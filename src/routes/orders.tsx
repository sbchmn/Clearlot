import { createFileRoute, Link } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Badge, Card } from "@/components/ui/card";
import { listMyOrders } from "@/lib/server/orders";
import { usd } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/orders")({ component: OrdersPage });

function tone(s: string) {
  if (s === "verified" || s === "shipped") return "ok" as const;
  if (s === "pending_admin") return "warn" as const;
  if (s === "cancelled") return "danger" as const;
  return "muted" as const;
}

function OrdersPage() {
  const { user, isPending } = useCurrentUserState();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listMyOrders>>>([]);
  useEffect(() => {
    if (user) listMyOrders().then(setRows).catch(() => setRows([]));
  }, [user]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;
  return (
    <AppFrame>
      <PageTitle kicker="Orders" title="Receipts" />
      <div className="space-y-3">
        {rows.map((o) => (
          <Link key={o.id} to="/orders/$id" params={{ id: String(o.id) }}>
            <Card className="flex items-center justify-between">
              <div>
                <p className="font-mono text-sm">{o.public_id}</p>
                <p className="text-xs text-muted">{new Date(o.created_at).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <Badge tone={tone(o.status)}>{o.status.replace("_", " ")}</Badge>
                <p className="mt-1 font-mono text-sm">{usd(o.total_cents)}</p>
              </div>
            </Card>
          </Link>
        ))}
        {!rows.length ? <p className="text-muted">No orders yet.</p> : null}
      </div>
    </AppFrame>
  );
}
