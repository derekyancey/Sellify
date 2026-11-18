import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Plus, Trash2 } from "lucide-react";
import { storeSlug, useSite, useStorePath } from "../context/Site";
import { createOrder, list, ops, update } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { date, dateTime, money } from "../lib/format";
import type { FinancialStatus, FulfillmentStatus, LineItem, Order, PaymentProvider } from "../lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, cx } from "../components/ui";

export const FinStatus = ({ s }: { s: FinancialStatus }) =>
  <Badge tone={s === "paid" ? "green" : s === "pending" ? "yellow" : "gray"}>{s[0].toUpperCase() + s.slice(1)}</Badge>;
export const FulStatus = ({ s }: { s: FulfillmentStatus }) =>
  <Badge tone={s === "fulfilled" ? "gray" : s === "unfulfilled" ? "yellow" : "red"}>{s[0].toUpperCase() + s.slice(1)}</Badge>;

const providerLabel: Record<PaymentProvider, string> = { stripe: "Stripe", paypal: "PayPal", manual: "Manual" };
export const paymentLink = (o: Order) =>
  o.paymentProvider === "stripe" && o.paymentRef ? `https://dashboard.stripe.com/payments/${o.paymentRef}`
  : o.paymentProvider === "paypal" && o.paymentRef ? `https://www.paypal.com/activity/payment/${o.paymentRef}` : null;

const filters = {
  all: () => true,
  unfulfilled: (o: Order) => o.fulfillmentStatus === "unfulfilled",
  unpaid: (o: Order) => o.financialStatus === "pending",
  refunded: (o: Order) => o.financialStatus === "refunded",
} as const;
type FilterKey = keyof typeof filters;

