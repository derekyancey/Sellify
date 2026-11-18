import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Mail, Play, ShoppingCart, UserPlus, Undo2 } from "lucide-react";
import { useSite, useStorePath } from "../../context/Site";
import { automations as runAutomations, create, list, update } from "../../lib/data";
import { useAsync } from "../../lib/useAsync";
import { dateTime } from "../../lib/format";
import type { Automation, AutomationType } from "../../lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select } from "../../components/ui";

const KINDS: { type: AutomationType; title: string; icon: typeof Mail; desc: string; delayLabel: string; unit: "hours" | "days"; defaultDelay: number; needsTemplate: boolean }[] = [
  { type: "abandoned_cart", title: "Abandoned cart reminder", icon: ShoppingCart, needsTemplate: false, unit: "hours", defaultDelay: 4, delayLabel: "Send after (hours)",
    desc: "Emails shoppers who started checkout but didn't pay, with a link that restores their cart. Sent once per cart, within 7 days, and skipped if they've bought since." },
  { type: "welcome", title: "Welcome email", icon: UserPlus, needsTemplate: true, unit: "hours", defaultDelay: 0, delayLabel: "Send after (hours)",
    desc: "Greets new email subscribers once, using a template from the Email designer." },
  { type: "winback", title: "Win-back email", icon: Undo2, needsTemplate: true, unit: "days", defaultDelay: 60, delayLabel: "Days since last order",
    desc: "Nudges subscribers who haven't ordered in a while. Sent once per gap between orders." },
];

export default function Automations() {
  const { site } = useSite(); const s = site!;
  const sp = useStorePath();
  const { data, loading, error, reload } = useAsync(async () => ({ autos: await list("automations", s.$id), templates: await list("templates", s.$id) }), [s.$id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<{ mode: string; results: any[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const verified = s.emailStatus === "verified";

  const save = async (type: AutomationType, patch: Partial<Automation>) => {
    setBusy(type); setErr(null);
    try {
      const existing = data!.autos.find(a => a.type === type);
      if (existing) await update("automations", existing.$id, patch);
      else await create("automations", { siteId: s.$id, type, enabled: false, sentCount: 0, ...patch });
      await reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  const run = async (mode: "preview" | "run") => {
    if (mode === "run" && !confirm("Send all due automation emails for this store now?")) return;
    setBusy(mode); setErr(null);
    try { const r = await runAutomations(mode, s.$id); setReport({ mode, results: r.results.filter((x: any) => !x.siteId || x.siteId === s.$id) }); reload(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  if (loading || !data) return <Loading />;
  return (
    <>
      <PageHeader title="Automations" subtitle="Emails that send themselves. Checked every hour on a schedule (part of your site-ops function, so it's free)."
        actions={<><Button loading={busy === "preview"} onClick={() => run("preview")}><Eye className="size-4" />Preview due emails</Button>
          <Button variant="primary" disabled={!verified} loading={busy === "run"} onClick={() => run("run")}><Play className="size-4" />Run now</Button></>} />
      {!verified && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Automations stay paused until <Link className="underline" to={sp("/settings#email")}>email setup</Link> is verified.</div>}
      {(err || error) && <div className="mb-4"><ErrorBox error={err || error!} /></div>}
      {report && (
        <div className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <strong>{report.mode === "preview" ? "Due now (nothing sent):" : "Sent:"}</strong>{" "}
          {report.results.length ? report.results.map(r => r.skipped ? r.skipped : `${KINDS.find(k => k.type === r.type)?.title}: ${report.mode === "preview" ? r.eligible : r.sent}${r.note ? ` (${r.note})` : ""}${r.error ? ` (error: ${r.error})` : ""}`).join(" · ") : "no automations are switched on."}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {KINDS.map(k => {
          const a = data.autos.find(x => x.type === k.type);
          const delay = a?.delayHours ?? (k.unit === "days" ? k.defaultDelay * 24 : k.defaultDelay);
          const missingTemplate = k.needsTemplate && !a?.templateId;
          return (
            <Card key={k.type} title={<span className="flex items-center gap-2"><k.icon className="size-4" />{k.title}</span>}
              actions={a?.enabled ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}>
              <p className="mb-3 text-sm text-zinc-600">{k.desc}</p>
              <div className="space-y-3">
                <Field label={k.delayLabel}>
                  <Input type="number" min={0} defaultValue={k.unit === "days" ? Math.round(delay / 24) : delay} key={a?.$id ?? "new"}
                    onBlur={e => { const v = Math.max(0, +e.target.value || 0); save(k.type, { delayHours: k.unit === "days" ? v * 24 : v }); }} className="w-28" />
                </Field>
                {k.needsTemplate && <>
                  <Field label="Template" hint={!data.templates.length ? <Link className="underline" to={sp("/marketing/designer")}>Design a template first</Link> : undefined}>
                    <Select value={a?.templateId ?? ""} onChange={e => save(k.type, { templateId: e.target.value || undefined })}>
                      <option value="">Choose…</option>{data.templates.map(t => <option key={t.$id} value={t.$id}>{t.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Subject (optional)"><Input defaultValue={a?.subject ?? ""} key={(a?.$id ?? "n") + "s"} placeholder="Uses the template's subject" onBlur={e => save(k.type, { subject: e.target.value || undefined })} /></Field>
                </>}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!a?.enabled} disabled={busy === k.type || missingTemplate} onChange={e => save(k.type, { enabled: e.target.checked, delayHours: delay })} />
                  {missingTemplate ? "Choose a template to switch this on" : "Switched on"}
                </label>
                <div className="text-xs text-zinc-500">{a?.sentCount ? `${a.sentCount} sent` : "Nothing sent yet"}{a?.lastRunAt ? ` · last sent ${dateTime(a.lastRunAt)}` : ""}</div>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-zinc-500">Welcome and win-back emails only go to customers subscribed to marketing and always include an unsubscribe link. Each run sends at most 50 emails, because Resend's free plan allows 100 a day.</p>
    </>
  );
}
