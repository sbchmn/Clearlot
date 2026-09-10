import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireAdmin } from "./profile";
import { slugify } from "@/lib/utils";

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const pending = await sql<{ n: number }>`select count(*)::int as n from orders where status = 'pending_admin'`;
    const live = await sql<{ n: number }>`select count(*)::int as n from group_buys where status = 'live'`;
    const recruiting = await sql<{ n: number }>`select count(*)::int as n from group_tests where status = 'recruiting'`;
    const members = await sql<{ n: number }>`select count(*)::int as n from profiles`;
    return {
      pendingOrders: pending[0]?.n ?? 0,
      liveDrops: live[0]?.n ?? 0,
      recruitingTests: recruiting[0]?.n ?? 0,
      members: members[0]?.n ?? 0,
    };
  });

export const listAdminProducts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    return sql<{
      id: number; slug: string; name: string; sku: string | null; stock_qty: number;
      always_on_enabled: boolean; always_on_price_cents: number; active: boolean; image_seed: number;
    }>`
      select id, slug, name, sku, stock_qty, always_on_enabled, always_on_price_cents, active, image_seed
      from products order by name
    `;
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as {
    id?: number;
    name: string;
    slug?: string;
    description: string;
    sku?: string;
    stock_qty: number;
    always_on_enabled: boolean;
    always_on_price_cents: number;
    active: boolean;
    tests: Array<{ test_type: string; payer: string; creates: string }>;
  })
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const slug = slugify(data.slug || data.name);
    let id = data.id;
    if (!id) {
      const ins = await sql<{ id: number }>`
        insert into products (slug, name, description, sku, image_seed, stock_qty, always_on_enabled, always_on_price_cents, active, created_by)
        values (${slug}, ${data.name}, ${data.description}, ${data.sku ?? null}, ${(data.name.length % 20) + 1}, ${data.stock_qty}, ${data.always_on_enabled}, ${data.always_on_price_cents}, ${data.active}, ${context.userId})
        returning id
      `;
      id = ins[0]!.id;
    } else {
      await sql`
        update products set slug = ${slug}, name = ${data.name}, description = ${data.description}, sku = ${data.sku ?? null},
          stock_qty = ${data.stock_qty}, always_on_enabled = ${data.always_on_enabled},
          always_on_price_cents = ${data.always_on_price_cents}, active = ${data.active}, updated_at = now()
        where id = ${id}
      `;
    }
    await sql`delete from product_tests where product_id = ${id}`;
    for (const t of data.tests) {
      if (!t.test_type.trim()) continue;
      await sql`
        insert into product_tests (product_id, test_type, payer, creates)
        values (${id}, ${t.test_type}, ${t.payer}, ${t.creates})
      `;
    }
    return { id };
  });

export const listSettlement = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    return sql<{
      code: string; kind: string; label: string; enabled: boolean;
      wallet_address: string | null; handle: string | null; instructions: string | null; min_confirmations: number;
    }>`
      select code, kind, label, enabled, wallet_address, handle, instructions, min_confirmations
      from payment_methods order by kind, code
    `;
  });

export const saveSettlement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as Array<{
    code: string;
    enabled: boolean;
    wallet_address?: string | null;
    handle?: string | null;
    instructions?: string | null;
    min_confirmations?: number;
  }>)
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    for (const m of data) {
      if (m.enabled && m.code !== "cashapp" && m.code !== "venmo" && !m.wallet_address?.trim()) {
        throw new Error(`Wallet address required to enable ${m.code.toUpperCase()}.`);
      }
      if (m.enabled && (m.code === "cashapp" || m.code === "venmo") && !m.handle?.trim()) {
        throw new Error(`Handle required to enable ${m.code}.`);
      }
      await sql`
        update payment_methods set
          enabled = ${m.enabled},
          wallet_address = ${m.wallet_address?.trim() || null},
          handle = ${m.handle?.trim() || null},
          instructions = ${m.instructions ?? null},
          min_confirmations = ${Math.max(0, Math.min(64, m.min_confirmations ?? 1))},
          updated_at = now()
        where code = ${m.code}
      `;
    }
    return { ok: true };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    return sql<{ user_id: string; display_name: string; is_admin: boolean; created_at: string }>`select user_id, display_name, is_admin, created_at from profiles order by created_at`;
  });

export const setUserAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as { userId: string; isAdmin: boolean })
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    if (data.userId === context.userId && !data.isAdmin) {
      throw new Error("You cannot remove your own admin flag.");
    }
    const sql = await getSql();
    await sql`update profiles set is_admin = ${data.isAdmin} where user_id = ${data.userId}`;
    return { ok: true };
  });

export const saveBotConfig = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as { telegramToken?: string; telegramSecret?: string })
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    if (data.telegramToken !== undefined) {
      await sql`
        insert into bot_config (key, value) values ('telegram_token', ${data.telegramToken})
        on conflict (key) do update set value = excluded.value
      `;
    }
    if (data.telegramSecret !== undefined) {
      await sql`
        insert into bot_config (key, value) values ('telegram_secret', ${data.telegramSecret})
        on conflict (key) do update set value = excluded.value
      `;
    }
    return { ok: true };
  });

export const getBotConfigMasked = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{ key: string; value: string | null }>`select key, value from bot_config`;
    const map: Record<string, string> = {};
    for (const r of rows) {
      const v = r.value || "";
      map[r.key] = v ? `${v.slice(0, 4)}…${v.slice(-4)}` : "";
    }
    return map;
  });
