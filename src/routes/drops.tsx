import { createFileRoute, Link } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Badge, Card } from "@/components/ui/card";
import { listDrops } from "@/lib/server/catalog";
import { usd } from "@/lib/utils";

export const Route = createFileRoute("/drops")({
  loader: async () => ({ rows: await listDrops() }),
  component: Drops,
});

function tone(status: string) {
  if (status === "live") return "ok" as const;
  if (status === "scheduled") return "warn" as const;
  return "muted" as const;
}

function Drops() {
  const { rows } = Route.useLoaderData();
  return (
    <AppFrame>
      <PageTitle kicker="Drops" title="Timed lots" body="Caps, drop-specific prices, admin fee, and shipping by item count. Inventory is shared with the catalog." />
      {rows.length === 0 ? (
        <p className="text-muted">No drops scheduled.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((d) => (
            <Link key={d.id} to="/drops/$slug" params={{ slug: d.slug }}>
              <Card className="h-full">
                <Badge tone={tone(d.status)}>{d.status}</Badge>
                <h2 className="mt-3 font-display text-3xl">{d.title}</h2>
                <p className="mt-2 text-sm text-muted">{d.description}</p>
                <p className="mt-4 font-mono text-xs text-faint">
                  {new Date(d.starts_at).toLocaleString()} → {new Date(d.ends_at).toLocaleString()} · fee {usd(d.admin_fee_cents)}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppFrame>
  );
}
