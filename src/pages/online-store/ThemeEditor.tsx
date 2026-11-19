import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, Eye, Fullscreen, LayoutList, Loader2, Monitor, MousePointerClick, Palette, Plus, Redo2, Smartphone, Trash2, Undo2 } from "lucide-react";
import { useSite, useStorePath } from "../../context/Site";
import { list, update } from "../../lib/data";
import type { Collection, Product, Theme } from "../../lib/types";
import * as ops from "../../theme/ops";
import type { Loc, Where } from "../../theme/ops";
import { SECTIONS, blockSchema, fromPreset, themeSettings } from "../../theme/registry";
import { bodyClass, headHtml, pageTitle, renderSection, renderSections } from "../../theme/render";
import { routeFor } from "../../theme/routes";
import { allCollection } from "../../theme/routes";
import { paramsOf } from "../../theme/filters";
import { predictiveSearch } from "../../theme/search";
import { blankPage } from "../../theme/presets";
import type { CartLine, RenderCtx, RenderData, Route, SettingValue, ThemeDoc } from "../../theme/types";
import { slug } from "../../theme/util";
import { cx } from "../../components/ui";
import { EnvCtx, type EditorEnv } from "./editor/context";
import Preview, { type Device, type Sel, type ToolbarAction } from "./editor/Preview";
import SectionTree from "./editor/SectionTree";
import { AddBlockPicker, AddSectionPicker } from "./editor/Pickers";
import { BlockPanel, SectionPanel, ThemeSettingsPanel } from "./editor/Panels";
import { MediaPicker, MenuEditor } from "./editor/modals";
import { blockLabel, sectionLabel } from "./editor/labels";
import { publishTheme } from "./publish";

/* ------------------------------------------------------------------ undo / redo */
function useHistory(initial: ThemeDoc | null) {
  const [h, setH] = useState({ past: [] as ThemeDoc[], present: initial, future: [] as ThemeDoc[] });
  const last = useRef({ key: "", at: 0 });
  /** Typing into one field within a second counts as one undo step. */
  const commit = useCallback((next: ThemeDoc, key = "") => {
    const now = Date.now();
    const merge = key && last.current.key === key && now - last.current.at < 1000;
    last.current = { key, at: now };
    setH(s => ({ past: merge || !s.present ? s.past : [...s.past.slice(-99), s.present], present: next, future: [] }));
  }, []);
  const undo = useCallback(() => { last.current.key = ""; setH(s => s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present!, ...s.future] } : s); }, []);
  const redo = useCallback(() => { last.current.key = ""; setH(s => s.future.length ? { past: [...s.past, s.present!], present: s.future[0], future: s.future.slice(1) } : s); }, []);
  const reset = useCallback((doc: ThemeDoc) => setH({ past: [], present: doc, future: [] }), []);
  return { doc: h.present, commit, undo, redo, reset, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}

const TEMPLATE_GROUPS: { label: string; keys: (t: ThemeDoc) => string[] }[] = [
  { label: "", keys: () => ["index"] },
  { label: "Products", keys: t => Object.keys(t.templates).filter(k => k.split(".")[0] === "product") },
  { label: "Collections", keys: t => Object.keys(t.templates).filter(k => k.split(".")[0] === "collection").concat("list-collections") },
  { label: "Pages", keys: t => Object.keys(t.templates).filter(k => k.startsWith("page.")) },
  { label: "Other", keys: () => ["cart", "search", "thank-you", "404"] },
];

const draftKey = (id: string) => `yancey-theme-draft-${id}`;

