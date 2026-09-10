import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppFrame } from "@/components/app-frame";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductMark } from "@/components/product-mark";
import { addToCart, getDrop } from "@/lib/server/catalog";
import { usd } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/drops/$slug")({ component: DropPage });

function DropPage() {
  const { slug } = Route.useParams();
  const nav = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [data, setData] = useState<Awaited<ReturnType<typeof getDrop>>>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [err, setErr] = useState<string | null>(null);
  const [needAuth, setNeedAuth] = useState(false);
  useEffect(() => {
    getDrop({ data: { slug } }).then(setData);
  }, [slug]);
  if (!data) {
    return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  }
  if (needAuth && !isPending && !user) return <RedirectToSignIn />;
  const { drop, items, tiers } = data;
  return (
    <AppFrame>
      <p className="text-xs uppercase tracking-widest text-muted">Drop</p>
      <h1 className="mt-2 font-display text-4xl">{drop.title}</h1>
      <p className="mt-3 max-w-2xl text-muted">{drop.description}</p>
      <p className="mt-3 font-mono text-xs text-faint">
        {new Date(drop.starts_at).toLocaleString()} → {new Date(drop.ends_at).toLocaleString()} · admin fee {usd(drop.admin_fee_cents)} · {drop.status}
      </p>
      {tiers.length ? (
        <p className="mt-2 text-sm text-muted">
          Shipping: {tiers.map((t) => `${t.label} ${usd(t.price_cents)}`).join(" · ")}
        </p>
      ) : null}
      {err ? <p className="mt-4 text-sm text-danger">{err}</p> : null}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {items.map((it) => (
          <Card key={it.id} className="overflow-hidden p-0">
            <div className="h-28">
              <ProductMark seed={it.image_seed} title={it.slug} />
            </div>
            <div className="p-5">
              <h2 className="font-display text-2xl">{it.name}</h2>
              <p className="mt-1 text-sm text-muted">{it.description}</p>
              <p className="mt-3 font-mono text-sm">{usd(it.unit_price_cents)} · {it.remaining} / {it.cap_qty} left</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {it.tests.map((t) => (
                  <Badge key={t.id} tone={t.payer === "admin" ? "ok" : "warn"}>
                    {t.test_type} · {t.payer === "admin" ? "admin" : "group"}
                  </Badge>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Input
                  className="w-20"
                  type="number"
                  min={1}
                  max={it.remaining}
                  value={qty[it.id] ?? 1}
                  onChange={(e) => setQty((s) => ({ ...s, [it.id]: Number(e.target.value) }))}
                />
                <Button
                  disabled={drop.status !== "live" || it.remaining < 1}
                  onClick={async () => {
                    if (!user) {
                      setNeedAuth(true);
                      return;
                    }
                    setErr(null);
                    try {
                      await addToCart({
                        data: {
                          productId: it.product_id,
                          qty: qty[it.id] ?? 1,
                          groupBuyItemId: it.id,
                          groupBuyId: drop.id,
                        },
                      });
                      nav({ to: "/cart" });
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : "Could not add");
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </AppFrame>
  );
}
