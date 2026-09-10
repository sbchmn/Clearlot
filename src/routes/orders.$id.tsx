import { createFileRoute } from "@tanstack/react-router";
import { AppFrame } from "@/components/app-frame";
import { Badge, Card } from "@/components/ui/card";
import { getMyOrder } from "@/lib/server/orders";
import { usd } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/orders/$id")({ component: Receipt });

function Receipt() {
  const { id } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const [order, setOrder] = useState<Awaited<ReturnType<typeof getMyOrder>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    getMyOrder({ data: { id: Number(id) } }).then(setOrder).catch((e) => setErr(e instanceof Error ? e.message : "Not found"));
  }, [user, id]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;
  if (err) return <AppFrame><p className="text-danger">{err}</p></AppFrame>;
  if (!order) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  const verified = order.status === "verified" || order.status === "packing" || order.status === "shipped";
  return (
    <AppFrame>
      {verified ? (
        <div className="mb-6 rounded-xl border border-ok/40 bg-ok/10 p-5">
          <p className="text-xs uppercase tracking-widest text-ok">Verified</p>
          <h1 className="font-display text-4xl">Payment cleared</h1>
          <p className="mt-2 text-sm text-muted">{order.auto_verified ? "Automatically verified on-chain." : "An admin confirmed this payment."}</p>
        </div>
      ) : order.status === "pending_admin" ? (
        <div className="mb-6 rounded-xl border border-warn/40 bg-warn/10 p-5">
          <p className="text-xs uppercase tracking-widest text-warn">Admin verification pending</p>
          <h1 className="font-display text-4xl">We’re reviewing your payment</h1>
          <p className="mt-2 text-sm text-muted">{order.verification_note || "The automatic chain check could not confirm this transfer. An admin will review the TXID and screenshot."}</p>
        </div>
      ) : (
        <div className="mb-6">
          <h1 className="font-display text-4xl">{order.status}</h1>
        </div>
      )}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-sm">{order.public_id}</p>
            <Badge className="mt-2" tone={verified ? "ok" : "warn"}>{order.status.replace("_", " ")}</Badge>
          </div>
          <p className="font-display text-3xl">{usd(order.total_cents)}</p>
        </div>
        <hr className="my-4 border-border" />
        {order.lines.map((l, i) => (
          <p key={i} className="flex justify-between text-sm">
            <span>{l.qty} × {l.name_snapshot}</span>
            <span className="font-mono">{usd(l.qty * l.unit_price_cents)}</span>
          </p>
        ))}
        <p className="mt-3 flex justify-between text-sm text-muted"><span>Admin fee</span><span>{usd(order.admin_fee_cents)}</span></p>
        <p className="flex justify-between text-sm text-muted"><span>Shipping {order.shipping_label}</span><span>{usd(order.shipping_cents)}</span></p>
        <p className="mt-4 font-mono text-xs text-faint break-all">
          {order.payment_code.toUpperCase()} · {order.txid}
          {order.crypto_amount ? ` · ${order.crypto_amount}` : ""}
        </p>
        <p className="mt-3 text-sm text-muted">
          Ship to {order.ship_name}, {order.ship_line1}, {order.ship_city} {order.ship_region} {order.ship_postal}
        </p>
        {order.proof_data ? (
          <img src={order.proof_data} alt="Payment proof" className="mt-4 max-h-64 rounded-md border border-border" />
        ) : null}
      </Card>
    </AppFrame>
  );
}
