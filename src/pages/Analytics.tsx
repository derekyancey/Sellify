import { useState } from "react";
import { SortTable } from "../lib/useSort";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSite } from "../context/Site";
import { ops } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { num, pct } from "../lib/format";
import { Card, ErrorBox, Loading, NeedsSetup, PageHeader, Stat, Table, Td, cx } from "../components/ui";

const ACCESS_HINT = "Check Store settings → Connections: the connected Google account (or the shared service account) needs access to this property.";
const axis = { tick: { fontSize: 11, fill: "#71717a" }, tickLine: false, axisLine: false } as const;

export default function Analytics() {
  const { site } = useSite(); const s = site!;
  const [days, setDays] = useState(28);
  return (
    <>
      <PageHeader title="Analytics" subtitle="Google Analytics 4 and Google Search Console — both free"
        actions={<div className="flex rounded-lg bg-zinc-200/70 p-0.5 text-sm">
          {[7, 28, 90].map(d => <button key={d} onClick={() => setDays(d)} className={cx("rounded-md px-3 py-1", days === d ? "bg-white font-medium shadow-sm" : "text-zinc-600")}>{d} days</button>)}
        </div>} />
      <div className="space-y-6">
        {s.ga4PropertyId ? <Ga4 propertyId={s.ga4PropertyId} days={days} /> : <NeedsSetup what="Google Analytics 4" />}
        {s.gscProperty ? <Gsc property={s.gscProperty} days={days} /> : <NeedsSetup what="Google Search Console" />}
      </div>
    </>
  );
}

function Ga4({ propertyId, days }: { propertyId: string; days: number }) {
  const { site } = useSite();
  const { data, error, loading } = useAsync(() => ops("/google/ga4", { propertyId, days, siteId: site!.$id }), [propertyId, days]);
  if (loading) return <Loading label="Loading Google Analytics…" />;
  if (error) return <ErrorBox error={`Google Analytics: ${error}`} hint={ACCESS_HINT} />;
  const t = data.totals;
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Google Analytics</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Sessions" value={num(t.sessions)} /><Stat label="Users" value={num(t.activeUsers)} />
        <Stat label="Page views" value={num(t.screenPageViews)} /><Stat label="Key events" value={num(t.conversions)} />
        <Stat label="Bounce rate" value={pct(t.bounceRate)} />
      </div>
      <Card title="Traffic">
        <div className="h-64"><ResponsiveContainer>
          <LineChart data={data.daily} margin={{ left: -10, right: 8 }}>
            <CartesianGrid stroke="#f1f1f3" vertical={false} /><XAxis dataKey="date" {...axis} tickFormatter={d => d.slice(5)} minTickGap={24} /><YAxis {...axis} />
            <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="sessions" name="Sessions" stroke="#16a34a" strokeWidth={2} dot={false} />
            <Line dataKey="users" name="Users" stroke="#0284c7" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer></div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Traffic sources">
          <div className="h-56"><ResponsiveContainer>
            <BarChart data={data.sources} layout="vertical" margin={{ left: 30 }}>
              <XAxis type="number" {...axis} /><YAxis type="category" dataKey="name" {...axis} width={100} /><Tooltip />
              <Bar dataKey="sessions" fill="#16a34a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
        <Card title="Top pages">
          <SortTable rows={data.pages as any[]} id="ga4-pages" cols={[{ label: "Page", get: p => p.path }, { label: "Views", get: p => p.views }]}>
            {rows => rows.map((p: any) => <tr key={p.path}><Td className="max-w-xs truncate">{p.path}</Td><Td className="tabular-nums">{num(p.views)}</Td></tr>)}
          </SortTable>
        </Card>
      </div>
    </section>
  );
}

function Gsc({ property, days }: { property: string; days: number }) {
  const { site } = useSite();
  const { data, error, loading } = useAsync(() => ops("/google/gsc", { property, days, siteId: site!.$id }), [property, days]);
  const [tab, setTab] = useState<"queries" | "pages">("queries");
  if (loading) return <Loading label="Loading Search Console…" />;
  if (error) return <ErrorBox error={`Search Console: ${error}`} hint={ACCESS_HINT} />;
  const t = data.totals;
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Google Search</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Clicks" value={num(t.clicks)} /><Stat label="Impressions" value={num(t.impressions)} />
        <Stat label="CTR" value={pct(t.ctr)} /><Stat label="Avg. position" value={t.position.toFixed(1)} />
      </div>
      <Card title="Search performance">
        <div className="h-64"><ResponsiveContainer>
          <LineChart data={data.daily} margin={{ left: -10, right: 8 }}>
            <CartesianGrid stroke="#f1f1f3" vertical={false} /><XAxis dataKey="date" {...axis} tickFormatter={d => d.slice(5)} minTickGap={24} />
            <YAxis yAxisId="c" {...axis} /><YAxis yAxisId="i" orientation="right" {...axis} />
            <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Line yAxisId="c" dataKey="clicks" name="Clicks" stroke="#2563eb" strokeWidth={2} dot={false} />
            <Line yAxisId="i" dataKey="impressions" name="Impressions" stroke="#7c3aed" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer></div>
      </Card>
      <Card title={<div className="flex gap-3">{(["queries", "pages"] as const).map(k => <button key={k} onClick={() => setTab(k)} className={cx("capitalize", tab === k ? "text-zinc-900" : "text-zinc-400")}>Top {k}</button>)}</div>}>
        <SortTable key={tab} rows={data[tab] as any[]} id={`gsc-${tab}`} empty={!data[tab].length} cols={[
          { label: tab === "queries" ? "Query" : "Page", get: r => r.key }, { label: "Clicks", get: r => r.clicks }, { label: "Impressions", get: r => r.impressions },
          { label: "CTR", get: r => r.ctr }, { label: "Position", get: r => r.position }]}>
          {rows => rows.map((r: any) => (
            <tr key={r.key}><Td className="max-w-sm truncate">{r.key}</Td><Td className="tabular-nums">{num(r.clicks)}</Td><Td className="tabular-nums">{num(r.impressions)}</Td><Td>{pct(r.ctr)}</Td><Td>{r.position.toFixed(1)}</Td></tr>
          ))}
        </SortTable>
      </Card>
    </section>
  );
}
