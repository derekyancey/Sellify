import { orderDate } from "../lib/types";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { storeSlug, useSite, useStorePath } from "../context/Site";
import { createOrder, list, ops, orderDownloads, update } from "../lib/data";
import { config } from "../lib/appwrite";
import { useAsync } from "../lib/useAsync";
import { date, dateTime, money } from "../lib/format";
import type { Address, Download as DownloadLink, FinancialStatus, FulfillmentStatus, LineItem, Order, PaymentProvider } from "../lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, cx } from "../components/ui";

const label = (s: string) => (s[0].toUpperCase() + s.slice(1)).replace(/_/g, " ");
export const FinStatus = ({ s }: { s: FinancialStatus }) =>
  <Badge tone={s === "paid" ? "green" : s === "pending" || s === "partially_refunded" ? "yellow" : "gray"}>{label(s)}</Badge>;
export const FulStatus = ({ s }: { s: FulfillmentStatus }) =>
  <Badge tone={s === "fulfilled" ? "gray" : s === "unfulfilled" || s === "partial" ? "yellow" : "red"}>{label(s)}</Badge>;
const addressLines = (a?: Address | null) => !a ? [] : [a.name, a.company, a.address1, a.address2,
  [a.city, a.provinceCode || a.province, a.zip].filter(Boolean).join(" "), a.country || a.countryCode, a.phone].filter(Boolean) as string[];

export const providerLabel: Record<PaymentProvider, string> = { stripe: "Stripe", paypal: "PayPal", manual: "Manual", shopify: "Shopify (imported)", free: "Free checkout" };
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
    if (o.paymentProvider === "free") {
      if (confirm("Void this free order? Its download links stop working.")) await setStatus(o, { financialStatus: "voided" });
      return;
    }
    const auto = (o.paymentProvider === "stripe" || o.paymentProvider === "paypal") && o.paymentRef;
    const msg = auto ? `Refund ${money(o.total, s.currency)} to ${o.customerName} through ${providerLabel[o.paymentProvider!]}?`
      : o.paymentProvider === "shopify" ? "Mark this order refunded in Yancey? It was paid through Shopify, so issue the refund in your Shopify admin."
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
        {!drafts && <Link to={sp("/import")} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"><Upload className="size-4" />Import</Link>}
        <Button onClick={() => downloadCsv(`${storeSlug(s)}-orders.csv`, rows.map(o => ({ order: o.number, date: orderDate(o), customer: o.customerName, email: o.customerEmail, total: o.total, payment: o.financialStatus, provider: o.paymentProvider ?? "manual", paymentRef: o.paymentRef ?? "", fulfillment: o.fulfillmentStatus, items: o.items.map(i => `${i.quantity}x ${i.title}`).join("; ") })))}><Download className="size-4" />Export</Button>
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
                <Td className="font-medium">#{o.number}</Td><Td>{date(orderDate(o))}</Td><Td>{o.customerName}</Td>
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
          {selected.financialStatus === "paid" && <Button variant="ghost" disabled={busy} onClick={() => refund(selected)}>{selected.paymentProvider === "free" ? "Void" : "Refund"}</Button>}
          {selected.fulfillmentStatus === "unfulfilled" && <Button variant="ghost" onClick={() => setStatus(selected, { fulfillmentStatus: "cancelled" })}>Cancel</Button>}
          {selected.fulfillmentStatus === "unfulfilled" && <Button variant="primary" loading={busy} onClick={() => fulfil(selected)}>Mark fulfilled</Button>}
        </>}>
        {selected && <>
          {actionError && <ErrorBox error={actionError} />}
          <div className="flex flex-wrap items-center gap-2"><FinStatus s={selected.financialStatus} /><FulStatus s={selected.fulfillmentStatus} /><span className="text-sm text-zinc-500">{dateTime(orderDate(selected))}</span></div>
          <div className="text-sm text-zinc-600">{selected.paymentProvider === "free" ? "Placed through " : "Paid via "}<strong>{providerLabel[selected.paymentProvider ?? "manual"]}</strong>
            {paymentLink(selected) && <> · <a className="underline" href={paymentLink(selected)!} target="_blank" rel="noreferrer">view payment</a></>}</div>
          <div className="text-sm"><div className="font-medium">{selected.customerName}</div><div className="text-zinc-500">{selected.customerEmail}</div></div>
          {selected.fulfillmentStatus === "unfulfilled" && (canEmail ? (
            <div className="space-y-2 rounded-lg bg-zinc-50 p-3 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={notifyShip} onChange={e => setNotifyShip(e.target.checked)} />Email {selected.customerEmail || "the customer"} when marked fulfilled</label>
              {notifyShip && <Input placeholder="Tracking number or link (optional)" value={tracking} onChange={e => setTracking(e.target.value)} />}
            </div>
          ) : <p className="text-xs text-zinc-500">Shipping emails are off. <Link className="underline" to={sp("/settings#email")}>Set up email</Link> to notify customers.</p>)}
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm">
            {selected.items.map((li, i) => <li key={i} className="flex justify-between gap-2 px-3 py-2"><span>{li.quantity} × {li.title}{li.sku && <span className="ml-1 text-xs text-zinc-400">{li.sku}</span>}{li.digital && <span className="ml-1.5"><Badge tone="blue">digital</Badge></span>}</span><span className="tabular-nums">{money(li.price * li.quantity, s.currency)}</span></li>)}
            {selected.subtotal != null && selected.subtotal !== selected.total && <li className="flex justify-between px-3 py-1.5 text-zinc-600"><span>Subtotal</span><span className="tabular-nums">{money(selected.subtotal, s.currency)}</span></li>}
            {!!selected.discountAmount && <li className="flex justify-between px-3 py-1.5 text-zinc-600"><span>Discount{selected.discountCode ? ` (${selected.discountCode})` : ""}</span><span className="tabular-nums">−{money(selected.discountAmount, s.currency)}</span></li>}
            {!!selected.shippingTotal && <li className="flex justify-between px-3 py-1.5 text-zinc-600"><span>Shipping</span><span className="tabular-nums">{money(selected.shippingTotal, s.currency)}</span></li>}
            {!!selected.taxTotal && <li className="flex justify-between px-3 py-1.5 text-zinc-600"><span>Tax</span><span className="tabular-nums">{money(selected.taxTotal, s.currency)}</span></li>}
            <li className="flex justify-between px-3 py-2 font-semibold"><span>Total</span><span>{money(selected.total, s.currency)}</span></li>
            {!!selected.refundedAmount && <li className="flex justify-between px-3 py-1.5 text-red-700"><span>Refunded</span><span className="tabular-nums">−{money(selected.refundedAmount, s.currency)}</span></li>}
          </ul>
          {selected.items.some(i => i.digital) && <OrderDownloads order={selected} canEmail={s.emailStatus === "verified"} />}
          {(addressLines(selected.billingAddress).length > 0 || selected.externalId) && (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              {addressLines(selected.billingAddress).length > 0 && <div><div className="text-xs font-medium uppercase text-zinc-500">Billing address</div>{addressLines(selected.billingAddress).map((l, i) => <div key={i}>{l}</div>)}</div>}
              {selected.source === "shopify" && <div><div className="text-xs font-medium uppercase text-zinc-500">Imported from Shopify</div>
                <div>Order ID {selected.externalId}</div>{selected.paymentMethod && <div>Paid with {selected.paymentMethod}</div>}
                {selected.cancelledAt && <div className="text-red-700">Cancelled {dateTime(selected.cancelledAt)}</div>}
                {!!selected.tags?.length && <div className="text-xs text-zinc-500">Tags: {selected.tags.join(", ")}</div>}</div>}
            </div>
          )}
        </>}
      </Modal>

      {creating && <CreateOrder draft={drafts} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />}
    </>
  );
}

