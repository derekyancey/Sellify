import { useRef, useState } from "react";
import { ImageOff, Loader2, Plus, Upload, X } from "lucide-react";
import { Link } from "react-router-dom";
import { uploadFile } from "../lib/files";
import { storeSlug, useSite, useStorePath } from "../context/Site";
import { create, list, remove, update } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { money } from "../lib/format";
import type { Product, ProductOption, Variant } from "../lib/types";
import { MAX_OPTIONS, MAX_VARIANTS, generateVariants, hasVariants, isTracked, priceRange, storedImages, variantTitle, withRollups } from "../lib/variants";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Textarea, cx } from "../components/ui";
import { downloadCsv } from "./Orders";

type Draft = Omit<Product, "$id" | "$createdAt" | "siteId">;
const blank: Draft = { title: "", description: "", price: 0, inventory: 0, status: "draft", sku: "", imageUrl: "", images: [], tracksInventory: true };
const statusTone = (s: string) => s === "active" ? "green" : s === "draft" ? "blue" : s === "unlisted" ? "yellow" : "gray";
/** Every sellable unit: the variants, or the product itself when it has none. */
const unitsOf = (p: Product) => p.variants?.length ? p.variants : [{ id: "", options: [], title: "", price: p.price, compareAtPrice: p.compareAtPrice, sku: p.sku, inventory: p.inventory } as Variant];

