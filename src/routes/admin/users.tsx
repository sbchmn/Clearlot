import { createFileRoute } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listUsers, setUserAdmin } from "@/lib/server/admin";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/admin/users")({ component: AdminUsers });

function AdminUsers() {
  const { user, isPending } = useCurrentUserState();
  const [rows, setRows] = useState<Array<{ user_id: string; display_name: string; is_admin: boolean }>>([]);
  async function reload() {
    setRows((await listUsers()) as typeof rows);
  }
  useEffect(() => {
    if (user) reload().catch(() => setRows([]));
  }, [user]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;
  return (
    <AppFrame>
      <PageTitle kicker="Admin" title="Members" />
      <div className="space-y-3">
        {rows.map((u) => (
          <Card key={u.user_id} className="flex items-center justify-between">
            <div>
              <p>{u.display_name || u.user_id}</p>
              <p className="font-mono text-xs text-muted">{u.user_id}</p>
            </div>
            <Button
              variant={u.is_admin ? "secondary" : "ghost"}
              onClick={async () => {
                await setUserAdmin({ data: { userId: u.user_id, isAdmin: !u.is_admin } });
                reload();
              }}
            >
              {u.is_admin ? "Admin" : "Make admin"}
            </Button>
          </Card>
        ))}
      </div>
    </AppFrame>
  );
}
