import { createFileRoute, Link } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listAdminOrders, moderateOrder } from "@/lib/server/orders";
import { usd } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/admin/orders")({ component: AdminOrders });

function AdminOrders() {
  const { user, isPending } = useCurrentUserState();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listAdminOrders>>>([]);
  async function reload() {
    setRows(await listAdminOrders());
  }
  useEffect(() => {
    if (user) reload().catch(() => setRows([]));
  }, [user]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;
  return (
    <AppFrame>
      <PageTitle kicker="Admin" title="Order queue" body="Pending-admin first. Verify credits the order; reject restocks inventory." />
      <div className="space-y-3">
        {rows.map((o) => (
          <Card key={o.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link className="font-mono text-sm underline" to="/orders/$id" params={{ id: String(o.id) }}>{o.public_id}</Link>
              <p className="text-xs text-muted">{o.display_name || o.user_id} · {o.payment_code} · {o.txid?.slice(0, 18)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={o.status === "pending_admin" ? "warn" : o.status === "cancelled" ? "danger" : "ok"}>{o.status.replace("_", " ")}</Badge>
              <span className="font-mono text-sm">{usd(o.total_cents)}</span>
              {o.status === "pending_admin" ? (
                <>
                  <Button onClick={async () => { await moderateOrder({ data: { id: o.id, action: "verify" } }); reload(); }}>Verify</Button>
                  <Button variant="ghost" onClick={async () => { await moderateOrder({ data: { id: o.id, action: "reject" } }); reload(); }}>Reject</Button>
                </>
              ) : null}
              {o.status === "verified" ? <Button variant="secondary" onClick={async () => { await moderateOrder({ data: { id: o.id, action: "pack" } }); reload(); }}>Pack</Button> : null}
              {o.status === "packing" ? <Button variant="secondary" onClick={async () => { await moderateOrder({ data: { id: o.id, action: "ship" } }); reload(); }}>Ship</Button> : null}
            </div>
          </Card>
        ))}
      </div>
    </AppFrame>
  );
}
