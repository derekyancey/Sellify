import { useMemo, useState } from "react";
import { useSite } from "../../context/Site";
import { list, update } from "../../lib/data";
import { useAsync } from "../../lib/useAsync";
import { Button, Card, ErrorBox, Input, Loading, PageHeader, Table, Td, cx } from "../../components/ui";

export default function Inventory() {
  const { site } = useSite(); const s = site!;
  const { data, loading, error, reload } = useAsync(() => list("products", s.$id), [s.$id]);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [threshold, setThreshold] = useState(10);
  const [lowOnly, setLowOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const rows = useMemo(() => (data ?? []).filter(p => p.status !== "archived" && (!lowOnly || p.inventory < threshold))
    .sort((a, b) => a.inventory - b.inventory), [data, lowOnly, threshold]);
  const changed = Object.keys(edits).filter(id => data?.find(p => p.$id === id)?.inventory !== edits[id]);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      for (const id of changed) await update("products", id, { inventory: Math.max(0, Math.floor(edits[id])) });
      setEdits({}); setMsg(`Updated ${changed.length} product${changed.length === 1 ? "" : "s"}.`); reload();
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
            {rows.map(p => {
              const v = value(p.$id, p.inventory);
              return (
                <tr key={p.$id} className={cx(edits[p.$id] !== undefined && edits[p.$id] !== p.inventory && "bg-amber-50/60")}>
                  <Td className="font-medium">{p.title}</Td><Td className="text-zinc-500">{p.sku}</Td>
                  <Td><Input type="number" min={0} value={v} className={cx("w-24", v < threshold && "text-red-600")} onChange={e => setEdits({ ...edits, [p.$id]: +e.target.value })} /></Td>
                  <Td className="whitespace-nowrap">
                    {[-1, 1, 10].map(d => <Button key={d} variant="ghost" className="px-2" onClick={() => setEdits({ ...edits, [p.$id]: Math.max(0, v + d) })}>{d > 0 ? `+${d}` : d}</Button>)}
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
