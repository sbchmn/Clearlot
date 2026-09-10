import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { loadProfile, requireAdmin } from "./profile";
import { cartView } from "./catalog";
import {
  ASSET_BY_CHAIN,
  CHAINS,
  amountCovers,
  decimalsFor,
  fetchUsdRates,
  normalizeTxid,
  quoteNative,
  verifyChainPayment,
  type Chain,
} from "./crypto";

const MAX_PROOF = 450_000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 8;

type MethodRow = {
  code: string;
  kind: "crypto" | "manual";
  label: string;
  enabled: boolean;
  wallet_address: string | null;
  handle: string | null;
  instructions: string | null;
  min_confirmations: number;
  asset_id: string | null;
};

export const listPaymentMethods = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await loadProfile(context.userId);
    const sql = await getSql();
    const rows = await sql<MethodRow>`
      select code, kind, label, enabled, wallet_address, handle, instructions, min_confirmations, asset_id
      from payment_methods order by kind, code
    `;
    return rows.filter((r) => r.enabled);
  });

async function cachedRates() {
  const sql = await getSql();
  const rows = await sql<{ asset: string; usd: string; fetched_at: string }>`select asset, usd::text as usd, fetched_at from fx_rates`;
  const fresh = rows.filter((r) => Date.now() - new Date(String(r.fetched_at)).getTime() < 60_000);
  if (fresh.length >= 4) {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.asset] = Number(r.usd);
    return map;
  }
  const live = await fetchUsdRates();
  for (const [asset, usd] of Object.entries(live)) {
    await sql`
      insert into fx_rates (asset, usd, fetched_at) values (${asset}, ${usd}, now())
      on conflict (asset) do update set usd = excluded.usd, fetched_at = now()
    `;
  }
  return live;
}

export async function quoteCheckoutForUser(userId: string) {
    await loadProfile(userId);
    const cart = await cartView(userId);
    const sql = await getSql();
    const methods = await sql<MethodRow>`select * from payment_methods where enabled = true`;
    let rates: Record<string, number> = {};
    try {
      rates = await cachedRates();
    } catch {
      const cached = await sql<{ asset: string; usd: string }>`select asset, usd::text as usd from fx_rates`;
      for (const r of cached) rates[r.asset] = Number(r.usd);
    }
    const quotes: Record<string, string> = {};
    for (const chain of CHAINS) {
      const usd = rates[ASSET_BY_CHAIN[chain]];
      if (usd > 0 && cart.total_cents > 0) {
        quotes[chain] = quoteNative(cart.total_cents, usd, decimalsFor(chain));
      }
    }
    return { cart, methods, quotes, rates };
}

export const quoteCheckout = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => quoteCheckoutForUser(context.userId));

function validateProof(proof: string) {
  if (typeof proof !== "string" || proof.length < 32) throw new Error("Payment proof screenshot is required.");
  if (proof.length > MAX_PROOF) throw new Error("Screenshot is too large. Use a compressed JPEG under 300 KB.");
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(proof)) {
    throw new Error("Proof must be a JPEG, PNG, or WebP image.");
  }
}

async function hitRateLimit(userId: string) {
  const sql = await getSql();
  const windowStart = new Date(Math.floor(Date.now() / RATE_WINDOW_MS) * RATE_WINDOW_MS).toISOString();
  await sql`
    insert into verify_rate (user_id, window_start, hits)
    values (${userId}, ${windowStart}, 1)
    on conflict (user_id, window_start) do update set hits = verify_rate.hits + 1
  `;
  const rows = await sql<{ hits: number }>`
    select hits from verify_rate where user_id = ${userId} and window_start = ${windowStart}
  `;
  if ((rows[0]?.hits ?? 0) > RATE_MAX) {
    throw new Error("Too many verification attempts. Wait a few minutes.");
  }
}

