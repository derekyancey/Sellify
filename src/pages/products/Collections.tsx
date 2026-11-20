import { useState } from "react";
import { useSort } from "../../lib/useSort";
import { Plus } from "lucide-react";
import { useSite } from "../../context/Site";
import { create, list, remove, update } from "../../lib/data";
import { useAsync } from "../../lib/useAsync";
import type { Collection } from "../../lib/types";
import { Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Table, Td, Textarea } from "../../components/ui";

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
type Draft = Omit<Collection, "$id" | "$createdAt" | "siteId"> & { $id?: string };

export default function Collections() {
  const { site } = useSite(); const s = site!;
  const { data, loading, error, reload } = useAsync(async () => ({ cols: await list("collections", s.$id), products: await list("products", s.$id) }), [s.$id]);
  const sort = useSort(data?.cols ?? [], { title: c => c.title, handle: c => c.handle, products: c => c.productIds.length }, { id: "collections" });
  const [editing, setEditing] = useState<Draft | null>(null);
  return (
    <>
      <PageHeader title="Collections" subtitle="Group products for your storefront: Yancey.collection('handle') returns them."
        actions={<Button variant="primary" onClick={() => setEditing({ title: "", handle: "", description: "", productIds: [] })}><Plus className="size-4" />Create collection</Button>} />
      <Card>
        {error && <ErrorBox error={error} />}
        {loading ? <Loading /> : (
          <Table head={[sort.th("Collection", "title"), sort.th("Handle", "handle"), sort.th("Products", "products")]} empty={!data!.cols.length}>
            {sort.rows.map(c => (
              <tr key={c.$id} className="cursor-pointer hover:bg-zinc-50" onClick={() => setEditing(c)}>
                <Td className="font-medium">{c.title}</Td><Td className="font-mono text-xs text-zinc-500">{c.handle}</Td><Td>{c.productIds.length}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {editing && data && <Editor initial={editing} products={data.products} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function Editor({ initial, products, onClose, onSaved }: { initial: Draft; products: { $id: string; title: string; status: string }[]; onClose(): void; onSaved(): void }) {
  const { site } = useSite(); const s = site!;
  const [c, setC] = useState(initial);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setC(x => ({ ...x, productIds: x.productIds.includes(id) ? x.productIds.filter(p => p !== id) : [...x.productIds, id] }));
  const save = async () => {
    if (!c.title.trim()) { setErr("Title is required"); return; }
    setBusy(true);
    const data = { title: c.title.trim(), handle: slug(c.handle || c.title), description: c.description, productIds: c.productIds };
    try { if (c.$id) await update("collections", c.$id, data); else await create("collections", { ...data, siteId: s.$id }); onSaved(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal open title={c.$id ? "Edit collection" : "Create collection"} onClose={onClose} footer={<>
      {c.$id && <Button variant="ghost" className="mr-auto text-red-600" onClick={async () => { if (confirm(`Delete "${c.title}"? Products are not deleted.`)) { await remove("collections", c.$id!); onSaved(); } }}>Delete</Button>}
      <Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      {err && <ErrorBox error={err} />}
      <Field label="Title"><Input value={c.title} onChange={e => setC({ ...c, title: e.target.value, handle: c.$id ? c.handle : slug(e.target.value) })} /></Field>
      <Field label="Handle" hint="Used in URLs and in Yancey.collection()."><Input value={c.handle} onChange={e => setC({ ...c, handle: slug(e.target.value) })} /></Field>
      <Field label="Description"><Textarea rows={2} value={c.description ?? ""} onChange={e => setC({ ...c, description: e.target.value })} /></Field>
      <Field label={`Products (${c.productIds.length} selected)`}>
        <Input placeholder="Filter products" value={q} onChange={e => setQ(e.target.value)} className="mb-2" />
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2 text-sm">
          {products.filter(p => p.title.toLowerCase().includes(q.toLowerCase())).map(p => (
            <label key={p.$id} className="flex items-center gap-2"><input type="checkbox" checked={c.productIds.includes(p.$id)} onChange={() => toggle(p.$id)} />{p.title}{p.status !== "active" && <span className="text-xs text-zinc-400">({p.status})</span>}</label>
          ))}
        </div>
      </Field>
    </Modal>
  );
}
