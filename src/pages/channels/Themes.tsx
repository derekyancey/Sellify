import { useMemo, useState } from "react";
import { ExternalLink, Monitor, Smartphone } from "lucide-react";
import { useSite, useStorePath } from "../../context/Site";
import { list, update } from "../../lib/data";
import { loadTheme, previewUrl, THEME_IDS, type ThemeInfo } from "../../lib/themes";
import { useAsync } from "../../lib/useAsync";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, Select, Table, Td, cx } from "../../components/ui";
import { Link } from "react-router-dom";

/** Online store → Themes: the store's current theme, a live preview, the theme library and product templates. */
export default function Themes() {
  const { site, reload } = useSite(); const s = site!;
  const sp = useStorePath();
  const themes = useAsync(() => Promise.all(THEME_IDS.map(loadTheme)), []);
  const products = useAsync(() => list("products", s.$id), [s.$id]);
  const current = themes.data?.find(t => t.id === s.themeId) ?? null;
  const [viewing, setViewing] = useState<string | null>(null);
  const [page, setPage] = useState("/");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [busy, setBusy] = useState(false);
  const shown = themes.data?.find(t => t.id === (viewing ?? s.themeId)) ?? current ?? themes.data?.[0] ?? null;

  const publish = async (t: ThemeInfo) => {
    setBusy(true);
    try { await update("sites", s.$id, { themeId: t.id }); await reload(); setViewing(null); } finally { setBusy(false); }
  };

  // Product templates and the products that use each one.
  const byTemplate = useMemo(() => {
    const m = new Map<string, { handle: string; title: string }[]>();
    for (const p of products.data ?? []) {
      const k = p.templateSuffix ?? "";
      m.set(k, [...(m.get(k) ?? []), { handle: p.handle || p.$id, title: p.title }]);
    }
    return m;
  }, [products.data]);
  const pages = useMemo(() => {
    const out = [{ value: "/", label: "Home page" }, { value: "/collections/all", label: "Collection: All" }];
    for (const t of shown?.productTemplates ?? []) {
      const p = byTemplate.get(t.suffix)?.[0];
      if (p) out.push({ value: `/products/${p.handle}`, label: `Product: ${t.label} (${p.title})` });
    }
    return out;
  }, [shown, byTemplate]);

  if (themes.error) return <ErrorBox error={themes.error} />;
  if (themes.loading || !themes.data) return <Loading />;

  return (
    <>
      <PageHeader title="Themes" subtitle={current ? <>Current theme: <b>{current.name}</b></> : "No theme published yet: your storefront uses your own site's code."}
        actions={shown && <a href={previewUrl(shown.id, s, page)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium">Open preview <ExternalLink className="size-4" /></a>} />

      {shown && (
        <Card title={<span className="flex items-center gap-2">{shown.name}{shown.id === s.themeId ? <Badge tone="green">Current</Badge> : <Badge tone="yellow">Previewing</Badge>}</span>}
          actions={<>
            <Select value={page} onChange={e => setPage(e.target.value)} className="w-72" aria-label="Page to preview">
              {pages.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
            <div className="flex rounded-lg border border-zinc-300">
              <button aria-label="Desktop" className={cx("px-2 py-1.5", device === "desktop" && "bg-zinc-100")} onClick={() => setDevice("desktop")}><Monitor className="size-4" /></button>
              <button aria-label="Mobile" className={cx("px-2 py-1.5", device === "mobile" && "bg-zinc-100")} onClick={() => setDevice("mobile")}><Smartphone className="size-4" /></button>
            </div>
            {shown.id !== s.themeId && <Button variant="primary" loading={busy} onClick={() => publish(shown)}>Publish</Button>}
          </>}>
          {shown.description && <p className="mb-3 text-sm text-zinc-600">{shown.description}</p>}
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
            <iframe key={shown.id + page + device} title={`${shown.name} preview`} src={previewUrl(shown.id, s, page)}
              className={cx("mx-auto block h-[75vh] bg-black", device === "mobile" ? "w-[390px]" : "w-full")} />
          </div>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Theme library">
          <ul className="divide-y divide-zinc-100">
            {themes.data.map(t => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <div className="grid h-10 w-20 shrink-0 place-items-center rounded bg-black p-1">{t.logo && <img src={t.logo} alt="" className="max-h-full" />}</div>
                <div className="min-w-0 flex-1"><div className="font-medium">{t.name} {t.version && <span className="text-xs text-zinc-500">v{t.version}</span>}</div>
                  <div className="truncate text-xs text-zinc-500">{t.productTemplates.length} product templates</div></div>
                {t.id === s.themeId ? <Badge tone="green">Current</Badge> : <>
                  <Button onClick={() => setViewing(t.id)}>Preview</Button>
                  <Button variant="primary" loading={busy} onClick={() => publish(t)}>Publish</Button></>}
              </li>
            ))}
          </ul>
        </Card>
        {shown && (
          <Card title="Product templates" actions={<Link className="text-xs underline" to={sp("/products")}>Pick a template on each product</Link>}>
            {products.loading ? <Loading /> : (
              <Table head={["Template", "Products"]} empty={!shown.productTemplates.length}>
                {shown.productTemplates.map(t => {
                  const ps = byTemplate.get(t.suffix) ?? [];
                  return (
                    <tr key={t.suffix}>
                      <Td><div className="font-medium">{t.label}</div><div className="text-xs text-zinc-500"><code>product{t.suffix ? "." + t.suffix : ""}</code></div></Td>
                      <Td className="text-sm">{ps.length ? <>
                        <button className="underline" onClick={() => { setPage(`/products/${ps[0].handle}`); scrollTo({ top: 0, behavior: "smooth" }); }}>{ps[0].title}</button>
                        {ps.length > 1 && <span className="text-zinc-500"> +{ps.length - 1} more</span>}</> : <span className="text-zinc-400">Not used</span>}</Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
