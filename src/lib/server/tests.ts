import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { loadProfile, requireAdmin } from "./profile";
import { seedIfEmpty } from "./seed";

export async function spawnTestsForDrop(dropId: number, adminId: string) {
  const sql = await getSql();
  const drop = await sql<{ id: number; title: string; tests_spawned: boolean }>`
    select id, title, tests_spawned from group_buys where id = ${dropId}
  `;
  if (!drop[0] || drop[0].tests_spawned) return;
  const specs = await sql<{
    product_id: number;
    product_name: string;
    test_type: string;
    payer: string;
    creates: string;
  }>`
    select i.product_id, p.name as product_name, t.test_type, t.payer, t.creates
    from group_buy_item_tests t
    join group_buy_items i on i.id = t.group_buy_item_id
    join products p on p.id = i.product_id
    where i.group_buy_id = ${dropId}
  `;

  const groupKey = new Map<string, string[]>();
  const publicKey = new Map<string, string[]>();
  for (const s of specs) {
    const wantGroup = s.creates === "group_test" || s.creates === "both";
    const wantPublic = s.creates === "public_result" || s.creates === "both";
    if (wantGroup && s.payer === "group_funded") {
      const k = `${s.product_id}:group`;
      groupKey.set(k, [...(groupKey.get(k) ?? []), s.test_type]);
    }
    if (wantPublic && s.payer === "admin") {
      const k = `${s.product_id}:public`;
      publicKey.set(k, [...(publicKey.get(k) ?? []), s.test_type]);
    }
    // Admin-paid group tests and group-funded public results still spawn as requested.
    if (wantGroup && s.payer === "admin") {
      const k = `${s.product_id}:group-admin`;
      groupKey.set(k, [...(groupKey.get(k) ?? []), s.test_type]);
    }
    if (wantPublic && s.payer === "group_funded") {
      const k = `${s.product_id}:public-group`;
      publicKey.set(k, [...(publicKey.get(k) ?? []), s.test_type]);
    }
  }

  const productName = async (id: number) => {
    const r = await sql<{ name: string }>`select name from products where id = ${id}`;
    return r[0]?.name ?? "Item";
  };

  for (const [key, types] of groupKey) {
    const productId = Number(key.split(":")[0]);
    const name = await productName(productId);
    const funded = key.includes("admin") ? "Admin-covered" : "Group-funded";
    await sql`
      insert into group_tests (
        title, description, status, compound, source, source_group_buy_id, source_product_id, created_by
      ) values (
        ${`${drop[0].title} — ${name} (${types.join(", ")})`},
        ${`${funded} panel auto-created from the drop. Types: ${types.join(", ")}.`},
        'recruiting',
        ${name},
        'group_buy',
        ${dropId},
        ${productId},
        ${adminId}
      )
    `;
  }
  for (const [key, types] of publicKey) {
    const productId = Number(key.split(":")[0]);
    const name = await productName(productId);
    await sql`
      insert into public_results (title, summary, published, source, source_group_buy_id, source_product_id, created_by, item_results)
      values (
        ${`${name} — ${types.join(" + ")}`},
        ${`COA stub from ${drop[0].title}. Waiting on lab files.`},
        false,
        'group_buy',
        ${dropId},
        ${productId},
        ${adminId},
        ${JSON.stringify(types.map((t) => ({ name: t, value: "Pending" })))}::jsonb
      )
    `;
  }
  await sql`update group_buys set tests_spawned = true where id = ${dropId}`;
}

export type GroupTest = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  vendor: string | null;
  batch_number: string | null;
  compound: string | null;
  size_label: string | null;
  lab_name: string | null;
  total_lab_cost: string;
  shipping_cost: string;
  donor_shipping_cost: string;
  refund_per_donor: string;
  results_link: string | null;
  results_note: string | null;
  source: string;
};

function num(v: unknown): number {
  return Number(v || 0);
}

export function splitCosts(opts: {
  nPart: number;
  nDonors: number;
  lab: number;
  shipping: number;
  donorShipping: number;
  refund: number;
}) {
  const nPart = opts.nPart;
  const nDonors = opts.nDonors;
  const nNon = Math.max(0, nPart - nDonors);
  const totalFixed = opts.lab + opts.shipping + opts.donorShipping;
  if (nPart === 0) {
    return { donorPays: 0, nonDonorPays: 0, base: 0, totalFixed };
  }
  const base = totalFixed / nPart;
  const pool = opts.refund * nDonors;
  let donorPays = base - opts.refund;
  let nonDonorPays = nNon === 0 ? 0 : base + pool / nNon;
  if (opts.donorShipping > 0 && nDonors > 0) {
    donorPays -= opts.donorShipping / nDonors;
  }
  return {
    donorPays: Math.round(donorPays * 100) / 100,
    nonDonorPays: Math.round(nonDonorPays * 100) / 100,
    base: Math.round(base * 100) / 100,
    totalFixed,
  };
}

