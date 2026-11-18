import { useState } from "react";
import { Plus } from "lucide-react";
import { useSite } from "../context/Site";
import { create, list, update } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { date, money } from "../lib/format";
import { Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Table, Td } from "../components/ui";
import { downloadCsv } from "./Orders";

export default function Customers() {
  const { site } = useSite(); const s = site!;
  const { data, loading, error, reload } = useAsync(() => list("customers", s.$id), [s.$id]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", acceptsMarketing: false });
  const rows = (data ?? []).filter(c => !q || `${c.name} ${c.email}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.totalSpent - a.totalSpent);

  const save = async () => {
    if (!form.name || !form.email) return;
    await create("customers", { ...form, siteId: s.$id, ordersCount: 0, totalSpent: 0 });
    setAdding(false); setForm({ name: "", email: "", phone: "", acceptsMarketing: false }); reload();
  };

  return (
    <>
      <PageHeader title="Customers" subtitle={`${data?.length ?? 0} customers`} actions={<>
        <Button onClick={() => downloadCsv(`${s.domain}-customers.csv`, rows.map(c => ({ name: c.name, email: c.email, phone: c.phone ?? "", subscribed: c.acceptsMarketing ? "yes" : "no", orders: c.ordersCount, spent: c.totalSpent })))}>Export</Button>
        <Button variant="primary" onClick={() => setAdding(true)}><Plus className="size-4" />Add customer</Button>
      </>} />
      <Card>
        <Input placeholder="Search customers" value={q} onChange={e => setQ(e.target.value)} className="mb-3 sm:max-w-xs" />
        {error && <ErrorBox error={error} />}
        {loading ? <Loading /> : (
          <Table head={["Customer", "Email", "Subscribed", "Orders", "Amount spent", "Since"]} empty={!rows.length}>
            {rows.map(c => (
              <tr key={c.$id}><Td className="font-medium">{c.name}</Td><Td className="text-zinc-500">{c.email}</Td>
                <Td><input type="checkbox" aria-label="Subscribed to email" checked={!!c.acceptsMarketing} onChange={async e => { await update("customers", c.$id, { acceptsMarketing: e.target.checked }); reload(); }} /></Td>
                <Td>{c.ordersCount}</Td><Td className="tabular-nums">{money(c.totalSpent, s.currency)}</Td><Td>{date(c.$createdAt)}</Td></tr>
            ))}
          </Table>
        )}
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
