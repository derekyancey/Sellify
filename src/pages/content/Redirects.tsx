import { useMemo, useState } from "react";
import Papa from "papaparse";
import { ArrowRight, CheckCircle2, Download, Plus, Search, Upload } from "lucide-react";
import { storeSlug, useSite } from "../../context/Site";
import { list, ops, remove, update } from "../../lib/data";
import { addRedirect } from "../../lib/redirects";
import { useAsync } from "../../lib/useAsync";
import { normalizePath, normalizeTarget, parsePath, storeUrl } from "../../lib/urls";
import type { Redirect } from "../../lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td } from "../../components/ui";
import { downloadCsv } from "../Orders";

interface ScanUrl { path: string; type: string; image: string | null; status: "same" | "redirect" | "missing" | "broken_redirect"; to: string | null }
interface Scan { domain: string; total: number; counts: Record<ScanUrl["status"], number>; urls: ScanUrl[] }

const STATUS: Record<ScanUrl["status"], { label: string; tone: "green" | "blue" | "red" | "yellow" }> = {
  same: { label: "Same URL", tone: "green" }, redirect: { label: "Redirected", tone: "blue" },
  missing: { label: "Missing", tone: "red" }, broken_redirect: { label: "Redirect loop / dead end", tone: "yellow" },
};

