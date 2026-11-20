import { orderDate } from "../lib/types";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { storeSlug, useSite } from "../context/Site";
import { list, ops } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { date, daysAgo, money, num } from "../lib/format";
import type { Order } from "../lib/types";
import { Badge, Card, ErrorBox, Loading, PageHeader, Stat, Table, Td, cx } from "../components/ui";
import { downloadCsv } from "./Orders";

const PROVIDERS = ["stripe", "paypal", "manual"] as const;
const LABEL = { stripe: "Stripe (card, Apple Pay, Google Pay)", paypal: "PayPal", manual: "Manual / draft" } as const;
const axis = { tick: { fontSize: 11, fill: "#71717a" }, tickLine: false, axisLine: false } as const;

/** Per-store money from Yancey's orders, plus account-wide Stripe/PayPal balances, fees and payouts. */
export default function Finance() {
  const { site } = useSite(); const s = site!;
  const [days, setDays] = useState(30);
  const orders = useAsync(() => list("orders", s.$id), [s.$id]);
  const proc = useAsync(() => ops("/finance/processors", { days }), [days]);

  const f = useMemo(() => {
    const since = daysAgo(days).toISOString();
    const rows = (orders.data ?? []).filter(o => orderDate(o) >= since);
    const paid = rows.filter(o => o.financialStatus === "paid"), refunded = rows.filter(o => o.financialStatus === "refunded");
    const sum = (xs: Order[], k: (o: Order) => number = o => o.total) => xs.reduce((t, o) => t + k(o), 0);
    const byProvider = PROVIDERS.map(p => {
      const pp = paid.filter(o => (o.paymentProvider ?? "manual") === p), rr = refunded.filter(o => (o.paymentProvider ?? "manual") === p);
      return { provider: p, orders: pp.length, sales: sum(pp), refunds: sum(rr) };
    });
    const months = new Map<string, { month: string; sales: number; refunds: number }>();
    for (const o of rows) {
      const m = orderDate(o).slice(0, 7);
      const e = months.get(m) ?? { month: m, sales: 0, refunds: 0 };
      if (o.financialStatus === "paid") e.sales += o.total;
      if (o.financialStatus === "refunded") e.refunds += o.total;
      months.set(m, e);
    }
    return {
      rows, sales: sum(paid), refunds: sum(refunded), discounts: sum(paid, o => o.discountAmount ?? 0),
      pending: sum(rows.filter(o => o.financialStatus === "pending")), orders: paid.length, byProvider,
      months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map(m => ({ ...m, sales: +m.sales.toFixed(2), refunds: +m.refunds.toFixed(2) })),
    };
  }, [orders.data, days]);

  const exportCsv = () => downloadCsv(`${storeSlug(s)}-finance-${days}d.csv`, f.rows.map(o => ({
    date: orderDate(o).slice(0, 10), order: o.number, customer: o.customerName, email: o.customerEmail, status: o.financialStatus,
    provider: o.paymentProvider ?? "manual", paymentRef: o.paymentRef ?? "", discountCode: o.discountCode ?? "", discount: o.discountAmount ?? 0,
    total: o.total, currency: s.currency,
  })));

  return (
    <>
      <PageHeader title="Finance" subtitle={`${s.name} · money in and out`} actions={<>
        <div className="flex rounded-lg bg-zinc-200/70 p-0.5 text-sm">
          {[30, 90, 365].map(d => <button key={d} onClick={() => setDays(d)} className={cx("rounded-md px-3 py-1", days === d ? "bg-white font-medium shadow-sm" : "text-zinc-600")}>{d === 365 ? "1 year" : `${d} days`}</button>)}
        </div>
        <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"><Download className="size-4" />Export for accountant</button>
      </>} />
      {orders.error && <ErrorBox error={orders.error} />}
      {orders.loading ? <Loading /> : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Sales" value={money(f.sales, s.currency)} sub={`${num(f.orders)} paid orders`} />
          <Stat label="Refunds" value={money(f.refunds, s.currency)} />
          <Stat label="Net sales" value={money(f.sales - f.refunds, s.currency)} />
          <Stat label="Discounts given" value={money(f.discounts, s.currency)} />
          <Stat label="Awaiting payment" value={money(f.pending, s.currency)} sub="draft / unpaid orders" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card title="By month" className="lg:col-span-2">
            <div className="h-60"><ResponsiveContainer>
              <BarChart data={f.months} margin={{ left: -10, right: 8 }}>
                <CartesianGrid stroke="#f1f1f3" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} />
                <Tooltip formatter={v => money(Number(v), s.currency)} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sales" name="Sales" fill="#16a34a" radius={[4, 4, 0, 0]} /><Bar dataKey="refunds" name="Refunds" fill="#f87171" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer></div>
          </Card>
          <Card title="By payment method">
            <ul className="space-y-3 text-sm">
              {f.byProvider.map(p => (
                <li key={p.provider}>
                  <div className="flex justify-between"><span className="font-medium">{LABEL[p.provider]}</span><span className="tabular-nums">{money(p.sales, s.currency)}</span></div>
                  <div className="flex justify-between text-xs text-zinc-500"><span>{p.orders} orders</span>{p.refunds > 0 && <span>−{money(p.refunds, s.currency)} refunded</span>}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </>}
      <Processors data={proc.data} loading={proc.loading} error={proc.error} days={days} />
    </>
  );
}

function Processors({ data, loading, error, days }: { data: any; loading: boolean; error: string | null; days: number }) {
  return (
    <Card title={<span>Payment accounts <span className="font-normal text-zinc-500">· shared by all your stores</span></span>} className="mt-4">
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : !data?.stripe && !data?.paypal ? (
        <p className="text-sm text-zinc-500">Add your Stripe and PayPal keys to the site-ops function to see balances, fees and payouts here.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {data.stripe && <Provider name="Stripe" d={data.stripe} days={days} />}
          {data.paypal && <Provider name="PayPal" d={data.paypal} days={days} />}
        </div>
      )}
    </Card>
  );
}

function Provider({ name, d, days }: { name: string; d: any; days: number }) {
  if (d.error) return <div className="min-w-0"><div className="mb-1 font-medium">{name}</div><ErrorBox error={d.error} /></div>;
  const balances: { currency: string; amount: number; label: string }[] = name === "Stripe"
    ? [...d.available.map((b: any) => ({ ...b, label: "Available" })), ...d.pending.map((b: any) => ({ ...b, label: "Pending" }))]
    : d.balances.map((b: any) => ({ currency: b.currency, amount: b.available, label: "Available" }));
  return (
    <div className="min-w-0 space-y-3 text-sm">
      <div className="font-medium">{name}</div>
      <div className="flex flex-wrap gap-2">
        {balances.map((b, i) => <div key={i} className="rounded-lg bg-zinc-50 px-3 py-2"><div className="text-xs text-zinc-500">{b.label}</div><div className="font-semibold tabular-nums">{money(b.amount, b.currency)}</div></div>)}
        {!balances.length && <span className="text-zinc-500">No balance yet.</span>}
      </div>
      {Object.entries(d.period as Record<string, any>).map(([cur, p]) => (
        <div key={cur} className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <div><div className="text-xs text-zinc-500">Gross ({days}d)</div><div className="tabular-nums">{money(p.gross, cur)}</div></div>
          <div><div className="text-xs text-zinc-500">Fees</div><div className="tabular-nums text-red-600">−{money(p.fees, cur)}</div></div>
          <div><div className="text-xs text-zinc-500">Refunds</div><div className="tabular-nums">{money(p.refunds, cur)}</div></div>
          <div><div className="text-xs text-zinc-500">Net</div><div className="font-semibold tabular-nums">{money(p.net, cur)}</div></div>
        </div>
      ))}
      {d.payouts?.length > 0 && (
        <Table head={["Payout", "Arrives", "Status"]}>
          {d.payouts.map((p: any) => <tr key={p.id}><Td className="tabular-nums">{money(p.amount, p.currency)}</Td><Td>{date(p.arrival)}</Td><Td><Badge tone={p.status === "paid" ? "green" : p.status === "failed" ? "red" : "yellow"}>{p.status.replace(/_/g, " ")}</Badge></Td></tr>)}
        </Table>
      )}
    </div>
  );
}
