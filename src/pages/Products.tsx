import { useState } from "react";
import { ImageOff, Plus, Trash2, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { storeSlug, useSite, useStorePath } from "../context/Site";
import { create, list, remove, update } from "../lib/data";
import { uploadFile } from "../lib/files";
import { useAsync } from "../lib/useAsync";
import { money } from "../lib/format";
import type { Product, ProductImage, Variant } from "../lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Textarea } from "../components/ui";
import { downloadCsv } from "./Orders";

type Draft = Omit<Product, "$id" | "$createdAt" | "siteId"> & { $id?: string };
const newVariant = (): Variant => ({ id: "v" + Math.random().toString(36).slice(2, 12), title: "Default Title", price: 0, inventory: 0 });
const blank = (): Draft => ({ title: "", description: "", price: 0, inventory: 0, status: "draft", sku: "", imageUrl: "", tracksInventory: true, variants: [newVariant()], images: [] });
const statusTone = (s: string) => s === "active" ? "green" : s === "draft" ? "blue" : s === "unlisted" ? "yellow" : "gray";

const variantsOf = (p: Product): Variant[] => p.variants?.length ? p.variants
  : [{ id: "default", title: "Default Title", price: p.price, compareAtPrice: p.compareAtPrice, sku: p.sku, inventory: p.inventory }];
const priceLabel = (p: Product, currency: string) => {
  const ps = variantsOf(p).map(v => v.price); const lo = Math.min(...ps), hi = Math.max(...ps);
  return lo === hi ? money(lo, currency) : `${money(lo, currency)}–${money(hi, currency)}`;
};

export default function Products() {
  const { site } = useSite(); const s = site!;
  const sp = useStorePath();
  const { data, loading, error, reload } = useAsync(() => list("products", s.$id), [s.$id]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const rows = (data ?? []).filter(p => (status === "all" || p.status === status)
    && (!q || `${p.title} ${p.sku ?? ""} ${p.vendor ?? ""} ${(p.tags ?? []).join(" ")} ${variantsOf(p).map(v => v.sku).join(" ")}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <PageHeader title="Products" subtitle={`${data?.length ?? 0} products`} actions={<>
        <Link to={sp("/import")} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"><Upload className="size-4" />Import</Link>
        <Button onClick={() => downloadCsv(`${storeSlug(s)}-products.csv`, rows.flatMap(p => variantsOf(p).map(v => ({
          handle: p.handle ?? "", title: p.title, status: p.status, vendor: p.vendor ?? "", type: p.productType ?? "", tags: (p.tags ?? []).join(", "),
          variant: v.title, sku: v.sku ?? "", price: v.price, compareAtPrice: v.compareAtPrice ?? "", inventory: p.tracksInventory === false ? "not tracked" : v.inventory, image: p.imageUrl ?? "" }))))}>Export</Button>
        <Button variant="primary" onClick={() => setEditing(blank())}><Plus className="size-4" />Add product</Button>
      </>} />
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <Input placeholder="Search title, SKU, vendor, tag" value={q} onChange={e => setQ(e.target.value)} className="min-w-0 flex-1 sm:max-w-xs" />
          <Select value={status} onChange={e => setStatus(e.target.value)} className="w-40">
            {["all", "active", "unlisted", "draft", "archived"].map(x => <option key={x} value={x}>{x === "all" ? "All statuses" : x[0].toUpperCase() + x.slice(1)}</option>)}
          </Select>
        </div>
        {error && <ErrorBox error={error} />}
        {loading ? <Loading /> : (
          <Table head={["", "Product", "Status", "Inventory", "Type", "Price"]} empty={!rows.length}>
            {rows.map(p => {
              const vs = variantsOf(p);
              return (
                <tr key={p.$id} onClick={() => setEditing({ ...p, variants: vs.map(v => ({ ...v })), images: p.images ?? (p.imageUrl ? [{ src: p.imageUrl }] : []) })} className="cursor-pointer hover:bg-zinc-50">
                  <Td className="w-12">{p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" className="size-9 rounded-md object-cover" /> : <div className="grid size-9 place-items-center rounded-md bg-zinc-100 text-zinc-400"><ImageOff className="size-4" /></div>}</Td>
                  <Td><div className="font-medium">{p.title}</div>{vs.length > 1 && <div className="text-xs text-zinc-500">{vs.length} variants</div>}</Td>
                  <Td><Badge tone={statusTone(p.status)}>{p.status}</Badge></Td>
                  <Td>{p.tracksInventory === false ? <span className="text-zinc-500">Not tracked</span>
                    : <span className={p.inventory < 10 ? "font-medium text-red-600" : ""}>{p.inventory} in stock</span>}</Td>
                  <Td className="text-zinc-500">{p.productType || "–"}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{priceLabel(p, s.currency)}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      {editing && <ProductForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function ProductForm({ initial, onClose, onSaved }: { initial: Draft; onClose(): void; onSaved(): void }) {
  const { site } = useSite(); const s = site!;
  const [p, setP] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setP(x => ({ ...x, [k]: v }));
  const vs = p.variants ?? [];
  const setV = (i: number, patch: Partial<Variant>) => set("variants", vs.map((v, j) => j === i ? { ...v, ...patch } : v));
  const imgs = p.images ?? [];
  const optionName = vs.find(v => v.options)?.options ? Object.keys(vs.find(v => v.options)!.options!)[0] : "Option";

  const addImages = async (files: FileList | null) => {
    if (!files) return;
    try { for (const f of Array.from(files)) { const up = await uploadFile(s.$id, f); set("images", [...(p.images ?? []), { src: up.url, alt: p.title }]); } }
    catch (e: any) { setErr(e.message); }
  };

  const save = async () => {
    if (!p.title.trim()) { setErr("Title is required"); return; }
    if (!vs.length || vs.some(v => !(v.price >= 0) || !v.title.trim())) { setErr("Every variant needs a name and a price."); return; }
    setBusy(true);
    const cheapest = vs.reduce((a, b) => (b.price < a.price ? b : a));
    const tracked = p.tracksInventory !== false;
    const data: any = {
      title: p.title.trim(), description: p.description, status: p.status, vendor: p.vendor || undefined, productType: p.productType || undefined,
      tags: p.tags ?? [], seoTitle: p.seoTitle || undefined, seoDescription: p.seoDescription || undefined, handle: p.handle || undefined,
      images: imgs, imageUrl: imgs[0]?.src ?? (p.imageUrl || undefined), variants: vs, tracksInventory: tracked,
      price: cheapest.price, compareAtPrice: cheapest.compareAtPrice ?? undefined, sku: vs[0].sku || undefined,
      inventory: tracked ? vs.reduce((t, v) => t + Math.max(0, v.inventory || 0), 0) : 0,
    };
    try {
      if (p.$id) await update("products", p.$id, data); else await create("products", { ...data, siteId: s.$id });
      onSaved();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const del = async () => { if (p.$id && confirm(`Delete "${p.title}"?`)) { await remove("products", p.$id); onSaved(); } };

  return (
    <Modal open title={p.$id ? "Edit product" : "Add product"} onClose={onClose}
      footer={<>{p.$id && <Button variant="ghost" className="mr-auto text-red-600" onClick={del}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      {err && <ErrorBox error={err} />}
      {p.source === "shopify" && <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">Imported from Shopify (handle <code>{p.handle}</code>). Re-importing a newer export overwrites these fields.</p>}
      <Field label="Title"><Input value={p.title} onChange={e => set("title", e.target.value)} /></Field>
      <Field label="Description" hint="HTML is kept as-is."><Textarea rows={4} value={p.description ?? ""} onChange={e => set("description", e.target.value)} /></Field>

      <div>
        <div className="mb-1 flex items-center justify-between text-sm font-medium"><span>Images</span>
          <label className="cursor-pointer text-xs underline">Add<input type="file" accept="image/*" multiple hidden onChange={e => addImages(e.target.files)} /></label></div>
        {imgs.length ? (
          <div className="flex flex-wrap gap-2">
            {imgs.map((im: ProductImage, i) => (
              <div key={im.src + i} className="group relative">
                <img src={im.src} alt={im.alt ?? ""} className={"size-16 rounded-md object-cover " + (i === 0 ? "ring-2 ring-zinc-900" : "")} />
                <div className="absolute inset-x-0 bottom-0 hidden justify-between rounded-b-md bg-black/60 px-1 text-[10px] text-white group-hover:flex">
                  {i > 0 ? <button onClick={() => set("images", [im, ...imgs.filter((_, j) => j !== i)])}>main</button> : <span>main</span>}
                  <button onClick={() => set("images", imgs.filter((_, j) => j !== i))} aria-label="Remove image">✕</button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-zinc-500">No images.</p>}
        {imgs.some(i => i.src.includes("cdn.shopify.com")) && <p className="mt-1 text-xs text-amber-700">Some images are still on Shopify. Copy them on the Import page before closing Shopify.</p>}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-sm font-medium"><span>{vs.length > 1 ? `Variants (${optionName})` : "Price & stock"}</span>
          <button className="text-xs underline" onClick={() => set("variants", [...vs.map(v => v.title === "Default Title" ? { ...v, title: "Option 1" } : v), { ...newVariant(), title: `Option ${vs.length + 1}` }])}>Add variant</button></div>
        <div className="space-y-2">
          {vs.map((v, i) => (
            <div key={v.id} className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-200 p-2 sm:grid-cols-6">
              {vs.length > 1 && <Input className="col-span-2" value={v.title} onChange={e => setV(i, { title: e.target.value })} placeholder="Name, e.g. Mac" aria-label="Variant name" />}
              <Input type="number" step="0.01" min={0} value={v.price} onChange={e => setV(i, { price: +e.target.value })} aria-label="Price" title="Price" />
              <Input type="number" step="0.01" min={0} value={v.compareAtPrice ?? ""} placeholder="Compare at" onChange={e => setV(i, { compareAtPrice: e.target.value ? +e.target.value : null })} aria-label="Compare-at price" />
              <Input value={v.sku ?? ""} placeholder="SKU" onChange={e => setV(i, { sku: e.target.value })} aria-label="SKU" />
              <div className="flex gap-1">
                <Input type="number" value={p.tracksInventory === false ? "" : v.inventory} disabled={p.tracksInventory === false} placeholder="–" onChange={e => setV(i, { inventory: +e.target.value })} aria-label="Stock" title="Stock" />
                {vs.length > 1 && <button onClick={() => set("variants", vs.filter((_, j) => j !== i))} className="p-1 text-zinc-400 hover:text-red-600" aria-label="Remove variant"><Trash2 className="size-4" /></button>}
              </div>
            </div>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={p.tracksInventory !== false} onChange={e => set("tracksInventory", e.target.checked)} />Track stock (turn off for digital products)</label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <Select value={p.status} onChange={e => set("status", e.target.value as Product["status"])}>
            <option value="active">Active: visible and for sale</option><option value="unlisted">Unlisted: for sale by link only</option>
            <option value="draft">Draft</option><option value="archived">Archived</option>
          </Select>
        </Field>
        <Field label="Product type"><Input value={p.productType ?? ""} onChange={e => set("productType", e.target.value)} /></Field>
        <Field label="Vendor"><Input value={p.vendor ?? ""} onChange={e => set("vendor", e.target.value)} /></Field>
        <Field label="Tags" hint="Comma separated"><Input value={(p.tags ?? []).join(", ")} onChange={e => set("tags", e.target.value.split(",").map(t => t.trim()).filter(Boolean))} /></Field>
      </div>
      <details className="text-sm"><summary className="cursor-pointer font-medium">Search engine listing</summary>
        <div className="mt-2 space-y-2">
          <Field label="SEO title"><Input value={p.seoTitle ?? ""} onChange={e => set("seoTitle", e.target.value)} placeholder={p.title} /></Field>
          <Field label="SEO description"><Textarea rows={2} value={p.seoDescription ?? ""} onChange={e => set("seoDescription", e.target.value)} /></Field>
        </div>
      </details>
    </Modal>
  );
}