function publicId() {
  return `CL-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export type OrderView = {
  id: number;
  public_id: string;
  status: string;
  auto_verified: boolean;
  verification_note: string | null;
  subtotal_cents: number;
  admin_fee_cents: number;
  shipping_cents: number;
  shipping_label: string | null;
  total_cents: number;
  payment_code: string;
  crypto_amount: string | null;
  txid: string | null;
  created_at: string;
  verified_at: string | null;
  ship_name: string | null;
  ship_line1: string | null;
  ship_city: string | null;
  ship_region: string | null;
  ship_postal: string | null;
  ship_country: string | null;
  proof_data?: string | null;
  lines: Array<{ name_snapshot: string; qty: number; unit_price_cents: number }>;
};

async function getOrderById(id: number, userId: string, isOwner: boolean, admin = false): Promise<OrderView> {
  const sql = await getSql();
  const rows = await sql<Omit<OrderView, "lines">>`
    select id, public_id, status, auto_verified, verification_note, subtotal_cents, admin_fee_cents,
           shipping_cents, shipping_label, total_cents, payment_code, crypto_amount, txid, created_at, verified_at,
           ship_name, ship_line1, ship_city, ship_region, ship_postal, ship_country, proof_data
    from orders
    where id = ${id} and (${admin} or user_id = ${userId})
  `;
  const order = rows[0];
  if (!order) throw new Error("Order not found.");
  const lines = await sql<{ name_snapshot: string; qty: number; unit_price_cents: number }>`
    select name_snapshot, qty, unit_price_cents from order_lines where order_id = ${id}
  `;
  return {
    ...order,
    created_at: String(order.created_at),
    verified_at: order.verified_at ? String(order.verified_at) : null,
    proof_data: isOwner || admin ? order.proof_data : null,
    lines,
  };
}

export type SubmitOrderInput = {
    paymentCode: string;
    txid: string;
    proofData: string;
    ship: {
      name: string;
      line1: string;
      city: string;
      region: string;
      postal: string;
      country?: string;
    };
    channel?: "web" | "telegram" | "discord";
  };

export async function submitOrderForUser(userId: string, data: SubmitOrderInput) {
    await loadProfile(userId);
    validateProof(data.proofData);
    const txidRaw = (data.txid || "").trim();
    if (txidRaw.length < 4) throw new Error("Transaction ID is required.");
    if (!data.ship?.name?.trim() || !data.ship.line1?.trim() || !data.ship.city?.trim() || !data.ship.postal?.trim()) {
      throw new Error("Shipping name, street, city, and postal code are required.");
    }
    await hitRateLimit(userId);

    const cart = await cartView(userId);
    if (cart.items.length === 0) throw new Error("Cart is empty.");
    if (cart.total_cents <= 0) throw new Error("Order total is invalid.");

    const sql = await getSql();
    const methods = await sql<MethodRow>`select * from payment_methods where code = ${data.paymentCode} and enabled = true`;
    const method = methods[0];
    if (!method) throw new Error("That payment method is not available.");

    const chain = CHAINS.includes(data.paymentCode as Chain) ? (data.paymentCode as Chain) : null;
    let cryptoAmount: string | null = null;
    let quoteRate: string | null = null;
    let normalizedTx: string | null = txidRaw;
    if (chain) {
      const parsed = normalizeTxid(chain, txidRaw);
      if (!parsed) throw new Error("Transaction ID does not match this chain's format.");
      normalizedTx = parsed;
      if (!method.wallet_address) throw new Error("No wallet is configured for this chain.");
      let rates: Record<string, number> = {};
      try {
        rates = await cachedRates();
      } catch {
        const cached = await sql<{ asset: string; usd: string }>`select asset, usd::text as usd from fx_rates`;
        for (const r of cached) rates[r.asset] = Number(r.usd);
      }
      const usd = rates[ASSET_BY_CHAIN[chain]];
      if (!(usd > 0)) throw new Error("Could not lock an exchange rate. Try again in a moment.");
      cryptoAmount = quoteNative(cart.total_cents, usd, decimalsFor(chain));
      quoteRate = String(usd);
    }

    const used = await sql<{ id: number }>`select id from orders where txid = ${normalizedTx}`;
    if (used[0]) throw new Error("That transaction ID was already submitted.");

    for (const line of cart.items) {
      if (line.group_buy_item_id) {
        const upd = await sql<{ id: number }>`
          update group_buy_items
          set sold_qty = sold_qty + ${line.qty}
          where id = ${line.group_buy_item_id} and sold_qty + ${line.qty} <= cap_qty
          returning id
        `;
        if (!upd[0]) throw new Error(`Not enough remaining cap for ${line.name}.`);
      }
      const stock = await sql<{ id: number }>`
        update products set stock_qty = stock_qty - ${line.qty}
        where id = ${line.product_id} and stock_qty >= ${line.qty}
        returning id
      `;
      if (!stock[0]) throw new Error(`Not enough stock for ${line.name}.`);
    }

    const pid = publicId();
    let orderId: number;
    try {
      const ins = await sql<{ id: number }>`
        insert into orders (
          public_id, user_id, channel, source, group_buy_id, status,
          subtotal_cents, admin_fee_cents, shipping_cents, shipping_label, total_cents,
          payment_code, crypto_asset, crypto_amount, quote_usd_rate, quote_locked_at,
          txid, proof_mime, proof_data,
          ship_name, ship_line1, ship_city, ship_region, ship_postal, ship_country
        ) values (
          ${pid}, ${userId}, ${data.channel || "web"}, ${cart.source}, ${cart.group_buy_id},
          'pending_admin',
          ${cart.subtotal_cents}, ${cart.admin_fee_cents}, ${cart.shipping?.price_cents ?? 0},
          ${cart.shipping?.label ?? null}, ${cart.total_cents},
          ${method.code}, ${chain ? ASSET_BY_CHAIN[chain] : null}, ${cryptoAmount}, ${quoteRate}, now(),
          ${normalizedTx}, ${data.proofData.slice(0, 40)}, ${data.proofData},
          ${data.ship.name.trim()}, ${data.ship.line1.trim()}, ${data.ship.city.trim()},
          ${data.ship.region.trim()}, ${data.ship.postal.trim()}, ${data.ship.country || "US"}
        ) returning id
      `;
      orderId = ins[0]!.id;
    } catch (err) {
      for (const line of cart.items) {
        if (line.group_buy_item_id) {
          await sql`update group_buy_items set sold_qty = greatest(sold_qty - ${line.qty}, 0) where id = ${line.group_buy_item_id}`;
        }
        await sql`update products set stock_qty = stock_qty + ${line.qty} where id = ${line.product_id}`;
      }
      const message = err instanceof Error ? err.message : "Could not create order.";
      if (/unique|duplicate/i.test(message)) throw new Error("That transaction ID was already submitted.");
      throw new Error(message);
    }

    for (const line of cart.items) {
      await sql`
        insert into order_lines (order_id, product_id, group_buy_item_id, name_snapshot, qty, unit_price_cents)
        values (${orderId}, ${line.product_id}, ${line.group_buy_item_id}, ${line.name}, ${line.qty}, ${line.unit_price_cents})
      `;
    }
    await sql`delete from carts where user_id = ${userId}`;

    let note = "Submitted. Waiting on admin verification.";
    if (chain && method.wallet_address && cryptoAmount) {
      const result = await verifyChainPayment({
        chain,
        txid: normalizedTx!,
        expectedAddress: method.wallet_address,
        expectedAmount: cryptoAmount,
        minConfirmations: method.min_confirmations,
      });
      await sql`
        insert into payment_verifications (order_id, user_id, txid, chain, result, expected_address, expected_amount, observed_amount, detail)
        values (
          ${orderId}, ${userId}, ${normalizedTx}, ${chain},
          ${result.ok ? "ok" : result.reason},
          ${method.wallet_address}, ${cryptoAmount},
          ${result.ok ? result.observedAmount : result.observedAmount ?? null},
          ${result.ok ? "auto-verified" : result.detail}
        )
      `;
      if (result.ok && amountCovers(cryptoAmount, result.observedAmount)) {
        note = "Automatically verified on-chain.";
        await sql`
          update orders set status = 'verified', auto_verified = true, verification_note = ${note}, verified_at = now()
          where id = ${orderId} and user_id = ${userId}
        `;
      } else {
        note = result.ok
          ? "On-chain amount did not cover the quote. An admin will review."
          : `${result.detail} An admin will review.`;
        await sql`update orders set verification_note = ${note} where id = ${orderId} and user_id = ${userId}`;
      }
    } else {
      note = "Manual rail. An admin will confirm Cash App / Venmo payment.";
      await sql`update orders set verification_note = ${note} where id = ${orderId} and user_id = ${userId}`;
    }

    return getOrderById(orderId, userId, true);
  }


export const submitOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as SubmitOrderInput)
  .handler(async ({ context, data }) => submitOrderForUser(context.userId, data));

export async function listOrdersForUser(userId: string) {
    const sql = await getSql();
    return sql<{
      id: number;
      public_id: string;
      status: string;
      auto_verified: boolean;
      total_cents: number;
      payment_code: string;
      created_at: string;
    }>`
      select id, public_id, status, auto_verified, total_cents, payment_code, created_at
      from orders where user_id = ${userId}
      order by created_at desc
    `;
}

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => listOrdersForUser(context.userId));

export const getMyOrder = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as { id: number })
  .handler(async ({ context, data }) => {
    const profile = await loadProfile(context.userId);
    return getOrderById(data.id, context.userId, true, profile.is_admin);
  });

export const listAdminOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    return sql<{
      id: number;
      public_id: string;
      user_id: string;
      status: string;
      auto_verified: boolean;
      total_cents: number;
      payment_code: string;
      txid: string | null;
      created_at: string;
      display_name: string | null;
    }>`
      select o.id, o.public_id, o.user_id, o.status, o.auto_verified, o.total_cents, o.payment_code, o.txid, o.created_at,
             pr.display_name
      from orders o
      left join profiles pr on pr.user_id = o.user_id
      order by
        case o.status when 'pending_admin' then 0 when 'verified' then 1 when 'packing' then 2 else 3 end,
        o.created_at desc
    `;
  });

export const moderateOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as { id: number; action: "verify" | "reject" | "pack" | "ship"; note?: string })
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{ id: number; status: string }>`select id, status from orders where id = ${data.id}`;
    const order = rows[0];
    if (!order) throw new Error("Order not found.");
    if (data.action === "verify") {
      await sql`
        update orders set status = 'verified', auto_verified = false, verification_note = ${data.note || "Verified by admin."}, verified_at = now()
        where id = ${data.id}
      `;
    } else if (data.action === "reject") {
      const lines = await sql<{ product_id: number; group_buy_item_id: number | null; qty: number }>`
        select product_id, group_buy_item_id, qty from order_lines where order_id = ${data.id}
      `;
      for (const line of lines) {
        await sql`update products set stock_qty = stock_qty + ${line.qty} where id = ${line.product_id}`;
        if (line.group_buy_item_id) {
          await sql`update group_buy_items set sold_qty = greatest(sold_qty - ${line.qty}, 0) where id = ${line.group_buy_item_id}`;
        }
      }
      await sql`
        update orders set status = 'cancelled', verification_note = ${data.note || "Rejected by admin. Inventory released."}
        where id = ${data.id}
      `;
    } else if (data.action === "pack") {
      await sql`update orders set status = 'packing' where id = ${data.id} and status = 'verified'`;
    } else {
      await sql`update orders set status = 'shipped' where id = ${data.id} and status in ('verified','packing')`;
    }
    return { ok: true };
  });
