import { useState } from "react";
import { ImageOff, Plus } from "lucide-react";
import { storeSlug, useSite } from "../context/Site";
import { create, list, remove, update } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { money } from "../lib/format";
import type { Product } from "../lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Textarea } from "../components/ui";
import { downloadCsv } from "./Orders";

type Draft = Omit<Product, "$id" | "$createdAt" | "siteId">;
const blank: Draft = { title: "", description: "", price: 0, inventory: 0, status: "draft", sku: "", imageUrl: "" };

export default function Products() {
  const { site } = useSite(); const s = site!;
  const { data, loading, error, reload } = useAsync(() => list("products", s.$id), [s.$id]);
  const [editing, setEditing] = useState<(Draft & { $id?: string }) | null>(null);
  const [q, setQ] = useState("");
  const rows = (data ?? []).filter(p => !q || `${p.title} ${p.sku}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Products" subtitle={`${data?.length ?? 0} products`} actions={<>
        <Button onClick={() => downloadCsv(`${storeSlug(s)}-products.csv`, rows.map(({ $id, siteId, ...p }) => p))}>Export</Button>
        <Button variant="primary" onClick={() => setEditing({ ...blank })}><Plus className="size-4" />Add product</Button>
      </>} />
      <Card>
        <Input placeholder="Search products" value={q} onChange={e => setQ(e.target.value)} className="mb-3 sm:max-w-xs" />
        {error && <ErrorBox error={error} />}
        {loading ? <Loading /> : (
          <Table head={["", "Product", "Status", "Inventory", "SKU", "Price"]} empty={!rows.length}>
            {rows.map(p => (
              <tr key={p.$id} onClick={() => setEditing(p)} className="cursor-pointer hover:bg-zinc-50">
                <Td className="w-12">{p.imageUrl ? <img src={p.imageUrl} alt="" className="size-9 rounded-md object-cover" /> : <div className="grid size-9 place-items-center rounded-md bg-zinc-100 text-zinc-400"><ImageOff className="size-4" /></div>}</Td>
                <Td className="font-medium">{p.title}</Td>
                <Td><Badge tone={p.status === "active" ? "green" : p.status === "draft" ? "blue" : "gray"}>{p.status}</Badge></Td>
                <Td className={p.inventory < 10 ? "font-medium text-red-600" : ""}>{p.inventory} in stock</Td>
                <Td className="text-zinc-500">{p.sku}</Td>
                <Td className="tabular-nums">{money(p.price, s.currency)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {editing && <ProductForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function ProductForm({ initial, onClose, onSaved }: { initial: Draft & { $id?: string }; onClose(): void; onSaved(): void }) {
  const { site } = useSite(); const s = site!;
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setP(x => ({ ...x, [k]: v }));

  const save = async () => {
    if (!p.title.trim()) { setErr("Title is required"); return; }
    setBusy(true);
    const { $id, ...rest } = p as any; delete rest.$createdAt; delete rest.siteId;
    try {
      if ($id) await update("products", $id, rest); else await create("products", { ...rest, siteId: s.$id });
      onSaved();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const del = async () => { if (p.$id && confirm(`Delete "${p.title}"?`)) { await remove("products", p.$id); onSaved(); } };

  return (
    <Modal open title={p.$id ? "Edit product" : "Add product"} onClose={onClose}
      footer={<>{p.$id && <Button variant="ghost" className="mr-auto text-red-600" onClick={del}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      {err && <ErrorBox error={err} />}
      <Field label="Title"><Input value={p.title} onChange={e => set("title", e.target.value)} /></Field>
      <Field label="Description"><Textarea rows={3} value={p.description ?? ""} onChange={e => set("description", e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Price (${s.currency})`}><Input type="number" step="0.01" min={0} value={p.price} onChange={e => set("price", +e.target.value)} /></Field>
        <Field label="Compare-at price"><Input type="number" step="0.01" min={0} value={p.compareAtPrice ?? ""} onChange={e => set("compareAtPrice", e.target.value ? +e.target.value : undefined)} /></Field>
        <Field label="Inventory"><Input type="number" min={0} value={p.inventory} onChange={e => set("inventory", +e.target.value)} /></Field>
        <Field label="SKU"><Input value={p.sku ?? ""} onChange={e => set("sku", e.target.value)} /></Field>
      </div>
      <Field label="Image URL" hint="Paste a URL (e.g. from Appwrite Storage or your site)."><Input value={p.imageUrl ?? ""} onChange={e => set("imageUrl", e.target.value)} /></Field>
      <Field label="Status">
        <Select value={p.status} onChange={e => set("status", e.target.value as Product["status"])}>
          <option value="active">Active — visible on your site</option><option value="draft">Draft</option><option value="archived">Archived</option>
        </Select>
      </Field>
    </Modal>
  );
}