const linkFor = (d: DownloadLink) => `${config.checkoutPublicUrl || "https://<checkout function domain>"}/download?t=${d.token}`;

/** The buyer's personal download links for this order: see usage, copy, reset, turn off, or email them again. */
function OrderDownloads({ order, canEmail }: { order: Order; canEmail: boolean }) {
  const { site } = useSite(); const s = site!;
  const sp = useStorePath();
  const { data, loading, error, reload } = useAsync(() => orderDownloads(order.$id, s.$id), [order.$id]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const patch = async (d: DownloadLink, data: Partial<DownloadLink>) => { setErr(null); try { await update("downloads", d.$id, data); reload(); } catch (e: any) { setErr(e.message); } };
  const resend = async () => {
    setSending(true); setErr(null); setMsg(null);
    try { await ops("/email/downloads", { site: s, order }); setMsg(`Download links sent to ${order.customerEmail}.`); }
    catch (e: any) { setErr(e.message); } finally { setSending(false); }
  };
  const expired = (d: DownloadLink) => !!d.expiresAt && new Date(d.expiresAt) < new Date();
  return (
    <div className="rounded-lg border border-zinc-200 text-sm">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
        <span className="font-medium">Downloads</span>
        {canEmail ? <Button disabled={sending || !data?.length || !order.customerEmail} loading={sending} onClick={resend}>Email links again</Button>
          : <Link className="text-xs underline" to={sp("/settings#email")}>Set up email to resend links</Link>}
      </div>
      {(error || err) && <div className="p-2"><ErrorBox error={String(error || err)} /></div>}
      {msg && <p className="px-3 pt-2 text-xs text-green-700">{msg}</p>}
      {loading ? <div className="p-3"><Loading /></div> : !data?.length ? <p className="px-3 py-2 text-xs text-zinc-500">No download links were created for this order (the products had no files when it was placed).</p> : (
        <ul className="divide-y divide-zinc-100">
          {data.map(d => (
            <li key={d.$id} className="space-y-1 px-3 py-2">
              <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate font-medium">{d.name}</span>
                {d.revoked ? <Badge tone="red">off</Badge> : expired(d) ? <Badge tone="gray">expired</Badge>
                  : d.maxDownloads && d.downloadCount >= d.maxDownloads ? <Badge tone="yellow">used up</Badge> : <Badge tone="green">active</Badge>}</div>
              <div className="text-xs text-zinc-500">
                Downloaded {d.downloadCount}{d.maxDownloads ? ` of ${d.maxDownloads}` : ""} time{d.downloadCount === 1 ? "" : "s"}
                {d.lastDownloadAt && `, last ${dateTime(d.lastDownloadAt)}`}{d.expiresAt && ` · ${expired(d) ? "expired" : "expires"} ${date(d.expiresAt)}`}
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <button className="underline" onClick={() => { navigator.clipboard?.writeText(linkFor(d)); setMsg("Link copied."); }}>Copy link</button>
                {(d.downloadCount > 0 || expired(d)) && <button className="underline" onClick={() => patch(d, { downloadCount: 0, ...(expired(d) ? { expiresAt: new Date(Date.now() + 7 * 864e5).toISOString() } : {}) })}>
                  {expired(d) ? "Reset and extend 7 days" : "Reset count"}</button>}
                <button className="underline" onClick={() => patch(d, { revoked: !d.revoked })}>{d.revoked ? "Turn back on" : "Turn off"}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
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
      await createOrder(s.$id, { customerId: c.$id, customerName: c.name, customerEmail: c.email ?? "", items, total,
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
