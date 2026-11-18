import { useState } from "react";
import { Link2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useSite } from "../context/Site";
import { ops } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, NeedsSetup, PageHeader, Select, Table, Td } from "../components/ui";

interface DnsRecord { id?: string; type: string; name: string; content: string; ttl: number; proxied: boolean; priority?: number }
const TYPES = ["A", "AAAA", "CNAME", "TXT", "MX", "NS", "CAA", "SRV"];

export default function Domains() {
  const { site } = useSite(); const s = site!;
  if (!s.cloudflareZoneId) return <><PageHeader title="Domain & DNS" /><NeedsSetup what="Cloudflare" /></>;
  return <DomainsInner key={s.$id} />;
}

function DomainsInner() {
  const { site } = useSite(); const s = site!;
  const zoneId = s.cloudflareZoneId!;
  const zone = useAsync(() => ops("/cloudflare/zone", { zoneId, domain: s.domain }), [zoneId]);
  const dns = useAsync(() => ops<{ records: DnsRecord[] }>("/cloudflare/dns/list", { zoneId, domain: s.domain }), [zoneId]);
  const [editing, setEditing] = useState<DnsRecord | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); setMsg(ok); dns.reload(); } catch (e: any) { setMsg(`Error: ${e.message}`); } finally { setBusy(null); }
  };
  const z = zone.data;

  return (
    <>
      <PageHeader title="Domain & DNS" subtitle={`${s.domain} · managed by Cloudflare`} actions={<>
        <Button loading={busy === "purge"} onClick={() => act("purge", () => ops("/cloudflare/purge", { zoneId }), "Cloudflare cache purged.")}><RefreshCw className="size-4" />Purge cache</Button>
        {s.netlifySiteId && <Button loading={busy === "connect"} onClick={() => confirm(`Point ${s.domain} and www.${s.domain} at Netlify? Existing apex/www A, AAAA and CNAME records will be replaced.`) &&
          act("connect", () => ops("/cloudflare/connect-netlify", { zoneId, domain: s.domain, netlifySiteId: s.netlifySiteId }), "Domain pointed at Netlify. SSL can take a few minutes to issue.")}><Link2 className="size-4" />Point to Netlify</Button>}
      </>} />
      {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.startsWith("Error") ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{msg}</div>}

      <Card title="Domain status" className="mb-4">
        {zone.loading ? <Loading /> : zone.error ? <ErrorBox error={zone.error} /> : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{z.name}</span>
              <Badge tone={z.status === "active" ? "green" : "yellow"}>{z.status}</Badge>
              <Badge>{z.plan?.name}</Badge>
            </div>
            {z.status !== "active" ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <div className="font-medium">Finish moving DNS from Namecheap to Cloudflare</div>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                  <li>In Namecheap go to <em>Domain List → Manage → Nameservers</em>.</li>
                  <li>Choose <em>Custom DNS</em> and enter: <code className="font-semibold">{z.name_servers?.join(", ")}</code></li>
                  <li>Save. Cloudflare usually activates within an hour (up to 24h).</li>
                </ol>
              </div>
            ) : (
              <p className="text-zinc-600">Nameservers: <code>{z.name_servers?.join(", ")}</code> — set at Namecheap ✓</p>
            )}
          </div>
        )}
      </Card>

      <Card title="DNS records" actions={<Button variant="primary" onClick={() => setEditing({ type: "A", name: s.domain, content: "", ttl: 1, proxied: true })}><Plus className="size-4" />Add record</Button>}>
        {dns.loading ? <Loading /> : dns.error ? <ErrorBox error={dns.error} /> : (
          <Table head={["Type", "Name", "Content", "Proxy", "TTL", ""]} empty={!dns.data!.records.length}>
            {dns.data!.records.map(r => (
              <tr key={r.id}>
                <Td><Badge tone="blue">{r.type}</Badge></Td>
                <Td className="max-w-[12rem] truncate font-medium">{r.name}</Td>
                <Td className="max-w-[18rem] truncate font-mono text-xs text-zinc-600">{r.priority != null && r.type === "MX" ? `${r.priority} ` : ""}{r.content}</Td>
                <Td>{r.proxied ? <Badge tone="yellow">Proxied</Badge> : <Badge>DNS only</Badge>}</Td>
                <Td>{r.ttl === 1 ? "Auto" : r.ttl}</Td>
                <Td className="whitespace-nowrap text-right">
                  <button className="p-1 text-zinc-400 hover:text-zinc-800" onClick={() => setEditing(r)} aria-label="Edit"><Pencil className="size-4" /></button>
                  <button className="p-1 text-zinc-400 hover:text-red-600" aria-label="Delete" onClick={() => confirm(`Delete ${r.type} ${r.name}?`) && act("del", () => ops("/cloudflare/dns/delete", { zoneId, recordId: r.id }), "Record deleted.")}><Trash2 className="size-4" /></button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-3 text-xs text-zinc-500">Tip: records pointing at Netlify should be <strong>DNS only</strong> so Netlify can issue the SSL certificate.</p>
      </Card>

      {editing && <RecordForm initial={editing} onClose={() => setEditing(null)} onSave={async rec => {
        await ops(rec.id ? "/cloudflare/dns/update" : "/cloudflare/dns/create", { zoneId, recordId: rec.id, record: rec });
        setEditing(null); setMsg("DNS record saved."); dns.reload();
      }} />}
    </>
  );
}

function RecordForm({ initial, onClose, onSave }: { initial: DnsRecord; onClose(): void; onSave(r: DnsRecord): Promise<void> }) {
  const [r, setR] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canProxy = ["A", "AAAA", "CNAME"].includes(r.type);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await onSave({ ...r, proxied: canProxy && r.proxied }); } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal open title={r.id ? "Edit DNS record" : "Add DNS record"} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      {err && <ErrorBox error={err} />}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Type"><Select value={r.type} onChange={e => setR({ ...r, type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</Select></Field>
        <div className="col-span-2"><Field label="Name" hint="Use @ or the domain for the root"><Input value={r.name} onChange={e => setR({ ...r, name: e.target.value })} /></Field></div>
      </div>
      <Field label="Content"><Input value={r.content} onChange={e => setR({ ...r, content: e.target.value })} placeholder={r.type === "CNAME" ? "your-site.netlify.app" : r.type === "A" ? "192.0.2.1" : ""} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="TTL"><Select value={r.ttl} onChange={e => setR({ ...r, ttl: +e.target.value })}>{[[1, "Auto"], [300, "5 min"], [3600, "1 hour"], [86400, "1 day"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        {r.type === "MX" && <Field label="Priority"><Input type="number" value={r.priority ?? 10} onChange={e => setR({ ...r, priority: +e.target.value })} /></Field>}
      </div>
      {canProxy && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.proxied} onChange={e => setR({ ...r, proxied: e.target.checked })} />Proxy through Cloudflare (orange cloud)</label>}
    </Modal>
  );
}
