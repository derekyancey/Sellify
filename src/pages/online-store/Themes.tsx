import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, Download, ExternalLink, Eye, MoreHorizontal, Palette, Pencil, Rocket, Trash2, Upload } from "lucide-react";
import { useSite, useStorePath } from "../../context/Site";
import { create, list, remove, update } from "../../lib/data";
import { dateTime } from "../../lib/format";
import type { Collection, Product, Site, Theme } from "../../lib/types";
import { STYLES, createTheme } from "../../theme/presets";
import { renderDocument } from "../../theme/render";
import type { ThemeDoc } from "../../theme/types";
import { Badge, Button, Card, ErrorBox, Loading, Modal, PageHeader, cx } from "../../components/ui";
import { SellOnSite } from "../StoreSettings";
import { deployStorefront, publishTheme } from "./publish";

/** A live, scaled-down render of a theme's home page. */
function ThemeThumb({ doc, site, products, collections, className }: { doc: ThemeDoc; site: Site; products: Product[]; collections: Collection[]; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1280));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const html = useMemo(() => renderDocument({
    theme: doc, editor: false, route: { template: "index", path: "/" },
    data: { site: { id: site.$id, name: site.name, currency: site.currency || "USD", domain: site.domain }, products, collections, cart: [] },
  }, "<style>[data-reveal]{opacity:1!important;transform:none!important}html{overflow:hidden}</style>"), [doc, site, products, collections]);
  return (
    <div ref={box} className={cx("relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50", className)} style={{ aspectRatio: "16/10" }}>
      <iframe title="Theme preview" srcDoc={html} loading="lazy" tabIndex={-1} className="pointer-events-none absolute left-0 top-0 origin-top-left border-0" style={{ width: 1280, height: 800, transform: `scale(${scale})` }} />
    </div>
  );
}

