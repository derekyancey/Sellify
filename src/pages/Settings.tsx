import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Plus, XCircle } from "lucide-react";
import { useSite } from "../context/Site";
import { create, ops, remove, resetDemo, update } from "../lib/data";
import { config, isDemo } from "../lib/appwrite";
import { useAsync } from "../lib/useAsync";
import type { Site } from "../lib/types";
import EmailSetup from "./EmailSetup";
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Table, Td } from "../components/ui";

type Draft = Omit<Site, "$id" | "$createdAt"> & { $id?: string };
const blank: Draft = { name: "", domain: "", currency: "USD", cloudflareZoneId: "", netlifySiteId: "", gscProperty: "", ga4PropertyId: "" };

export default function SettingsPage() {
  const { sites, site, select, reload } = useSite();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Draft | null>(params.get("new") ? { ...blank } : null);
  useEffect(() => { if (params.get("new")) setEditing({ ...blank }); }, [params]);
  useEffect(() => {
    if (location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 150);
  }, []);

  return (
    <>
      <PageHeader title="Sites & settings" subtitle="Each site gets its own store, analytics, DNS and deploys."
        actions={<Button variant="primary" onClick={() => setEditing({ ...blank })}><Plus className="size-4" />Add site</Button>} />
      <div className="space-y-4">
        {editing && <SiteForm initial={editing} onDone={async (saved) => {
          setEditing(null); setParams({});
          await reload(); if (saved) select(saved);
        }} />}
        <Card title="Your sites">
          <Table head={["Site", "Domain", "Cloudflare", "Netlify", "Search Console", "GA4", ""]} empty={!sites.length}>
            {sites.map(s => (
              <tr key={s.$id} className={s.$id === site?.$id ? "bg-zinc-50" : ""}>
                <Td className="font-medium">{s.name}</Td><Td>{s.domain}</Td>
                {[s.cloudflareZoneId, s.netlifySiteId, s.gscProperty, s.ga4PropertyId].map((v, i) =>
                  <Td key={i}>{v ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-zinc-300" />}</Td>)}
                <Td className="text-right"><Button variant="ghost" onClick={() => setEditing({ ...s })}>Edit</Button></Td>
              </tr>
            ))}
          </Table>
        </Card>
        {site && <EmailSetup site={site} />}
        {site && <SellOnSite site={site} />}
        <IntegrationStatus />
        {isDemo && (
          <Card title="Demo mode">
            <p className="mb-3 text-sm text-zinc-600">You're seeing sample data saved in this browser. Add your Appwrite project ID to <code>.env</code> to switch to your real backend (see README).</p>
            <Button onClick={() => { resetDemo(); location.reload(); }}>Reset demo data</Button>
          </Card>
        )}
      </div>
    </>
  );
}

function SiteForm({ initial, onDone }: { initial: Draft; onDone(savedId?: string): void }) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const set = (k: keyof Draft, v: string) => setD(x => ({ ...x, [k]: v }));
  const netlifySites = useAsync(() => ops<{ sites: { id: string; name: string; url: string }[] }>("/netlify/sites").catch(() => ({ sites: [] })), []);
  const cleanDomain = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

  const findZone = async (createIfMissing: boolean) => {
    setErr(null); setNote(null);
    try {
      const domain = cleanDomain(d.domain);
      const res = await ops(createIfMissing ? "/cloudflare/zones/create" : "/cloudflare/zones/find", { domain });
      const zone = createIfMissing ? res.zone : res.zones?.[0];
      if (zone) { set("cloudflareZoneId", zone.id); setNote(createIfMissing ? `Added ${domain} to Cloudflare. Now set these nameservers at Namecheap: ${zone.name_servers.join(", ")}` : `Found Cloudflare zone (${zone.status}).`); }
      else setNote(`${domain} isn't in your Cloudflare account yet — click "Add to Cloudflare".`);
    } catch (e: any) { setErr(e.message); }
  };

  const save = async () => {
    const domain = cleanDomain(d.domain);
    if (!d.name.trim() || !domain) { setErr("Name and domain are required."); return; }
    setBusy(true);
    const { $id, ...rest } = d as any; delete rest.$createdAt;
    const data = { ...rest, domain, gscProperty: rest.gscProperty || `sc-domain:${domain}` };
    try {
      const saved = $id ? await update("sites", $id, data) : await create("sites", data);
      onDone(saved.$id);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const del = async () => {
    if (d.$id && confirm(`Remove ${d.name} from the dashboard? (Its products/orders stay in Appwrite; DNS and hosting are untouched.)`)) { await remove("sites", d.$id); onDone(); }
  };

  return (
    <Card title={d.$id ? `Edit ${initial.name}` : "Add a site"}>
      <div className="grid gap-4 md:grid-cols-2">
        {err && <div className="md:col-span-2"><ErrorBox error={err} /></div>}
        {note && <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 md:col-span-2">{note}</div>}
        <Field label="Store name"><Input value={d.name} onChange={e => set("name", e.target.value)} placeholder="My Shop" /></Field>
        <Field label="Domain" hint="The Namecheap domain, without https://"><Input value={d.domain} onChange={e => set("domain", e.target.value)} placeholder="myshop.com" /></Field>
        <Field label="Currency"><Select value={d.currency} onChange={e => set("currency", e.target.value)}>{["USD", "CAD", "EUR", "GBP", "AUD"].map(c => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Netlify site" hint="The Netlify site that hosts this domain.">
          {netlifySites.loading ? <Loading /> : netlifySites.data?.sites.length ? (
            <Select value={d.netlifySiteId} onChange={e => set("netlifySiteId", e.target.value)}>
              <option value="">— none —</option>
              {netlifySites.data.sites.map(n => <option key={n.id} value={n.id}>{n.name} ({n.url.replace(/^https?:\/\//, "")})</option>)}
            </Select>
          ) : <Input value={d.netlifySiteId} onChange={e => set("netlifySiteId", e.target.value)} placeholder="Netlify site ID (Site configuration → General)" />}
        </Field>
        <Field label="Cloudflare zone ID" hint={<span className="flex gap-3"><button type="button" className="underline" onClick={() => findZone(false)}>Find by domain</button><button type="button" className="underline" onClick={() => findZone(true)}>Add to Cloudflare</button></span>}>
          <Input value={d.cloudflareZoneId} onChange={e => set("cloudflareZoneId", e.target.value)} />
        </Field>
        <Field label="Search Console property" hint="Leave blank to use sc-domain:yourdomain (a domain property).">
          <Input value={d.gscProperty} onChange={e => set("gscProperty", e.target.value)} placeholder={`sc-domain:${cleanDomain(d.domain) || "example.com"}`} />
        </Field>
        <Field label="GA4 property ID" hint="Numbers only: GA → Admin → Property details.">
          <Input value={d.ga4PropertyId} onChange={e => set("ga4PropertyId", e.target.value.replace(/\D/g, ""))} placeholder="123456789" />
        </Field>
      </div>
      <div className="mt-4 flex gap-2">
        {d.$id && <Button variant="ghost" className="text-red-600" onClick={del}>Remove site</Button>}
        <Button className="ml-auto" onClick={() => onDone()}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={save}>Save site</Button>
      </div>
    </Card>
  );
}

function IntegrationStatus() {
  const { data, error, loading } = useAsync(() => ops("/health"), []);
  const items = [
    ["cloudflare", "Cloudflare", "CLOUDFLARE_API_TOKEN"],
    ["netlify", "Netlify", "NETLIFY_AUTH_TOKEN"],
    ["google", "Google (Search Console + GA4)", "GOOGLE_SERVICE_ACCOUNT_JSON"],
    ["stripe", "Stripe (cards, Apple Pay, Google Pay)", "STRIPE_SECRET_KEY on both functions, and STRIPE_WEBHOOK_SECRET on checkout"],
    ["paypal", "PayPal", "PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV on both functions"],
    ["email", "Email (Resend)", "RESEND_API_KEY on both functions"],
  ] as const;
  return (
    <Card title="Integration status">
      {loading ? <Loading /> : error ? <ErrorBox error={`Couldn't reach the site-ops function: ${error}`} hint="Deploy appwrite/functions/site-ops (see README)." /> : (
        <ul className="space-y-2 text-sm">
          {items.map(([k, label, env]) => (
            <li key={k} className="flex items-start gap-2">
              {data.integrations[k] ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 text-red-500" />}
              <div><div className="font-medium">{label}</div>{!data.integrations[k] && <div className="text-zinc-500">Set <code>{env}</code>{k === "stripe" || k === "paypal" || k === "email" ? "" : " on the site-ops function"}.</div>}</div>
            </li>
          ))}
          {data.serviceAccountEmail && <li className="rounded-lg bg-zinc-50 p-2 text-zinc-600">Add <code className="font-semibold text-zinc-900">{data.serviceAccountEmail}</code> as a user in each GA4 property (Viewer) and Search Console property (Full).</li>}
        </ul>
      )}
    </Card>
  );
}

export function SellOnSite({ site }: { site: Site }) {
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="${location.origin}/sellify.js"
        data-endpoint="${config.endpoint}"
        data-project="${config.projectId || "YOUR_APPWRITE_PROJECT_ID"}"
        data-site="${site.$id}"
        data-success-url="/thank-you"></script>`;
  const copy = async () => { try { await navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  return (
    <Card title={`Sell on ${site.domain}`} actions={<Button onClick={copy}>{copied ? "Copied!" : "Copy snippet"}</Button>}>
      <p className="mb-2 text-sm text-zinc-600">Paste this into your site's HTML, then use <code>Sellify.cart.add(id)</code> and <code>Sellify.checkout("stripe" | "paypal")</code>. Stripe shows card, Apple Pay and Google Pay on one page. Paid orders appear under Orders automatically.</p>
      <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">{snippet}</pre>
      <p className="mt-2 text-xs text-zinc-500">Also add <strong>{site.domain}</strong> as a Web platform in Appwrite. For a complete starter page, see <code>examples/storefront.html</code> in the repo.</p>
    </Card>
  );
}
