import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { loadProfile } from "./profile";
import { addToCartForUser, cartView, clearCartForUser, fetchCatalog, fetchDrops, fetchDrop, fetchProduct } from "./catalog";
import { listOrdersForUser, quoteCheckoutForUser, submitOrderForUser } from "./orders";
import { listTestsForUser, requestJoinForUser } from "./tests";
import { usd } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; text: string };
type Payload = {
  viewing?: { kind: "product" | "drop-item"; productId: number; slug: string; groupBuyItemId?: number; groupBuyId?: number };
  ship?: { name?: string; line1?: string; city?: string; region?: string; postal?: string };
  pay?: string;
  txid?: string;
};

const HELP = `I can run a full checkout here.

Commands:
• shop — always-on catalog
• drops — live timed lots
• cart — review basket
• checkout — ship, pay, TXID, proof
• orders — your receipts
• tests — join group tests
• clear — empty cart
• help — this list

During checkout, send the next field as a normal message.`;

async function loadSession(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ step: string; payload: Payload; messages: Msg[] }>`
    select step, payload, messages from bot_sessions where user_id = ${userId}
  `;
  if (rows[0]) return rows[0];
  await sql`
    insert into bot_sessions (user_id, step, payload, messages)
    values (${userId}, 'menu', '{}'::jsonb, ${JSON.stringify([{ role: "assistant", text: HELP }])}::jsonb)
  `;
  return { step: "menu", payload: {}, messages: [{ role: "assistant" as const, text: HELP }] };
}

async function saveSession(userId: string, step: string, payload: Payload, messages: Msg[]) {
  const sql = await getSql();
  const trimmed = messages.slice(-40);
  await sql`
    insert into bot_sessions (user_id, step, payload, messages, updated_at)
    values (${userId}, ${step}, ${JSON.stringify(payload)}::jsonb, ${JSON.stringify(trimmed)}::jsonb, now())
    on conflict (user_id) do update set step = excluded.step, payload = excluded.payload, messages = excluded.messages, updated_at = now()
  `;
  return { step, payload, messages: trimmed };
}

function arg(text: string) {
  const parts = text.trim().split(/\s+/);
  return { cmd: (parts[0] || "").toLowerCase(), rest: parts.slice(1).join(" "), parts };
}

