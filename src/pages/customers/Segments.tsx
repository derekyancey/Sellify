import { useMemo, useState } from "react";
import { SortTable } from "../../lib/useSort";
import { Plus, Trash2 } from "lucide-react";
import { useSite } from "../../context/Site";
import { create, list, remove, update } from "../../lib/data";
import { useAsync } from "../../lib/useAsync";
import { money } from "../../lib/format";
import { BUILT_IN, FIELDS, OPS, matches, opsFor } from "../../lib/segments";
import type { Customer, SegmentField, SegmentRule } from "../../lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Table, Td } from "../../components/ui";

interface Editing { $id?: string; name: string; rules: SegmentRule[] }

export default function Segments() {
  const { site } = useSite(); const s = site!;
  const { data, loading, error, reload } = useAsync(async () => ({ customers: await list("customers", s.$id), segments: await list("segments", s.$id) }), [s.$id]);
  const [editing, setEditing] = useState<Editing | null>(null);
  if (loading || !data) return <Loading />;
  const count = (rules: SegmentRule[]) => data.customers.filter(c => matches(c, rules)).length;

  return (
    <>
      <PageHeader title="Segments" subtitle="Groups of customers you can email from Campaigns."
        actions={<Button variant="primary" onClick={() => setEditing({ name: "", rules: [{ field: "totalSpent", op: "gt", value: "50" }] })}><Plus className="size-4" />Create segment</Button>} />
      {error && <ErrorBox error={error} />}
      {editing && <Builder key={editing.$id ?? "new"} initial={editing} customers={data.customers} currency={s.currency}
        onCancel={() => setEditing(null)}
        onSave={async seg => {
          if (seg.$id) await update("segments", seg.$id, { name: seg.name, rules: seg.rules });
          else await create("segments", { siteId: s.$id, name: seg.name, rules: seg.rules });
          setEditing(null); reload();
        }}
        onDelete={editing.$id ? async () => { await remove("segments", editing.$id!); setEditing(null); reload(); } : undefined} />}
      <Card title="Your segments" className={editing ? "mt-4" : ""}>
        <SortTable id="segments" cols={[{ label: "Segment", get: r => r.name }, { label: "Customers", get: r => r.count }, { label: "" }]}
          rows={[...BUILT_IN.map(b => ({ id: b.id, name: b.name, rules: b.rules, builtIn: true, count: count(b.rules) })),
            ...data.segments.map(sg => ({ id: sg.$id, name: sg.name, rules: sg.rules, builtIn: false, count: count(sg.rules) }))]}>
          {rows => rows.map(r => (
            <tr key={r.id}><Td className="font-medium">{r.name} {r.builtIn && <Badge>built-in</Badge>}</Td><Td>{r.count}</Td>
              <Td className="text-right">{!r.builtIn && <Button variant="ghost" onClick={() => setEditing({ $id: r.id, name: r.name, rules: r.rules })}>Edit</Button>}</Td></tr>
          ))}
        </SortTable>
      </Card>
    </>
  );
}

function Builder({ initial, customers, currency, onSave, onCancel, onDelete }: {
  initial: Editing; customers: Customer[]; currency: string; onSave(e: Editing): Promise<void>; onCancel(): void; onDelete?: () => Promise<void>;
}) {
  const [seg, setSeg] = useState(initial);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => customers.filter(c => matches(c, seg.rules)), [customers, seg.rules]);
  const setRule = (i: number, patch: Partial<SegmentRule>) => setSeg(x => ({ ...x, rules: x.rules.map((r, j) => {
    if (j !== i) return r;
    const next = { ...r, ...patch };
    if (patch.field) { next.op = opsFor(patch.field)[0]; next.value = FIELDS[patch.field].kind === "bool" ? "true" : ""; }
    return next;
  }) }));

  return (
    <Card title={seg.$id ? "Edit segment" : "New segment"} actions={<Badge tone="blue">{preview.length} matching</Badge>}>
      <div className="space-y-3">
        <Field label="Name"><Input value={seg.name} onChange={e => setSeg({ ...seg, name: e.target.value })} placeholder="e.g. VIPs" className="max-w-sm" /></Field>
        <div className="text-sm font-medium">Customers who match <em>all</em> of:</div>
        {seg.rules.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Select value={r.field} onChange={e => setRule(i, { field: e.target.value as SegmentField })} className="w-48">
              {Object.entries(FIELDS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </Select>
            <Select value={r.op} onChange={e => setRule(i, { op: e.target.value as any })} className="w-36">
              {opsFor(r.field).map(o => <option key={o} value={o}>{OPS[o]}</option>)}
            </Select>
            {FIELDS[r.field].kind === "bool"
              ? <Select value={r.value} onChange={e => setRule(i, { value: e.target.value })} className="w-28"><option value="true">yes</option><option value="false">no</option></Select>
              : <Input value={r.value} onChange={e => setRule(i, { value: e.target.value })} className="w-40" type={FIELDS[r.field].kind === "number" ? "number" : "text"} />}
            <button onClick={() => setSeg({ ...seg, rules: seg.rules.filter((_, j) => j !== i) })} className="p-1 text-zinc-400 hover:text-red-600" aria-label="Remove rule"><Trash2 className="size-4" /></button>
          </div>
        ))}
        <Button variant="ghost" onClick={() => setSeg({ ...seg, rules: [...seg.rules, { field: "ordersCount", op: "gt", value: "0" }] })}><Plus className="size-4" />Add condition</Button>
        {preview.length > 0 && (
          <div className="rounded-lg bg-zinc-50 p-3 text-sm">
            <div className="mb-1 text-xs font-medium uppercase text-zinc-500">Preview</div>
            {preview.slice(0, 5).map(c => <div key={c.$id} className="flex justify-between"><span>{c.name} <span className="text-zinc-500">{c.email}</span></span><span>{money(c.totalSpent, currency)}</span></div>)}
            {preview.length > 5 && <div className="text-zinc-500">…and {preview.length - 5} more</div>}
          </div>
        )}
        <div className="flex gap-2">
          {onDelete && <Button variant="ghost" className="text-red-600" onClick={() => confirm("Delete this segment?") && onDelete()}>Delete</Button>}
          <Button className="ml-auto" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!seg.name.trim()} onClick={async () => { setBusy(true); try { await onSave(seg); } finally { setBusy(false); } }}>Save segment</Button>
        </div>
      </div>
    </Card>
  );
}
