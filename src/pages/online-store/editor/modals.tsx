import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CornerDownRight, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { listFiles, uploadFile, type StoredFile } from "../../../lib/files";
import type { Menu, MenuItem } from "../../../theme/types";
import { uid } from "../../../theme/util";
import { cx } from "../../../components/ui";
import { inputCls } from "./fields";
import { useEnv } from "./context";

export function Overlay({ title, onClose, children, footer, wide }: { title: string; onClose(): void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:pt-16" onMouseDown={onClose}>
      <div className={cx("flex max-h-[85vh] w-full flex-col rounded-xl bg-white shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")} onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-100" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

const btn = (primary?: boolean) => cx("rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50", primary ? "bg-zinc-900 text-white hover:bg-zinc-700" : "border border-zinc-300 bg-white hover:bg-zinc-50");

/** Choose an image: the store's files, product photos, upload, or a URL. */
export function MediaPicker({ current, onPick, onClose }: { current: string; onPick(url: string): void; onClose(): void }) {
  const env = useEnv();
  const [files, setFiles] = useState<StoredFile[] | null>(null);
  const [sel, setSel] = useState(current);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { listFiles(env.siteId).then(f => setFiles(f.filter(x => x.mime.startsWith("image/"))), () => setFiles([])); }, [env.siteId]);
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true); setErr(null);
    try {
      const up: StoredFile[] = [];
      for (const f of Array.from(list)) up.push(await uploadFile(env.siteId, f));
      setFiles(fs => [...up, ...(fs ?? [])]); setSel(up[0].url);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const productImgs = [...new Set(env.products.map(p => p.imageUrl).filter((u): u is string => !!u))];
  const Tile = ({ src, name }: { src: string; name?: string }) => (
    <button type="button" onClick={() => setSel(src)} onDoubleClick={() => { onPick(src); onClose(); }} title={name}
      className={cx("group relative aspect-square overflow-hidden rounded-lg border bg-zinc-50", sel === src ? "border-zinc-900 ring-2 ring-zinc-900/20" : "border-zinc-200 hover:border-zinc-400")}>
      <img src={src} alt="" className="size-full object-cover" loading="lazy" />
    </button>
  );
  return (
    <Overlay title="Select image" onClose={onClose} wide
      footer={<><button className={btn()} onClick={onClose}>Cancel</button><button className={btn(true)} disabled={!sel} onClick={() => { onPick(sel); onClose(); }}>Done</button></>}>
      <div
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); upload(e.dataTransfer.files); }}
        className="mb-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">
        <button className={btn()} onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="mr-1 inline size-4 animate-spin" /> : <Upload className="mr-1 inline size-4" />}Upload files
        </button>
        <span className="text-xs">or drop images here</span>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={e => upload(e.target.files)} />
      </div>
      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <div className="mb-4 flex gap-2">
        <input className={inputCls} placeholder="…or paste an image URL (https://…)" value={url} onChange={e => setUrl(e.target.value)} />
        <button className={btn()} disabled={!/^https?:\/\//.test(url)} onClick={() => { onPick(url); onClose(); }}>Use URL</button>
      </div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Files</div>
      {files === null ? <div className="py-6 text-sm text-zinc-500"><Loader2 className="mr-1 inline size-4 animate-spin" />Loading…</div>
        : files.length ? <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{files.map(f => <Tile key={f.id} src={f.url} name={f.name} />)}</div>
        : <div className="py-3 text-sm text-zinc-500">No uploaded images yet.</div>}
      {productImgs.length > 0 && <>
        <div className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Product images</div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{productImgs.map(u => <Tile key={u} src={u} />)}</div>
      </>}
    </Overlay>
  );
}

