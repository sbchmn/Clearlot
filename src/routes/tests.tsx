import { createFileRoute, Link } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Badge, Card } from "@/components/ui/card";
import { listTests } from "@/lib/server/tests";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/tests")({ component: TestsPage });

function TestsPage() {
  const { user, isPending } = useCurrentUserState();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listTests>>>([]);
  useEffect(() => {
    if (user) listTests().then(setRows).catch(() => setRows([]));
  }, [user]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;
  return (
    <AppFrame>
      <PageTitle kicker="Tests" title="Group lab tests" body="Recruiting panels are open. Closed results stay gated to approved paid members." />
      <div className="grid gap-3">
        {rows.map((t) => (
          <Link key={t.id} to="/tests/$id" params={{ id: String(t.id) }}>
            <Card className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl">{t.title}</h2>
                <p className="text-sm text-muted">{t.description}</p>
              </div>
              <div className="text-right">
                <Badge>{t.status.replaceAll("_", " ")}</Badge>
                {t.my_state ? <p className="mt-2 text-xs text-muted">{t.my_state}</p> : null}
              </div>
            </Card>
          </Link>
        ))}
        {!rows.length ? <p className="text-muted">No tests visible yet.</p> : null}
      </div>
    </AppFrame>
  );
}