export default function Redirects() {
  const { site, reload: reloadSite } = useSite(); const s = site!;
  const { data, loading, error, reload } = useAsync(() => list("redirects", s.$id), [s.$id]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<Redirect> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = useMemo(() => (data ?? []).filter(r => !q || r.path.includes(q.toLowerCase()) || r.target.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.path.localeCompare(b.path)), [data, q]);

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label); setErr(null); setMsg(null);
    try { const m = await fn(); if (m) setMsg(m); await reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  const report = (r: any, what: string) => `${what}: ${r.written} saved${r.problemCount ? `, ${r.problemCount} skipped (${r.problems?.[0]?.key}: ${r.problems?.[0]?.error})` : ""}.`;

  const importCsv = (file: File) => run("csv", async () => {
    const parsed = Papa.parse<Record<string, string>>((await file.text()).replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy" });
    const rows = parsed.data.map(r => ({ path: r["Redirect from"] ?? r.path ?? r.from ?? r.source_url ?? "", target: r["Redirect to"] ?? r.target ?? r.to ?? r.target_url ?? "" }))
      .filter(r => r.path && r.target);
    if (!rows.length) throw new Error("No redirects found. Use Shopify's export (columns \"Redirect from\" and \"Redirect to\").");
    return report(await ops("/import/redirects", { siteId: s.$id, rows }), `Imported ${file.name}`);
  });

  const host = s.domain ?? "your-domain.com";
  const absolute = (t: string) => /^https?:\/\//.test(t) ? t : `https://${host}${t}`;

  return (
    <>
      <PageHeader title="URL redirects" subtitle={<>Old links keep working. Your storefront uses Shopify's paths (<code>/products/…</code>, <code>/collections/…</code>, <code>/pages/…</code>, <code>/blogs/…</code>), so only URLs that moved need a redirect.</>}
        actions={<>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium"><Upload className="size-4" />{busy === "csv" ? "Importing…" : "Import CSV"}
            <input type="file" accept=".csv,text/csv" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importCsv(f); }} /></label>
          <Button variant="primary" onClick={() => setEditing({ path: "", target: "" })}><Plus className="size-4" />Create redirect</Button>
        </>} />
      {err && <div className="mb-4"><ErrorBox error={err} /></div>}
      {msg && <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">{msg}</p>}

      <ShopifyCheck shopifyDomain={s.shopifyDomain} redirects={data ?? []} onChanged={() => { reload(); reloadSite(); }}
        importRedirects={domain => run("shopify", async () => report(await ops("/import/shopify-redirects", { siteId: s.$id, shopifyDomain: domain }), "Shopify redirects"))}
        busy={busy === "shopify"} />

      <Card title={`Redirects (${data?.length ?? 0})`} actions={data?.length ? (
        <div className="flex gap-2">
          <Button onClick={() => downloadCsv(`${storeSlug(s)}-redirects.csv`, rows.map(r => ({ "Redirect from": r.path, "Redirect to": r.target })))}><Download className="size-4" />Export</Button>
          <Button title="For Cloudflare → Rules → Bulk Redirects: real 301s at the edge, before the page loads (best for search engines)"
            onClick={() => downloadCsv(`${storeSlug(s)}-cloudflare-bulk-redirects.csv`, rows.filter(r => !r.path.includes("?")).map(r => ({
              source_url: `${host}${r.path}`, target_url: absolute(r.target), status_code: 301, preserve_query_string: "TRUE", include_subdomains: "TRUE", subpath_matching: "FALSE", preserve_path_suffix: "FALSE" })))}>
            <Download className="size-4" />Cloudflare CSV</Button>
        </div>) : undefined}>
        {error && <ErrorBox error={error} hint="If the table is missing, re-run appwrite/setup.py." />}
        <div className="mb-3 flex items-center gap-2"><Search className="size-4 text-zinc-400" /><Input placeholder="Filter by path or target" value={q} onChange={e => setQ(e.target.value)} className="max-w-sm" /></div>
        {loading ? <Loading /> : (
          <Table head={["Redirect from", "", "Redirect to", "Source"]} empty={!rows.length}>
            {rows.slice(0, 500).map(r => (
              <tr key={r.$id} className="cursor-pointer hover:bg-zinc-50" onClick={() => setEditing(r)}>
                <Td className="max-w-xs truncate font-mono text-xs">{r.path}</Td><Td><ArrowRight className="size-3.5 text-zinc-400" /></Td>
                <Td className="max-w-xs truncate font-mono text-xs">{r.target}</Td><Td><Badge tone={r.source === "auto" ? "blue" : r.source === "shopify" ? "green" : "gray"}>{r.source ?? "manual"}</Badge></Td>
              </tr>
            ))}
          </Table>
        )}
        {rows.length > 500 && <p className="mt-2 text-xs text-zinc-500">Showing 500 of {rows.length}. Filter to find others.</p>}
        <p className="mt-3 text-xs text-zinc-500">Storefronts follow these with <code>Yancey.redirect()</code>. For permanent (301) redirects that search engines see before the page loads, download the Cloudflare CSV and upload it under Cloudflare → Rules → Bulk Redirects (free for up to 10,000 URLs).</p>
      </Card>

      {editing && <Editor initial={editing} all={data ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function ShopifyCheck({ shopifyDomain, redirects, onChanged, importRedirects, busy }: { shopifyDomain?: string; redirects: Redirect[]; onChanged(): void; importRedirects(d: string): void; busy: boolean }) {
  const { site } = useSite(); const s = site!;
  const [domain, setDomain] = useState(shopifyDomain ?? "");
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"problems" | "all">("problems");
  const [targets, setTargets] = useState<Record<string, string>>({});
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

  const doScan = async () => {
    setLoading("scan"); setErr(null);
    try {
      if (clean !== (s.shopifyDomain ?? "")) await update("sites", s.$id, { shopifyDomain: clean });
      const res = await ops<Scan>("/urls/scan", { siteId: s.$id, shopifyDomain: clean });
      setScan(res); setTargets({}); onChanged();
    } catch (e: any) { setErr(e.message); } finally { setLoading(null); }
  };
  const fix = async (urls: ScanUrl[]) => {
    setLoading("fix"); setErr(null);
    try { for (const u of urls) await addRedirect(s.$id, u.path, targets[u.path] || suggest(u), "manual", redirects); await doScan(); }
    catch (e: any) { setErr(e.message); setLoading(null); }
  };
  const shown = scan ? scan.urls.filter(u => filter === "all" || u.status === "missing" || u.status === "broken_redirect") : [];
  const problems = scan ? scan.urls.filter(u => u.status === "missing" || u.status === "broken_redirect") : [];

  return (
    <Card title="Check against your Shopify store" className="mb-4">
      <p className="mb-3 text-sm text-zinc-600">Reads every URL in your Shopify store's public sitemap (products, collections, pages, blogs and blog posts) and checks that {s.domain ?? "this store"} serves it on the same path or redirects it.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Shopify store domain"><Input value={domain} placeholder="yourstore.com or yourstore.myshopify.com" onChange={e => setDomain(e.target.value)} className="w-72" /></Field>
        <Button variant="primary" loading={loading === "scan"} disabled={!clean} onClick={doScan}><Search className="size-4" />Check URLs</Button>
        <Button loading={busy} disabled={!clean} onClick={() => importRedirects(clean)} title="Needs SHOPIFY_ADMIN_TOKEN on site-ops; otherwise use Import CSV with Shopify's export">Import Shopify's redirects</Button>
      </div>
      {err && <div className="mt-3"><ErrorBox error={err} /></div>}
      {scan && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span>{scan.total} URLs on {scan.domain}:</span>
            {(Object.keys(STATUS) as ScanUrl["status"][]).map(k => <Badge key={k} tone={STATUS[k].tone}>{scan.counts[k] ?? 0} {STATUS[k].label.toLowerCase()}</Badge>)}
            <Select value={filter} onChange={e => setFilter(e.target.value as any)} className="ml-auto w-44"><option value="problems">Only problems</option><option value="all">All URLs</option></Select>
          </div>
          {!problems.length ? (
            <p className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900"><CheckCircle2 className="size-4" />Every Shopify URL works on {s.domain ?? "this store"}.</p>
          ) : filter === "problems" && (
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-600">
              <span>Missing URLs need a redirect or the content imported (Products, Collections, Blog posts, Pages). The suggested target is the closest match.</span>
              <Button loading={loading === "fix"} onClick={() => fix(problems)}>Redirect all {problems.length} as suggested</Button>
            </div>
          )}
          <Table head={["Shopify URL", "Type", "Status", "Now goes to", ""]} empty={!shown.length}>
            {shown.slice(0, 300).map(u => {
              const st = STATUS[u.status], open = u.status === "missing" || u.status === "broken_redirect";
              return (
                <tr key={u.path}>
                  <Td className="max-w-[16rem] truncate font-mono text-xs"><a className="underline decoration-zinc-300" href={`https://${scan.domain}${u.path}`} target="_blank" rel="noreferrer">{u.path}</a></Td>
                  <Td className="text-xs">{u.type}</Td><Td><Badge tone={st.tone}>{st.label}</Badge></Td>
                  <Td className="font-mono text-xs">{open
                    ? <Input className="w-56 font-mono text-xs" value={targets[u.path] ?? suggest(u)} onChange={e => setTargets(t => ({ ...t, [u.path]: e.target.value }))} />
                    : u.to ? <a className="underline decoration-zinc-300" href={storeUrl(s, u.to)} target="_blank" rel="noreferrer">{u.to}</a> : "same"}</Td>
                  <Td>{open && <Button onClick={() => fix([u])} disabled={!!loading}>Redirect</Button>}</Td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}
    </Card>
  );
}

/** Closest live page for a missing Shopify URL: its parent listing (Shopify's own fallback), else home. */
function suggest(u: ScanUrl): string {
  const r = parsePath(u.path);
  if (r.type === "product" && r.collection) return `/collections/${r.collection}`;
  if (r.type === "product" || r.type === "collection") return "/collections/all";
  if (r.type === "article") return `/blogs/${r.blog}`;
  return "/";
}

function Editor({ initial, all, onClose, onSaved }: { initial: Partial<Redirect>; all: Redirect[]; onClose(): void; onSaved(): void }) {
  const { site } = useSite(); const s = site!;
  const [path, setPath] = useState(initial.path ?? "");
  const [target, setTarget] = useState(initial.target ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const p = normalizePath(path), t = normalizeTarget(target, [s.domain ?? ""]);
    if (!path.trim() || !target.trim()) { setErr("Both fields are required."); return; }
    if (p === normalizePath(t)) { setErr("A URL can't redirect to itself."); return; }
    if (all.some(r => r.path === p && r.$id !== initial.$id)) { setErr(`${p} already has a redirect.`); return; }
    setBusy(true);
    try {
      if (initial.$id && initial.path !== p) await remove("redirects", initial.$id);
      await addRedirect(s.$id, p, t, initial.source ?? "manual", all.filter(r => r.$id !== initial.$id || initial.path === p));
      onSaved();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const del = async () => { if (initial.$id && confirm(`Delete the redirect from ${initial.path}?`)) { await remove("redirects", initial.$id); onSaved(); } };
  return (
    <Modal open title={initial.$id ? "Edit redirect" : "Create redirect"} onClose={onClose}
      footer={<>{initial.$id && <Button variant="ghost" className="mr-auto text-red-600" onClick={del}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      {err && <ErrorBox error={err} />}
      <Field label="Redirect from" hint={`The old path, e.g. /products/old-name. Matched without the domain${s.domain ? ` (${s.domain})` : ""}, ignoring case.`}>
        <Input className="font-mono" value={path} onChange={e => setPath(e.target.value)} placeholder="/products/old-name" /></Field>
      <Field label="Redirect to" hint="A path on this store, or a full URL."><Input className="font-mono" value={target} onChange={e => setTarget(e.target.value)} placeholder="/products/new-name" /></Field>
    </Modal>
  );
}