export default function Products() {
  const { site } = useSite(); const s = site!;
  const sp = useStorePath();
  const { data, loading, error, reload } = useAsync(() => list("products", s.$id), [s.$id]);
  const [editing, setEditing] = useState<(Draft & { $id?: string }) | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const rows = (data ?? []).filter(p => (status === "all" || p.status === status)
    && (!q || `${p.title} ${p.sku ?? ""} ${p.vendor ?? ""} ${(p.tags ?? []).join(" ")} ${unitsOf(p).map(v => v.sku ?? "").join(" ")}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <PageHeader title="Products" subtitle={`${data?.length ?? 0} products`} actions={<>
        <Link to={sp("/import")} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"><Upload className="size-4" />Import</Link>
        <Button onClick={() => downloadCsv(`${storeSlug(s)}-products.csv`, rows.flatMap(p => unitsOf(p).map(v => ({
          handle: p.handle ?? "", title: p.title, status: p.status, vendor: p.vendor ?? "", type: p.productType ?? "", tags: (p.tags ?? []).join(", "),
          variant: variantTitle(v), sku: v.sku ?? "", price: v.price, compareAtPrice: v.compareAtPrice ?? "",
          inventory: isTracked(p, v) ? v.inventory : "not tracked", image: v.imageUrl || p.imageUrl || "" }))))}>Export</Button>
        <Button variant="primary" onClick={() => setEditing({ ...blank })}><Plus className="size-4" />Add product</Button>
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
            {rows.map(p => (
              <tr key={p.$id} onClick={() => setEditing(p)} className="cursor-pointer hover:bg-zinc-50">
                <Td className="w-12">{p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" className="size-9 rounded-md object-cover" /> : <div className="grid size-9 place-items-center rounded-md bg-zinc-100 text-zinc-400"><ImageOff className="size-4" /></div>}</Td>
                <Td className="font-medium">{p.title}{hasVariants(p) && <div className="text-xs font-normal text-zinc-500">{p.variants!.length} variants · {p.options!.map(o => o.name).join(", ")}</div>}</Td>
                <Td><Badge tone={statusTone(p.status) as any}>{p.status}</Badge></Td>
                <Td>{p.tracksInventory === false ? <span className="text-zinc-500">Not tracked</span>
                  : <span className={p.inventory < 10 ? "font-medium text-red-600" : ""}>{p.inventory} in stock{hasVariants(p) && ` for ${p.variants!.length} variants`}</span>}</Td>
                <Td className="text-zinc-500">{p.productType || "–"}</Td>
                <Td className="tabular-nums">{(() => { const r = priceRange(p); return r.varies ? `${money(r.min, s.currency)} – ${money(r.max, s.currency)}` : money(p.price, s.currency); })()}</Td>
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
  const [p, setP] = useState<Draft & { $id?: string }>(() => {
    const d = { ...initial, options: initial.options ?? [], variants: initial.variants ?? [] };
    // A product without options keeps one default variant (Shopify imports do); edit its values at product level.
    const base = !d.options.length ? d.variants[0] : undefined;
    return base ? { ...d, price: base.price, compareAtPrice: base.compareAtPrice ?? undefined, sku: base.sku ?? d.sku, inventory: base.inventory } : d;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setP(x => ({ ...x, [k]: v }));
  const options = p.options ?? [], variants = p.variants ?? [];
  const multi = options.length > 0 && variants.length > 0;
  const tracked = p.tracksInventory !== false;

  const setOptions = (next: ProductOption[]) => setP(x => ({ ...x, options: next, variants: generateVariants(next, x.variants ?? [], { price: x.price, compareAtPrice: x.compareAtPrice, inventory: x.inventory }) }));
  const setVariant = (id: string, patch: Partial<Variant>) => setP(x => ({ ...x, variants: (x.variants ?? []).map(v => v.id === id ? { ...v, ...patch } : v) }));

  const save = async () => {
    if (!p.title.trim()) { setErr("Title is required"); return; }
    const opts = options.map(o => ({ name: o.name.trim(), values: o.values.map(v => v.trim()).filter(Boolean) })).filter(o => o.values.length);
    if (opts.some(o => !o.name)) { setErr("Every option needs a name, like Size or Color."); return; }
    if (new Set(opts.map(o => o.name.toLowerCase())).size !== opts.length) { setErr("Option names must be different."); return; }
    setBusy(true);
    const { $id, ...rest } = withRollups({ ...p, title: p.title.trim(), options: opts, variants: opts.length ? variants : variants.filter(v => !v.options.length).slice(0, 1) }) as any;
    delete rest.$createdAt; delete rest.siteId;
    if (!tracked) rest.inventory = 0;
    rest.images = storedImages(rest.imageUrl, rest.images); // [{src, alt, original}], main image first
    rest.imageUrl = rest.imageUrl || null;
    try {
      if ($id) await update("products", $id, rest); else await create("products", { ...rest, siteId: s.$id });
      onSaved();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const del = async () => { if (p.$id && confirm(`Delete "${p.title}"?`)) { await remove("products", p.$id); onSaved(); } };

  return (
    <Modal open wide title={p.$id ? "Edit product" : "Add product"} onClose={onClose}
      footer={<>{p.$id && <Button variant="ghost" className="mr-auto text-red-600" onClick={del}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      {err && <ErrorBox error={err} />}
      {p.source === "shopify" && <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">Imported from Shopify{p.handle ? <> (handle <code>{p.handle}</code>)</> : null}. Re-importing a newer export overwrites these fields.</p>}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="space-y-3">
          <Field label="Title"><Input value={p.title} onChange={e => set("title", e.target.value)} /></Field>
          <Field label="Description" hint="HTML is kept as-is."><Textarea rows={4} value={p.description ?? ""} onChange={e => set("description", e.target.value)} /></Field>
        </div>
        <div className="space-y-3">
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
      </div>
      <MediaManager siteId={s.$id} images={[p.imageUrl, ...(p.images ?? [])].filter((u): u is string => !!u)}
        onChange={list => setP(x => ({ ...x, imageUrl: list[0] ?? "", images: list.slice(1) }))} />
      {[p.imageUrl, ...(p.images ?? [])].some(u => u?.includes("cdn.shopify.com")) && <p className="-mt-2 text-xs text-amber-700">Some images are still on Shopify. Copy them on the Import page before closing Shopify.</p>}

      {!multi && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={`Price (${s.currency})`}><Input type="number" step="0.01" min={0} value={p.price} onChange={e => set("price", +e.target.value)} /></Field>
          <Field label="Compare-at price"><Input type="number" step="0.01" min={0} value={p.compareAtPrice ?? ""} onChange={e => set("compareAtPrice", e.target.value ? +e.target.value : undefined)} /></Field>
          <Field label="Inventory"><Input type="number" min={0} value={tracked ? p.inventory : ""} disabled={!tracked} placeholder={tracked ? undefined : "Not tracked"} onChange={e => set("inventory", +e.target.value)} /></Field>
          <Field label="SKU"><Input value={p.sku ?? ""} onChange={e => set("sku", e.target.value)} /></Field>
        </div>
      )}

      <section className="rounded-xl border border-zinc-200">
        <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
          <h3 className="text-sm font-semibold">Variants</h3>
          {multi && <span className="text-xs text-zinc-500">{variants.length} variant{variants.length === 1 ? "" : "s"}{tracked ? ` · ${variants.reduce((t, v) => t + Math.max(0, v.inventory || 0), 0)} in stock` : " · stock not tracked"}</span>}
        </div>
        <div className="space-y-3 p-3">
          {options.map((o, oi) => (
            <OptionEditor key={oi} option={o} index={oi}
              onChange={next => setOptions(options.map((x, i) => i === oi ? next : x))}
              onRemove={() => setOptions(options.filter((_, i) => i !== oi))} />
          ))}
          {options.length < MAX_OPTIONS && (
            <button type="button" className="flex items-center gap-1.5 text-sm text-sky-700 hover:underline"
              onClick={() => setOptions([...options, { name: ["Size", "Color", "Material"].find(n => !options.some(o => o.name === n)) ?? "", values: [] }])}>
              <Plus className="size-4" />{options.length ? "Add another option" : "Add options like size or color"}
            </button>
          )}
          {multi && <VariantTable variants={variants} currency={s.currency} tracked={tracked} gallery={[p.imageUrl, ...(p.images ?? [])].filter((u): u is string => !!u)} onChange={setVariant} onAll={patch => setP(x => ({ ...x, variants: (x.variants ?? []).map(v => ({ ...v, ...patch })) }))} />}
          {variants.length >= MAX_VARIANTS && <p className="text-xs text-amber-700">Products can have up to {MAX_VARIANTS} variants.</p>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tracked} onChange={e => set("tracksInventory", e.target.checked)} />Track stock (turn off for digital products: they're always available)</label>
        </div>
      </section>
      <details className="text-sm"><summary className="cursor-pointer font-medium">Search engine listing</summary>
        <div className="mt-2 space-y-2">
          <Field label="SEO title"><Input value={p.seoTitle ?? ""} onChange={e => set("seoTitle", e.target.value)} placeholder={p.title} /></Field>
          <Field label="SEO description"><Textarea rows={2} value={p.seoDescription ?? ""} onChange={e => set("seoDescription", e.target.value)} /></Field>
        </div>
      </details>
    </Modal>
  );
}

function OptionEditor({ option, index, onChange, onRemove }: { option: ProductOption; index: number; onChange(o: ProductOption): void; onRemove(): void }) {
  const [draft, setDraft] = useState("");
  const addValue = () => {
    const vals = draft.split(",").map(v => v.trim()).filter(v => v && !option.values.includes(v));
    if (vals.length) onChange({ ...option, values: [...option.values, ...vals] });
    setDraft("");
  };
  const move = (i: number, d: number) => { const vals = [...option.values]; const [x] = vals.splice(i, 1); vals.splice(i + d, 0, x); onChange({ ...option, values: vals }); };
  return (
    <div className="rounded-lg bg-zinc-50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Input className="w-40" value={option.name} placeholder="Option name" aria-label={`Option ${index + 1} name`} onChange={e => onChange({ ...option, name: e.target.value })} />
        <button type="button" onClick={onRemove} className="ml-auto text-xs text-red-600 hover:underline">Remove option</button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {option.values.map((v, i) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white py-0.5 pl-2.5 pr-1 text-sm">
            {i > 0 && <button type="button" className="text-zinc-400 hover:text-zinc-700" onClick={() => move(i, -1)} aria-label="Move left">‹</button>}
            {v}
            <button type="button" onClick={() => onChange({ ...option, values: option.values.filter(x => x !== v) })} className="rounded-full p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-600" aria-label={`Remove ${v}`}><X className="size-3" /></button>
          </span>
        ))}
        <Input className="w-48" value={draft} placeholder={option.values.length ? "Add another value" : "e.g. Small, Medium, Large"}
          onChange={e => setDraft(e.target.value)} onBlur={addValue}
          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addValue(); } else if (e.key === "Backspace" && !draft && option.values.length) onChange({ ...option, values: option.values.slice(0, -1) }); }} />
      </div>
    </div>
  );
}

function VariantTable({ variants, currency, gallery, tracked, onChange, onAll }: { variants: Variant[]; currency: string; gallery: string[]; tracked: boolean; onChange(id: string, patch: Partial<Variant>): void; onAll(patch: Partial<Variant>): void }) {
  const [bulk, setBulk] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const num = (v: string) => (v === "" ? undefined : Math.max(0, +v));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">Set for all variants:</span>
        <Input className="w-28" type="number" min={0} step="0.01" placeholder={`Price (${currency})`} value={bulk} onChange={e => setBulk(e.target.value)} />
        <Button variant="ghost" className="px-2 text-xs" disabled={bulk === ""} onClick={() => { onAll({ price: +bulk }); setBulk(""); }}>Apply price</Button>
        {tracked && <>
          <Input className="w-24" type="number" min={0} placeholder="Stock" value={bulkStock} onChange={e => setBulkStock(e.target.value)} />
          <Button variant="ghost" className="px-2 text-xs" disabled={bulkStock === ""} onClick={() => { onAll({ inventory: Math.floor(+bulkStock) }); setBulkStock(""); }}>Apply stock</Button>
        </>}
      </div>
      <div className="-mx-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-y border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
            <tr><th className="px-3 py-1.5 font-medium">Variant</th><th className="px-2 py-1.5 font-medium">Price</th><th className="px-2 py-1.5 font-medium">Compare-at</th><th className="px-2 py-1.5 font-medium">Available</th><th className="px-2 py-1.5 font-medium">SKU</th><th className="px-2 py-1.5 font-medium">Image</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {variants.map(v => (
              <tr key={v.id}>
                <td className="px-3 py-1.5 font-medium">
                  <div className="flex items-center gap-2">
                    {v.imageUrl ? <img src={v.imageUrl} alt="" className="size-7 rounded object-cover" /> : <span className="grid size-7 place-items-center rounded bg-zinc-100 text-zinc-400"><ImageOff className="size-3.5" /></span>}
                    {variantTitle(v)}
                  </div>
                </td>
                <td className="px-2 py-1.5"><Input className="w-24" type="number" min={0} step="0.01" value={v.price} onChange={e => onChange(v.id, { price: Math.max(0, +e.target.value) })} /></td>
                <td className="px-2 py-1.5"><Input className="w-24" type="number" min={0} step="0.01" value={v.compareAtPrice ?? ""} onChange={e => onChange(v.id, { compareAtPrice: num(e.target.value) })} /></td>
                <td className="px-2 py-1.5">{tracked
                  ? <Input className={cx("w-20", v.inventory <= 0 && "text-red-600")} type="number" min={0} value={Math.max(0, v.inventory)} onChange={e => onChange(v.id, { inventory: Math.max(0, Math.floor(+e.target.value)) })} />
                  : <span className="text-xs text-zinc-500">Not tracked</span>}</td>
                <td className="px-2 py-1.5"><Input className="w-28" value={v.sku ?? ""} onChange={e => onChange(v.id, { sku: e.target.value })} /></td>
                <td className="px-2 py-1.5">
                  <div className="flex gap-1">
                    {gallery.length > 0 ? gallery.map((u, i) => (
                      <button key={u} type="button" title={i === 0 ? "Main image" : `Image ${i + 1}`} onClick={() => onChange(v.id, { imageUrl: v.imageUrl === u ? undefined : u })}
                        className={cx("size-8 overflow-hidden rounded border", v.imageUrl === u ? "border-zinc-900 ring-2 ring-zinc-900/20" : "border-zinc-200 opacity-70 hover:opacity-100")}>
                        <img src={u} alt="" className="size-full object-cover" />
                      </button>
                    )) : <span className="text-xs text-zinc-400">Add images above</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Product images: upload, paste a URL, reorder, choose the main one (the first). */
function MediaManager({ siteId, images, onChange }: { siteId: string; images: string[]; onChange(list: string[]): void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const add = (urls: string[]) => onChange([...images, ...urls.filter(u => !images.includes(u))]);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setErr(null);
    try { const out: string[] = []; for (const f of Array.from(files)) if (f.type.startsWith("image/")) out.push((await uploadFile(siteId, f)).url); add(out); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const move = (from: number, to: number) => { const l = [...images]; const [x] = l.splice(from, 1); l.splice(to, 0, x); onChange(l); };
  return (
    <section className="rounded-xl border border-zinc-200" onDragOver={e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
      onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); upload(e.dataTransfer.files); } }}>
      <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
        <h3 className="text-sm font-semibold">Media</h3>
        <span className="text-xs text-zinc-500">Drag to reorder. The first image is the main one.</span>
      </div>
      <div className="p-3">
        {err && <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {images.map((u, i) => (
            <div key={u} draggable onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
              onDragOver={e => { if (drag !== null) e.preventDefault(); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); if (drag !== null && drag !== i) move(drag, i); setDrag(null); }}
              className={cx("group relative aspect-square cursor-grab overflow-hidden rounded-lg border bg-zinc-50", i === 0 ? "col-span-2 row-span-2 border-zinc-300" : "border-zinc-200", drag === i && "opacity-40")}>
              <img src={u} alt="" className="size-full object-cover" />
              {i === 0 && <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold">Main</span>}
              <div className="absolute inset-x-1 bottom-1 hidden justify-between gap-1 group-hover:flex">
                {i > 0 ? <button type="button" onClick={() => move(i, 0)} className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium hover:bg-white">Make main</button> : <span />}
                <button type="button" onClick={() => onChange(images.filter(x => x !== u))} className="rounded bg-white/90 p-0.5 text-red-600 hover:bg-white" aria-label="Remove image"><X className="size-3.5" /></button>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => input.current?.click()} disabled={busy}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}{busy ? "Uploading…" : "Add images"}
          </button>
        </div>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={e => { upload(e.target.files); e.target.value = ""; }} />
        <div className="mt-2 flex gap-2">
          <Input placeholder="…or paste an image URL (https://…)" value={url} onChange={e => setUrl(e.target.value)} />
          <Button disabled={!/^https?:\/\//.test(url)} onClick={() => { add([url.trim()]); setUrl(""); }}>Add URL</Button>
        </div>
      </div>
    </section>
  );
}
