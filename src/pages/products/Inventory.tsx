import { useMemo, useState } from "react";
import { useSite } from "../../context/Site";
import { list, update } from "../../lib/data";
import { useAsync } from "../../lib/useAsync";
import type { Product, Variant } from "../../lib/types";
import { hasVariants, variantTitle, withRollups } from "../../lib/variants";
import { Button, Card, ErrorBox, Input, Loading, PageHeader, Table, Td, cx } from "../../components/ui";

export default function Inventory() {
  const { site } = useSite(); const s = site!;
  const { data, loading, error, reload } = useAsync(() => list("products", s.$id), [s.$id]);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [threshold, setThreshold] = useState(10);
  const [lowOnly, setLowOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // One row per sellable thing: a product without variants, or each variant.
  type Row = { key: string; product: Product; variant?: Variant; sku?: string; inventory: number };
  const all = useMemo(() => (data ?? []).filter(p => p.status !== "archived").flatMap<Row>(p => hasVariants(p)
    ? p.variants!.map(v => ({ key: `${p.$id}:${v.id}`, product: p, variant: v, sku: v.sku, inventory: v.inventory }))
    : [{ key: `${p.$id}:`, product: p, variant: undefined, sku: p.sku, inventory: p.inventory }]), [data]);
  const rows = useMemo(() => all.filter(r => !lowOnly || r.inventory < threshold).sort((a, b) => a.inventory - b.inventory), [all, lowOnly, threshold]);
  const changed = Object.keys(edits).filter(k => all.find(r => r.key === k)?.inventory !== edits[k]);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const byProduct = new Map<string, string[]>();
      for (const k of changed) { const pid = k.split(":")[0]; byProduct.set(pid, [...(byProduct.get(pid) ?? []), k]); }
      for (const [pid, keys] of byProduct) {
        const p = data!.find(x => x.$id === pid)!;
        if (hasVariants(p)) {
          const variants = p.variants!.map(v => edits[`${pid}:${v.id}`] !== undefined ? { ...v, inventory: Math.max(0, Math.floor(edits[`${pid}:${v.id}`])) } : v);
          await update("products", pid, withRollups({ options: p.options, variants }));
        } else await update("products", pid, { inventory: Math.max(0, Math.floor(edits[keys[0]])) });
      }
      setEdits({}); setMsg(`Updated ${changed.length} item${changed.length === 1 ? "" : "s"}.`); reload();
    } catch (e: any) { setMsg(`Error: ${e.message}`); } finally { setBusy(false); }
  };
  const value = (id: string, base: number) => edits[id] ?? base;

  return (
    <>
      <PageHeader title="Inventory" subtitle="Adjust stock in bulk. Paid orders reduce stock automatically."
        actions={<><Button disabled={!changed.length} onClick={() => setEdits({})}>Discard</Button><Button variant="primary" disabled={!changed.length} loading={busy} onClick={save}>Save {changed.length || ""} change{changed.length === 1 ? "" : "s"}</Button></>} />
      {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.startsWith("Error") ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{msg}</div>}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} />Only low stock (under</label>
          <Input type="number" min={1} value={threshold} onChange={e => setThreshold(+e.target.value || 1)} className="w-20" />)
        </div>
        {error && <ErrorBox error={error} />}
        {loading ? <Loading /> : (
          <Table head={["Product", "SKU", "Available", "Adjust"]} empty={!rows.length}>
            {rows.map(r => {
              const v = value(r.key, r.inventory);
              return (
                <tr key={r.key} className={cx(edits[r.key] !== undefined && edits[r.key] !== r.inventory && "bg-amber-50/60")}>
                  <Td className="font-medium">{r.product.title}{r.variant && <div className="text-xs font-normal text-zinc-500">{variantTitle(r.variant)}</div>}</Td><Td className="text-zinc-500">{r.sku}</Td>
                  <Td><Input type="number" min={0} value={v} className={cx("w-24", v < threshold && "text-red-600")} onChange={e => setEdits({ ...edits, [r.key]: +e.target.value })} /></Td>
                  <Td className="whitespace-nowrap">
                    {[-1, 1, 10].map(d => <Button key={d} variant="ghost" className="px-2" onClick={() => setEdits({ ...edits, [r.key]: Math.max(0, v + d) })}>{d > 0 ? `+${d}` : d}</Button>)}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
