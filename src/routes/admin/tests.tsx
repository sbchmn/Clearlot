import { createFileRoute, Link } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { listTests, saveTest } from "@/lib/server/tests";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/admin/tests")({ component: AdminTests });

function AdminTests() {
  const { user, isPending } = useCurrentUserState();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listTests>>>([]);
  const [title, setTitle] = useState("New panel");
  const [description, setDescription] = useState("");
  const [lab, setLab] = useState(200);
  useEffect(() => {
    if (user) listTests().then(setRows).catch(() => setRows([]));
  }, [user]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;
  return (
    <AppFrame>
      <PageTitle kicker="Admin" title="Test manager" />
      <Card className="mb-6">
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await saveTest({ data: { title, description, total_lab_cost: lab, shipping_cost: 30, refund_per_donor: 20, status: "recruiting" } });
            setRows(await listTests());
          }}
        >
          <div className="md:col-span-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="md:col-span-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div><Label>Lab cost</Label><Input type="number" value={lab} onChange={(e) => setLab(Number(e.target.value))} /></div>
          <div className="flex items-end"><Button type="submit">Create recruiting test</Button></div>
        </form>
      </Card>
      <div className="space-y-3">
        {rows.map((t) => (
          <Link key={t.id} to="/tests/$id" params={{ id: String(t.id) }}>
            <Card>
              <p className="font-display text-xl">{t.title}</p>
              <p className="text-xs text-muted">{t.status} · {t.source}</p>
            </Card>
          </Link>
        ))}
      </div>
    </AppFrame>
  );
}
