import { createFileRoute } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { listSettlement, saveSettlement } from "@/lib/server/admin";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/admin/settlement")({ component: Settlement });

type Row = {
  code: string;
  kind: string;
  label: string;
  enabled: boolean;
  wallet_address: string | null;
  handle: string | null;
  instructions: string | null;
  min_confirmations: number;
};

function Settlement() {
  const { user, isPending } = useCurrentUserState();
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (user) listSettlement().then((r) => setRows(r as Row[])).catch((e) => setMsg(e instanceof Error ? e.message : "Denied"));
  }, [user]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;
  return (
    <AppFrame>
      <PageTitle kicker="Group buy configuration" title="Settlement rails" body="Enable chains and paste wallet IDs. Cash App and Venmo stay manual. Auto-verify never succeeds on a lookup error." />
      <div className="space-y-4">
        {rows.map((r, i) => (
          <Card key={r.code}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl">{r.label}</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, enabled: e.target.checked };
                    setRows(next);
                  }}
                />
                Enabled
              </label>
            </div>
            {r.kind === "crypto" ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Wallet ID</Label>
                  <Input className="font-mono" value={r.wallet_address || ""} onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, wallet_address: e.target.value };
                    setRows(next);
                  }} />
                </div>
                <div>
                  <Label>Min confirmations</Label>
                  <Input type="number" value={r.min_confirmations} onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, min_confirmations: Number(e.target.value) };
                    setRows(next);
                  }} />
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <Label>Handle</Label>
                <Input value={r.handle || ""} onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...r, handle: e.target.value };
                  setRows(next);
                }} />
              </div>
            )}
            <div className="mt-3">
              <Label>Instructions</Label>
              <Textarea value={r.instructions || ""} onChange={(e) => {
                const next = [...rows];
                next[i] = { ...r, instructions: e.target.value };
                setRows(next);
              }} />
            </div>
          </Card>
        ))}
        <Button
          onClick={async () => {
            setMsg(null);
            try {
              await saveSettlement({ data: rows });
              setMsg("Saved.");
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Save failed");
            }
          }}
        >
          Save rails
        </Button>
        {msg ? <p className="text-sm text-muted">{msg}</p> : null}
      </div>
    </AppFrame>
  );
}