export default function ThemeEditor() {
  const { themeId } = useParams();
  const { site } = useSite(); const s = site!;
  const sp = useStorePath();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [row, setRow] = useState<Theme | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const hist = useHistory(null);
  const doc = hist.doc;
  const saved = useRef<string>("");
  const [savedTick, setSavedTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<ThemeDoc | null>(null);

  const [template, setTemplate] = useState(params.get("template") || "index");
  const [pick, setPick] = useState<{ product?: string; variant?: string; collection?: string; query?: string; search?: string }>({});
  const [tab, setTab] = useState<"sections" | "settings">("sections");
  const [themeGroup, setThemeGroup] = useState<string | null>(null);
  const [selected, setSelected] = useState<Sel>(null);
  const [highlight, setHighlight] = useState<Sel>(null);
  const [scrollKey, setScrollKey] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [device, setDevice] = useState<Device>("desktop");
  const [full, setFull] = useState(params.get("view") === "preview");
  const [inspector, setInspector] = useState(params.get("view") !== "preview");
  const [cart, setCart] = useState<{ id: string; variantId?: string; quantity: number }[]>([]);
  const [cartOpenKey, setCartOpenKey] = useState(0);
  const [addSection, setAddSection] = useState<{ where: Where; index: number; anchor: DOMRect } | null>(null);
  const [addBlock, setAddBlock] = useState<{ where: Where; sectionId: string; anchor: DOMRect } | null>(null);
  const [media, setMedia] = useState<{ current: string; onPick(u: string): void } | null>(null);
  const [menus, setMenus] = useState<string | null>(null);
  const [pageMenu, setPageMenu] = useState(false);
  const [wide, setWide] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(m.matches);
    m.addEventListener("change", on); return () => m.removeEventListener("change", on);
  }, []);

  /* ------------------------------------------------ load */
  useEffect(() => {
    let live = true;
    Promise.all([list("themes", s.$id), list("products", s.$id), list("collections", s.$id)]).then(([themes, ps, cs]) => {
      if (!live) return;
      const t = themes.find(x => x.$id === themeId);
      if (!t?.data) { setError("This theme doesn't exist any more."); return; }
      setRow(t); setProducts(ps); setCollections(cs);
      hist.reset(t.data);
      saved.current = JSON.stringify(t.data);
      try {
        const raw = localStorage.getItem(draftKey(t.$id));
        if (raw) { const d = JSON.parse(raw); if (d.base === (t.savedAt ?? t.$createdAt) && JSON.stringify(d.doc) !== saved.current) setDraft(d.doc); else localStorage.removeItem(draftKey(t.$id)); }
      } catch { /* ignore */ }
    }, e => setError(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId, s.$id]);

  const dirty = useMemo(() => !!doc && JSON.stringify(doc) !== saved.current, [doc, savedTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep unsaved work in this browser so a closed tab or crash doesn't lose it (improvement).
  useEffect(() => {
    if (!row || !doc) return;
    const t = setTimeout(() => {
      try { if (dirty) localStorage.setItem(draftKey(row.$id), JSON.stringify({ base: row.savedAt ?? row.$createdAt, doc })); else localStorage.removeItem(draftKey(row.$id)); } catch { /* full */ }
    }, 600);
    return () => clearTimeout(t);
  }, [doc, dirty, row]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(t => (t === m ? null : t)), 2600); };

  const save = useCallback(async () => {
    if (!row || !doc || saving) return;
    setSaving(true);
    try {
      const savedAt = new Date().toISOString();
      const next = await update("themes", row.$id, { data: doc, savedAt });
      setRow({ ...row, ...next, data: doc, savedAt });
      saved.current = JSON.stringify(doc); setSavedTick(t => t + 1);
      try { localStorage.removeItem(draftKey(row.$id)); } catch { /* ignore */ }
      flash("Saved");
    } catch (e) { flash(`Couldn't save: ${(e as Error).message}`); }
    finally { setSaving(false); }
  }, [row, doc, saving]);

  /* ------------------------------------------------ render context */
  const route: Route = useMemo(() => {
    const type = template.split(".")[0];
    const product = type === "product" ? products.find(p => p.$id === pick.product) ?? products.find(p => p.status === "active") : undefined;
    const collection = type === "collection" ? (pick.collection === "all" ? allCollection(products, s.$id) : collections.find(c => c.handle === pick.collection) ?? collections[0] ?? allCollection(products, s.$id)) : undefined;
    const path = product ? `/products/${product.$id}` : collection ? `/collections/${collection.handle}` : template === "index" ? "/" : template.startsWith("page.") ? `/pages/${template.slice(5)}` : `/${template}`;
    const search = pick.search ?? "";
    const params = paramsOf(search);
    return { template, product, variant: pick.variant, collection, query: type === "search" ? pick.query ?? "" : undefined, path: path + search, params, sort: params.sort?.[0] };
  }, [template, pick, products, collections, s.$id]);

  const cartLines: CartLine[] = useMemo(() => cart.map(l => {
    const product = products.find(p => p.$id === l.id);
    return { product: product!, variant: product?.variants?.find(v => v.id === l.variantId), quantity: l.quantity };
  }).filter(l => l.product), [cart, products]);
  const data: RenderData = useMemo(() => ({ site: { id: s.$id, name: s.name, currency: s.currency || "USD", domain: s.domain }, products, collections, cart: cartLines, payments: { stripe: true, paypal: true } }), [s, products, collections, cartLines]);
  const ctx: RenderCtx | null = useMemo(() => doc ? { theme: doc, data, route, editor: true } : null, [doc, data, route]);
  const sections = useMemo(() => ctx ? renderSections(ctx) : [], [ctx]);
  const head = useMemo(() => ctx ? headHtml(ctx) : "", [ctx]);

  const loc = (where: Where): Loc => ({ where, template });
  const locOf = (id: string): Loc | null => (doc ? ops.findSection(doc, template, id)?.loc ?? null : null);
  const sectionOf = (id: string) => (doc ? ops.findSection(doc, template, id)?.section ?? null : null);

  /* ------------------------------------------------ actions */
  const selectSection = (sel: Sel, scroll = true) => {
    setSelected(sel);
    if (sel) { setTab("sections"); if (sel.blockId) setExpanded(e => new Set(e).add(sel.sectionId)); }
    if (scroll) setScrollKey(k => k + 1);
  };

  const doAction = (a: ToolbarAction, id: string, blockId?: string) => {
    if (!doc) return;
    const l = locOf(id); if (!l) return;
    if (blockId) {
      if (a === "duplicate") { const r = ops.duplicateBlock(doc, l, id, blockId); hist.commit(r.doc); setSelected({ sectionId: id, blockId: r.blockId }); }
      if (a === "hide") hist.commit(ops.toggleBlock(doc, l, id, blockId));
      if (a === "remove") { hist.commit(ops.removeBlock(doc, l, id, blockId)); setSelected({ sectionId: id }); }
      return;
    }
    const g = ops.getGroup(doc, l), i = g.order.indexOf(id);
    if (a === "up") hist.commit(ops.moveSection(doc, l, id, i - 1));
    if (a === "down") hist.commit(ops.moveSection(doc, l, id, i + 1));
    if (a === "duplicate") { const r = ops.duplicateSection(doc, l, id); hist.commit(r.doc); setSelected({ sectionId: r.id }); }
    if (a === "hide") { hist.commit(ops.setSectionProp(doc, l, id, { disabled: !g.sections[id].disabled })); setSelected(null); }
    if (a === "remove") { hist.commit(ops.removeSection(doc, l, id)); setSelected(null); }
    setTimeout(() => setScrollKey(k => k + 1), 30);
  };

  const onInlineEdit = (id: string, blockId: string | undefined, key: string, value: string) => {
    if (!doc) return;
    const l = locOf(id); const sec = sectionOf(id); if (!l || !sec) return;
    const schema = blockId ? blockSchema(SECTIONS[sec.type], sec.blocks[blockId]?.type ?? "")?.settings : SECTIONS[sec.type]?.settings;
    const type = schema?.find(x => x.id === key)?.type;
    const v = type === "inline_richtext" ? value : new DOMParser().parseFromString(value, "text/html").body.textContent ?? "";
    hist.commit(blockId ? ops.setBlockSetting(doc, l, id, blockId, key, v) : ops.setSectionSetting(doc, l, id, key, v), `inline:${id}:${blockId}:${key}`);
  };

  const onNavigate = (url: string) => {
    if (!doc) return;
    const r = routeFor(url, doc, products, collections, s.$id);
    setTemplate(r.template); setSelected(null);
    setPick({ product: r.product?.$id, variant: r.variant, collection: r.collection?.handle, query: r.query, search: new URL(url, "https://x").search });
  };

  const changeTemplate = (k: string) => { setTemplate(k); setSelected(null); setPageMenu(false); setParams(p => { p.set("template", k); return p; }, { replace: true }); };

  const createPage = () => {
    if (!doc) return;
    const title = prompt("Page name (for example “Shipping policy”)");
    if (!title) return;
    let handle = slug(title) || "page", n = 2;
    while (doc.templates[`page.${handle}`]) handle = `${slug(title)}-${n++}`;
    hist.commit(ops.setTemplate(doc, `page.${handle}`, blankPage(title)));
    changeTemplate(`page.${handle}`);
    flash(`Page created at /pages/${handle}. Add it to a menu so customers can find it.`);
  };

  const api = useMemo(() => ({
    addToCart: (id: string, q: number, variantId?: string) => setCart(c => {
      const same = (x: { id: string; variantId?: string }) => x.id === id && (x.variantId ?? "") === (variantId ?? "");
      return c.some(same) ? c.map(x => same(x) ? { ...x, quantity: x.quantity + q } : x) : [...c, { id, variantId, quantity: q }];
    }),
    setQuantity: (id: string, q: number, variantId?: string) => setCart(c => {
      const same = (x: { id: string; variantId?: string }) => x.id === id && (x.variantId ?? "") === (variantId ?? "");
      return q > 0 ? c.map(x => same(x) ? { ...x, quantity: q } : x) : c.filter(x => !same(x));
    }),
    checkout: async () => { throw new Error("Checkout is turned off in the editor preview."); },
    buyNow: async () => { throw new Error("Checkout is turned off in the editor preview."); },
    discount: async (code: string) => `Discount codes are checked at checkout (${code.toUpperCase()}).`,
    subscribe: async () => { /* preview only */ },
    navigate: onNavigate,
    search: (q: string) => doc ? predictiveSearch(q, { products, collections, currency: s.currency || "USD" }, doc) : [],
  }), [doc, products, collections]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------ keyboard */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable=true]");
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
      else if (mod && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); if (e.shiftKey) hist.redo(); else hist.undo(); }
      else if (mod && e.key.toLowerCase() === "y" && !typing) { e.preventDefault(); hist.redo(); }
      else if (e.key === "Escape" && !typing && !addSection && !addBlock && !media && !menus) setSelected(null);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [save, hist, addSection, addBlock, media, menus]);

  /* ------------------------------------------------ env for fields */
  const env: EditorEnv | null = doc ? {
    siteId: s.$id, theme: doc, products, collections,
    pickImage: (current, onPick) => setMedia({ current, onPick }),
    openMenus: h => setMenus(h ?? "main-menu"),
    openColors: () => { setTab("settings"); setThemeGroup("colors"); },
  } : null;

  if (error) return <div className="grid h-screen place-items-center p-6 text-center text-sm"><div><p className="mb-3 text-zinc-700">{error}</p><Link className="underline" to={sp("/channels/online-store")}>Back to themes</Link></div></div>;
  if (!doc || !row || !env || !ctx) return <div className="grid h-screen place-items-center text-sm text-zinc-500"><span><Loader2 className="mr-2 inline size-4 animate-spin" />Opening theme editor…</span></div>;

  const groups = [
    { where: "header" as Where, title: "Header", group: doc.groups.header },
    { where: "template" as Where, title: "Template", group: doc.templates[template] ?? { order: [], sections: {} } },
    { where: "footer" as Where, title: "Footer", group: doc.groups.footer },
  ];
  const selSection = selected ? sectionOf(selected.sectionId) : null;
  const selLoc = selected ? locOf(selected.sectionId) : null;
  const templateTitle = (k: string) => doc.templates[k]?.title ?? ({ "list-collections": "Collections list", cart: "Cart", search: "Search", "404": "404 page" } as Record<string, string>)[k] ?? k;

  const previewDoc = (type: string) => {
    const { id, section } = fromPreset(type);
    const c = { ...ctx, editor: false, theme: { ...doc, settings: themeSettings(doc) } };
    return `<!doctype html><html><head>${headHtml(c)}<style>[data-reveal]{opacity:1!important;transform:none!important}body{pointer-events:none}</style></head><body class="color-scheme-1">${renderSection(c, id, section, "template")}</body></html>`;
  };

  const selectionPanel = (
    <>
              {selSection && selLoc && selected ? (selected.blockId && selSection.blocks[selected.blockId] ? (
                <BlockPanel key={selected.blockId} section={selSection} blockId={selected.blockId} onBack={() => setSelected({ sectionId: selected.sectionId })}
                  onSetting={(k, v: SettingValue) => hist.commit(ops.setBlockSetting(doc, selLoc, selected.sectionId, selected.blockId!, k, v), `${selected.blockId}:${k}`)}
                  onToggle={() => doAction("hide", selected.sectionId, selected.blockId)} onDuplicate={() => doAction("duplicate", selected.sectionId, selected.blockId)}
                  onRemove={() => doAction("remove", selected.sectionId, selected.blockId)} />
              ) : (
                <SectionPanel key={selected.sectionId} section={selSection}
                  onSetting={(k, v) => hist.commit(ops.setSectionSetting(doc, selLoc, selected.sectionId, k, v), `${selected.sectionId}:${k}`)}
                  onRename={name => hist.commit(ops.setSectionProp(doc, selLoc, selected.sectionId, { name: name || undefined }), `${selected.sectionId}:name`)}
                  onCss={css => hist.commit(ops.setSectionProp(doc, selLoc, selected.sectionId, { custom_css: css }), `${selected.sectionId}:css`)}
                  onToggle={() => doAction("hide", selected.sectionId)} onDuplicate={() => doAction("duplicate", selected.sectionId)} onRemove={() => doAction("remove", selected.sectionId)}
                  onAddBlock={anchor => setAddBlock({ where: selLoc.where, sectionId: selected.sectionId, anchor })} />
              )) : (
                <div className="p-6 text-center text-sm text-zinc-500">
                  <MousePointerClick className="mx-auto mb-2 size-6 text-zinc-300" />
                  Select a section or block in the sidebar or the preview to edit its settings.
                  <p className="mt-3 text-xs">Tip: double-click text in the preview to edit it in place.</p>
                </div>
              )}
    </>
  );
  const narrowSettings = !wide && !!selected && !!selSection;

  const iconBtn = (active: boolean) => cx("grid size-8 place-items-center rounded-lg", active ? "bg-zinc-200 text-zinc-900" : "text-zinc-600 hover:bg-zinc-100");

  return (
    <EnvCtx.Provider value={env}>
      <div className="flex h-screen flex-col bg-zinc-100 text-zinc-900">
        {/* top bar */}
        <header className="relative z-30 flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-2">
          <button onClick={() => { if (!dirty || confirm("Leave without saving? Your changes stay in this browser until you come back.")) navigate(sp("/channels/online-store")); }}
            className="grid size-8 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100" title="Exit"><ArrowLeft className="size-4" /></button>
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            <span className="truncate text-sm font-semibold">{row.name}</span>
            <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", row.role === "main" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600")}>{row.role === "main" ? "Live" : "Draft"}</span>
          </div>

          {/* page selector */}
          <div className="relative mx-auto">
            <button onClick={() => setPageMenu(o => !o)} className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-50">
              {templateTitle(template)}<ChevronDown className="size-3.5 text-zinc-500" />
            </button>
            {pageMenu && <>
              <div className="fixed inset-0 z-30" onClick={() => setPageMenu(false)} />
              <div className="absolute left-1/2 z-40 mt-1 max-h-[70vh] w-72 -translate-x-1/2 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xl">
                {TEMPLATE_GROUPS.map(g => {
                  const keys = g.keys(doc).filter((k, i, a) => a.indexOf(k) === i && (doc.templates[k] || k === "list-collections"));
                  return (
                    <div key={g.label} className="mb-1">
                      {g.label && <div className="px-2 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{g.label}</div>}
                      {keys.map(k => (
                        <div key={k} className="group flex items-center">
                          <button onClick={() => changeTemplate(k)} className={cx("flex flex-1 items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-zinc-100", k === template && "font-semibold")}>
                            {templateTitle(k)}{k === template && <Check className="size-3.5" />}
                          </button>
                          {k.startsWith("page.") && (
                            <button title="Delete page" onClick={() => { if (confirm(`Delete the page “${templateTitle(k)}”?`)) { hist.commit(ops.setTemplate(doc, k, null)); if (k === template) changeTemplate("index"); } }}
                              className="ml-1 hidden rounded p-1 text-red-500 hover:bg-red-50 group-hover:block"><Trash2 className="size-3.5" /></button>
                          )}
                        </div>
                      ))}
                      {g.label === "Pages" && <button onClick={createPage} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-sky-700 hover:bg-zinc-100"><Plus className="size-3.5" />Create page</button>}
                    </div>
                  );
                })}
              </div>
            </>}
          </div>

          <div className="flex items-center gap-0.5">
            <button className={iconBtn(inspector)} onClick={() => setInspector(i => !i)} title={inspector ? "Inspector on: click to select sections (turn off to click through the store)" : "Inspector off: the preview works like the live store"}><MousePointerClick className="size-4" /></button>
            <div className="mx-1 hidden h-5 w-px bg-zinc-200 sm:block" />
            <button className={iconBtn(device === "desktop" && !full)} onClick={() => { setDevice("desktop"); setFull(false); }} title="Desktop"><Monitor className="size-4" /></button>
            <button className={iconBtn(device === "mobile")} onClick={() => setDevice("mobile")} title="Mobile"><Smartphone className="size-4" /></button>
            <button className={iconBtn(full)} onClick={() => setFull(f => !f)} title="Full screen"><Fullscreen className="size-4" /></button>
            <div className="mx-1 h-5 w-px bg-zinc-200" />
            <button className={iconBtn(false)} disabled={!hist.canUndo} onClick={hist.undo} title="Undo (⌘Z)"><Undo2 className={cx("size-4", !hist.canUndo && "opacity-30")} /></button>
            <button className={iconBtn(false)} disabled={!hist.canRedo} onClick={hist.redo} title="Redo (⇧⌘Z)"><Redo2 className={cx("size-4", !hist.canRedo && "opacity-30")} /></button>
            <a href={`${sp(`/channels/online-store/editor/${row.$id}`)}?view=preview&template=${encodeURIComponent(template)}`} target="_blank" rel="noreferrer" className={cx(iconBtn(false), "hidden sm:grid")} title="Open preview in a new tab"><Eye className="size-4" /></a>
            {row.role !== "main" && (
              <button onClick={async () => {
                if (dirty) await save();
                if (!confirm(`Publish “${row.name}”? It replaces your current live theme.`)) return;
                try { await publishTheme(s.$id, row.$id); setRow(r => r && { ...r, role: "main" }); flash("Published. It's now your live theme."); }
                catch (e) { flash(`Couldn't publish: ${(e as Error).message}`); }
              }} className="ml-1 hidden rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] font-medium hover:bg-zinc-50 sm:block">Publish</button>
            )}
            <button onClick={save} disabled={!dirty || saving} className="ml-1 flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-zinc-700 disabled:bg-zinc-200 disabled:text-zinc-500">
              {saving && <Loader2 className="size-3.5 animate-spin" />}{dirty ? "Save" : "Saved"}
            </button>
          </div>
        </header>

        {draft && (
          <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900">
            You have unsaved changes from an earlier session.
            <button className="font-semibold underline" onClick={() => { hist.commit(draft); setDraft(null); }}>Restore them</button>
            <button className="underline" onClick={() => { setDraft(null); try { localStorage.removeItem(draftKey(row.$id)); } catch { /* ignore */ } }}>Discard</button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {!full && <>
            {/* icon rail */}
            <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-zinc-200 bg-white py-2">
              <button className={iconBtn(tab === "sections")} onClick={() => setTab("sections")} title="Sections"><LayoutList className="size-4" /></button>
              <button className={iconBtn(tab === "settings")} onClick={() => setTab("settings")} title="Theme settings"><Palette className="size-4" /></button>
            </nav>
            {/* left panel */}
            <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-200 bg-white">
              {narrowSettings ? <>
                <button onClick={() => setSelected(null)} className="flex h-11 shrink-0 items-center gap-1.5 border-b border-zinc-200 px-4 text-left text-sm font-semibold hover:bg-zinc-50"><ArrowLeft className="size-4" />{templateTitle(template)}</button>
                <div className="flex-1 overflow-y-auto">{selectionPanel}</div>
              </> : <>
              <div className="flex h-11 shrink-0 items-center border-b border-zinc-200 px-4 text-sm font-semibold">{tab === "sections" ? templateTitle(template) : "Theme settings"}</div>
              <div className="flex-1 overflow-y-auto">
                {tab === "sections" ? <>
                  {(template.split(".")[0] === "product" || template.split(".")[0] === "collection" || template === "search") && (
                    <div className="border-b border-zinc-200 px-4 py-2.5">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Preview</div>
                      {template.split(".")[0] === "product" ? (
                        <select className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-[13px]" value={route.product?.$id ?? ""} onChange={e => setPick({ product: e.target.value })}>
                          {!products.length && <option value="">Sample product</option>}
                          {products.filter(p => p.status !== "archived").map(p => <option key={p.$id} value={p.$id}>{p.title}</option>)}
                        </select>
                      ) : template === "search" ? (
                        <input className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-[13px]" placeholder="Search terms" value={pick.query ?? ""} onChange={e => setPick({ query: e.target.value })} />
                      ) : (
                        <select className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-[13px]" value={route.collection?.handle ?? ""} onChange={e => setPick({ collection: e.target.value })}>
                          <option value="all">All products</option>
                          {collections.map(c => <option key={c.$id} value={c.handle}>{c.title}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                  <SectionTree groups={groups} selected={selected} expanded={expanded}
                    onToggleExpand={id => setExpanded(e => { const n = new Set(e); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                    onSelect={sel => { selectSection(sel); if (sel && !sel.blockId) setExpanded(e => new Set(e).add(sel.sectionId)); }}
                    onHover={setHighlight}
                    onToggleSection={(w, id) => hist.commit(ops.setSectionProp(doc, loc(w), id, { disabled: !ops.getGroup(doc, loc(w)).sections[id].disabled }))}
                    onToggleBlock={(w, id, b) => hist.commit(ops.toggleBlock(doc, loc(w), id, b))}
                    onMoveSection={(from, id, to, index) => {
                      const sec = ops.getGroup(doc, loc(from)).sections[id];
                      const sc = SECTIONS[sec.type];
                      const ok = from === to || (sc && (sc.groups ?? (sc.category === "Template" ? ["template"] : ["template", "footer"])).includes(to));
                      if (!ok) { flash(`${sc?.name ?? "This section"} can't go in the ${to}.`); return; }
                      let i = index;
                      if (from === to) { const cur = ops.getGroup(doc, loc(from)).order.indexOf(id); if (cur < index) i--; }
                      hist.commit(ops.moveSectionTo(doc, loc(from), id, loc(to), i));
                    }}
                    onMoveBlock={(w, id, b, i) => hist.commit(ops.moveBlock(doc, loc(w), id, b, i))}
                    onAddSection={(where, index, anchor) => setAddSection({ where, index, anchor })}
                    onAddBlock={(where, sectionId, anchor) => setAddBlock({ where, sectionId, anchor })} />
                </> : (
                  <ThemeSettingsPanel values={themeSettings(doc)} schemes={doc.colorSchemes} open={themeGroup}
                    setOpen={g => { setThemeGroup(g); if (g === "cart") setCartOpenKey(k => k + 1); }}
                    onSetting={(k, v) => hist.commit(ops.setThemeSetting(doc, k, v), `theme:${k}`)}
                    onScheme={(id, sc) => hist.commit(ops.setScheme(doc, id, sc), `scheme:${id}`)} />
                )}
              </div>
              </>}
            </aside>
          </>}

          {/* preview */}
          <div className="relative min-w-0 flex-1">
            <Preview sections={sections} head={head} title={pageTitle(ctx)} bodyClass={bodyClass(ctx)} device={device} inspector={inspector && !full}
              selected={selected} highlight={highlight} scrollKey={scrollKey} cartOpenKey={cartOpenKey}
              label={(id, b) => { const sec = sectionOf(id); if (!sec) return ""; return b && sec.blocks[b] ? blockLabel(sec, sec.blocks[b]) : sectionLabel(sec); }}
              canMove={id => { const l = locOf(id); if (!l) return { up: false, down: false, remove: false }; const o = ops.getGroup(doc, l).order; const i = o.indexOf(id); return { up: i > 0, down: i < o.length - 1, remove: !SECTIONS[sectionOf(id)?.type ?? ""]?.static }; }}
              onSelect={sel => selectSection(sel, false)} onAction={doAction} onInlineEdit={onInlineEdit} onNavigate={onNavigate} api={api} />
            {toast && <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
          </div>

          {/* right panel: settings of the selection (on narrow screens they open in the left panel instead) */}
          {!full && wide && (
            <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-zinc-200 bg-white lg:block">
              {selectionPanel}
            </aside>
          )}
        </div>

        {addSection && (
          <AddSectionPicker where={addSection.where} template={template} anchor={addSection.anchor}
            isAllowed={t => ops.underLimit(doc, template, t)} preview={previewDoc}
            onClose={() => setAddSection(null)}
            onAdd={type => {
              const r = ops.addSection(doc, loc(addSection.where), type, addSection.index);
              hist.commit(r.doc); setAddSection(null);
              setExpanded(e => new Set(e).add(r.id)); setSelected({ sectionId: r.id }); setTimeout(() => setScrollKey(k => k + 1), 50);
            }} />
        )}
        {addBlock && sectionOf(addBlock.sectionId) && (
          <AddBlockPicker section={sectionOf(addBlock.sectionId)!} anchor={addBlock.anchor} onClose={() => setAddBlock(null)}
            onAdd={type => {
              const r = ops.addBlock(doc, loc(addBlock.where), addBlock.sectionId, type);
              hist.commit(r.doc); setAddBlock(null);
              setExpanded(e => new Set(e).add(addBlock.sectionId)); setSelected({ sectionId: addBlock.sectionId, blockId: r.blockId }); setTimeout(() => setScrollKey(k => k + 1), 50);
            }} />
        )}
        {media && <MediaPicker current={media.current} onPick={media.onPick} onClose={() => setMedia(null)} />}
        {menus !== null && <MenuEditor menus={doc.menus} initial={menus} onClose={() => setMenus(null)} onSave={m => hist.commit({ ...structuredClone(doc), menus: m })} />}
      </div>
    </EnvCtx.Provider>
  );
}
