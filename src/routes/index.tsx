import { createFileRoute, Link } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProductMark } from "@/components/product-mark";
import { listCatalog, listDrops } from "@/lib/server/catalog";
import { usd } from "@/lib/utils";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [drops, catalog] = await Promise.all([listDrops(), listCatalog()]);
    return { drops, catalog };
  },
  component: Home,
});

function Home() {
  const { drops, catalog } = Route.useLoaderData();
  const live = drops.filter((d) => d.status === "live");

  return (
    <AppFrame>
      <PageTitle
        kicker="Operations desk"
        title="Lots close. Proofs clear. Tests stay on the ledger."
        body="Timed group buys and an always-on catalog share one inventory. Crypto rails auto-check transaction IDs; Cash App and Venmo wait on an admin. Lab panels spawn into the test desk or the COA library."
      />
      <div className="mb-10 flex flex-wrap gap-3">
        <Link to="/drops">
          <Button>Open live drops</Button>
        </Link>
        <Link to="/shop">
          <Button variant="secondary">Browse catalog</Button>
        </Link>
        <Link to="/desk">
          <Button variant="ghost">Chat checkout</Button>
        </Link>
      </div>
      <section className="mb-12">
        <h2 className="mb-4 font-display text-2xl">Live lots</h2>
        {live.length === 0 ? (
          <p className="text-muted">No live drop right now. The catalog remains open.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {live.map((d) => (
              <Link key={d.id} to="/drops/$slug" params={{ slug: d.slug }}>
                <Card className="h-full transition-colors hover:border-accent/40">
                  <Badge tone="ok">Live</Badge>
                  <h3 className="mt-3 font-display text-2xl">{d.title}</h3>
                  <p className="mt-2 text-sm text-muted">{d.description}</p>
                  <p className="mt-4 font-mono text-xs text-faint">
                    Closes {new Date(d.ends_at).toLocaleString()} · admin fee {usd(d.admin_fee_cents)}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-4 font-display text-2xl">Always-on</h2>
        {catalog.length === 0 ? (
          <p className="text-muted">Catalog is warming up. Refresh in a moment.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {catalog.slice(0, 4).map((p) => (
              <Link key={p.id} to="/shop/$slug" params={{ slug: p.slug }}>
                <Card className="overflow-hidden p-0">
                  <div className="h-28">
                    <ProductMark seed={p.image_seed} title={p.sku || p.slug} />
                  </div>
                  <div className="p-4">
                    <p className="text-sm text-fg">{p.name}</p>
                    <p className="mt-1 font-mono text-xs text-muted">{usd(p.always_on_price_cents)}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppFrame>
  );
}
