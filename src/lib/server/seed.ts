import { getSql } from "@/lib/db";

export async function seedIfEmpty(adminId: string) {
  const sql = await getSql();
  const claimed = await sql<{ key: string }>`
    insert into app_meta (key, value) values ('seeded', '1')
    on conflict (key) do nothing
    returning key
  `;
  if (!claimed[0]) return;

  try {

  // Burn / example addresses so the settlement page is prefilled but not a personal wallet.
  await sql`
    update payment_methods set
      enabled = true,
      wallet_address = case code
        when 'btc' then 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
        when 'etc' then '0x000000000000000000000000000000000000dEaD'
        when 'sol' then '11111111111111111111111111111111'
        when 'tron' then 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
        else wallet_address
      end,
      handle = case code
        when 'cashapp' then '$clearlot'
        when 'venmo' then '@clearlot'
        else handle
      end
    where code in ('btc','etc','sol','tron','cashapp','venmo')
  `;

  const products = [
    {
      slug: "reference-10",
      name: "Reference standard 10 mg",
      description: "Analytical reference, 10 mg vial. Always-on catalog price is list; drop prices may differ.",
      sku: "REF-10",
      seed: 11,
      stock: 48,
      price: 4200,
      tests: [
        { type: "Mass", payer: "admin", creates: "public_result" },
        { type: "Purity", payer: "admin", creates: "public_result" },
        { type: "Endotoxins", payer: "group_funded", creates: "group_test" },
      ],
    },
    {
      slug: "reference-50",
      name: "Reference standard 50 mg",
      description: "Larger analytical vial. Inventory is shared with timed drops.",
      sku: "REF-50",
      seed: 23,
      stock: 24,
      price: 8900,
      tests: [
        { type: "Mass", payer: "admin", creates: "both" },
        { type: "Purity", payer: "admin", creates: "both" },
      ],
    },
    {
      slug: "sterile-vials",
      name: "Sterile vials — 10 pack",
      description: "Type I glass, sterile packed. No lab panel included.",
      sku: "VIAL-10",
      seed: 7,
      stock: 120,
      price: 1800,
      tests: [] as { type: string; payer: string; creates: string }[],
    },
    {
      slug: "cold-shipper",
      name: "Cold-chain shipper",
      description: "Insulated mailer with gel pack. Catalog-only accessory.",
      sku: "SHIP-COLD",
      seed: 19,
      stock: 60,
      price: 1200,
      tests: [],
    },
  ];

  for (const p of products) {
    await sql`
      insert into products (slug, name, description, sku, image_seed, stock_qty, always_on_enabled, always_on_price_cents, created_by)
      values (${p.slug}, ${p.name}, ${p.description}, ${p.sku}, ${p.seed}, ${p.stock}, true, ${p.price}, ${adminId})
      on conflict (slug) do nothing
    `;
    const row = await sql<{ id: number }>`select id from products where slug = ${p.slug}`;
    const id = row[0]?.id;
    if (!id) continue;
    for (const t of p.tests) {
      await sql`
        insert into product_tests (product_id, test_type, payer, creates)
        values (${id}, ${t.type}, ${t.payer}, ${t.creates})
      `;
    }
  }

  await sql`
    insert into shipping_tiers (scope, group_buy_id, min_items, max_items, price_cents, label)
    values
      ('catalog', null, 1, 2, 800, 'USPS Ground 1–2 items'),
      ('catalog', null, 3, 6, 1200, 'USPS Ground 3–6 items'),
      ('catalog', null, 7, null, 1600, 'USPS Ground 7+ items')
  `;

  const now = new Date();
  const starts = new Date(now.getTime() - 60 * 60 * 1000);
  const ends = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

  await sql`
    insert into group_buys (slug, title, description, status, starts_at, ends_at, admin_fee_cents, created_by)
    values (
      'september-lot',
      'September lot',
      'Timed drop. Caps are per SKU. Admin fee is flat per order. Shipping is based on item count.',
      'live',
      ${starts.toISOString()},
      ${ends.toISOString()},
      500,
      ${adminId}
    )
    on conflict (slug) do nothing
  `;
  const drop = await sql<{ id: number }>`select id from group_buys where slug = 'september-lot'`;
  const dropId = drop[0]?.id;
  if (dropId) {
    await sql`
      insert into shipping_tiers (scope, group_buy_id, min_items, max_items, price_cents, label)
      values
        ('group_buy', ${dropId}, 1, 2, 700, 'Drop ship 1–2'),
        ('group_buy', ${dropId}, 3, null, 1100, 'Drop ship 3+')
    `;
    const ref10 = await sql<{ id: number }>`select id from products where slug = 'reference-10'`;
    const ref50 = await sql<{ id: number }>`select id from products where slug = 'reference-50'`;
    const vials = await sql<{ id: number }>`select id from products where slug = 'sterile-vials'`;
    const items = [
      { pid: ref10[0]?.id, price: 3600, cap: 20 },
      { pid: ref50[0]?.id, price: 7800, cap: 10 },
      { pid: vials[0]?.id, price: 1500, cap: 40 },
    ];
    for (const it of items) {
      if (!it.pid) continue;
      await sql`
        insert into group_buy_items (group_buy_id, product_id, unit_price_cents, cap_qty)
        values (${dropId}, ${it.pid}, ${it.price}, ${it.cap})
        on conflict (group_buy_id, product_id) do nothing
      `;
    }
    const gbRef10 = await sql<{ id: number }>`
      select i.id from group_buy_items i
      join products p on p.id = i.product_id
      where i.group_buy_id = ${dropId} and p.slug = 'reference-10'
    `;
    if (gbRef10[0]) {
      await sql`
        insert into group_buy_item_tests (group_buy_item_id, test_type, payer, creates)
        values
          (${gbRef10[0].id}, 'Mass', 'admin', 'public_result'),
          (${gbRef10[0].id}, 'Purity', 'admin', 'public_result'),
          (${gbRef10[0].id}, 'Endotoxins', 'group_funded', 'group_test')
      `;
    }
  }

  await sql`
    insert into group_tests (
      title, description, status, vendor, batch_number, compound, size_label, lab_name,
      total_lab_cost, shipping_cost, refund_per_donor, created_by, source
    ) values (
      'Endotoxin panel — open',
      'Group-funded endotoxin panel. Join while recruiting; costs split across approved members.',
      'recruiting',
      'North lab',
      'B-204',
      'Reference standard',
      '10 mg',
      'North Analytics',
      240,
      35,
      20,
      ${adminId},
      'manual'
    )
  `;

  await sql`
    insert into public_results (title, summary, results_link, published, created_by, item_results)
    values (
      'August reference — mass + purity',
      'COA library entry. Mass and purity were admin-covered on the prior drop.',
      'https://example.com/coa/august',
      true,
      ${adminId},
      ${JSON.stringify([
        { name: "Mass", value: "10.12 mg" },
        { name: "Purity", value: "99.1%" },
      ])}::jsonb
    )
  `;

  if (dropId) {
    try {
      const { spawnTestsForDrop } = await import("./tests");
      await spawnTestsForDrop(dropId, adminId);
    } catch {
      /* drop is still shoppable if test spawn fails */
    }
  }
  } catch (err) {
    await sql`delete from app_meta where key = 'seeded'`;
    throw err;
  }
}
