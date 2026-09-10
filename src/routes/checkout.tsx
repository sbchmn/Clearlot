import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { getMyProfile, updateMyProfile } from "@/lib/server/profile";
import { quoteCheckout, submitOrder } from "@/lib/server/orders";
import { compressImage } from "@/lib/compress-image";
import { formatCrypto, usd } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/checkout")({ component: Checkout });

function Checkout() {
  const { user, isPending } = useCurrentUserState();
  const nav = useNavigate();
  const [quote, setQuote] = useState<Awaited<ReturnType<typeof quoteCheckout>> | null>(null);
  const [pay, setPay] = useState("btc");
  const [txid, setTxid] = useState("");
  const [proof, setProof] = useState<string | null>(null);
  const [ship, setShip] = useState({ name: "", line1: "", city: "", region: "", postal: "", country: "US" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    quoteCheckout().then((q) => {
      setQuote(q);
      if (q.methods[0]) setPay(q.methods[0].code);
    }).catch((e) => setErr(e instanceof Error ? e.message : "Quote failed"));
    getMyProfile().then((p) => {
      setShip({
        name: p.ship_name || p.display_name || "",
        line1: p.ship_line1 || "",
        city: p.ship_city || "",
        region: p.ship_region || "",
        postal: p.ship_postal || "",
        country: p.ship_country || "US",
      });
    });
  }, [user]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;
  const method = quote?.methods.find((m) => m.code === pay);
  const cryptoAmt = quote?.quotes[pay];

  return (
    <AppFrame>
      <PageTitle kicker="Checkout" title="Settle the lot" body="TXID and a payment screenshot are required. Crypto is checked on-chain; if that fails, the order waits on an admin." />
      {!quote?.cart.items.length ? (
        <p className="text-muted">Cart is empty.</p>
      ) : (
        <form
          className="grid gap-6 lg:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!proof) {
              setErr("Payment proof screenshot is required.");
              return;
            }
            setBusy(true);
            setErr(null);
            try {
              await updateMyProfile({ data: { display_name: ship.name, ship_name: ship.name, ship_line1: ship.line1, ship_city: ship.city, ship_region: ship.region, ship_postal: ship.postal, ship_country: ship.country } });
              const order = await submitOrder({
                data: { paymentCode: pay, txid, proofData: proof, ship, channel: "web" },
              });
              nav({ to: "/orders/$id", params: { id: String(order.id) } });
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Submit failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-4">
            <Card>
              <h2 className="mb-3 font-display text-2xl">Ship to</h2>
              <div className="grid gap-3">
                <div><Label>Name</Label><Input required value={ship.name} onChange={(e) => setShip({ ...ship, name: e.target.value })} /></div>
                <div><Label>Street</Label><Input required value={ship.line1} onChange={(e) => setShip({ ...ship, line1: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>City</Label><Input required value={ship.city} onChange={(e) => setShip({ ...ship, city: e.target.value })} /></div>
                  <div><Label>Region</Label><Input required value={ship.region} onChange={(e) => setShip({ ...ship, region: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Postal</Label><Input required value={ship.postal} onChange={(e) => setShip({ ...ship, postal: e.target.value })} /></div>
                  <div><Label>Country</Label><Input value={ship.country} onChange={(e) => setShip({ ...ship, country: e.target.value })} /></div>
                </div>
              </div>
            </Card>
            <Card>
              <h2 className="mb-3 font-display text-2xl">Payment</h2>
              <div className="mb-4 flex flex-wrap gap-2">
                {quote.methods.map((m) => (
                  <button
                    type="button"
                    key={m.code}
                    onClick={() => setPay(m.code)}
                    className={`rounded-full border px-3 py-2 text-sm ${pay === m.code ? "border-accent bg-accent text-accent-fg" : "border-border text-muted"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {method?.kind === "crypto" ? (
                <div className="space-y-2 text-sm">
                  <p>Send <span className="font-mono text-fg">{cryptoAmt ? formatCrypto(cryptoAmt, pay) : "—"}</span></p>
                  <p className="break-all font-mono text-xs text-muted">{method.wallet_address}</p>
                  <p className="text-muted">{method.instructions}</p>
                </div>
              ) : (
                <p className="text-sm text-muted">Send {usd(quote.cart.total_cents)} to {method?.handle}. This rail is always admin-reviewed.</p>
              )}
              <div className="mt-4">
                <Label>{method?.kind === "crypto" ? "Transaction ID" : "Payment reference"}</Label>
                <Input required value={txid} onChange={(e) => setTxid(e.target.value)} className="font-mono" />
              </div>
              <div className="mt-4">
                <Label>Payment proof screenshot</Label>
                <Input
                  type="file"
                  accept="image/*"
                  required
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setProof(await compressImage(file));
                    } catch (err) {
                      setErr(err instanceof Error ? err.message : "Image failed");
                    }
                  }}
                />
                {proof ? <p className="mt-2 text-xs text-ok">Screenshot attached.</p> : null}
              </div>
            </Card>
          </div>
          <div>
            <Card>
              {quote.cart.items.map((i) => (
                <p key={i.id} className="flex justify-between text-sm">
                  <span>{i.qty} × {i.name}</span>
                  <span className="font-mono">{usd(i.line_cents)}</span>
                </p>
              ))}
              <hr className="my-3 border-border" />
              <p className="flex justify-between text-sm text-muted"><span>Subtotal</span><span>{usd(quote.cart.subtotal_cents)}</span></p>
              <p className="flex justify-between text-sm text-muted"><span>Admin fee</span><span>{usd(quote.cart.admin_fee_cents)}</span></p>
              <p className="flex justify-between text-sm text-muted"><span>Shipping</span><span>{usd(quote.cart.shipping?.price_cents ?? 0)}</span></p>
              <p className="mt-3 flex justify-between font-display text-3xl"><span>Due</span><span>{usd(quote.cart.total_cents)}</span></p>
              {err ? <p className="mt-3 text-sm text-danger">{err}</p> : null}
              <Button type="submit" className="mt-4 w-full" disabled={busy}>{busy ? "Checking chain…" : "Submit order"}</Button>
              <Badge className="mt-3" tone="muted">Auto-verify on BTC / ETC / SOL / TRON. Manual on Cash App / Venmo.</Badge>
            </Card>
          </div>
        </form>
      )}
    </AppFrame>
  );
}