function ActionsMenu({ items }: { items: { label: string; icon: typeof Copy; onClick(): void; danger?: boolean; hidden?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="secondary" onClick={() => setOpen(o => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)} aria-label="Theme actions"><MoreHorizontal className="size-4" /></Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl">
          {items.filter(i => !i.hidden).map(i => (
            <button key={i.label} onMouseDown={() => { i.onClick(); setOpen(false); }}
              className={cx("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm", i.danger ? "text-red-600 hover:bg-red-50" : "hover:bg-zinc-100")}>
              <i.icon className="size-4" />{i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Themes() {
  const { site } = useSite(); const s = site!;
  const sp = useStorePath();
  const navigate = useNavigate();
  const [themes, setThemes] = useState<Theme[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [gitConfirm, setGitConfirm] = useState<Theme | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const [ts, ps, cs] = await Promise.all([list("themes", s.$id), list("products", s.$id), list("collections", s.$id)]);
      setProducts(ps); setCollections(cs);
      if (!ts.length) {
        // Every store starts with a live theme, like Shopify's default.
        const t = await create("themes", { siteId: s.$id, name: STYLES[0].name, role: "main", style: STYLES[0].id, data: createTheme(STYLES[0].id, cs), publishedAt: new Date().toISOString() });
        setThemes([t]);
      } else setThemes(ts);
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { load(); }, [s.$id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); if (ok) setMsg({ ok: true, text: ok }); await load(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(null); }
  };

  const live = themes?.find(t => t.role === "main");
  const library = (themes ?? []).filter(t => t !== live).sort((a, b) => b.$createdAt.localeCompare(a.$createdAt));
  const editorUrl = (t: Theme) => sp(`/channels/online-store/editor/${t.$id}`);

  const download = (t: Theme) => {
    const blob = new Blob([JSON.stringify({ yanceyTheme: 1, name: t.name, style: t.style, data: t.data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${t.name.replace(/[^\w-]+/g, "-").toLowerCase()}.theme.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const duplicate = (t: Theme) => run(`dup-${t.$id}`, () => create("themes", { siteId: s.$id, name: `Copy of ${t.name}`, role: "unpublished", style: t.style, data: structuredClone(t.data) }), "Theme duplicated.");
  const rename = (t: Theme) => { const n = prompt("Theme name", t.name); if (n && n !== t.name) run(`ren-${t.$id}`, () => update("themes", t.$id, { name: n })); };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const data = json.data as ThemeDoc;
      if (!data?.templates || !data.groups) throw new Error("That file isn't a Yancey theme.");
      await run("upload", () => create("themes", { siteId: s.$id, name: json.name || f.name.replace(/\.theme\.json$|\.json$/, ""), role: "unpublished", style: json.style, data }), "Theme uploaded to your library.");
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  const deploy = (t: Theme, force = false) => run(`deploy-${t.$id}`, async () => {
    try {
      const r = await deployStorefront(s, t, force);
      setMsg({ ok: true, text: `Published ${r.pages} pages to ${s.domain ?? "your site"}. Appwrite is activating deployment ${r.deploymentId}; it's usually live within a minute.` });
    } catch (e) {
      if (/Git repository/.test((e as Error).message)) { setGitConfirm(t); return; }
      throw e;
    }
  });

  if (error) return <><PageHeader title="Themes" /><ErrorBox error={error} hint="If you just updated Yancey, run python appwrite/setup.py to add the themes table." /></>;
  if (!themes) return <><PageHeader title="Themes" /><Loading /></>;

  return (
    <>
      <PageHeader title="Themes" subtitle="Design your online store: sections, colors and fonts, with no code."
        actions={s.domain ? <a href={`https://${s.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium">View your store <ExternalLink className="size-4" /></a> : undefined} />
      {msg && <div className={cx("mb-4 rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>{msg.text}</div>}

      {live && (
        <Card className="mb-6">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Link to={editorUrl(live)} className="block"><ThemeThumb doc={live.data} site={s} products={products} collections={collections} /></Link>
            <div className="flex flex-col">
              <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{live.name}</h2><Badge tone="green">Current theme</Badge></div>
              <p className="mt-1 text-sm text-zinc-500">{live.savedAt ? `Last saved ${dateTime(live.savedAt)}` : `Added ${dateTime(live.$createdAt)}`}{live.publishedAt ? ` · published ${dateTime(live.publishedAt)}` : ""}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => navigate(editorUrl(live))}><Palette className="size-4" />Customize</Button>
                <ActionsMenu items={[
                  { label: "Preview", icon: Eye, onClick: () => window.open(`${editorUrl(live)}?view=preview`, "_blank") },
                  { label: "Rename", icon: Pencil, onClick: () => rename(live) },
                  { label: "Duplicate", icon: Copy, onClick: () => duplicate(live) },
                  { label: "Download theme file", icon: Download, onClick: () => download(live) },
                ]} />
              </div>
              <div className="mt-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 pt-3 text-sm">
                <div className="font-medium">Put it on {s.domain ?? "your website"}</div>
                <p className="mt-0.5 text-xs text-zinc-500">Renders every page (home, products, collections, pages) and uploads it to the store's Appwrite site. Prices, stock and the cart stay live.</p>
                {s.hostingSiteId
                  ? <Button className="mt-2" variant="primary" loading={busy === `deploy-${live.$id}`} onClick={() => deploy(live)}><Rocket className="size-4" />Publish to {s.domain ?? "site"}</Button>
                  : <p className="mt-2 text-xs">First pick this store's Appwrite site under <Link className="underline" to={sp("/settings#connections")}>Store settings → Connections</Link>.</p>}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card title="Theme library" actions={<>
        <Button onClick={() => fileInput.current?.click()} loading={busy === "upload"}><Upload className="size-4" />Upload theme</Button>
        <Button variant="primary" onClick={() => setAdding(true)}>Add theme</Button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e => { upload(e.target.files?.[0]); e.target.value = ""; }} />
      </>}>
        {library.length ? (
          <ul className="divide-y divide-zinc-100">
            {library.map(t => (
              <li key={t.$id} className="flex flex-wrap items-center gap-4 py-3 first:pt-0 last:pb-0">
                <Link to={editorUrl(t)} className="w-40 shrink-0"><ThemeThumb doc={t.data} site={s} products={products} collections={collections} /></Link>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-zinc-500">{t.savedAt ? `Last saved ${dateTime(t.savedAt)}` : `Added ${dateTime(t.$createdAt)}`}</div>
                </div>
                <div className="flex gap-2">
                  <ActionsMenu items={[
                    { label: "Publish", icon: Rocket, onClick: () => { if (confirm(`Publish “${t.name}”? It replaces “${live?.name}” as your live theme.`)) run(`pub-${t.$id}`, () => publishTheme(s.$id, t.$id), `“${t.name}” is now your live theme.${s.hostingSiteId ? " Click “Publish to site” to update your website." : ""}`); } },
                    { label: "Preview", icon: Eye, onClick: () => window.open(`${editorUrl(t)}?view=preview`, "_blank") },
                    { label: "Rename", icon: Pencil, onClick: () => rename(t) },
                    { label: "Duplicate", icon: Copy, onClick: () => duplicate(t) },
                    { label: "Download theme file", icon: Download, onClick: () => download(t) },
                    { label: "Remove", icon: Trash2, danger: true, onClick: () => { if (confirm(`Remove “${t.name}”? This can't be undone.`)) run(`rm-${t.$id}`, () => remove("themes", t.$id)); } },
                  ]} />
                  <Button onClick={() => navigate(editorUrl(t))}>Customize</Button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-zinc-500">Themes you add, upload or duplicate appear here. Try a new look without changing your live store, then publish it when it's ready.</p>}
      </Card>

      <details className="mt-6 rounded-xl border border-zinc-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Use your own website instead</summary>
        <div className="border-t border-zinc-100 p-4"><SellOnSite site={s} /></div>
      </details>

      <Modal title="Add a theme" open={adding} onClose={() => setAdding(false)}>
        <p className="text-sm text-zinc-500">Pick a starting style. It's added to your library with your products and collections, so you can customize it before publishing.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {STYLES.map(st => (
            <button key={st.id} disabled={!!busy} onClick={() => run(`add-${st.id}`, async () => {
              const t = await create("themes", { siteId: s.$id, name: st.name, role: "unpublished", style: st.id, data: createTheme(st.id, collections) });
              setAdding(false); navigate(editorUrl(t));
            })} className="rounded-xl border border-zinc-200 p-3 text-left hover:border-zinc-900 disabled:opacity-60">
              <div className="mb-2 flex h-14 overflow-hidden rounded-lg">{st.swatch.map(c => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
              <div className="font-medium">{st.name}{busy === `add-${st.id}` && " …"}</div>
              <div className="text-xs text-zinc-500">{st.tagline}</div>
            </button>
          ))}
        </div>
      </Modal>

      <Modal title="Replace the Git build?" open={!!gitConfirm} onClose={() => setGitConfirm(null)}
        footer={<><Button onClick={() => setGitConfirm(null)}>Cancel</Button><Button variant="primary" onClick={() => { const t = gitConfirm!; setGitConfirm(null); deploy(t, true); }}>Publish anyway</Button></>}>
        <p className="text-sm">This store's Appwrite site deploys from a Git repository. Publishing the theme uploads a new deployment that replaces the Git build, until the next push to that repository rebuilds it.</p>
      </Modal>
    </>
  );
}
