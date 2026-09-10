import { createFileRoute, Link } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { clearCart, getCart, updateCartQty } from "@/lib/server/catalog";
import { usd } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/cart")({ component: CartPage });

function CartPage() {
  const { user, isPending } = useCurrentUserState();
  const [cart, setCart] = useState<Awaited<ReturnType<typeof getCart>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function reload() {
    try {
      setCart(await getCart());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load cart");
    }
  }
  useEffect(() => {
    if (user) reload();
  }, [user]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;
  return (
    <AppFrame>
      <PageTitle kicker="Cart" title={cart?.drop_title ? cart.drop_title : "Catalog cart"} />
      {err ? <p className="mb-4 text-sm text-danger">{err}</p> : null}
      {!cart?.items.length ? (
        <p className="text-muted">Empty. Add from a drop or the catalog.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            {cart.items.map((i) => (
              <Card key={i.id} className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{i.name}</p>
                  <p className="font-mono text-xs text-muted">{usd(i.unit_price_cents)} each</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={async () => setCart(await updateCartQty({ data: { itemId: i.id, qty: i.qty - 1 } }))}>−</Button>
                  <span className="w-6 text-center font-mono">{i.qty}</span>
                  <Button variant="secondary" onClick={async () => setCart(await updateCartQty({ data: { itemId: i.id, qty: i.qty + 1 } }))}>+</Button>
                </div>
              </Card>
            ))}
            <Button variant="ghost" onClick={async () => setCart(await clearCart())}>Clear cart</Button>
          </div>
          <Card>
            <p className="text-sm text-muted">Subtotal {usd(cart.subtotal_cents)}</p>
            <p className="text-sm text-muted">Admin fee {usd(cart.admin_fee_cents)}</p>
            <p className="text-sm text-muted">Shipping {usd(cart.shipping?.price_cents ?? 0)}</p>
            <p className="mt-3 font-display text-3xl">{usd(cart.total_cents)}</p>
            <Link to="/checkout">
              <Button className="mt-4 w-full">Checkout</Button>
            </Link>
          </Card>
        </div>
      )}
    </AppFrame>
  );
}
