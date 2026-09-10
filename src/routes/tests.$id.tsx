import { createFileRoute } from "@tanstack/react-router";
import { AppFrame } from "@/components/app-frame";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { getTest, markTestPaid, moderateParticipation, requestJoinTest } from "@/lib/server/tests";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/tests/$id")({ component: TestDetail });

function TestDetail() {
  const { id } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const [data, setData] = useState<Awaited<ReturnType<typeof getTest>>>(null);
  const [reason, setReason] = useState("");
  async function reload() {
    setData(await getTest({ data: { id: Number(id) } }));
  }
  useEffect(() => {
    if (user) reload();
  }, [user, id]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;
  if (!data) return <AppFrame><p className="text-muted">Not found.</p></AppFrame>;
  const { test, mine, participants, costs, canSeeResults, isAdmin } = data;
  return (
    <AppFrame>
      <p className="text-xs uppercase tracking-widest text-muted">Group test</p>
      <h1 className="mt-2 font-display text-4xl">{test.title}</h1>
      <p className="mt-2 max-w-2xl text-muted">{test.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge>{test.status.replaceAll("_", " ")}</Badge>
        {test.compound ? <Badge tone="muted">{test.compound}</Badge> : null}
        {test.source === "group_buy" ? <Badge tone="ok">Spawned from a drop</Badge> : null}
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-display text-2xl">Cost share</h2>
          <p className="mt-2 text-sm text-muted">Lab {costs.totalFixed.toFixed(2)} split across approved members. Donors receive a {Number(test.refund_per_donor).toFixed(2)} credit.</p>
          <p className="mt-3 font-mono text-sm">Donor pays {costs.donorPays.toFixed(2)}</p>
          <p className="font-mono text-sm">Non-donor pays {costs.nonDonorPays.toFixed(2)}</p>
          {!mine ? (
            <Button className="mt-4" onClick={async () => { await requestJoinTest({ data: { id: Number(id) } }); reload(); }}>
              Request to join
            </Button>
          ) : mine.denied ? (
            <div className="mt-4">
              <p className="text-sm text-danger">Denied: {mine.denied_reason}</p>
              <Button className="mt-2" variant="secondary" onClick={async () => { await requestJoinTest({ data: { id: Number(id) } }); reload(); }}>
                Reapply
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">
              {mine.approved ? `Approved. You owe ${Number(mine.amount_owed).toFixed(2)}.` : "Join request pending."}
            </p>
          )}
        </Card>
        <Card>
          <h2 className="font-display text-2xl">Results</h2>
          {canSeeResults ? (
            <div className="mt-3 text-sm">
              {test.results_link ? <a className="text-accent underline" href={test.results_link} target="_blank" rel="noreferrer">Open results</a> : <p className="text-muted">No link posted yet.</p>}
              {test.results_note ? <p className="mt-2 text-muted">{test.results_note}</p> : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Results unlock for approved members marked paid after the test closes.</p>
          )}
        </Card>
      </div>
      {isAdmin ? (
        <Card className="mt-6">
          <h2 className="font-display text-2xl">Participants</h2>
          <div className="mt-4 space-y-3">
            {participants.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                  <p>{p.display_name}</p>
                  <p className="text-xs text-muted">
                    {p.denied ? "denied" : p.approved ? "approved" : "pending"} · owed {Number(p.amount_owed).toFixed(2)}
                    {p.denied_reason ? ` · ${p.denied_reason}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={async () => { await moderateParticipation({ data: { participationId: p.id, action: "approve" } }); reload(); }}>Approve</Button>
                  <Button variant="ghost" onClick={async () => { await moderateParticipation({ data: { participationId: p.id, action: "deny", reason: reason || "Not eligible" } }); reload(); }}>Deny</Button>
                  <Button variant="ghost" onClick={async () => { await markTestPaid({ data: { participationId: p.id, amountPaid: Number(p.amount_owed), paid: true } }); reload(); }}>Mark paid</Button>
                </div>
              </div>
            ))}
            <div>
              <Label>Denial reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
        </Card>
      ) : null}
    </AppFrame>
  );
}
