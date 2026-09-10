import { createFileRoute } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { listAdminProducts } from "@/lib/server/admin";
import { listDrops, saveDrop } from "@/lib/server/catalog";
import { usd } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/admin/drops")({ component: AdminDrops });

function AdminDrops() {
  const { user, isPending } = useCurrentUserState();
  const [drops, setDrops] = useState<Awaited<ReturnType<typeof listDrops>>>([]);
  const [products, setProducts] = useState<Array<Record<string, unknown>>>([]);
  const [title, setTitle] = useState("New lot");
  const [description, setDescription] = useState("");
  const [fee, setFee] = useState(500);
  const [status, setStatus] = useState("live");
  const [starts, setStarts] = useState(new Date().toISOString().slice(0, 16));
  const [ends, setEnds] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16));
  const [picked, setPicked] = useState<Record<number, { on: boolean; price: number; cap: number; tests: string }>>({});
  useEffect(() => {
    if (!user) return;
    listDrops().then(setDrops).catch(() => setDrops([]));
    listAdminProducts().then((p) => {
      const rows = p as Array<Record<string, unknown>>;
      setProducts(rows);
      const init: typeof picked = {};
      for (const row of rows) {
        init[Number(row.id)] = { on: false, price: Number(row.always_on_price_cents), cap: 10, tests: "Mass|admin|public_result\nEndotoxins|group_funded|group_test" };
      }
      setPicked(init);
    }).catch(() => setProducts([]));
  }, [user]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;
  return (
    <AppFrame>
      <PageTitle kicker="Admin" title="Group buys" body="Timed window, per-item prices and caps, admin fee, shipping by count, and test spawn rules." />
      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const items = Object.entries(picked).filter(([, v]) => v.on).map(([id, v]) => ({
                product_id: Number(id),
                unit_price_cents: v.price,
                cap_qty: v.cap,
                tests: v.tests.split("\n").map((line) => {
                  const [test_type, payer, creates] = line.split("|").map((s) => s.trim());
                  return { test_type, payer: payer || "admin", creates: creates || "public_result" };
                }).filter((t) => t.test_type),
              }));
              await saveDrop({
                data: {
                  title,
                  slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
                  description,
                  status,
                  starts_at: new Date(starts).toISOString(),
                  ends_at: new Date(ends).toISOString(),
                  admin_fee_cents: fee,
                  items,
                  tiers: [
                    { min_items: 1, max_items: 2, price_cents: 800, label: "1–2 items" },
                    { min_items: 3, max_items: null, price_cents: 1200, label: "3+ items" },
                  ],
                },
              });
              setDrops(await listDrops());
            }}
          >
            <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Starts</Label><Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} /></div>
              <div><Label>Ends</Label><Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Admin fee (cents)</Label><Input type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} /></div>
              <div>
                <Label>Status</Label>
                <Input value={status} onChange={(e) => setStatus(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted">Select SKUs. Tests: type|payer|creates</p>
            {products.map((p) => {
              const id = Number(p.id);
              const row = picked[id];
              if (!row) return null;
              return (
                <div key={id} className="rounded-md border border-border p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={row.on} onChange={(e) => setPicked({ ...picked, [id]: { ...row, on: e.target.checked } })} />
                    {String(p.name)}
                  </label>
                  {row.on ? (
                    <div className="mt-2 grid gap-2">
                      <Input type="number" value={row.price} onChange={(e) => setPicked({ ...picked, [id]: { ...row, price: Number(e.target.value) } })} />
                      <Input type="number" value={row.cap} onChange={(e) => setPicked({ ...picked, [id]: { ...row, cap: Number(e.target.value) } })} />
                      <Textarea value={row.tests} onChange={(e) => setPicked({ ...picked, [id]: { ...row, tests: e.target.value } })} />
                    </div>
                  ) : null}
                </div>
              );
            })}
            <Button type="submit">Save drop (spawns tests if live)</Button>
          </form>
        </Card>
        <div className="space-y-3">
          {drops.map((d) => (
            <Card key={d.id}>
              <Badge>{d.status}</Badge>
              <p className="mt-2 font-display text-2xl">{d.title}</p>
              <p className="text-xs text-muted">{usd(d.admin_fee_cents)} fee · {new Date(d.ends_at).toLocaleString()}</p>
            </Card>
          ))}
        </div>
      </div>
    </AppFrame>
  );
}
