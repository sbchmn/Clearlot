import { createFileRoute } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Badge, Card } from "@/components/ui/card";
import { listPublicResults } from "@/lib/server/tests";

export const Route = createFileRoute("/library")({
  loader: async () => ({ rows: await listPublicResults() }),
  component: Library,
});

function Library() {
  const { rows } = Route.useLoaderData();
  return (
    <AppFrame>
      <PageTitle kicker="COA library" title="Public results" body="Admin-covered panels land here as published certificates. Group-funded panels stay on the test desk." />
      {rows.length === 0 ? (
        <p className="text-muted">No published certificates yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="flex items-center gap-2">
                <Badge tone={r.published ? "ok" : "warn"}>{r.published ? "Published" : "Stub"}</Badge>
                {r.source === "group_buy" ? <Badge>From drop</Badge> : null}
              </div>
              <h2 className="mt-3 font-display text-2xl">{r.title}</h2>
              <p className="mt-2 text-sm text-muted">{r.summary || ""}</p>
              {r.results_link ? (
                <a className="mt-3 inline-block text-sm text-accent underline" href={r.results_link} target="_blank" rel="noreferrer">
                  Open COA
                </a>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </AppFrame>
  );
}
