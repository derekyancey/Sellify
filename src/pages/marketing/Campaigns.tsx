import { useMemo, useState } from "react";
import { useSort } from "../../lib/useSort";
import { Link } from "react-router-dom";
import { Plus, Send } from "lucide-react";
import { useSite, useStorePath } from "../../context/Site";
import { create, list, ops, remove, update } from "../../lib/data";
import { useAsync } from "../../lib/useAsync";
import { dateTime } from "../../lib/format";
import { BUILT_IN, matches, resolveSegment } from "../../lib/segments";
import type { Campaign } from "../../lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td } from "../../components/ui";

const RESEND_FREE_DAILY = 100;

export default function Campaigns() {
  const { site } = useSite(); const s = site!;
  const sp = useStorePath();
  const { data, loading, error, reload } = useAsync(async () => {
    const [campaigns, templates, segments, customers] = await Promise.all([list("campaigns", s.$id), list("templates", s.$id), list("segments", s.$id), list("customers", s.$id)]);
    return { campaigns, templates, segments, customers };
  }, [s.$id]);
  const [editing, setEditing] = useState<Partial<Campaign> | null>(null);
  const sort = useSort(data?.campaigns ?? [], {
    name: c => c.name, status: c => c.status, audience: c => resolveSegment(c.segmentId, data?.segments ?? [])?.name,
    sent: c => (c.status === "sent" ? c.sentCount : null), date: c => c.sentAt || c.$createdAt,
  }, { id: "campaigns" });
  if (loading || !data) return <Loading />;
  const segName = (id: string) => resolveSegment(id, data.segments)?.name ?? "deleted segment";

  return (
    <>
      <PageHeader title="Campaigns" subtitle="Email your subscribers. Only customers who opted in to marketing are ever emailed."
        actions={<Button variant="primary" disabled={!data.templates.length} onClick={() => setEditing({ name: "", segmentId: "subscribers", templateId: data.templates[0]?.$id, subject: data.templates[0]?.subject })}><Plus className="size-4" />Create campaign</Button>} />
      {error && <ErrorBox error={error} />}
      {s.emailStatus !== "verified" && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Finish <Link className="underline" to={sp("/settings#email")}>email setup</Link> before sending campaigns.</div>}
      {!data.templates.length && <div className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">First, <Link className="underline" to={sp("/marketing/designer")}>design an email template</Link>.</div>}
      <Card>
        <Table head={[sort.th("Campaign", "name"), sort.th("Status", "status"), sort.th("Audience", "audience"), sort.th("Sent", "sent"), sort.th("Date", "date")]} empty={!data.campaigns.length}>
          {sort.rows.map(c => (
            <tr key={c.$id} className="cursor-pointer hover:bg-zinc-50" onClick={() => setEditing(c)}>
              <Td><div className="font-medium">{c.name}</div><div className="text-xs text-zinc-500">{c.subject}</div></Td>
              <Td><Badge tone={c.status === "sent" ? "green" : c.status === "failed" ? "red" : c.status === "sending" ? "yellow" : "gray"}>{c.status}</Badge></Td>
              <Td>{segName(c.segmentId)}</Td><Td>{c.status === "sent" ? c.sentCount : "–"}</Td><Td>{c.sentAt ? dateTime(c.sentAt) : dateTime(c.$createdAt)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      {editing && <Editor initial={editing} data={data} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function Editor({ initial, data, onClose, onDone }: { initial: Partial<Campaign>; data: any; onClose(): void; onDone(): void }) {
  const { site } = useSite(); const s = site!;
  const [c, setC] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(initial.error ?? null);
  const locked = c.status === "sent" || c.status === "sending";
  const segment = resolveSegment(c.segmentId ?? "", data.segments);
  const recipients = useMemo(() => !segment ? [] : (data.customers as any[]).filter(cu => cu.acceptsMarketing && cu.email && matches(cu, segment.rules)), [segment, data.customers]);
  const template = data.templates.find((t: any) => t.$id === c.templateId);

  const persist = async () => {
    const body = { name: c.name?.trim() || "Untitled campaign", subject: c.subject ?? "", templateId: c.templateId!, segmentId: c.segmentId! };
    if (c.$id) { await update("campaigns", c.$id, body); return c.$id; }
    const row = await create("campaigns", { ...body, siteId: s.$id, status: "draft", sentCount: 0 });
    setC(x => ({ ...x, $id: row.$id })); return row.$id;
  };
  const saveDraft = async () => { setBusy("save"); try { await persist(); onDone(); } catch (e: any) { setErr(e.message); setBusy(null); } };

  const send = async () => {
    setErr(null);
    if (!template) { setErr("Choose a template."); return; }
    if (!template.html.includes("{{unsubscribe_url}}")) { setErr("The template needs an {{unsubscribe_url}} link. Add one in the Email designer."); return; }
    if (!recipients.length) { setErr("No subscribed customers in this audience."); return; }
    if (!confirm(`Send "${c.subject}" to ${recipients.length} subscriber${recipients.length === 1 ? "" : "s"} now?`)) return;
    setBusy("send");
    let id: string | undefined;
    try {
      id = await persist();
      await update("campaigns", id, { status: "sending" });
      const res = await ops("/email/campaign", { site: s, campaignId: id, subject: c.subject, html: template.html,
        recipients: recipients.map(r => ({ email: r.email, name: r.name, customerId: r.$id })) });
      await update("campaigns", id, { status: res.failed ? "failed" : "sent", sentCount: res.sent, sentAt: new Date().toISOString(), error: res.failed ? `${res.failed} failed: ${res.error ?? ""}` : undefined });
      onDone();
    } catch (e: any) {
      setErr(e.message); setBusy(null);
      if (id) await update("campaigns", id, { status: "failed", error: e.message }).catch(() => {});
    }
  };

  return (
    <Modal open title={c.$id ? c.name || "Campaign" : "Create campaign"} onClose={onClose} footer={locked ? <Button onClick={onClose}>Close</Button> : <>
      {c.$id && <Button variant="ghost" className="mr-auto text-red-600" onClick={async () => { if (confirm("Delete this draft?")) { await remove("campaigns", c.$id!); onDone(); } }}>Delete</Button>}
      <Button loading={busy === "save"} onClick={saveDraft}>Save draft</Button>
      <Button variant="primary" loading={busy === "send"} disabled={s.emailStatus !== "verified"} onClick={send}><Send className="size-4" />Send now</Button></>}>
      {err && <ErrorBox error={err} />}
      <Field label="Campaign name (internal)"><Input disabled={locked} value={c.name ?? ""} onChange={e => setC({ ...c, name: e.target.value })} placeholder="November newsletter" /></Field>
      <Field label="Template">
        <Select disabled={locked} value={c.templateId} onChange={e => { const t = data.templates.find((x: any) => x.$id === e.target.value); setC({ ...c, templateId: e.target.value, subject: c.subject || t?.subject }); }}>
          {data.templates.map((t: any) => <option key={t.$id} value={t.$id}>{t.name}</option>)}
        </Select>
      </Field>
      <Field label="Subject line"><Input disabled={locked} value={c.subject ?? ""} onChange={e => setC({ ...c, subject: e.target.value })} /></Field>
      <Field label="Audience" hint="Only customers subscribed to marketing are included, whatever the segment.">
        <Select disabled={locked} value={c.segmentId} onChange={e => setC({ ...c, segmentId: e.target.value })}>
          <optgroup label="Built-in">{BUILT_IN.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>
          {data.segments.length > 0 && <optgroup label="Your segments">{data.segments.map((sg: any) => <option key={sg.$id} value={sg.$id}>{sg.name}</option>)}</optgroup>}
        </Select>
      </Field>
      <div className="rounded-lg bg-zinc-50 px-3 py-2 text-sm">
        {locked ? <>Sent to <strong>{c.sentCount}</strong> subscribers {c.sentAt && `on ${dateTime(c.sentAt)}`}.</> : <><strong>{recipients.length}</strong> subscribed recipient{recipients.length === 1 ? "" : "s"}.</>}
        {!locked && recipients.length > RESEND_FREE_DAILY && <div className="mt-1 text-amber-700">Resend's free plan sends {RESEND_FREE_DAILY} emails/day; larger sends need a paid plan or will partly fail.</div>}
      </div>
      {template && <iframe title="Preview" srcDoc={template.html} className="h-64 w-full rounded-lg border border-zinc-200" sandbox="" />}
    </Modal>
  );
}
