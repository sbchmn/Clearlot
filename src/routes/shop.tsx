import { createFileRoute, Link } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Card } from "@/components/ui/card";
import { ProductMark } from "@/components/product-mark";
import { listCatalog } from "@/lib/server/catalog";
import { usd } from "@/lib/utils";

export const Route = createFileRoute("/shop")({
  loader: async () => ({ items: await listCatalog() }),
  component: Shop,
});

function Shop() {
  const { items } = Route.useLoaderData();
  return (
    <AppFrame>
      <PageTitle kicker="Catalog" title="Always-on inventory" body="Same SKUs as drops. Catalog prices can differ from a timed lot." />
      {items.length === 0 ? (
        <p className="text-muted">No catalog items yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <Link key={p.id} to="/shop/$slug" params={{ slug: p.slug }}>
              <Card className="overflow-hidden p-0 h-full">
                <div className="h-32">
                  <ProductMark seed={p.image_seed} title={p.sku || p.slug} />
                </div>
                <div className="p-5">
                  <h2 className="font-display text-2xl">{p.name}</h2>
                  <p className="mt-2 line-clamp-3 text-sm text-muted">{p.description}</p>
                  <p className="mt-4 font-mono text-sm">{usd(p.always_on_price_cents)} · {p.stock_qty} in stock</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppFrame>
  );
}
