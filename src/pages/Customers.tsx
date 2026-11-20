import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Upload } from "lucide-react";
import { storeSlug, useSite, useStorePath } from "../context/Site";
import { create, list, update } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { date, money, num } from "../lib/format";
import type { Customer } from "../lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, cx } from "../components/ui";
import { downloadCsv } from "./Orders";

const PAGE = 100;

export default function Customers() {
  const { site } = useSite(); const s = site!;
  const sp = useStorePath();
  const { data, loading, error, reload, setData } = useAsync(() => list("customers", s.$id), [s.$id]);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "subscribers" | "buyers">("all");
  const [sort, setSort] = useState<"spent" | "orders" | "name">("spent");
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", acceptsMarketing: false });

  const subs = useMemo(() => (data ?? []).filter(c => c.acceptsMarketing).length, [data]);
  const rows = useMemo(() => {
    const t = q.toLowerCase();
    return (data ?? []).filter(c => (show === "all" || (show === "subscribers" ? c.acceptsMarketing : c.ordersCount > 0))
      && (!t || `${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${(c.tags ?? []).join(" ")}`.toLowerCase().includes(t)))
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "orders" ? b.ordersCount - a.ordersCount : b.totalSpent - a.totalSpent);
  }, [data, q, show, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);

  const toggle = async (c: Customer, on: boolean) => {
    // Unticking records an unsubscribe, which later imports respect; ticking is an explicit re-subscribe by you.
    const patch = on ? { acceptsMarketing: true, unsubscribedAt: "" } : { acceptsMarketing: false, unsubscribedAt: new Date().toISOString() };
    setData(d => d && d.map(x => x.$id === c.$id ? { ...x, ...patch } : x));
    await update("customers", c.$id, patch as any);
  };
  const save = async () => {
    if (!form.name || !form.email) return;
    await create("customers", { ...form, email: form.email.trim().toLowerCase(), siteId: s.$id, ordersCount: 0, totalSpent: 0 });
    setAdding(false); setForm({ name: "", email: "", phone: "", acceptsMarketing: false }); reload();
  };

  return (
    <>
      <PageHeader title="Customers" subtitle={`${num(data?.length ?? 0)} customers · ${num(subs)} email subscribers`} actions={<>
        <Link to={sp("/import")} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"><Upload className="size-4" />Import</Link>
        <Button onClick={() => downloadCsv(`${storeSlug(s)}-${show === "subscribers" ? "subscribers" : "customers"}.csv`, rows.map(c => ({
          name: c.name, firstName: c.firstName ?? "", lastName: c.lastName ?? "", email: c.email ?? "", phone: c.phone ?? "",
          subscribed: c.acceptsMarketing ? "yes" : "no", sms: c.acceptsSms ? "yes" : "no", orders: c.ordersCount, spent: c.totalSpent, tags: (c.tags ?? []).join(", ") })))}>Export</Button>
        <Button variant="primary" onClick={() => setAdding(true)}><Plus className="size-4" />Add customer</Button>
      </>} />
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-zinc-100 p-0.5 text-sm">
            {([["all", "All"], ["subscribers", `Subscribers (${num(subs)})`], ["buyers", "Have ordered"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => { setShow(k); setPage(0); }} className={cx("rounded-md px-3 py-1", show === k ? "bg-white font-medium shadow-sm" : "text-zinc-600")}>{l}</button>
            ))}
          </div>
          <Input placeholder="Search name, email, phone, tag" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} className="min-w-0 flex-1 sm:max-w-xs" />
          <Select value={sort} onChange={e => setSort(e.target.value as any)} className="w-40">
            <option value="spent">Most spent</option><option value="orders">Most orders</option><option value="name">Name A–Z</option>
          </Select>
        </div>
        {error && <ErrorBox error={error} />}
        {loading ? <Loading label="Loading customers…" /> : <>
          <Table head={["Customer", "Email", "Subscribed", "Orders", "Amount spent", "Added"]} empty={!rows.length}>
            {shown.map(c => (
              <tr key={c.$id}>
                <Td><div className="font-medium">{c.name}</div>{!!c.tags?.length && <div className="max-w-[16rem] truncate text-xs text-zinc-400">{c.tags.join(", ")}</div>}</Td>
                <Td className="text-zinc-500">{c.email || <span className="text-zinc-400">{c.phone || "no email"}</span>}</Td>
                <Td><input type="checkbox" aria-label="Subscribed to email" checked={!!c.acceptsMarketing} disabled={!c.email} onChange={e => toggle(c, e.target.checked)} />
                  {c.unsubscribedAt && !c.acceptsMarketing && <span className="ml-1"><Badge>unsubscribed {date(c.unsubscribedAt)}</Badge></span>}</Td>
                <Td>{c.ordersCount}</Td><Td className="tabular-nums">{money(c.totalSpent, s.currency)}</Td><Td>{date(c.$createdAt)}</Td>
              </tr>
            ))}
          </Table>
          {rows.length > PAGE && (
            <div className="mt-3 flex items-center justify-between text-sm text-zinc-600">
              <span>{num(page * PAGE + 1)}–{num(Math.min(rows.length, (page + 1) * PAGE))} of {num(rows.length)}</span>
              <div className="flex gap-2"><Button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button></div>
            </div>
          )}
        </>}
      </Card>
      <Modal open={adding} title="Add customer" onClose={() => setAdding(false)} footer={<><Button onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
        <Field label="Name"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.acceptsMarketing} onChange={e => setForm({ ...form, acceptsMarketing: e.target.checked })} />Customer agreed to receive marketing emails</label>
      </Modal>
    </>
  );
}
