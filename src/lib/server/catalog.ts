import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { loadProfile } from "./profile";
import { spawnTestsForDrop } from "./tests";
import { seedIfEmpty } from "./seed";

export type ProductCard = {
  id: number;
  slug: string;
  name: string;
  description: string;
  sku: string | null;
  image_seed: number;
  stock_qty: number;
  always_on_enabled: boolean;
  always_on_price_cents: number;
  active: boolean;
};

export type TestSpec = {
  id: number;
  test_type: string;
  custom_label: string | null;
  payer: "admin" | "group_funded";
  creates: "group_test" | "public_result" | "both";
};

export type DropCard = {
  id: number;
  slug: string;
  title: string;
  description: string;
  status: string;
  starts_at: string;
  ends_at: string;
  admin_fee_cents: number;
};

export type DropItem = {
  id: number;
  product_id: number;
  slug: string;
  name: string;
  description: string;
  image_seed: number;
  unit_price_cents: number;
  cap_qty: number;
  sold_qty: number;
  remaining: number;
  tests: TestSpec[];
};

export type ShippingTier = {
  id: number;
  min_items: number;
  max_items: number | null;
  price_cents: number;
  label: string;
};

function asIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v ?? "");
}

export async function fetchCatalog() {
  await seedIfEmpty("system");
  const sql = await getSql();
  return sql<ProductCard>`
    select id, slug, name, description, sku, image_seed, stock_qty, always_on_enabled, always_on_price_cents, active
    from products
    where active = true and always_on_enabled = true
    order by name
  `;
}

export const listCatalog = createServerFn({ method: "GET" }).handler(async () => fetchCatalog());

export async function fetchProduct(slug: string) {
  await seedIfEmpty("system");
  const sql = await getSql();
  const rows = await sql<ProductCard>`
    select id, slug, name, description, sku, image_seed, stock_qty, always_on_enabled, always_on_price_cents, active
    from products where slug = ${slug} and active = true
  `;
  const product = rows[0];
  if (!product) return null;
  const tests = await sql<TestSpec>`
    select id, test_type, custom_label, payer, creates from product_tests where product_id = ${product.id}
  `;
  return { product, tests };
}

export const getProduct = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { slug: string })
  .handler(async ({ data }) => fetchProduct(data.slug));

export async function fetchDrops() {
  await seedIfEmpty("system");
  const sql = await getSql();
  const rows = await sql<DropCard>`
    select id, slug, title, description, status, starts_at, ends_at, admin_fee_cents
    from group_buys
    where status in ('scheduled', 'live', 'closed')
    order by starts_at desc
  `;
  return rows.map((r) => ({ ...r, starts_at: asIso(r.starts_at), ends_at: asIso(r.ends_at) }));
}

export const listDrops = createServerFn({ method: "GET" }).handler(async () => fetchDrops());

export async function fetchDrop(slug: string) {
    await seedIfEmpty("system");
    const sql = await getSql();
    const drops = await sql<DropCard>`
      select id, slug, title, description, status, starts_at, ends_at, admin_fee_cents
      from group_buys where slug = ${slug}
    `;
    const drop = drops[0];
    if (!drop) return null;
    drop.starts_at = asIso(drop.starts_at);
    drop.ends_at = asIso(drop.ends_at);
    const items = await sql<Omit<DropItem, "tests" | "remaining">>`
      select i.id, i.product_id, p.slug, p.name, p.description, p.image_seed,
             i.unit_price_cents, i.cap_qty, i.sold_qty
      from group_buy_items i
      join products p on p.id = i.product_id
      where i.group_buy_id = ${drop.id}
      order by p.name
    `;
    const tests = await sql<TestSpec & { group_buy_item_id: number }>`
      select t.id, t.group_buy_item_id, t.test_type, t.custom_label, t.payer, t.creates
      from group_buy_item_tests t
      join group_buy_items i on i.id = t.group_buy_item_id
      where i.group_buy_id = ${drop.id}
    `;
    const byItem = new Map<number, TestSpec[]>();
    for (const t of tests) {
      const list = byItem.get(t.group_buy_item_id) ?? [];
      list.push(t);
      byItem.set(t.group_buy_item_id, list);
    }
    const tiers = await sql<ShippingTier>`
      select id, min_items, max_items, price_cents, label
      from shipping_tiers
      where scope = 'group_buy' and group_buy_id = ${drop.id}
      order by min_items
    `;
    return {
      drop,
      items: items.map((it) => ({
        ...it,
        remaining: Math.max(0, it.cap_qty - it.sold_qty),
        tests: byItem.get(it.id) ?? [],
      })),
      tiers,
    };
}