async function recalc(testId: number) {
  const sql = await getSql();
  const t = await sql<GroupTest>`select * from group_tests where id = ${testId}`;
  const test = t[0];
  if (!test) return;
  const parts = await sql<{ id: number; vial_donor: boolean; approved: boolean }>`
    select id, vial_donor, approved from participations where group_test_id = ${testId}
  `;
  const approved = parts.filter((p) => p.approved);
  const costs = splitCosts({
    nPart: approved.length,
    nDonors: approved.filter((p) => p.vial_donor).length,
    lab: num(test.total_lab_cost),
    shipping: num(test.shipping_cost),
    donorShipping: num(test.donor_shipping_cost),
    refund: num(test.refund_per_donor),
  });
  for (const p of approved) {
    const owed = p.vial_donor ? costs.donorPays : costs.nonDonorPays;
    await sql`update participations set amount_owed = ${owed} where id = ${p.id}`;
  }
}

export async function listTestsForUser(userId: string) {
    await loadProfile(userId);
    const sql = await getSql();
    return sql<GroupTest & { my_state: string | null }>`
      select g.*,
        case
          when p.denied then 'denied'
          when p.approved then 'approved'
          when p.id is not null then 'pending'
          else null
        end as my_state
      from group_tests g
      left join participations p on p.group_test_id = g.id and p.user_id = ${userId}
      where g.status = 'recruiting' or p.id is not null
      order by g.created_at desc
    `;
}

export const listTests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => listTestsForUser(context.userId));

export const getTest = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as { id: number })
  .handler(async ({ context, data }) => {
    const profile = await loadProfile(context.userId);
    const sql = await getSql();
    const rows = await sql<GroupTest>`select * from group_tests where id = ${data.id}`;
    const test = rows[0];
    if (!test) return null;
    const mine = await sql<{
      id: number;
      approved: boolean;
      denied: boolean;
      denied_reason: string | null;
      vial_donor: boolean;
      amount_owed: string;
      amount_paid: string;
      paid_lab: boolean;
      order_status: string;
    }>`select id, approved, denied, denied_reason, vial_donor, amount_owed, amount_paid, paid_lab, order_status
       from participations where group_test_id = ${data.id} and user_id = ${context.userId}`;
    const parts = profile.is_admin
      ? await sql<{
          id: number;
          user_id: string;
          display_name: string;
          approved: boolean;
          denied: boolean;
          denied_reason: string | null;
          vial_donor: boolean;
          amount_owed: string;
          amount_paid: string;
          paid_lab: boolean;
        }>`
          select p.id, p.user_id, coalesce(pr.display_name, p.user_id) as display_name,
                 p.approved, p.denied, p.denied_reason, p.vial_donor, p.amount_owed, p.amount_paid, p.paid_lab
          from participations p
          left join profiles pr on pr.user_id = p.user_id
          where p.group_test_id = ${data.id}
          order by p.requested_at
        `
      : [];
    const approved = parts.filter((p) => p.approved);
    const costs = splitCosts({
      nPart: approved.length,
      nDonors: approved.filter((p) => p.vial_donor).length,
      lab: num(test.total_lab_cost),
      shipping: num(test.shipping_cost),
      donorShipping: num(test.donor_shipping_cost),
      refund: num(test.refund_per_donor),
    });
    const canSeeResults =
      profile.is_admin || (Boolean(mine[0]?.approved) && Boolean(mine[0]?.paid_lab) && test.status === "closed");
    return { test, mine: mine[0] ?? null, participants: parts, costs, canSeeResults, isAdmin: profile.is_admin };
  });

export async function requestJoinForUser(userId: string, data: { id: number; vialDonor?: boolean }) {
    await loadProfile(userId);
    const sql = await getSql();
    const t = await sql<{ status: string }>`select status from group_tests where id = ${data.id}`;
    if (t[0]?.status !== "recruiting") throw new Error("This test is not recruiting.");
    const existing = await sql<{ id: number; denied: boolean }>`
      select id, denied from participations where group_test_id = ${data.id} and user_id = ${userId}
    `;
    if (existing[0] && !existing[0].denied) throw new Error("You already have a request on this test.");
    if (existing[0]?.denied) {
      await sql`
        update participations set denied = false, denied_reason = null, approved = false,
          vial_donor = ${Boolean(data.vialDonor)}, requested_at = now()
        where id = ${existing[0].id}
      `;
    } else {
      await sql`
        insert into participations (group_test_id, user_id, vial_donor)
        values (${data.id}, ${userId}, ${Boolean(data.vialDonor)})
      `;
    }
    return { ok: true };
}

