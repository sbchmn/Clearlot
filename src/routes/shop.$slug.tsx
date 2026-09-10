import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppFrame } from "@/components/app-frame";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { ProductMark } from "@/components/product-mark";
import { addToCart, getProduct } from "@/lib/server/catalog";
import { usd } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/shop/$slug")({ component: ProductPage });

function ProductPage() {
  const { slug } = Route.useParams();
  const nav = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [data, setData] = useState<Awaited<ReturnType<typeof getProduct>>>(null);
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [needAuth, setNeedAuth] = useState(false);
  useEffect(() => {
    getProduct({ data: { slug } }).then(setData);
  }, [slug]);
  if (!data) {
    return (
      <AppFrame>
        <p className="text-muted">Loading…</p>
      </AppFrame>
    );
  }
  if (needAuth && !isPending && !user) return <RedirectToSignIn />;
  const p = data.product;
  return (
    <AppFrame>
      <div className="grid gap-8 md:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <div className="h-64">
            <ProductMark seed={p.image_seed} title={p.sku || p.slug} />
          </div>
        </Card>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted">Catalog</p>
          <h1 className="mt-2 font-display text-4xl">{p.name}</h1>
          <p className="mt-3 text-muted">{p.description}</p>
          <p className="mt-4 font-mono text-lg">{usd(p.always_on_price_cents)}</p>
          <p className="text-sm text-muted">{p.stock_qty} available</p>
          {data.tests.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {data.tests.map((t) => (
                <Badge key={t.id} tone={t.payer === "admin" ? "ok" : "warn"}>
                  {t.test_type} · {t.payer === "admin" ? "admin-covered" : "group-funded"}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="mt-6 max-w-32">
            <Label>Qty</Label>
            <Input type="number" min={1} max={p.stock_qty} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </div>
          {err ? <p className="mt-3 text-sm text-danger">{err}</p> : null}
          <Button
            className="mt-4"
            onClick={async () => {
              if (!user) {
                setNeedAuth(true);
                return;
              }
              setErr(null);
              try {
                await addToCart({ data: { productId: p.id, qty } });
                nav({ to: "/cart" });
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Could not add");
              }
            }}
          >
            Add to cart
          </Button>
        </div>
      </div>
    </AppFrame>
  );
}
