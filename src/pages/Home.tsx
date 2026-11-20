import { orderDate } from "../lib/types";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { useSite, useStorePath } from "../context/Site";
import { list, ops } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { date, daysAgo, money, num, ymd } from "../lib/format";
import { Badge, Card, Loading, PageHeader, Stat, Td } from "../components/ui";
import { SortTable } from "../lib/useSort";
import type { Site } from "../lib/types";
import { FinStatus, FulStatus } from "./Orders";

export default function HomePage() {
  const { site } = useSite();
  const s = site!;
  const sp = useStorePath();
  const store = useAsync(async () => {
    const [orders, products, customers] = await Promise.all([list("orders", s.$id), list("products", s.$id), list("customers", s.$id)]);
    return { orders, products, customers };
  }, [s.$id]);
  const traffic = useAsync(async () => {
    const [ga, gsc] = await Promise.all([
      s.ga4PropertyId ? ops("/google/ga4", { propertyId: s.ga4PropertyId, days: 28, siteId: s.$id }).catch(() => null) : null,
      s.gscProperty ? ops("/google/gsc", { property: s.gscProperty, days: 28, siteId: s.$id }).catch(() => null) : null,
    ]);
    return { ga, gsc };
  }, [s.$id]);

  if (store.loading || !store.data) return <Loading />;
  const { orders, products } = store.data;
  const since = daysAgo(30).toISOString();
  const recent = orders.filter(o => orderDate(o) >= since);
  const paid = recent.filter(o => o.financialStatus === "paid");
  const revenue = paid.reduce((t, o) => t + o.total, 0);

  const byDay = new Map<string, number>();
  for (let i = 29; i >= 0; i--) byDay.set(ymd(daysAgo(i)), 0);
  paid.forEach(o => { const d = orderDate(o).slice(0, 10); if (byDay.has(d)) byDay.set(d, byDay.get(d)! + o.total); });
  const chart = [...byDay].map(([d, v]) => ({ date: d.slice(5), revenue: Math.round(v * 100) / 100 }));

  const sold = new Map<string, number>();
  paid.forEach(o => o.items.forEach(li => sold.set(li.title, (sold.get(li.title) ?? 0) + li.quantity)));
  const top = [...sold].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const lowStock = products.filter(p => p.status === "active" && p.inventory < 10);
  const toFulfill = orders.filter(o => o.fulfillmentStatus === "unfulfilled" && o.financialStatus === "paid");

  return (
    <>
      <PageHeader title={`Welcome back`} subtitle={`${s.name} · last 30 days`} />
      <SetupChecklist site={s} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue" value={money(revenue, s.currency)} sub={`${paid.length} paid orders`} />
        <Stat label="Orders" value={num(recent.length)} sub={`${toFulfill.length} to fulfill`} />
        <Stat label="Avg. order" value={money(paid.length ? revenue / paid.length : 0, s.currency)} />
        <Stat label="Sessions (GA4)" value={traffic.data?.ga ? num(traffic.data.ga.totals.sessions) : "–"}
          sub={traffic.data?.gsc ? `${num(traffic.data.gsc.totals.clicks)} Google clicks` : s.ga4PropertyId ? "loading…" : "connect GA4 in settings"} />
      </div>

      {(toFulfill.length > 0 || lowStock.length > 0) && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {toFulfill.length > 0 && <Link to={sp("/orders?filter=unfulfilled")} className="flex-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><strong>{toFulfill.length}</strong> paid {toFulfill.length === 1 ? "order" : "orders"} waiting to be fulfilled →</Link>}
          {lowStock.length > 0 && <Link to={sp("/products/inventory")} className="flex flex-1 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"><AlertTriangle className="size-4" /><span><strong>{lowStock.length}</strong> {lowStock.length === 1 ? "product" : "products"} low on stock →</span></Link>}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Revenue" className="lg:col-span-2">
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={chart} margin={{ left: -10, right: 8 }}>
                <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#16a34a" stopOpacity={0.25} /><stop offset="1" stopColor="#16a34a" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#f1f1f3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => money(Number(v), s.currency)} />
                <Area type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Top products">
          {top.length ? (
            <ul className="space-y-2 text-sm">
              {top.map(([title, qty]) => <li key={title} className="flex justify-between gap-2"><span className="truncate">{title}</span><span className="tabular-nums text-zinc-500">{qty} sold</span></li>)}
            </ul>
          ) : <p className="text-sm text-zinc-500">No sales yet.</p>}
        </Card>
      </div>

      <Card title="Recent orders" className="mt-4" actions={<Link to={sp("/orders")} className="text-sm text-zinc-500 hover:text-zinc-900">View all</Link>}>
        {/* Sorts the six most recent orders; "View all" has the full list. */}
        <SortTable rows={orders.slice(0, 6)} id="home-recent-orders" empty={!orders.length} cols={[
          { label: "Order", get: o => o.number }, { label: "Date", get: o => orderDate(o) }, { label: "Customer", get: o => o.customerName },
          { label: "Payment", get: o => o.financialStatus }, { label: "Fulfillment", get: o => o.fulfillmentStatus }, { label: "Total", get: o => o.total }]}>
          {rows => rows.map(o => (
            <tr key={o.$id}>
              <Td className="font-medium">#{o.number}</Td><Td>{date(orderDate(o))}</Td><Td>{o.customerName}</Td>
              <Td><FinStatus s={o.financialStatus} /></Td><Td><FulStatus s={o.fulfillmentStatus} /></Td>
              <Td className="tabular-nums">{money(o.total, s.currency)}</Td>
            </tr>
          ))}
        </SortTable>
      </Card>
      {!s.ga4PropertyId && !s.gscProperty && <p className="mt-4 text-xs text-zinc-500">Tip: connect Google Analytics and Search Console in <Link className="underline" to={sp("/settings")}>store settings</Link> to see traffic here. <Badge tone="blue">free</Badge></p>}
    </>
  );
}

function SetupChecklist({ site }: { site: Site }) {
  const sp = useStorePath();
  const health = useAsync(() => ops("/health").catch(() => null), []);
  const payments = !!(health.data?.integrations?.stripe || health.data?.integrations?.paypal);
  const steps = [
    { label: "Add your store's URL", done: !!site.domain, to: "/settings#url" },
    { label: "Confirm your email and verify your sending domain", done: site.emailStatus === "verified" && !!site.ownerEmail, to: "/settings#email" },
    { label: "Connect hosting (Appwrite Sites)", done: !!site.hostingSiteId, to: "/settings#connections" },
    { label: "Connect Google Analytics and Search Console", done: !!(site.ga4PropertyId && site.gscProperty), to: "/settings#connections" },
    { label: "Turn on payments (Stripe / PayPal)", done: payments, to: "/account" },
  ];
  const done = steps.filter(x => x.done).length;
  if (health.loading || done === steps.length) return null;
  return (
    <Card title={`Finish setting up ${site.name}`} actions={<span className="text-sm text-zinc-500">{done} of {steps.length} done</span>} className="mb-4">
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className="h-full bg-brand-500" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ul className="space-y-1.5 text-sm">
        {steps.map(x => (
          <li key={x.label}>
            <Link to={x.to.startsWith("/account") ? x.to : sp(x.to)} className="flex items-center gap-2 hover:underline">
              {x.done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4 text-zinc-300" />}
              <span className={x.done ? "text-zinc-400 line-through" : ""}>{x.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
