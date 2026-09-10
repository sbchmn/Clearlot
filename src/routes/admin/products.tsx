import { createFileRoute } from "@tanstack/react-router";
import { AppFrame, PageTitle } from "@/components/app-frame";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { listAdminProducts, saveProduct } from "@/lib/server/admin";
import { usd } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";

export const Route = createFileRoute("/admin/products")({ component: AdminProducts });

function AdminProducts() {
  const { user, isPending } = useCurrentUserState();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({ name: "", description: "", sku: "", stock_qty: 10, always_on_price_cents: 2500, always_on_enabled: true, active: true, tests: "Mass|admin|public_result" });
  async function reload() {
    setRows((await listAdminProducts()) as Array<Record<string, unknown>>);
  }
  useEffect(() => {
    if (user) reload().catch(() => setRows([]));
  }, [user]);
  if (isPending) return <AppFrame><p className="text-muted">Loading…</p></AppFrame>;
  if (!user) return <RedirectToSignIn />;
  return (
    <AppFrame>
      <PageTitle kicker="Admin" title="Products" body="Shared inventory for catalog and drops. Tests listed as type|payer|creates per line." />
      <div className="grid gap-8 lg:grid-cols-2">
        <Card>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const tests = form.tests.split("\n").map((line) => {
                const [test_type, payer, creates] = line.split("|").map((s) => s.trim());
                return { test_type, payer: payer || "admin", creates: creates || "public_result" };
              }).filter((t) => t.test_type);
              await saveProduct({ data: { ...form, tests } });
              setForm({ ...form, name: "", description: "" });
              reload();
            }}
          >
            <div><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
              <div><Label>Stock</Label><Input type="number" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Catalog price (cents)</Label><Input type="number" value={form.always_on_price_cents} onChange={(e) => setForm({ ...form, always_on_price_cents: Number(e.target.value) })} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.always_on_enabled} onChange={(e) => setForm({ ...form, always_on_enabled: e.target.checked })} /> Always-on catalog</label>
            <div><Label>Included tests</Label><Textarea value={form.tests} onChange={(e) => setForm({ ...form, tests: e.target.value })} /></div>
            <Button type="submit">Create product</Button>
          </form>
        </Card>
        <div className="space-y-3">
          {rows.map((p) => (
            <Card key={String(p.id)}>
              <p className="font-display text-xl">{String(p.name)}</p>
              <p className="font-mono text-xs text-muted">{String(p.slug)} · stock {String(p.stock_qty)} · {usd(Number(p.always_on_price_cents))}</p>
            </Card>
          ))}
        </div>
      </div>
    </AppFrame>
  );
}