export const getDrop = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { slug: string })
  .handler(async ({ data }) => fetchDrop(data.slug));

export async function fetchCatalogTiers() {
  await seedIfEmpty("system");
  const sql = await getSql();
  return sql<ShippingTier>`
    select id, min_items, max_items, price_cents, label
    from shipping_tiers where scope = 'catalog'
    order by min_items
  `;
}

export const listCatalogTiers = createServerFn({ method: "GET" }).handler(async () => fetchCatalogTiers());

export type CartView = {
  source: "catalog" | "group_buy";
  group_buy_id: number | null;
  drop_title: string | null;
  admin_fee_cents: number;
  items: Array<{
    id: number;
    product_id: number;
    group_buy_item_id: number | null;
    name: string;
    slug: string;
    image_seed: number;
    qty: number;
    unit_price_cents: number;
    line_cents: number;
  }>;
  item_count: number;
  subtotal_cents: number;
  shipping: ShippingTier | null;
  total_cents: number;
};

async function cartView(userId: string): Promise<CartView> {
  const sql = await getSql();
  const carts = await sql<{ source: "catalog" | "group_buy"; group_buy_id: number | null }>`
    select source, group_buy_id from carts where user_id = ${userId}
  `;
  const cart = carts[0];
  if (!cart) {
    return { source: "catalog", group_buy_id: null, drop_title: null, admin_fee_cents: 0, items: [], item_count: 0, subtotal_cents: 0, shipping: null, total_cents: 0 };
  }
  const items = await sql<{
    id: number;
    product_id: number;
    group_buy_item_id: number | null;
    name: string;
    slug: string;
    image_seed: number;
    qty: number;
    unit_price_cents: number;
  }>`
    select ci.id, ci.product_id, ci.group_buy_item_id, p.name, p.slug, p.image_seed, ci.qty,
      case when ci.group_buy_item_id is not null then i.unit_price_cents else p.always_on_price_cents end as unit_price_cents
    from cart_items ci
    join products p on p.id = ci.product_id
    left join group_buy_items i on i.id = ci.group_buy_item_id
    where ci.user_id = ${userId}
    order by p.name
  `;
  const lines = items.map((it) => ({ ...it, line_cents: it.qty * it.unit_price_cents }));
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.line_cents, 0);
  let adminFee = 0;
  let dropTitle: string | null = null;
  let tiers: ShippingTier[] = [];
  if (cart.source === "group_buy" && cart.group_buy_id) {
    const d = await sql<{ title: string; admin_fee_cents: number }>`
      select title, admin_fee_cents from group_buys where id = ${cart.group_buy_id}
    `;
    adminFee = d[0]?.admin_fee_cents ?? 0;
    dropTitle = d[0]?.title ?? null;
    tiers = await sql<ShippingTier>`
      select id, min_items, max_items, price_cents, label
      from shipping_tiers where scope = 'group_buy' and group_buy_id = ${cart.group_buy_id}
      order by min_items
    `;
  } else {
    tiers = await sql<ShippingTier>`
      select id, min_items, max_items, price_cents, label
      from shipping_tiers where scope = 'catalog' order by min_items
    `;
  }
  const shipping =
    tiers.find((t) => itemCount >= t.min_items && (t.max_items == null || itemCount <= t.max_items)) ??
    null;
  const total = subtotal + adminFee + (shipping?.price_cents ?? 0);
  return {
    source: cart.source,
    group_buy_id: cart.group_buy_id,
    drop_title: dropTitle,
    admin_fee_cents: adminFee,
    items: lines,
    item_count: itemCount,
    subtotal_cents: subtotal,
    shipping,
    total_cents: total,
  };
}

