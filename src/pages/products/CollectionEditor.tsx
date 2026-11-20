import { useMemo, useRef, useState } from "react";
import { ArrowLeft, GripVertical, ImageOff, Plus, Trash2, X, Zap } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSite, useStorePath } from "../../context/Site";
import { create, list, remove, update } from "../../lib/data";
import { uploadFile } from "../../lib/files";
import { useAsync } from "../../lib/useAsync";
import { money } from "../../lib/format";
import { FIELDS, OPS, SORTS, collectionProducts, isMulti, matchesRules, needsValue, opsFor, salesByProduct, slug, valueOptions } from "../../lib/collections";
import type { Collection, CollectionCondition, CollectionField, CollectionRules, CollectionSort, Product } from "../../lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Select, Textarea, cx } from "../../components/ui";
import { redirectMoved } from "../../lib/redirects";

type Draft = Omit<Collection, "$id" | "$createdAt" | "siteId"> & { $id?: string };
const newCondition = (): CollectionCondition => ({ field: "productType", op: "is", values: [] });
const blank = (): Draft => ({ title: "", handle: "", description: "", productIds: [], type: "smart", sortOrder: "best-selling",
  rules: { match: "all", conditions: [newCondition()] }, published: true, imageUrl: "", seoTitle: "", seoDescription: "" });

export default function CollectionEditor() {
  const { id } = useParams();
  const { site } = useSite(); const s = site!;
  const { data, loading, error } = useAsync(async () => {
    const [cols, products, orders] = await Promise.all([list("collections", s.$id), list("products", s.$id), list("orders", s.$id)]);
    return { cols, products, sales: salesByProduct(orders) };
  }, [s.$id]);
  if (error) return <ErrorBox error={error} />;
  if (loading || !data) return <Loading />;
  const existing = id && id !== "new" ? data.cols.find(c => c.$id === id) : undefined;
  if (id && id !== "new" && !existing) return <ErrorBox error="Collection not found." />;
  return <Editor key={id} initial={existing ? { ...blank(), ...existing, type: existing.type ?? "manual", sortOrder: existing.sortOrder ?? (existing.type === "smart" ? "best-selling" : "manual"), rules: existing.rules ?? blank().rules } : blank()}
    others={data.cols.filter(c => c.$id !== existing?.$id)} products={data.products} sales={data.sales} />;
}

