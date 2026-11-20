import { orderDate } from "../lib/types";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Globe, Plus } from "lucide-react";
import { useStores } from "../context/Site";
import { create, list } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { daysAgo, money, num } from "../lib/format";
import type { Site } from "../lib/types";
import { Badge, Button, ErrorBox, Field, Input, Modal, PageHeader, Select } from "../components/ui";
import { cleanDomain } from "./StoreSettings";

const progress = (s: Site) => [!!s.domain, !!s.hostingSiteId, !!(s.ga4PropertyId && s.gscProperty), s.emailStatus === "verified"];
const initials = (n: string) => n.split(/\s+/).filter(w => /[a-z0-9]/i.test(w[0] ?? "")).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
const COLORS = ["bg-emerald-600", "bg-sky-600", "bg-violet-600", "bg-amber-600", "bg-rose-600", "bg-teal-600"];

export default function StoresHome() {
  const { sites, reload } = useStores();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(params.get("new") === "1");
  useEffect(() => { if (params.get("new") === "1") setAdding(true); }, [params]);
  const [q, setQ] = useState("");
  const orders = useAsync(() => list("orders"), [sites.length]);

  const stats = useMemo(() => {
    const since = daysAgo(30).toISOString();
    const by: Record<string, { revenue: number; orders: number }> = {};
    for (const o of orders.data ?? []) {
      if (orderDate(o) < since) continue;
      const s = (by[o.siteId] ??= { revenue: 0, orders: 0 });
      s.orders++; if (o.financialStatus === "paid") s.revenue += o.total;
    }
    return by;
  }, [orders.data]);
  const shown = sites.filter(s => `${s.name} ${s.domain ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const total = Object.values(stats).reduce((t, x) => t + x.revenue, 0);

  return (
    <>
      <PageHeader title="Your stores" subtitle={sites.length ? `${sites.length} store${sites.length === 1 ? "" : "s"} · ${money(total)} paid in the last 30 days` : "Add your first store to get started."}
        actions={<Button variant="primary" onClick={() => setAdding(true)}><Plus className="size-4" />Add store</Button>} />
      {sites.length > 6 && <Input placeholder="Search stores" value={q} onChange={e => setQ(e.target.value)} className="mb-4 sm:max-w-xs" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((s, i) => {
          const p = progress(s), done = p.filter(Boolean).length, st = stats[s.$id];
          return (
            <Link key={s.$id} to={`/stores/${s.$id}`} className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-400 hover:shadow">
              <div className="flex items-center gap-3">
                <div className={`grid size-10 shrink-0 place-items-center rounded-lg font-bold text-white ${COLORS[i % COLORS.length]}`}>{initials(s.name)}</div>
                <div className="min-w-0">
                  <div className="truncate font-semibold group-hover:underline">{s.name}</div>
                  <div className="flex items-center gap-1 truncate text-sm text-zinc-500"><Globe className="size-3.5 shrink-0" />{s.domain || <em>No URL yet</em>}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-zinc-50 px-3 py-2"><div className="text-xs text-zinc-500">Sales (30d)</div><div className="font-semibold tabular-nums">{money(st?.revenue ?? 0, s.currency)}</div></div>
                <div className="rounded-lg bg-zinc-50 px-3 py-2"><div className="text-xs text-zinc-500">Orders (30d)</div><div className="font-semibold tabular-nums">{num(st?.orders ?? 0)}</div></div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100"><div className="h-full bg-brand-500" style={{ width: `${(done / p.length) * 100}%` }} /></div>
                {done === p.length ? <Badge tone="green">Set up</Badge> : <span>{done}/{p.length} set up</span>}
                <ArrowRight className="size-4 text-zinc-400 group-hover:text-zinc-800" />
              </div>
            </Link>
          );
        })}
        <button onClick={() => setAdding(true)} className="grid min-h-40 place-items-center rounded-xl border-2 border-dashed border-zinc-300 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-800">
          <span className="flex items-center gap-2"><Plus className="size-4" />Add a store</span>
        </button>
      </div>
      {orders.error && <div className="mt-4"><ErrorBox error={orders.error} /></div>}
      {adding && <AddStore sites={sites} onClose={() => { setAdding(false); setParams({}); }} onCreated={async id => { await reload(); navigate(`/stores/${id}/settings`); }} />}
    </>
  );
}

function AddStore({ sites, onClose, onCreated }: { sites: Site[]; onClose(): void; onCreated(id: string): void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const domain = url.trim() ? cleanDomain(url) : "";
    if (!name.trim()) { setErr("Give the store a name."); return; }
    if (domain && !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) { setErr("That URL doesn't look right. Try something like mystore.com."); return; }
    if (domain && sites.some(s => s.domain === domain)) { setErr(`${domain} is already one of your stores.`); return; }
    setBusy(true);
    try {
      const row = await create("sites", { name: name.trim(), currency, ...(domain ? { domain, gscProperty: `sc-domain:${domain}` } : {}), emailStatus: "none" } as any);
      onCreated(row.$id);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal open title="Add a store" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Create store</Button></>}>
      {err && <ErrorBox error={err} />}
      <Field label="Store name"><Input value={name} onChange={e => setName(e.target.value)} placeholder="My Shop" autoFocus /></Field>
      <Field label="Store URL (optional)" hint="You can add or change it later in the store's settings."><Input value={url} onChange={e => setUrl(e.target.value)} placeholder="myshop.com" /></Field>
      <Field label="Currency"><Select value={currency} onChange={e => setCurrency(e.target.value)}>{["USD", "CAD", "EUR", "GBP", "AUD"].map(c => <option key={c}>{c}</option>)}</Select></Field>
    </Modal>
  );
}