export const getCart = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await loadProfile(context.userId);
    return cartView(context.userId);
  });

export type CartInput = { productId: number; qty: number; groupBuyItemId?: number | null; groupBuyId?: number | null };

export async function addToCartForUser(userId: string, data: CartInput) {
    const sql = await getSql();
    await loadProfile(userId);
    const qty = Math.max(1, Math.min(99, Math.floor(Number(data.qty) || 1)));
    const source = data.groupBuyItemId ? "group_buy" : "catalog";
    const existing = await sql<{ source: string; group_buy_id: number | null }>`
      select source, group_buy_id from carts where user_id = ${userId}
    `;
    if (existing[0] && existing[0].source !== source) {
      throw new Error("Cart already holds items from a different source. Checkout or clear it first.");
    }
    if (existing[0] && source === "group_buy" && existing[0].group_buy_id !== data.groupBuyId) {
      throw new Error("Cart is locked to another drop. Checkout or clear it first.");
    }
    if (source === "catalog") {
      const p = await sql<{ always_on_enabled: boolean; stock_qty: number; active: boolean }>`
        select always_on_enabled, stock_qty, active from products where id = ${data.productId}
      `;
      if (!p[0]?.active || !p[0].always_on_enabled) throw new Error("This item is not on the catalog.");
      if (p[0].stock_qty < qty) throw new Error("Not enough stock.");
    } else {
      const it = await sql<{ cap_qty: number; sold_qty: number; group_buy_id: number; status: string; starts_at: string; ends_at: string }>`
        select i.cap_qty, i.sold_qty, i.group_buy_id, g.status, g.starts_at, g.ends_at
        from group_buy_items i join group_buys g on g.id = i.group_buy_id
        where i.id = ${data.groupBuyItemId ?? 0}
      `;
      const row = it[0];
      if (!row) throw new Error("Drop item not found.");
      if (row.status !== "live") throw new Error("This drop is not live.");
      const now = Date.now();
      if (now < new Date(asIso(row.starts_at)).getTime() || now > new Date(asIso(row.ends_at)).getTime()) {
        throw new Error("This drop is outside its time window.");
      }
      if (row.sold_qty + qty > row.cap_qty) throw new Error("That quantity exceeds the drop cap.");
    }
    await sql`
      insert into carts (user_id, source, group_buy_id, updated_at)
      values (${userId}, ${source}, ${data.groupBuyId ?? null}, now())
      on conflict (user_id) do update set updated_at = now()
    `;
    const existingItem = await sql<{ id: number }>`
      select id from cart_items
      where user_id = ${userId}
        and product_id = ${data.productId}
        and group_buy_item_id is not distinct from ${data.groupBuyItemId ?? null}
    `;
    if (existingItem[0]) {
      await sql`update cart_items set qty = qty + ${qty} where id = ${existingItem[0].id} and user_id = ${userId}`;
    } else {
      await sql`
        insert into cart_items (user_id, product_id, group_buy_item_id, qty)
        values (${userId}, ${data.productId}, ${data.groupBuyItemId ?? null}, ${qty})
      `;
    }
    return cartView(userId);
}

export const addToCart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as CartInput)
  .handler(async ({ context, data }) => addToCartForUser(context.userId, data));

