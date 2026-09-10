import { createFileRoute } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deskMessage, getDesk } from "@/lib/server/bot";
import { compressImage } from "@/lib/compress-image";
import { useEffect, useRef, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/desk")({ component: Desk });

function Desk() {
  const { user, isPending } = useCurrentUserState();
  const [session, setSession] = useState<Awaited<ReturnType<typeof getDesk>> | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  async function reload() {
    setSession(await getDesk());
  }
  useEffect(() => {
    if (user) reload();
  }, [user]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;

  async function send(payload: { text?: string; proofData?: string }) {
    setBusy(true);
    try {
      setSession(await deskMessage({ data: payload }));
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppFrame>
      <PageTitle kicker="Desk" title="Chat checkout" body="Same flow the Telegram bot uses: browse, cart, ship, TXID, screenshot." />
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 max-h-[55vh] space-y-3 overflow-y-auto rounded-xl border border-border bg-surface p-4">
          {(session?.messages ?? []).map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <pre className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-accent text-accent-fg" : "bg-elevated text-fg"}`}>
                {m.text}
              </pre>
            </div>
          ))}
          <div ref={bottom} />
        </div>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            send({ text });
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="shop · drops · checkout · help" />
          <Button type="submit" disabled={busy}>Send</Button>
        </form>
        <div className="mt-3">
          <label className="text-xs text-muted">
            Attach proof
            <Input
              className="mt-1"
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const proofData = await compressImage(file);
                await send({ proofData });
              }}
            />
          </label>
        </div>
      </div>
    </AppFrame>
  );
}
