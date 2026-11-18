import { useState } from "react";
import { Download, Play } from "lucide-react";
import { useSite } from "../context/Site";
import { ops, pagespeed } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { date } from "../lib/format";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Table, Td, cx } from "../components/ui";
import { downloadCsv } from "./Orders";

export default function Seo() {
  const { site } = useSite(); const s = site!;
  return (
    <>
      <PageHeader title="SEO" subtitle="Site crawler, PageSpeed Insights and sitemaps — all free" />
      <div className="space-y-6">
        <Crawler key={s.$id} domain={s.domain!} />
        <PageSpeed key={s.$id + "ps"} domain={s.domain!} />
        {s.gscProperty && <Sitemaps property={s.gscProperty} domain={s.domain!} siteId={s.$id} />}
      </div>
    </>
  );
}

function Crawler({ domain }: { domain: string }) {
  const [url, setUrl] = useState(`https://${domain}/`);
  const [maxPages, setMaxPages] = useState(50);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<any>(null);
  const [openIssue, setOpenIssue] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setErr(null);
    try { setRes(await ops("/seo/crawl", { url, maxPages, domain })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Card title="Site crawler" actions={res && <Button onClick={() => downloadCsv(`${domain}-crawl.csv`, res.pages.map((p: any) => ({ ...p, h1: p.h1.join(" | ") })))}><Download className="size-4" />Export CSV</Button>}>
      <p className="mb-3 text-sm text-zinc-500">Crawls your site like a search engine (Python, runs in Appwrite) and flags broken links, missing titles, meta descriptions, H1s, alt text, noindex pages and slow responses.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Start URL"><Input value={url} onChange={e => setUrl(e.target.value)} className="w-72 max-w-full" /></Field>
        <Field label="Max pages"><Select value={maxPages} onChange={e => setMaxPages(+e.target.value)}>{[25, 50, 100, 200].map(n => <option key={n}>{n}</option>)}</Select></Field>
        <Button variant="primary" onClick={run} loading={busy}><Play className="size-4" />{busy ? "Crawling…" : "Start crawl"}</Button>
      </div>
      {err && <div className="mt-3"><ErrorBox error={err} /></div>}
      {res && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="gray">{res.pagesCrawled} pages crawled</Badge>
            <Badge tone={res.robotsTxt ? "green" : "yellow"}>robots.txt {res.robotsTxt ? "found" : "missing"}</Badge>
            <Badge tone={res.sitemap ? "green" : "yellow"}>sitemap.xml {res.sitemap ? "found" : "missing"}</Badge>
          </div>
          {res.issues.length === 0 ? <p className="text-sm text-emerald-700">No issues found. 🎉</p> : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm">
              {res.issues.map((i: any) => (
                <li key={i.issue}>
                  <button onClick={() => setOpenIssue(openIssue === i.issue ? null : i.issue)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50">
                    <Badge tone={i.type === "error" ? "red" : i.type === "warning" ? "yellow" : "blue"}>{i.type}</Badge>
                    <span className="flex-1">{i.issue}</span><span className="tabular-nums text-zinc-500">{i.urls.length}</span>
                  </button>
                  {openIssue === i.issue && <ul className="bg-zinc-50 px-3 py-2 text-xs text-zinc-600">{i.urls.map((u: string) => <li key={u} className="truncate py-0.5"><a href={u} target="_blank" rel="noreferrer" className="hover:underline">{u}</a></li>)}</ul>}
                </li>
              ))}
            </ul>
          )}
          <Table head={["URL", "Status", "Title", "Words", "Depth", "Inlinks", "Time"]}>
            {res.pages.map((p: any) => (
              <tr key={p.url}>
                <Td className="max-w-[16rem] truncate"><a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">{p.url.replace(/^https?:\/\/[^/]+/, "") || "/"}</a></Td>
                <Td><Badge tone={p.status < 300 ? "green" : p.status < 400 ? "yellow" : "red"}>{p.status || "ERR"}</Badge></Td>
                <Td className="max-w-[14rem] truncate text-zinc-600">{p.title || <span className="text-red-600">missing</span>}</Td>
                <Td>{p.wordCount}</Td><Td>{p.depth}</Td><Td>{p.inlinks}</Td><Td className="tabular-nums">{p.responseMs} ms</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Card>
  );
}

function PageSpeed({ domain }: { domain: string }) {
  const [url, setUrl] = useState(`https://${domain}/`);
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Awaited<ReturnType<typeof pagespeed>> | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try { setRes(await pagespeed(url, strategy)); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const ring = (n: number) => n >= 90 ? "text-emerald-600 border-emerald-500" : n >= 50 ? "text-amber-600 border-amber-500" : "text-red-600 border-red-500";
  return (
    <Card title="PageSpeed Insights (Lighthouse)">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="URL"><Input value={url} onChange={e => setUrl(e.target.value)} className="w-72 max-w-full" /></Field>
        <Field label="Device"><Select value={strategy} onChange={e => setStrategy(e.target.value as any)}><option value="mobile">Mobile</option><option value="desktop">Desktop</option></Select></Field>
        <Button variant="primary" onClick={run} loading={busy}>{busy ? "Testing (~20s)…" : "Run test"}</Button>
      </div>
      {err && <div className="mt-3"><ErrorBox error={err} hint="Without an API key, Google rate-limits PageSpeed requests. Add VITE_PAGESPEED_API_KEY for reliable use." /></div>}
      {res && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="flex flex-wrap gap-4">
            {Object.entries({ Performance: res.scores.performance, Accessibility: res.scores.accessibility, "Best practices": res.scores.bestPractices, SEO: res.scores.seo }).map(([k, v]) => (
              <div key={k} className="text-center">
                <div className={cx("mx-auto grid size-16 place-items-center rounded-full border-4 text-lg font-bold", ring(v))}>{v}</div>
                <div className="mt-1 text-xs text-zinc-600">{k}</div>
              </div>
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {Object.entries(res.metrics).map(([k, v]) => <div key={k} className="rounded-lg bg-zinc-50 p-2"><dt className="text-xs text-zinc-500">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
          </dl>
          {res.opportunities.length > 0 && (
            <div className="lg:col-span-2">
              <h3 className="mb-1 text-sm font-medium">Opportunities</h3>
              <ul className="space-y-1 text-sm text-zinc-700">{res.opportunities.map(o => <li key={o.title}>• {o.title} <span className="text-zinc-500">{o.savings}</span></li>)}</ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Sitemaps({ property, domain, siteId }: { property: string; domain: string; siteId: string }) {
  const { data, error, loading, reload } = useAsync(() => ops("/google/gsc/sitemaps", { property, siteId }), [property]);
  const [path, setPath] = useState(`https://${domain}/sitemap.xml`);
  const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { await ops("/google/gsc/submit-sitemap", { property, sitemap: path, siteId }); await reload(); } finally { setBusy(false); } };
  return (
    <Card title="Sitemaps (Search Console)">
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <Table head={["Sitemap", "Last submitted", "Errors", "Warnings"]} empty={!data.sitemaps.length}>
          {data.sitemaps.map((m: any) => <tr key={m.path}><Td className="max-w-xs truncate">{m.path}</Td><Td>{m.lastSubmitted ? date(m.lastSubmitted) : "–"}</Td><Td>{m.errors}</Td><Td>{m.warnings}</Td></tr>)}
        </Table>
      )}
      <div className="mt-3 flex flex-wrap gap-2"><Input value={path} onChange={e => setPath(e.target.value)} className="max-w-sm" /><Button onClick={submit} loading={busy}>Submit sitemap</Button></div>
    </Card>
  );
}
