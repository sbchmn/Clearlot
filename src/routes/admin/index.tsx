import { createFileRoute, Link } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Card } from "@/components/ui/card";
import { adminOverview } from "@/lib/server/admin";
import { getMyProfile } from "@/lib/server/profile";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

const tiles = [
  { to: "/admin/orders", label: "Orders", key: "pendingOrders" as const },
  { to: "/admin/drops", label: "Drops", key: "liveDrops" as const },
  { to: "/admin/tests", label: "Tests", key: "recruitingTests" as const },
  { to: "/admin/users", label: "Members", key: "members" as const },
];

function AdminHome() {
  const { user, isPending } = useCurrentUserState();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof adminOverview>> | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (!user) return;
    getMyProfile().then((p) => {
      if (!p.is_admin) setDenied(true);
      else adminOverview().then(setStats);
    });
  }, [user]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;
  if (denied) return <AppFrame><p className="text-danger">Admin only.</p></AppFrame>;
  return (
    <AppFrame>
      <PageTitle kicker="Admin" title="Clearlot desk" body="Settlement, drops, catalog, tests, and members." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to}>
            <Card>
              <p className="text-xs uppercase tracking-widest text-muted">{t.label}</p>
              <p className="mt-2 font-display text-4xl">{stats ? stats[t.key] : "—"}</p>
            </Card>
          </Link>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link className="text-accent underline" to="/admin/products">Products</Link>
        <Link className="text-accent underline" to="/admin/settlement">Settlement rails</Link>
        <Link className="text-accent underline" to="/admin/drops">Group buy editor</Link>
        <Link className="text-accent underline" to="/admin/orders">Order queue</Link>
        <Link className="text-accent underline" to="/admin/tests">Test manager</Link>
        <Link className="text-accent underline" to="/admin/users">Users</Link>
      </div>
    </AppFrame>
  );
}