export const updateCartQty = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as { itemId: number; qty: number })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const qty = Math.floor(Number(data.qty) || 0);
    if (qty <= 0) {
      await sql`delete from cart_items where id = ${data.itemId} and user_id = ${context.userId}`;
    } else {
      await sql`update cart_items set qty = ${Math.min(99, qty)} where id = ${data.itemId} and user_id = ${context.userId}`;
    }
    const left = await sql<{ n: number }>`select count(*)::int as n from cart_items where user_id = ${context.userId}`;
    if ((left[0]?.n ?? 0) === 0) {
      await sql`delete from carts where user_id = ${context.userId}`;
    }
    return cartView(context.userId);
  });

export async function clearCartForUser(userId: string) {
  const sql = await getSql();
  await sql`delete from carts where user_id = ${userId}`;
  return cartView(userId);
}

export const clearCart = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => clearCartForUser(context.userId));

export { cartView };

export const saveDrop = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as {
    id?: number;
    title: string;
    slug: string;
    description: string;
    status: string;
    starts_at: string;
    ends_at: string;
    admin_fee_cents: number;
    items: Array<{ product_id: number; unit_price_cents: number; cap_qty: number; tests: Array<{ test_type: string; payer: string; creates: string }> }>;
    tiers: Array<{ min_items: number; max_items: number | null; price_cents: number; label: string }>;
  })
  .handler(async ({ context, data }) => {
    const { requireAdmin } = await import("./profile");
    await requireAdmin(context.userId);
    const sql = await getSql();
    let id = data.id;
    if (!id) {
      const ins = await sql<{ id: number }>`
        insert into group_buys (slug, title, description, status, starts_at, ends_at, admin_fee_cents, created_by)
        values (${data.slug}, ${data.title}, ${data.description}, ${data.status}, ${data.starts_at}, ${data.ends_at}, ${data.admin_fee_cents}, ${context.userId})
        returning id
      `;
      id = ins[0]!.id;
    } else {
      await sql`
        update group_buys set
          slug = ${data.slug}, title = ${data.title}, description = ${data.description},
          status = ${data.status}, starts_at = ${data.starts_at}, ends_at = ${data.ends_at},
          admin_fee_cents = ${data.admin_fee_cents}, updated_at = now()
        where id = ${id}
      `;
    }
    await sql`delete from shipping_tiers where scope = 'group_buy' and group_buy_id = ${id}`;
    for (const t of data.tiers) {
      await sql`
        insert into shipping_tiers (scope, group_buy_id, min_items, max_items, price_cents, label)
        values ('group_buy', ${id}, ${t.min_items}, ${t.max_items}, ${t.price_cents}, ${t.label})
      `;
    }
    const existing = await sql<{ id: number; product_id: number }>`select id, product_id from group_buy_items where group_buy_id = ${id}`;
    const keep = new Set(data.items.map((i) => i.product_id));
    for (const row of existing) {
      if (!keep.has(row.product_id)) {
        await sql`delete from group_buy_items where id = ${row.id}`;
      }
    }
    for (const it of data.items) {
      await sql`
        insert into group_buy_items (group_buy_id, product_id, unit_price_cents, cap_qty)
        values (${id}, ${it.product_id}, ${it.unit_price_cents}, ${it.cap_qty})
        on conflict (group_buy_id, product_id) do update
          set unit_price_cents = excluded.unit_price_cents, cap_qty = excluded.cap_qty
      `;
      const row = await sql<{ id: number }>`
        select id from group_buy_items where group_buy_id = ${id} and product_id = ${it.product_id}
      `;
      const itemId = row[0]!.id;
      await sql`delete from group_buy_item_tests where group_buy_item_id = ${itemId}`;
      for (const t of it.tests) {
        await sql`
          insert into group_buy_item_tests (group_buy_item_id, test_type, payer, creates)
          values (${itemId}, ${t.test_type}, ${t.payer}, ${t.creates})
        `;
      }
    }
    if (data.status === "live" || data.status === "closed") {
      await spawnTestsForDrop(id, context.userId);
    }
    return { id };
  });