export async function runDeskTurn(
  userId: string,
  data: { text?: string; proofData?: string },
  channel: "web" | "telegram" = "web",
) {
  await loadProfile(userId);
  const session = await loadSession(userId);
  const userText = (data.text || (data.proofData ? "[screenshot attached]" : "")).trim();
  const messages = [...session.messages];
  if (userText) messages.push({ role: "user", text: userText });
  const replies: string[] = [];
  let step = session.step;
  let payload = { ...(session.payload || {}) } as Payload;

  const say = (t: string) => replies.push(t);

  try {
    if (data.proofData && (step === "proof" || step === "pay")) {
      payload = { ...payload };
      const ship = payload.ship;
      if (!payload.pay || !payload.txid || !ship?.name || !ship.line1 || !ship.city || !ship.postal) {
        say("I still need shipping, a payment rail, and a TXID before the screenshot.");
      } else {
        const order = await submitOrderForUser(userId, {
          paymentCode: payload.pay,
          txid: payload.txid,
          proofData: data.proofData,
          ship: {
            name: ship.name,
            line1: ship.line1,
            city: ship.city,
            region: ship.region || "",
            postal: ship.postal,
          },
          channel,
        });
        if (order.status === "verified") {
          say(`Verified. Receipt ${order.public_id}. Total ${usd(order.total_cents)}. Open /orders/${order.id}`);
        } else {
          say(`Admin verification pending for ${order.public_id}. ${order.verification_note || ""}`);
        }
        step = "menu";
        payload = {};
      }
    } else {
      const { cmd, rest, parts } = arg(data.text || "");
      if (["help", "menu", "start", "/start", "/help"].includes(cmd) && (step === "menu" || cmd === "/start")) {
        say(HELP);
        step = "menu";
      } else if (cmd === "shop" || cmd === "catalog") {
        const catalog = await fetchCatalog();
        if (!catalog.length) say("Catalog is empty.");
        else {
          say(catalog.map((p) => `• ${p.slug} — ${p.name} — ${usd(p.always_on_price_cents)} (stock ${p.stock_qty})`).join("\n") + "\n\nSend: view <slug>");
        }
        step = "menu";
      } else if (cmd === "drops") {
        const drops = await fetchDrops();
        const live = drops.filter((d) => d.status === "live");
        if (!live.length) say("No live drops.");
        else say(live.map((d) => `• ${d.slug} — ${d.title} (fee ${usd(d.admin_fee_cents)})`).join("\n") + "\n\nSend: drop <slug>");
        step = "menu";
      } else if (cmd === "view" && parts[1]) {
        const found = await fetchProduct(parts[1]);
        if (!found) say("No product with that slug.");
        else {
          payload.viewing = { kind: "product", productId: found.product.id, slug: found.product.slug };
          say(`${found.product.name}\n${found.product.description}\n${usd(found.product.always_on_price_cents)} · stock ${found.product.stock_qty}\n\nSend: add <qty>`);
          step = "viewing";
        }
      } else if (cmd === "drop" && parts[1]) {
        const found = await fetchDrop(parts[1]);
        if (!found) say("No drop with that slug.");
        else {
          say(
            `${found.drop.title}\nWindow ${new Date(found.drop.starts_at).toLocaleString()} → ${new Date(found.drop.ends_at).toLocaleString()}\nAdmin fee ${usd(found.drop.admin_fee_cents)}\n` +
              found.items.map((i) => `• ${i.slug} — ${usd(i.unit_price_cents)} — ${i.remaining} left`).join("\n") +
              `\n\nSend: take <slug> <qty>`,
          );
          payload.viewing = { kind: "drop-item", productId: found.items[0]?.product_id ?? 0, slug: parts[1], groupBuyId: found.drop.id };
          step = "drop";
        }
      } else if (cmd === "take" && step === "drop") {
        const slug = parts[1];
        const qty = Math.max(1, Number(parts[2] || 1));
        const found = await fetchDrop(payload.viewing?.slug || "");
        const item = found?.items.find((i) => i.slug === slug);
        if (!item || !found) say("Unknown drop item.");
        else {
          await addToCartForUser(userId, { productId: item.product_id, qty, groupBuyItemId: item.id, groupBuyId: found.drop.id });
          const c = await cartView(userId);
          say(`Added. Cart total ${usd(c.total_cents)} (${c.item_count} items). Send cart or checkout.`);
          step = "menu";
        }
      } else if (cmd === "add") {
        const qty = Math.max(1, Number(parts[1] || rest || 1));
        if (!payload.viewing || payload.viewing.kind !== "product") say("View a product first: view <slug>");
        else {
          await addToCartForUser(userId, { productId: payload.viewing.productId, qty });
          const c = await cartView(userId);
          say(`Added. Cart total ${usd(c.total_cents)}. Send cart or checkout.`);
          step = "menu";
        }
      } else if (cmd === "cart") {
        const c = await cartView(userId);
        if (!c.items.length) say("Cart is empty.");
        else {
          say(
            c.items.map((i) => `• ${i.qty} × ${i.name} @ ${usd(i.unit_price_cents)}`).join("\n") +
              `\nSubtotal ${usd(c.subtotal_cents)} · fee ${usd(c.admin_fee_cents)} · ship ${usd(c.shipping?.price_cents ?? 0)}\nTotal ${usd(c.total_cents)}`,
          );
        }
      } else if (cmd === "clear") {
        await clearCartForUser(userId);
        say("Cart cleared.");
        step = "menu";
        payload = {};
      } else if (cmd === "orders") {
        const orders = await listOrdersForUser(userId);
        if (!orders.length) say("No orders yet.");
        else say(orders.map((o) => `• ${o.public_id} — ${o.status} — ${usd(o.total_cents)}`).join("\n"));
      } else if (cmd === "tests") {
        const tests = await listTestsForUser(userId);
        say(
          tests
            .map((t) => `• #${t.id} ${t.title} [${t.status}]${t.my_state ? ` you:${t.my_state}` : ""}`)
            .join("\n") + "\n\nSend: join <id>",
        );
      } else if (cmd === "join" && parts[1]) {
        await requestJoinForUser(userId, { id: Number(parts[1]) });
        say("Join request submitted.");
      } else if (cmd === "checkout") {
        const c = await cartView(userId);
        if (!c.items.length) say("Cart is empty.");
        else {
          say(`Total ${usd(c.total_cents)}. Ship to whom? Send your name.`);
          step = "ship_name";
        }
      } else if (step === "ship_name") {
        payload.ship = { ...(payload.ship || {}), name: data.text!.trim() };
        say("Street address?");
        step = "ship_line";
      } else if (step === "ship_line") {
        payload.ship = { ...(payload.ship || {}), line1: data.text!.trim() };
        say("City?");
        step = "ship_city";
      } else if (step === "ship_city") {
        payload.ship = { ...(payload.ship || {}), city: data.text!.trim() };
        say("State / region?");
        step = "ship_region";
      } else if (step === "ship_region") {
        payload.ship = { ...(payload.ship || {}), region: data.text!.trim() };
        say("Postal code?");
        step = "ship_postal";
      } else if (step === "ship_postal") {
        payload.ship = { ...(payload.ship || {}), postal: data.text!.trim() };
        const quote = await quoteCheckoutForUser(userId);
        const rails = quote.methods.map((m) => {
          if (m.kind === "crypto") return `• ${m.code} — ${m.label} — ${quote.quotes[m.code] ?? "?"} to ${m.wallet_address}`;
          return `• ${m.code} — ${m.label} — ${m.handle} (manual)`;
        });
        say(`Pay how?\n${rails.join("\n")}\n\nSend the code (btc, etc, sol, tron, cashapp, venmo).`);
        step = "pay";
      } else if (step === "pay") {
        const code = cmd;
        const quote = await quoteCheckoutForUser(userId);
        const m = quote.methods.find((x) => x.code === code);
        if (!m) say("Unknown rail. Send btc, etc, sol, tron, cashapp, or venmo.");
        else {
          payload.pay = code;
          if (m.kind === "crypto") {
            say(`Send ${quote.quotes[code]} ${code.toUpperCase()} to ${m.wallet_address}\nThen paste the TXID.`);
          } else {
            say(`Send ${usd(quote.cart.total_cents)} to ${m.handle}. Then paste a payment reference / confirmation id.`);
          }
          step = "txid";
        }
      } else if (step === "txid") {
        payload.txid = data.text!.trim();
        say("Attach a payment-proof screenshot to finish. Use the paperclip on this desk.");
        step = "proof";
      } else {
        say("I didn’t catch that. Send help for commands, or continue the current step.");
      }
    }
  } catch (err) {
    say(err instanceof Error ? err.message : "Something went wrong.");
  }

  for (const r of replies) messages.push({ role: "assistant", text: r });
  const saved = await saveSession(userId, step, payload, messages);
  return { ...saved, replies };
}

export const getDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await loadProfile(context.userId);
    return loadSession(context.userId);
  });

export const deskMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as { text?: string; proofData?: string })
  .handler(async ({ context, data }) => {
    const result = await runDeskTurn(context.userId, data, "web");
    return { step: result.step, payload: result.payload, messages: result.messages };
  });