/** Navigation menus, edited right in the editor (Shopify sends you to a separate admin page). */
export function MenuEditor({ menus, initial, onSave, onClose }: { menus: Record<string, Menu>; initial?: string; onSave(m: Record<string, Menu>): void; onClose(): void }) {
  const [draft, setDraft] = useState(() => structuredClone(menus));
  const [handle, setHandle] = useState(initial && menus[initial] ? initial : Object.keys(menus)[0]);
  const env = useEnv();
  const menu = draft[handle];
  const setItems = (fn: (items: MenuItem[]) => MenuItem[]) => setDraft(d => ({ ...d, [handle]: { ...d[handle], items: fn(structuredClone(d[handle].items)) } }));
  const suggestions = [
    { t: "Home", u: "/" }, { t: "All products", u: "/collections/all" }, { t: "Collections", u: "/collections" }, { t: "Search", u: "/search" },
    ...Object.entries(env.theme.templates).filter(([k]) => k.startsWith("page.")).map(([k, t]) => ({ t: t.title ?? k.slice(5), u: `/pages/${k.slice(5)}` })),
    ...env.collections.map(c => ({ t: c.title, u: `/collections/${c.handle}` })),
    ...env.products.filter(p => p.status === "active").map(p => ({ t: p.title, u: `/products/${p.$id}` })),
  ];
  const row = (it: MenuItem, path: number[], depth: number, siblings: number) => {
    const update = (patch: Partial<MenuItem>) => setItems(items => { at(items, path, x => Object.assign(x, patch)); return items; });
    const move = (d: number) => setItems(items => { const list = listAt(items, path.slice(0, -1)); const i = path[path.length - 1]; const [x] = list.splice(i, 1); list.splice(i + d, 0, x); return items; });
    const del = () => setItems(items => { listAt(items, path.slice(0, -1)).splice(path[path.length - 1], 1); return items; });
    return (
      <div key={it.id}>
        <div className={cx("flex items-center gap-1.5 py-1", depth > 0 && "pl-6")}>
          {depth > 0 && <CornerDownRight className="size-3.5 shrink-0 text-zinc-400" />}
          <input className={cx(inputCls, "w-36")} value={it.title} onChange={e => update({ title: e.target.value })} placeholder="Label" />
          <input className={inputCls} list="menu-links" value={it.url} onChange={e => update({ url: e.target.value })} placeholder="/collections/all" />
          <button className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30" disabled={path[path.length - 1] === 0} onClick={() => move(-1)} aria-label="Move up"><ArrowUp className="size-3.5" /></button>
          <button className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30" disabled={path[path.length - 1] === siblings - 1} onClick={() => move(1)} aria-label="Move down"><ArrowDown className="size-3.5" /></button>
          <button className="rounded p-1 text-red-500 hover:bg-red-50" onClick={del} aria-label="Delete"><Trash2 className="size-3.5" /></button>
        </div>
        {it.children?.map((c, i) => row(c, [...path, i], depth + 1, it.children!.length))}
        {depth === 0 && <button className="ml-6 text-xs text-sky-700 hover:underline" onClick={() => update({ children: [...(it.children ?? []), { id: uid("m"), title: "", url: "" }] })}>+ Add sub-item to {it.title || "item"}</button>}
      </div>
    );
  };
  return (
    <Overlay title="Navigation menus" onClose={onClose} wide
      footer={<><button className={btn()} onClick={onClose}>Cancel</button><button className={btn(true)} onClick={() => { onSave(draft); onClose(); }}>Save menus</button></>}>
      <datalist id="menu-links">{suggestions.map(s => <option key={s.u} value={s.u}>{s.t}</option>)}</datalist>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.entries(draft).map(([h, m]) => (
          <button key={h} onClick={() => setHandle(h)} className={cx("rounded-full px-3 py-1 text-sm", h === handle ? "bg-zinc-900 text-white" : "bg-zinc-100 hover:bg-zinc-200")}>{m.title}</button>
        ))}
        <button className="rounded-full border border-dashed border-zinc-300 px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-50" onClick={() => {
          const name = prompt("Menu name"); if (!name) return;
          const h = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || uid("menu-");
          setDraft(d => ({ ...d, [h]: { title: name, items: [] } })); setHandle(h);
        }}><Plus className="mr-0.5 inline size-3.5" />New menu</button>
      </div>
      {menu && <>
        <div className="mb-3 flex items-center gap-2">
          <input className={cx(inputCls, "max-w-xs")} value={menu.title} onChange={e => setDraft(d => ({ ...d, [handle]: { ...d[handle], title: e.target.value } }))} />
          {!["main-menu", "footer"].includes(handle) && <button className="text-xs text-red-600 hover:underline" onClick={() => { setDraft(d => { const n = { ...d }; delete n[handle]; return n; }); setHandle("main-menu"); }}>Delete menu</button>}
        </div>
        <div className="space-y-0.5">{menu.items.map((it, i) => row(it, [i], 0, menu.items.length))}</div>
        <button className={cx(btn(), "mt-3")} onClick={() => setItems(items => [...items, { id: uid("m"), title: "", url: "" }])}><Plus className="mr-1 inline size-4" />Add menu item</button>
      </>}
    </Overlay>
  );
}

function listAt(items: MenuItem[], path: number[]): MenuItem[] {
  let list = items;
  for (const i of path) { list[i].children ??= []; list = list[i].children!; }
  return list;
}
function at(items: MenuItem[], path: number[], fn: (x: MenuItem) => void) {
  fn(listAt(items, path.slice(0, -1))[path[path.length - 1]]);
}