export const requestJoinTest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as { id: number; vialDonor?: boolean })
  .handler(async ({ context, data }) => requestJoinForUser(context.userId, data));

export const moderateParticipation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as { participationId: number; action: "approve" | "deny" | "reopen"; reason?: string })
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const row = await sql<{ id: number; group_test_id: number }>`
      select id, group_test_id from participations where id = ${data.participationId}
    `;
    if (!row[0]) throw new Error("Not found");
    if (data.action === "approve") {
      await sql`update participations set approved = true, denied = false, denied_reason = null where id = ${data.participationId}`;
    } else if (data.action === "deny") {
      const reason = (data.reason || "").trim();
      if (!reason) throw new Error("Denial reason is required.");
      await sql`update participations set approved = false, denied = true, denied_reason = ${reason} where id = ${data.participationId}`;
    } else {
      await sql`update participations set approved = false, denied = false, denied_reason = null where id = ${data.participationId}`;
    }
    await recalc(row[0].group_test_id);
    return { ok: true };
  });

export const saveTest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as Partial<GroupTest> & { title: string })
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    if (data.id) {
      await sql`
        update group_tests set
          title = ${data.title},
          description = ${data.description ?? null},
          status = coalesce(${data.status ?? null}, status),
          vendor = ${data.vendor ?? null},
          batch_number = ${data.batch_number ?? null},
          compound = ${data.compound ?? null},
          size_label = ${data.size_label ?? null},
          lab_name = ${data.lab_name ?? null},
          total_lab_cost = ${Number(data.total_lab_cost || 0)},
          shipping_cost = ${Number(data.shipping_cost || 0)},
          donor_shipping_cost = ${Number(data.donor_shipping_cost || 0)},
          refund_per_donor = ${Number(data.refund_per_donor || 0)},
          results_link = ${data.results_link ?? null},
          results_note = ${data.results_note ?? null},
          updated_at = now()
        where id = ${data.id}
      `;
      await recalc(Number(data.id));
      return { id: data.id };
    }
    const ins = await sql<{ id: number }>`
      insert into group_tests (
        title, description, status, vendor, batch_number, compound, size_label, lab_name,
        total_lab_cost, shipping_cost, donor_shipping_cost, refund_per_donor, created_by
      ) values (
        ${data.title}, ${data.description ?? null}, ${data.status || "recruiting"},
        ${data.vendor ?? null}, ${data.batch_number ?? null}, ${data.compound ?? null},
        ${data.size_label ?? null}, ${data.lab_name ?? null},
        ${Number(data.total_lab_cost || 0)}, ${Number(data.shipping_cost || 0)},
        ${Number(data.donor_shipping_cost || 0)}, ${Number(data.refund_per_donor || 20)},
        ${context.userId}
      ) returning id
    `;
    return { id: ins[0]!.id };
  });

export const markTestPaid = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as { participationId: number; amountPaid: number; paid: boolean })
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    await sql`
      update participations set amount_paid = ${data.amountPaid}, paid_lab = ${data.paid}
      where id = ${data.participationId}
    `;
    return { ok: true };
  });

export const listPublicResults = createServerFn({ method: "GET" })
  .handler(async () => {
    await seedIfEmpty("system");
    const sql = await getSql();
    type Row = {
      id: number; title: string; summary: string | null; results_link: string | null;
      published: boolean; source: string; posted_at: string; item_results: Array<{ name: string; value: string }> | null;
    };
    return sql<Row>`select id, title, summary, results_link, published, source, posted_at, item_results from public_results where published = true order by posted_at desc`;
  });

export const savePublicResult = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as { id?: number; title: string; summary?: string; results_link?: string; published?: boolean; item_results?: unknown })
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const items = JSON.stringify(data.item_results ?? []);
    if (data.id) {
      await sql`
        update public_results set title = ${data.title}, summary = ${data.summary ?? null},
          results_link = ${data.results_link ?? null}, published = ${Boolean(data.published)},
          item_results = ${items}::jsonb
        where id = ${data.id}
      `;
      return { id: data.id };
    }
    const ins = await sql<{ id: number }>`
      insert into public_results (title, summary, results_link, published, item_results, created_by)
      values (${data.title}, ${data.summary ?? null}, ${data.results_link ?? null}, ${Boolean(data.published)}, ${items}::jsonb, ${context.userId})
      returning id
    `;
    return { id: ins[0]!.id };
  });
