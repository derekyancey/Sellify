import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Circle, Mail, RefreshCw, Send } from "lucide-react";
import { useAuth } from "../context/Auth";
import { useSite } from "../context/Site";
import { ops, update } from "../lib/data";
import type { Site } from "../lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Table, Td, cx } from "../components/ui";

interface DnsRec { type: string; name: string; value: string; priority?: number; status?: string; purpose?: string }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email is a required setup step: nothing is sent until the owner confirms their email and the domain verifies. */
export default function EmailSetup({ site }: { site: Site }) {
  const { user } = useAuth();
  const { reload } = useSite();
  const confirmed = !!site.ownerEmail && !!site.senderAddress;
  const verified = site.emailStatus === "verified";

  const [ownerEmail, setOwnerEmail] = useState(site.ownerEmail || user?.email || "");
  const [senderName, setSenderName] = useState(site.senderName || site.name);
  const [localPart, setLocalPart] = useState(site.senderAddress?.split("@")[0] || "orders");
  const [records, setRecords] = useState<DnsRec[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setOwnerEmail(site.ownerEmail || user?.email || ""); setSenderName(site.senderName || site.name);
    setLocalPart(site.senderAddress?.split("@")[0] || "orders"); setRecords(null); setNote(null); setErr(null);
  }, [site.$id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setErr(null); setNote(null);
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  const save = (patch: Partial<Site>) => update("sites", site.$id, patch).then(reload);

  const saveIdentity = () => run("identity", async () => {
    if (!EMAIL_RE.test(ownerEmail)) throw new Error("Enter a valid email address for yourself.");
    if (!/^[a-z0-9._+-]+$/i.test(localPart)) throw new Error("The sender address can only use letters, numbers, dots, dashes and underscores.");
    await save({ ownerEmail: ownerEmail.trim().toLowerCase(), senderName: senderName.trim() || site.name, senderAddress: `${localPart.toLowerCase()}@${site.domain}`,
      emailStatus: site.emailStatus ?? "none" });
    setNote("Saved. Next, verify your domain so emails can be delivered.");
  });

  const setupDomain = () => run("domain", async () => {
    const res = await ops("/email/setup", { domain: site.domain, zoneId: site.cloudflareZoneId });
    setRecords(res.records);
    await save({ emailDomainId: res.domainId, emailStatus: res.status });
    setNote(site.cloudflareZoneId
      ? `Added ${res.addedToCloudflare.length} DNS record(s) to Cloudflare${res.alreadyPresent.length ? ` (${res.alreadyPresent.length} were already there)` : ""}. Verification usually takes a few minutes.`
      : "Add the records below at your DNS provider, then click Check verification.");
  });

  const check = () => run("check", async () => {
    const res = await ops("/email/status", { domainId: site.emailDomainId, domain: site.domain });
    setRecords(res.records);
    if (res.status !== site.emailStatus) await save({ emailStatus: res.status });
    setNote(res.status === "verified" ? "Domain verified. You can send email now." : "Not verified yet. DNS changes can take a few minutes, sometimes up to an hour.");
  });

  const test = () => run("test", async () => {
    const res = await ops("/email/test", { site });
    setNote(`Test email sent to ${res.to}. Check your inbox (and spam folder).`);
  });

  const toggle = (k: "emailReceipts" | "emailOwnerAlerts" | "emailShipping") => run(k, () => save({ [k]: site[k] === false }));

  return (
    <Card title={<span className="flex items-center gap-2"><Mail className="size-4" />Email for {site.domain}</span>}
      actions={verified ? <Badge tone="green">Sending enabled</Badge> : <Badge tone="yellow">Emails off until setup is done</Badge>}>
      <div id="email" className="scroll-mt-20 space-y-5">
        {err && <ErrorBox error={err} />}
        {note && <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{note}</div>}

        <Step n={1} done={confirmed} title="Your email" desc="New-order alerts go here, and customers' replies come back to it.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Your email address"><Input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="you@example.com" /></Field>
            <Field label="Sender name" hint="Shown as the sender in customers' inboxes."><Input value={senderName} onChange={e => setSenderName(e.target.value)} /></Field>
            <Field label="Send from" hint="Must be on your store's domain.">
              <div className="flex items-center gap-1"><Input value={localPart} onChange={e => setLocalPart(e.target.value)} className="w-32" /><span className="truncate text-sm text-zinc-500">@{site.domain}</span></div>
            </Field>
          </div>
          <Button className="mt-3" variant={confirmed ? "secondary" : "primary"} loading={busy === "identity"} onClick={saveIdentity}>{confirmed ? "Update" : "Confirm and save"}</Button>
        </Step>

        <Step n={2} done={verified} disabled={!confirmed} title="Verify your domain"
          desc={site.cloudflareZoneId ? "Sellify registers your domain with Resend and adds the DNS records to Cloudflare for you." : "Sellify registers your domain with Resend; you add the DNS records it shows at your DNS provider."}>
          <div className="flex flex-wrap items-center gap-2">
            {!site.emailDomainId
              ? <Button variant="primary" loading={busy === "domain"} onClick={setupDomain}>Set up sending domain</Button>
              : <>
                  <Badge tone={verified ? "green" : site.emailStatus === "failed" ? "red" : "yellow"}>{site.emailStatus}</Badge>
                  <Button loading={busy === "check"} onClick={check}><RefreshCw className="size-4" />Check verification</Button>
                  {!verified && <Button variant="ghost" loading={busy === "domain"} onClick={setupDomain}>Re-add DNS records</Button>}
                </>}
          </div>
          {records && records.length > 0 && (
            <div className="mt-3"><Table head={["Type", "Name", "Value", "Status"]}>
              {records.map(r => (
                <tr key={r.type + r.name}><Td><Badge tone="blue">{r.type}</Badge></Td><Td className="max-w-[12rem] truncate font-mono text-xs">{r.name}</Td>
                  <Td className="max-w-[16rem] truncate font-mono text-xs" >{r.priority != null ? `${r.priority} ` : ""}{r.value}</Td>
                  <Td><Badge tone={r.status === "verified" ? "green" : r.status === "failed" ? "red" : "yellow"}>{r.status || "pending"}</Badge></Td></tr>
              ))}
            </Table></div>
          )}
        </Step>

        <Step n={3} done={verified} disabled={!verified} title="Choose what gets sent" desc="Send yourself a test first.">
          <div className="space-y-2 text-sm">
            {([["emailReceipts", "Order receipts to customers"], ["emailOwnerAlerts", `New-order alerts to ${site.ownerEmail || "you"}`], ["emailShipping", "\"Your order has shipped\" emails when you fulfil an order"]] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={site[k] !== false} disabled={!verified || busy === k} onChange={() => toggle(k)} />{label}</label>
            ))}
          </div>
          <Button className="mt-3" loading={busy === "test"} disabled={!verified} onClick={test}><Send className="size-4" />Send test email</Button>
        </Step>
      </div>
    </Card>
  );
}

function Step({ n, done, disabled, title, desc, children }: { n: number; done: boolean; disabled?: boolean; title: string; desc: string; children: ReactNode }) {
  return (
    <section className={cx("flex gap-3", disabled && "pointer-events-none opacity-50")} aria-disabled={disabled}>
      <div className="pt-0.5">{done ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Circle className="size-5 text-zinc-300" />}</div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">Step {n}: {title}</h3>
        <p className="mb-2 text-sm text-zinc-500">{desc}</p>
        {children}
      </div>
    </section>
  );
}
