import { createFileRoute } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { createTelegramLink, getMyProfile, updateMyProfile } from "@/lib/server/profile";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

function ProfilePage() {
  const { user, isPending } = useCurrentUserState();
  const [form, setForm] = useState({ display_name: "", ship_name: "", ship_line1: "", ship_city: "", ship_region: "", ship_postal: "", ship_country: "US" });
  const [saved, setSaved] = useState(false);
  const [linked, setLinked] = useState(false);
  const [tg, setTg] = useState<{ token: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!user) return;
    getMyProfile().then((p) => {
      setForm({
        display_name: p.display_name,
        ship_name: p.ship_name || "",
        ship_line1: p.ship_line1 || "",
        ship_city: p.ship_city || "",
        ship_region: p.ship_region || "",
        ship_postal: p.ship_postal || "",
        ship_country: p.ship_country || "US",
      });
      setLinked(Boolean(p.telegram_user_id));
    });
  }, [user]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;
  return (
    <AppFrame>
      <PageTitle kicker="Account" title="Profile & shipping" />
      <form
        className="max-w-lg space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await updateMyProfile({ data: form });
          setSaved(true);
        }}
      >
        {Object.entries({ display_name: "Display name", ship_name: "Ship name", ship_line1: "Street", ship_city: "City", ship_region: "Region", ship_postal: "Postal", ship_country: "Country" }).map(([k, label]) => (
          <div key={k}>
            <Label>{label}</Label>
            <Input value={(form as Record<string, string>)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </div>
        ))}
        <Button type="submit">Save</Button>
        {saved ? <p className="text-sm text-ok">Saved.</p> : null}
      </form>
      <Card className="mt-8 max-w-lg">
        <h2 className="font-display text-2xl">Telegram desk</h2>
        <p className="mt-2 text-sm text-muted">
          {linked
            ? "This account is linked. Chat checkout on Telegram uses the same cart and receipts."
            : "Link Telegram to run the full checkout from chat. An admin must set the bot token first."}
        </p>
        <Button
          className="mt-4"
          variant="secondary"
          onClick={async () => {
            const next = await createTelegramLink();
            setTg(next);
          }}
        >
          {linked ? "Relink Telegram" : "Link Telegram"}
        </Button>
        {tg ? (
          <div className="mt-3 space-y-2 text-sm">
            {tg.url ? (
              <a className="text-accent underline" href={tg.url} target="_blank" rel="noreferrer">
                Open bot with link token
              </a>
            ) : (
              <p className="font-mono text-xs text-muted break-all">Send /start {tg.token} to the Clearlot bot.</p>
            )}
          </div>
        ) : null}
      </Card>
    </AppFrame>
  );
}