function Editor({ initial, others, products, sales }: { initial: Draft; others: Collection[]; products: Product[]; sales: Map<string, number> }) {
  const { site } = useSite(); const s = site!;
  const sp = useStorePath(); const nav = useNavigate();
  const [c, setC] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [handleTouched, setHandleTouched] = useState(!!initial.$id);
  const [keepOldUrl, setKeepOldUrl] = useState(true);
  const handleChanged = !!initial.$id && !!initial.handle && slug(c.handle || c.title) !== initial.handle;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setC(x => ({ ...x, [k]: v }));
  const smart = c.type === "smart";
  const rules = c.rules ?? { match: "all", conditions: [] };
  const setRules = (r: CollectionRules) => set("rules", r);
  const opts = useMemo(() => valueOptions(products), [products]);
  const members = useMemo(() => collectionProducts(c, products, sales), [c, products, sales]);
  const back = sp("/products/collections");

  const save = async () => {
    const title = c.title.trim();
    if (!title) { setErr("Title is required."); return; }
    const handle = slug(c.handle || title);
    if (!handle) { setErr("Handle needs at least one letter or number."); return; }
    if (others.some(o => o.handle === handle)) { setErr(`Another collection already uses the handle "${handle}".`); return; }
    if (smart && !rules.conditions.some(x => !needsValue(x.op) || x.values.some(v => v.trim()))) { setErr("Add at least one condition with a value."); return; }
    setBusy(true); setErr(null);
    const data = {
      title, handle, description: c.description || undefined, type: c.type, sortOrder: c.sortOrder,
      rules: smart ? { match: rules.match, conditions: rules.conditions.map(x => ({ ...x, values: x.values.map(v => v.trim()).filter(Boolean) })) } : null,
      productIds: members.map(p => p.$id), published: c.published !== false, imageUrl: c.imageUrl || undefined,
      seoTitle: c.seoTitle || undefined, seoDescription: c.seoDescription || undefined,
    };
    try {
      if (c.$id) await update("collections", c.$id, data);
      else await create("collections", { ...data, siteId: s.$id } as any);
      if (handleChanged && keepOldUrl) await redirectMoved(s.$id, `/collections/${initial.handle}`, `/collections/${handle}`);
      nav(back);
    } catch (e: any) {
      setBusy(false);
      setErr(/attribute|column|Unknown/i.test(e.message) ? `${e.message}. The collections table needs the new columns: re-run appwrite/setup.py.` : e.message);
    }
  };
  const del = async () => { if (c.$id && confirm(`Delete "${c.title}"? Its products are not deleted.`)) { await remove("collections", c.$id); nav(back); } };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to={back} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100" aria-label="Back to collections"><ArrowLeft className="size-5" /></Link>
          <h1 className="text-xl font-bold tracking-tight">{c.$id ? initial.title : "Create collection"}</h1>
          {c.published === false && <Badge>Hidden</Badge>}
        </div>
        <div className="flex gap-2">
          {c.$id && <Button variant="ghost" className="text-red-600" onClick={del}>Delete</Button>}
          <Button onClick={() => nav(back)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>Save</Button>
        </div>
      </div>
      {err && <div className="mb-4"><ErrorBox error={err} /></div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card>
            <div className="space-y-3">
              <Field label="Title"><Input value={c.title} placeholder="e.g. Summer collection, Under $100, Staff picks"
                onChange={e => setC(x => ({ ...x, title: e.target.value, handle: handleTouched ? x.handle : slug(e.target.value) }))} /></Field>
              <Field label="Description" hint="HTML is allowed."><Textarea rows={4} value={c.description ?? ""} onChange={e => set("description", e.target.value)} /></Field>
            </div>
          </Card>

          <Card title="Collection type">
            <div className="grid gap-2 sm:grid-cols-2">
              {([["smart", "Smart", "Products that match your conditions are added automatically, now and in the future."],
                ["manual", "Manual", "You choose each product. Good for curated picks."]] as const).map(([v, label, hint]) => (
                <label key={v} className={cx("flex cursor-pointer gap-2 rounded-lg border p-3 text-sm", c.type === v ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200")}>
                  <input type="radio" name="ctype" checked={c.type === v} className="mt-0.5"
                    onChange={() => setC(x => ({ ...x, type: v, productIds: v === "manual" ? members.map(p => p.$id) : x.productIds,
                      sortOrder: v === "manual" && x.sortOrder === "best-selling" && !x.$id ? "manual" : x.sortOrder === "manual" && v === "smart" ? "best-selling" : x.sortOrder }))} />
                  <span><span className="font-medium">{label}</span><span className="mt-0.5 block text-xs text-zinc-500">{hint}</span></span>
                </label>
              ))}
            </div>
            {smart && <Conditions rules={rules} onChange={setRules} opts={opts} products={products} />}
          </Card>

          <ProductsCard c={c} members={members} products={products} sales={sales} currency={s.currency}
            onSort={v => set("sortOrder", v)} onIds={ids => set("productIds", ids)} />
        </div>

        <div className="min-w-0 space-y-4">
          <Card title="Visibility">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={c.published !== false} onChange={e => set("published", e.target.checked)} />
              <span><span className="font-medium">Visible on storefront</span><span className="block text-xs text-zinc-500">When off, <code>Yancey.collection()</code> treats it as not found.</span></span>
            </label>
          </Card>
          <ImageCard url={c.imageUrl} title={c.title} onChange={u => set("imageUrl", u)} />
          <Card title="Search engine listing">
            <div className="space-y-3">
              <Field label="URL handle" hint={<>{s.domain ? <>{s.domain}/collections/{slug(c.handle || c.title)}, the same path as on Shopify · </> : null}<code>Yancey.collection("{slug(c.handle || c.title) || "handle"}")</code></>}>
                <Input value={c.handle} onChange={e => { setHandleTouched(true); set("handle", slug(e.target.value)); }} onBlur={() => !c.handle && setHandleTouched(false)} />
              </Field>
              {handleChanged && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={keepOldUrl} onChange={e => setKeepOldUrl(e.target.checked)} />
                Redirect <code>/collections/{initial.handle}</code> to the new URL</label>}
              <Field label="Page title" hint={`${(c.seoTitle || c.title).length}/70 characters`}><Input value={c.seoTitle ?? ""} placeholder={c.title} onChange={e => set("seoTitle", e.target.value)} /></Field>
              <Field label="Meta description" hint={`${(c.seoDescription ?? "").length}/160 characters`}><Textarea rows={3} value={c.seoDescription ?? ""} onChange={e => set("seoDescription", e.target.value)} /></Field>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ conditions */

function Conditions({ rules, onChange, opts, products }: { rules: CollectionRules; onChange(r: CollectionRules): void; opts: Partial<Record<CollectionField, string[]>>; products: Product[] }) {
  const setCond = (i: number, patch: Partial<CollectionCondition>) => onChange({ ...rules, conditions: rules.conditions.map((x, j) => {
    if (j !== i) return x;
    const next = { ...x, ...patch };
    if (patch.field && patch.field !== x.field) { next.op = opsFor(patch.field)[0]; next.values = []; }
    if (patch.op && !isMulti(patch.op)) next.values = next.values.slice(0, needsValue(patch.op) ? 1 : 0);
    return next;
  }) });
  const count = (cond: CollectionCondition) => products.filter(p => matchesRules(p, { match: "all", conditions: [cond] })).length;

  return (
    <div className="mt-4 border-t border-zinc-100 pt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Products must match</span>
        <Select value={rules.match} onChange={e => onChange({ ...rules, match: e.target.value as "all" | "any" })} className="w-auto">
          <option value="all">all conditions</option><option value="any">any condition</option>
        </Select>
      </div>
      <div className="space-y-2">
        {rules.conditions.map((cond, i) => {
          const kind = FIELDS[cond.field].kind;
          return (
            <div key={i} className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={cond.field} onChange={e => setCond(i, { field: e.target.value as CollectionField })} className="w-44" aria-label="Field">
                  {Object.entries(FIELDS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                </Select>
                <Select value={cond.op} onChange={e => setCond(i, { op: e.target.value as any })} className="w-44" aria-label="Operator">
                  {opsFor(cond.field).map(o => <option key={o} value={o}>{OPS[o]}{isMulti(o) ? " any of" : ""}</option>)}
                </Select>
                {needsValue(cond.op) && !isMulti(cond.op) && (
                  <Input type={kind === "number" ? "number" : "text"} step="0.01" value={cond.values[0] ?? ""} className="w-32" aria-label="Value"
                    onChange={e => setCond(i, { values: [e.target.value] })} />
                )}
                <span className="ml-auto text-xs tabular-nums text-zinc-500">{count(cond)} match</span>
                <button onClick={() => onChange({ ...rules, conditions: rules.conditions.filter((_, j) => j !== i) })} className="p-1 text-zinc-400 hover:text-red-600" aria-label="Remove condition"><Trash2 className="size-4" /></button>
              </div>
              {needsValue(cond.op) && isMulti(cond.op) && (
                <ChipInput values={cond.values} onChange={values => setCond(i, { values })} options={opts[cond.field] ?? []}
                  placeholder={kind === "status" ? "Pick a status" : `Type a value and press Enter${opts[cond.field]?.length ? ", or pick one" : ""}`} strict={kind === "status"} />
              )}
            </div>
          );
        })}
      </div>
      <Button variant="ghost" className="mt-2" onClick={() => onChange({ ...rules, conditions: [...rules.conditions, newCondition()] })}><Plus className="size-4" />Add condition</Button>
    </div>
  );
}

/** Several values as removable chips ("is any of Color, Music, Overlay"), with suggestions from the catalog. */
function ChipInput({ values, onChange, options, placeholder, strict }: { values: string[]; onChange(v: string[]): void; options: string[]; placeholder: string; strict?: boolean }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const has = (v: string) => values.some(x => x.toLowerCase() === v.toLowerCase());
  const add = (v: string) => { v = v.trim(); if (v && !has(v) && (!strict || options.includes(v))) onChange([...values, v]); setText(""); };
  const matches = options.filter(o => !has(o) && o.toLowerCase().includes(text.toLowerCase())).slice(0, 50);
  return (
    <div className="relative mt-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-300 bg-white p-1.5" onClick={() => ref.current?.focus()}>
        {values.map(v => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-0.5 pr-1 pl-2.5 text-sm">
            {v}<button onClick={e => { e.stopPropagation(); onChange(values.filter(x => x !== v)); }} className="rounded-full p-0.5 text-zinc-500 hover:bg-zinc-200" aria-label={`Remove ${v}`}><X className="size-3" /></button>
          </span>
        ))}
        <input ref={ref} value={text} placeholder={values.length ? "" : placeholder} className="min-w-32 flex-1 px-1 py-0.5 text-sm outline-none"
          onChange={e => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => {
            if ((e.key === "Enter" || e.key === ",") && text.trim()) { e.preventDefault(); add(strict ? (matches[0] ?? "") : text); }
            else if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
            else if (e.key === "Escape") setOpen(false);
          }} />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg">
          {matches.map(o => <button key={o} onMouseDown={e => { e.preventDefault(); add(o); }} className="block w-full px-3 py-1.5 text-left hover:bg-zinc-50">{o}</button>)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ products */

function ProductsCard({ c, members, products, sales, currency, onSort, onIds }: {
  c: Draft; members: Product[]; products: Product[]; sales: Map<string, number>; currency: string; onSort(v: CollectionSort): void; onIds(ids: string[]): void;
}) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const smart = c.type === "smart";
  const sort = c.sortOrder ?? "manual";
  const canReorder = sort === "manual";
  const shown = members.filter(p => !q || p.title.toLowerCase().includes(q.toLowerCase()));
  const ids = members.map(p => p.$id);
  const move = (from: number, to: number) => { const next = ids.slice(); const [x] = next.splice(from, 1); next.splice(to, 0, x); onIds(next); };
  const picker = products.filter(p => !ids.includes(p.$id) && (!q || `${p.title} ${p.productType ?? ""} ${(p.tags ?? []).join(" ")}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <Card title={`Products (${members.length})`} actions={
      <Select value={sort} onChange={e => onSort(e.target.value as CollectionSort)} className="w-48" aria-label="Sort">
        {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>Sort: {v}</option>)}
      </Select>}>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder={adding ? "Search products to add" : "Search products"} value={q} onChange={e => setQ(e.target.value)} className="min-w-0 flex-1" />
        {!smart && <Button onClick={() => setAdding(a => !a)}>{adding ? "Done adding" : <><Plus className="size-4" />Add products</>}</Button>}
      </div>
      {smart && <p className="mb-2 flex items-center gap-1 text-xs text-zinc-500"><Zap className="size-3.5 text-amber-500" />Updates automatically as products change. Preview of what's in it now.</p>}
      {canReorder && !smart && members.length > 1 && !q && !adding && <p className="mb-2 text-xs text-zinc-500">Drag to reorder.</p>}

      {adding && !smart ? (
        <div className="max-h-96 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200">
          {picker.length ? picker.map(p => (
            <button key={p.$id} onClick={() => onIds([...ids, p.$id])} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-50">
              <Thumb p={p} /><span className="flex-1">{p.title}{p.status !== "active" && <span className="ml-1 text-xs text-zinc-400">({p.status})</span>}</span><Plus className="size-4 text-zinc-400" />
            </button>
          )) : <div className="p-6 text-center text-sm text-zinc-500">No more products to add.</div>}
        </div>
      ) : shown.length ? (
        <div className="max-h-[32rem] divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200">
          {shown.map(p => {
            const i = ids.indexOf(p.$id); const draggable = canReorder && !smart && !q;
            return (
              <div key={p.$id} draggable={draggable} onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
                onDragOver={e => { if (drag !== null && drag !== i) { e.preventDefault(); move(drag, i); setDrag(i); } }}
                className={cx("flex items-center gap-3 px-3 py-2 text-sm", drag === i && "bg-zinc-50 opacity-60")}>
                {draggable && <GripVertical className="size-4 shrink-0 cursor-grab text-zinc-400" />}
                <span className="w-6 text-right text-xs tabular-nums text-zinc-400">{i + 1}</span>
                <Thumb p={p} />
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                {p.status !== "active" && <Badge tone={p.status === "unlisted" ? "yellow" : "gray"}>{p.status}</Badge>}
                {sort === "best-selling" && <span className="text-xs tabular-nums text-zinc-500">{sales.get(p.$id) ?? 0} sold</span>}
                <span className="text-xs tabular-nums text-zinc-500">{money(Math.min(...(p.variants?.length ? p.variants.map(v => v.price) : [p.price])), currency)}</span>
                {!smart && <button onClick={() => onIds(ids.filter(x => x !== p.$id))} className="p-1 text-zinc-400 hover:text-red-600" aria-label={`Remove ${p.title}`}><X className="size-4" /></button>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          {q ? "No products match your search." : smart ? "No products match these conditions yet." : "No products yet. Use Add products to pick some."}
        </div>
      )}
    </Card>
  );
}

const Thumb = ({ p }: { p: Product }) => p.imageUrl
  ? <img src={p.imageUrl} alt="" loading="lazy" className="size-8 shrink-0 rounded object-cover" />
  : <div className="grid size-8 shrink-0 place-items-center rounded bg-zinc-100 text-zinc-400"><ImageOff className="size-3.5" /></div>;

function ImageCard({ url, title, onChange }: { url?: string; title: string; onChange(u: string): void }) {
  const { site } = useSite(); const s = site!;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const upload = async (f?: File) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try { onChange((await uploadFile(s.$id, f)).url); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Card title="Image">
      {err && <div className="mb-2"><ErrorBox error={err} /></div>}
      {url ? (
        <div className="space-y-2">
          <img src={url} alt={title} className="aspect-video w-full rounded-lg object-cover" />
          <div className="flex gap-2">
            <label className="cursor-pointer text-sm underline">Replace<input type="file" accept="image/*" hidden onChange={e => upload(e.target.files?.[0])} /></label>
            <button className="text-sm text-red-600 underline" onClick={() => onChange("")}>Remove</button>
          </div>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 hover:bg-zinc-50">
          {busy ? "Uploading…" : <><Plus className="size-5" />Add image</>}
          <input type="file" accept="image/*" hidden onChange={e => upload(e.target.files?.[0])} />
        </label>
      )}
      <Input className="mt-2" placeholder="…or paste an image URL" value={url ?? ""} onChange={e => onChange(e.target.value)} />
    </Card>
  );
}
