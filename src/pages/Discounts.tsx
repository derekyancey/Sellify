import { useState } from "react";
import { Plus, Shuffle } from "lucide-react";
import { useSite } from "../context/Site";
import { create, list, remove, update } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { date, money } from "../lib/format";
import type { Discount } from "../lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td } from "../components/ui";

type Draft = Omit<Discount, "$id" | "$createdAt" | "siteId" | "usedCount"> & { $id?: string; usedCount?: number };
const blank: Draft = { code: "", type: "percent", value: 10, active: true };

export function discountState(d: Discount): { label: string; tone: "green" | "gray" | "yellow" | "red" } {
  const now = new Date().toISOString();
  if (!d.active) return { label: "Disabled", tone: "gray" };
  if (d.usageLimit && d.usedCount >= d.usageLimit) return { label: "Used up", tone: "red" };
  if (d.startsAt && d.startsAt > now) return { label: "Scheduled", tone: "yellow" };
  if (d.endsAt && d.endsAt < now) return { label: "Expired", tone: "gray" };
  return { label: "Active", tone: "green" };
}

export default function Discounts() {
  const { site } = useSite(); const s = site!;
  const { data, loading, error, reload } = useAsync(() => list("discounts", s.$id), [s.$id]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const describe = (d: Draft) => `${d.type === "percent" ? `${d.value}% off` : `${money(d.value, s.currency)} off`}${d.minSubtotal ? ` orders over ${money(d.minSubtotal, s.currency)}` : " entire order"}`;

  return (
    <>
      <PageHeader title="Discounts" subtitle="Codes customers enter at checkout. Applied to both Stripe and PayPal payments."
        actions={<Button variant="primary" onClick={() => setEditing({ ...blank })}><Plus className="size-4" />Create discount</Button>} />
      <Card>
        {error && <ErrorBox error={error} />}
        {loading ? <Loading /> : (
          <Table head={["Code", "Status", "Discount", "Used", "Ends"]} empty={!data!.length}>
            {data!.map(d => { const st = discountState(d); return (
              <tr key={d.$id} className="cursor-pointer hover:bg-zinc-50" onClick={() => setEditing(d)}>
                <Td className="font-mono font-semibold">{d.code}</Td><Td><Badge tone={st.tone}>{st.label}</Badge></Td>
                <Td>{describe(d)}</Td><Td>{d.usedCount}{d.usageLimit ? ` / ${d.usageLimit}` : ""}</Td><Td>{d.endsAt ? date(d.endsAt) : "–"}</Td>
              </tr>
            ); })}
          </Table>
        )}
      </Card>
      {editing && <Editor initial={editing} describe={describe} existing={data ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function Editor({ initial, existing, describe, onClose, onSaved }: { initial: Draft; existing: Discount[]; describe(d: Draft): string; onClose(): void; onSaved(): void }) {
  const { site } = useSite(); const s = site!;
  const [d, setD] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => ({ ...x, [k]: v }));
  const dateIn = (iso?: string) => iso ? iso.slice(0, 10) : "";

  const save = async () => {
    const code = d.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) { setErr("Codes are 3–32 letters, numbers, dashes or underscores."); return; }
    if (existing.some(x => x.code === code && x.$id !== d.$id)) { setErr(`${code} already exists for this store.`); return; }
    if (!(d.value > 0) || (d.type === "percent" && d.value > 100)) { setErr("Enter a valid discount value."); return; }
    setBusy(true);
    const data = { code, type: d.type, value: d.value, minSubtotal: d.minSubtotal || undefined, usageLimit: d.usageLimit || undefined,
      startsAt: d.startsAt || undefined, endsAt: d.endsAt || undefined, active: d.active };
    try { if (d.$id) await update("discounts", d.$id, data); else await create("discounts", { ...data, siteId: s.$id, usedCount: 0 }); onSaved(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal open title={d.$id ? `Edit ${d.code}` : "Create discount"} onClose={onClose} footer={<>
      {d.$id && <Button variant="ghost" className="mr-auto text-red-600" onClick={async () => { if (confirm(`Delete ${d.code}?`)) { await remove("discounts", d.$id!); onSaved(); } }}>Delete</Button>}
      <Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      {err && <ErrorBox error={err} />}
      <Field label="Code">
        <div className="flex gap-2"><Input value={d.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="SUMMER20" className="font-mono" />
          <Button onClick={() => set("code", Math.random().toString(36).slice(2, 10).toUpperCase())} title="Generate"><Shuffle className="size-4" /></Button></div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type"><Select value={d.type} onChange={e => set("type", e.target.value as Draft["type"])}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></Select></Field>
        <Field label={d.type === "percent" ? "Percent off" : `Amount off (${s.currency})`}><Input type="number" min={0} step="0.01" value={d.value} onChange={e => set("value", +e.target.value)} /></Field>
        <Field label="Minimum order (optional)"><Input type="number" min={0} step="0.01" value={d.minSubtotal ?? ""} onChange={e => set("minSubtotal", e.target.value ? +e.target.value : undefined)} /></Field>
        <Field label="Total uses (optional)"><Input type="number" min={1} value={d.usageLimit ?? ""} onChange={e => set("usageLimit", e.target.value ? +e.target.value : undefined)} /></Field>
        <Field label="Starts (optional)"><Input type="date" value={dateIn(d.startsAt)} onChange={e => set("startsAt", e.target.value ? new Date(e.target.value + "T00:00:00").toISOString() : undefined)} /></Field>
        <Field label="Ends (optional)"><Input type="date" value={dateIn(d.endsAt)} onChange={e => set("endsAt", e.target.value ? new Date(e.target.value + "T23:59:59").toISOString() : undefined)} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.active} onChange={e => set("active", e.target.checked)} />Active</label>
      <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600"><strong className="font-mono">{d.code || "CODE"}</strong>: {describe(d)}{d.usedCount ? ` · used ${d.usedCount} times` : ""}</p>
    </Modal>
  );
}