export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [keys.join(","), ...rows.map(r => keys.map(k => esc(r[k])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name; a.click();
}

const isDraft = (o: Order) => o.financialStatus === "pending" && (o.paymentProvider ?? "manual") === "manual";

export default function Orders({ drafts = false }: { drafts?: boolean }) {
  const { site } = useSite(); const s = site!;
  const sp = useStorePath();
  const [params, setParams] = useSearchParams();
  const filter = drafts ? "all" : (params.get("filter") as FilterKey) || "all";
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);
  const { data: all, loading, error, reload } = useAsync(() => list("orders", s.$id), [s.$id]);
  const data = useMemo(() => all && (drafts ? all.filter(isDraft) : all), [all, drafts]);

  const rows = useMemo(() => (data ?? []).filter(filters[filter]).filter(o =>
    !q || `#${o.number} ${o.customerName} ${o.customerEmail}`.toLowerCase().includes(q.toLowerCase())), [data, filter, q]);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notifyShip, setNotifyShip] = useState(true);
  const [tracking, setTracking] = useState("");
  const canEmail = s.emailStatus === "verified" && s.emailShipping !== false;
  const fulfil = async (o: Order) => {
    await setStatus(o, { fulfillmentStatus: "fulfilled" });
    if (canEmail && notifyShip && o.customerEmail) {
      try { await ops("/email/order", { site: s, order: o, tracking: tracking.trim() || undefined }); }
      catch (e: any) { setActionError(`Order marked fulfilled, but the shipping email failed: ${e.message}`); }
    }
    setTracking("");
  };
  const setStatus = async (o: Order, patch: Partial<Order>) => {
    setBusy(true); setActionError(null);
    try { const next = await update("orders", o.$id, patch); setSelected(next); reload(); }
    catch (e: any) { setActionError(e.message); } finally { setBusy(false); }
  };
  const refund = async (o: Order) => {
    const auto = (o.paymentProvider === "stripe" || o.paymentProvider === "paypal") && o.paymentRef;
    const msg = auto ? `Refund ${money(o.total, s.currency)} to ${o.customerName} through ${providerLabel[o.paymentProvider!]}?`
      : "Mark this order refunded? Issue the refund yourself — it wasn't paid through Stripe or PayPal.";
    if (!confirm(msg)) return;
    if (auto) {
      setBusy(true); setActionError(null);
      try { await ops("/payments/refund", { provider: o.paymentProvider, paymentRef: o.paymentRef, currency: s.currency }); }
      catch (e: any) { setActionError(e.message); setBusy(false); return; }
    }
    await setStatus(o, { financialStatus: "refunded" });
  };

  return (
    <>
      <PageHeader title={drafts ? "Draft orders" : "Orders"} subtitle={drafts ? "Manual orders waiting for payment. Mark them paid once you've been paid." : `${data?.length ?? 0} total`} actions={<>
        <Button onClick={() => downloadCsv(`${storeSlug(s)}-orders.csv`, rows.map(o => ({ order: o.number, date: o.$createdAt, customer: o.customerName, email: o.customerEmail, total: o.total, payment: o.financialStatus, provider: o.paymentProvider ?? "manual", paymentRef: o.paymentRef ?? "", fulfillment: o.fulfillmentStatus, items: o.items.map(i => `${i.quantity}x ${i.title}`).join("; ") })))}><Download className="size-4" />Export</Button>
        <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" />{drafts ? "Create draft" : "Create order"}</Button>
      </>} />
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {!drafts && <div className="flex rounded-lg bg-zinc-100 p-0.5 text-sm">
            {(Object.keys(filters) as FilterKey[]).map(k => (
              <button key={k} onClick={() => setParams(k === "all" ? {} : { filter: k })}
                className={cx("rounded-md px-3 py-1 capitalize", filter === k ? "bg-white shadow-sm font-medium" : "text-zinc-600")}>{k}</button>
            ))}
          </div>}
          <Input placeholder="Search orders" value={q} onChange={e => setQ(e.target.value)} className="sm:ml-auto sm:max-w-xs" />
        </div>
        {error && <ErrorBox error={error} />}
        {loading ? <Loading /> : (
          <Table head={["Order", "Date", "Customer", "Payment", "Fulfillment", "Items", "Total"]} empty={!rows.length}>
            {rows.map(o => (
              <tr key={o.$id} onClick={() => setSelected(o)} className="cursor-pointer hover:bg-zinc-50">
                <Td className="font-medium">#{o.number}</Td><Td>{date(o.$createdAt)}</Td><Td>{o.customerName}</Td>
                <Td><FinStatus s={o.financialStatus} /> <span className="ml-1 text-xs text-zinc-500">{providerLabel[o.paymentProvider ?? "manual"]}</span></Td><Td><FulStatus s={o.fulfillmentStatus} /></Td>
                <Td>{o.items.reduce((t, i) => t + i.quantity, 0)}</Td><Td className="tabular-nums">{money(o.total, s.currency)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={!!selected} onClose={() => { setSelected(null); setActionError(null); }} title={selected ? `Order #${selected.number}` : ""}
        footer={selected && <>
          {selected.financialStatus === "pending" && <Button disabled={busy} onClick={() => setStatus(selected, { financialStatus: "paid" })}>Mark as paid</Button>}
          {selected.financialStatus === "paid" && <Button variant="ghost" disabled={busy} onClick={() => refund(selected)}>Refund</Button>}
          {selected.fulfillmentStatus === "unfulfilled" && <Button variant="ghost" onClick={() => setStatus(selected, { fulfillmentStatus: "cancelled" })}>Cancel</Button>}
          {selected.fulfillmentStatus === "unfulfilled" && <Button variant="primary" loading={busy} onClick={() => fulfil(selected)}>Mark fulfilled</Button>}
        </>}>
        {selected && <>
          {actionError && <ErrorBox error={actionError} />}
          <div className="flex flex-wrap items-center gap-2"><FinStatus s={selected.financialStatus} /><FulStatus s={selected.fulfillmentStatus} /><span className="text-sm text-zinc-500">{dateTime(selected.$createdAt)}</span></div>
          <div className="text-sm text-zinc-600">Paid via <strong>{providerLabel[selected.paymentProvider ?? "manual"]}</strong>
            {paymentLink(selected) && <> · <a className="underline" href={paymentLink(selected)!} target="_blank" rel="noreferrer">view payment</a></>}</div>
          <div className="text-sm"><div className="font-medium">{selected.customerName}</div><div className="text-zinc-500">{selected.customerEmail}</div></div>
          {selected.fulfillmentStatus === "unfulfilled" && (canEmail ? (
            <div className="space-y-2 rounded-lg bg-zinc-50 p-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={notifyShip} onChange={e => setNotifyShip(e.target.checked)} />Email {selected.customerEmail || "the customer"} when marked fulfilled</label>
              {notifyShip && <Input placeholder="Tracking number or link (optional)" value={tracking} onChange={e => setTracking(e.target.value)} />}
            </div>
          ) : <p className="text-xs text-zinc-500">Shipping emails are off. <Link className="underline" to={sp("/settings#email")}>Set up email</Link> to notify customers.</p>)}
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm">
            {selected.items.map((li, i) => <li key={i} className="flex justify-between px-3 py-2"><span>{li.quantity} × {li.title}</span><span className="tabular-nums">{money(li.price * li.quantity, s.currency)}</span></li>)}
            <li className="flex justify-between px-3 py-2 font-semibold"><span>Total</span><span>{money(selected.total, s.currency)}</span></li>
          </ul>
        </>}
      </Modal>

      {creating && <CreateOrder draft={drafts} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />}
    </>
  );
}

function CreateOrder({ onClose, onCreated, draft }: { onClose(): void; onCreated(): void; draft?: boolean }) {
  const { site } = useSite(); const s = site!;
  const refs = useAsync(async () => ({ products: await list("products", s.$id), customers: await list("customers", s.$id) }), [s.$id]);
  const [customerId, setCustomerId] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [paid, setPaid] = useState(!draft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const total = items.reduce((t, i) => t + i.price * i.quantity, 0);

  const add = (pid: string) => {
    const p = refs.data?.products.find(p => p.$id === pid); if (!p) return;
    setItems(it => it.some(i => i.productId === pid) ? it.map(i => i.productId === pid ? { ...i, quantity: i.quantity + 1 } : i)
      : [...it, { productId: p.$id, title: p.title, price: p.price, quantity: 1 }]);
  };
  const save = async () => {
    const c = refs.data?.customers.find(c => c.$id === customerId);
    if (!c || !items.length) { setErr("Choose a customer and at least one product."); return; }
    setBusy(true);
    try {
      await createOrder(s.$id, { customerId: c.$id, customerName: c.name, customerEmail: c.email, items, total,
        financialStatus: paid ? "paid" : "pending", fulfillmentStatus: "unfulfilled", paymentProvider: "manual" });
      onCreated();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <Modal open title="Create order" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Create order</Button></>}>
      {refs.loading ? <Loading /> : <>
        {err && <ErrorBox error={err} />}
        <Field label="Customer">
          <Select value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">Choose…</option>
            {refs.data!.customers.map(c => <option key={c.$id} value={c.$id}>{c.name} ({c.email})</option>)}
          </Select>
        </Field>
        <Field label="Add product">
          <Select value="" onChange={e => add(e.target.value)}>
            <option value="">Choose…</option>
            {refs.data!.products.filter(p => p.status === "active").map(p => <option key={p.$id} value={p.$id}>{p.title} — {money(p.price, s.currency)} ({p.inventory} in stock)</option>)}
          </Select>
        </Field>
        {items.length > 0 && (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm">
            {items.map(li => (
              <li key={li.productId} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1">{li.title}</span>
                <Input type="number" min={1} value={li.quantity} className="w-16"
                  onChange={e => setItems(it => it.map(i => i.productId === li.productId ? { ...i, quantity: Math.max(1, +e.target.value) } : i))} />
                <button onClick={() => setItems(it => it.filter(i => i.productId !== li.productId))} className="p-1 text-zinc-400 hover:text-red-600" aria-label="Remove"><Trash2 className="size-4" /></button>
              </li>
            ))}
            <li className="flex justify-between px-3 py-2 font-semibold"><span>Total</span><span>{money(total, s.currency)}</span></li>
          </ul>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} />Payment received</label>
      </>}
    </Modal>
  );
}
