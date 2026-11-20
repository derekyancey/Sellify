import { useRef, useState } from "react";
import { CheckCircle2, FileText, ImageDown, Upload, X } from "lucide-react";
import { useSite } from "../context/Site";
import { ops } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { num } from "../lib/format";
import { chunk, ORDER, readFiles, summarize, type ImportKind, type ParsedFile } from "../lib/shopifyFiles";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, Stat, cx } from "../components/ui";
import { syncCollections } from "../lib/collections";

interface Result { kind: ImportKind; store: string; records: number; added: number; updated: number; subscribers?: number; keptUnsubscribed?: number; problems: { key: string; error: string }[]; problemCount: number }
interface Plan { file: ParsedFile; stores: string[]; subscribersOnly: boolean }

const KIND_LABEL: Record<ImportKind, string> = { products: "Products", customers: "Customers", orders: "Orders" };

/** Import Shopify exports. Safe to repeat: records are matched (products by handle, customers by email,
 *  orders by Shopify order ID) and updated to the latest upload instead of duplicated. */
export default function Import() {
  const { site, sites } = useSite(); const s = site!;
  const summary = useAsync(() => ops("/import/summary", { siteId: s.$id }), [s.$id]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [bad, setBad] = useState<ParsedFile[]>([]);
  const [reading, setReading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setReading(true); setErr(null);
    try {
      const parsed = await readFiles(Array.from(list));
      setBad(b => [...b, ...parsed.filter(f => f.error)]);
      setPlans(p => [...p, ...parsed.filter(f => !f.error).map(file => ({ file, stores: [s.$id], subscribersOnly: false }))]
        .sort((a, b) => ORDER.indexOf(a.file.kind!) - ORDER.indexOf(b.file.kind!)));
    } finally { setReading(false); }
  };
  const setPlan = (id: string, patch: Partial<Plan>) => setPlans(ps => ps.map(p => p.file.id === id ? { ...p, ...patch } : p));

  const run = async () => {
    setRunning(true); setErr(null); setResults([]);
    const steps = plans.flatMap(p => p.stores.map(store => ({ p, store, chunks: chunk(p.file.kind!, p.file.rows) })));
    const total = steps.reduce((t, x) => t + x.chunks.length, 0);
    let done = 0;
    const out: Result[] = [];
    try {
      for (const { p, store, chunks } of steps) {
        const storeName = sites.find(x => x.$id === store)?.name ?? store;
        const agg: Result = { kind: p.file.kind!, store: storeName, records: 0, added: 0, updated: 0, subscribers: 0, keptUnsubscribed: 0, problems: [], problemCount: 0 };
        for (const rows of chunks) {
          setProgress({ label: `${KIND_LABEL[p.file.kind!]} → ${storeName}`, done, total });
          const r = await ops<any>(`/import/${p.file.kind}`, { siteId: store, rows, options: { subscribersOnly: p.subscribersOnly } });
          agg.records += r.records; agg.added += r.added; agg.updated += r.updated; agg.problemCount += r.problemCount;
          agg.subscribers! += r.subscribers ?? 0; agg.keptUnsubscribed! += r.keptUnsubscribed ?? 0;
          agg.problems.push(...r.problems);
          done++;
        }
        out.push(agg);
        setResults([...out]);
      }
      setPlans([]);
      summary.reload();
      // Smart collections pick up newly imported products (and best-selling order from imported orders).
      for (const store of new Set(steps.filter(x => x.p.file.kind !== "customers").map(x => x.store)))
        await syncCollections(store).catch(e => setErr(`Imported, but updating collections failed: ${e.message}. Open Collections to retry.`));
    } catch (e: any) {
      setErr(`Import stopped: ${e.message}. Everything before this point was saved. Running the same import again is safe and continues where it left off.`);
    } finally { setRunning(false); setProgress(null); }
  };

  const sm = summary.data;
  return (
    <>
      <PageHeader title="Import data" subtitle={`Bring products, customers and orders into ${s.name} from Shopify exports (CSV or zip).`} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Products" value={sm ? num(sm.products) : "–"} />
        <Stat label="Customers" value={sm ? num(sm.customers) : "–"} />
        <Stat label="Email subscribers" value={sm ? num(sm.subscribers) : "–"} />
        <Stat label="Orders" value={sm ? num(sm.orders) : "–"} />
      </div>
      {summary.error && <div className="mb-4"><ErrorBox error={summary.error} /></div>}

      <Card title="1. Add your export files">
        <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
          className={cx("rounded-xl border-2 border-dashed p-6 text-center text-sm transition", drag ? "border-brand-500 bg-brand-50" : "border-zinc-300")}>
          <input ref={input} type="file" multiple accept=".csv,.zip,text/csv,application/zip" hidden onChange={e => { add(e.target.files); e.target.value = ""; }} />
          <Upload className="mx-auto mb-2 size-6 text-zinc-400" />
          <div>Drop Shopify exports here, or <button className="underline" onClick={() => input.current?.click()}>choose files</button></div>
          <div className="mt-1 text-xs text-zinc-500">Shopify admin → Products / Customers / Orders → Export → "All" → CSV. Zips from Shopify's email work too.</div>
          {reading && <div className="mt-3"><Loading label="Reading files…" /></div>}
        </div>
        <ul className="mt-3 space-y-1 text-xs text-zinc-500">
          <li>• <strong>Safe to repeat:</strong> products are matched by handle, customers by email, orders by Shopify order ID. Uploading again updates them to the newest data, with no duplicates.</li>
          <li>• Anyone who unsubscribed through Yancey stays unsubscribed, even if an older file says otherwise.</li>
          <li>• Imports never send emails or change stock.</li>
        </ul>
        {bad.map(f => <div key={f.id} className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"><FileText className="size-4" /><span className="font-medium">{f.name}</span>: {f.error}
          <button className="ml-auto" onClick={() => setBad(b => b.filter(x => x.id !== f.id))} aria-label="Dismiss"><X className="size-4" /></button></div>)}
      </Card>

      {plans.length > 0 && (
        <Card title="2. Check and choose where it goes" className="mt-4" actions={<Button variant="primary" loading={running} disabled={plans.some(p => !p.stores.length)} onClick={run}>Import {plans.length} file{plans.length === 1 ? "" : "s"}</Button>}>
          <div className="space-y-3">
            {plans.map(p => {
              const sum = summarize(p.file);
              return (
                <div key={p.file.id} className="rounded-lg border border-zinc-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="blue">{KIND_LABEL[p.file.kind!]}</Badge>
                    <span className="truncate text-sm font-medium">{p.file.name}</span>
                    <button className="ml-auto text-zinc-400 hover:text-zinc-700" disabled={running} onClick={() => setPlans(ps => ps.filter(x => x.file.id !== p.file.id))} aria-label="Remove file"><X className="size-4" /></button>
                  </div>
                  <div className="mt-1 text-sm"><strong>{num(sum.main)}</strong> {sum.label} · {sum.details.join(" · ")}</div>
                  {p.file.kind === "customers" ? (
                    <div className="mt-2 space-y-2 text-sm">
                      <div className="text-xs font-medium uppercase text-zinc-500">Import into</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {sites.map(x => (
                          <label key={x.$id} className="flex items-center gap-1.5">
                            <input type="checkbox" disabled={running} checked={p.stores.includes(x.$id)}
                              onChange={e => setPlan(p.file.id, { stores: e.target.checked ? [...p.stores, x.$id] : p.stores.filter(i => i !== x.$id) })} />{x.name}
                          </label>
                        ))}
                      </div>
                      <label className="flex items-center gap-1.5"><input type="checkbox" disabled={running} checked={p.subscribersOnly} onChange={e => setPlan(p.file.id, { subscribersOnly: e.target.checked })} />
                        Only email subscribers ({sum.details[0]})</label>
                    </div>
                  ) : <div className="mt-1 text-xs text-zinc-500">Into {s.name}{p.file.kind === "orders" ? ". Import products and customers first so orders link to them." : ""}</div>}
                </div>
              );
            })}
          </div>
          {plans.some(p => !p.stores.length) && <p className="mt-2 text-sm text-red-700">Pick at least one store for each customers file.</p>}
        </Card>
      )}

      {(progress || err || results.length > 0) && (
        <Card title="Results" className="mt-4">
          {progress && (
            <div className="mb-3 text-sm">
              <div className="mb-1 flex justify-between"><span>{progress.label}</span><span className="tabular-nums">{Math.round((progress.done / Math.max(1, progress.total)) * 100)}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full bg-brand-500 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
            </div>
          )}
          {err && <div className="mb-3"><ErrorBox error={err} /></div>}
          <ul className="space-y-3 text-sm">
            {results.map((r, i) => (
              <li key={i} className="rounded-lg bg-zinc-50 p-3">
                <div className="flex flex-wrap items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" />
                  <strong>{KIND_LABEL[r.kind]} → {r.store}:</strong> {num(r.records)} imported ({num(r.added)} new, {num(r.updated)} updated)
                  {r.kind === "customers" && <span>· {num(r.subscribers ?? 0)} subscribed</span>}</div>
                {!!r.keptUnsubscribed && <div className="mt-1 text-xs text-zinc-600">{num(r.keptUnsubscribed)} people who unsubscribed in Yancey were kept unsubscribed.</div>}
                {r.problemCount > 0 && (
                  <details className="mt-1 text-xs text-amber-800"><summary className="cursor-pointer">{r.problemCount} row{r.problemCount === 1 ? "" : "s"} skipped</summary>
                    <ul className="mt-1 space-y-0.5">{r.problems.slice(0, 50).map((p, j) => <li key={j}><code>{p.key}</code>: {p.error}</li>)}</ul></details>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ImageCopy siteId={s.$id} pending={sm?.imagesOnShopify} onDone={summary.reload} />
    </>
  );
}

function ImageCopy({ siteId, pending, onDone }: { siteId: string; pending?: number; onDone(): void }) {
  const [state, setState] = useState<{ copied: number; reused: number; left?: number; failed: { product: string; url: string; error: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    let copied = 0, reused = 0, failed: any[] = [];
    try {
      for (let i = 0; i < 200; i++) { // each call copies for ~20s, then we call again
        const r = await ops<any>("/import/images", { siteId });
        copied += r.copied; reused += r.reused; failed = r.failed;
        setState({ copied, reused, left: r.remaining, failed });
        if (r.done) break;
      }
      onDone();
    } catch (e: any) { setErr(`${e.message}. Run it again to continue; finished images are kept.`); } finally { setBusy(false); }
  };
  return (
    <Card title={<span className="flex items-center gap-2"><ImageDown className="size-4" />3. Copy images off Shopify</span>} className="mt-4"
      actions={<Button variant="primary" loading={busy} disabled={pending === 0 && !busy} onClick={go}>{pending ? `Copy ${num(pending)} images` : "Nothing to copy"}</Button>}>
      <p className="text-sm text-zinc-600">Imported products still show images hosted by Shopify, which stop working once your Shopify store closes. This copies every product, variant and description image into Yancey's storage and updates the products. It's safe to run more than once.</p>
      {err && <div className="mt-3"><ErrorBox error={err} /></div>}
      {state && (
        <div className="mt-3 text-sm">
          <div>{num(state.copied)} copied{state.reused ? `, ${num(state.reused)} already in storage` : ""}{state.left ? ` · about ${num(state.left)} to go…` : busy ? "…" : " · done"}</div>
          {state.failed.length > 0 && (
            <details className="mt-1 text-xs text-amber-800"><summary className="cursor-pointer">{state.failed.length} couldn't be copied (they keep their Shopify link)</summary>
              <ul className="mt-1 space-y-0.5">{state.failed.map((f, i) => <li key={i}>{f.product}: {f.error}</li>)}</ul></details>
          )}
        </div>
      )}
    </Card>
  );
}
