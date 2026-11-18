import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Globe } from "lucide-react";
import { useSite, useStorePath } from "../context/Site";
import { ops, remove, update } from "../lib/data";
import { config } from "../lib/appwrite";
import { useAsync } from "../lib/useAsync";
import type { Site } from "../lib/types";
import EmailSetup from "./EmailSetup";
import GoogleConnect from "./GoogleConnect";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select } from "../components/ui";

export const cleanDomain = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function Section({ id, title, desc, children }: { id: string; title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 grid grid-cols-1 gap-4 border-b border-zinc-200 py-6 last:border-0 lg:grid-cols-3">
      <div className="min-w-0"><h2 className="font-semibold">{title}</h2>{desc && <p className="mt-1 text-sm text-zinc-500">{desc}</p>}</div>
      <div className="min-w-0 lg:col-span-2">{children}</div>
    </section>
  );
}

export default function StoreSettings() {
  const { site, sites, reload } = useSite(); const s = site!;
  const sp = useStorePath();
  const navigate = useNavigate();
  const { hash } = useLocation();
  useEffect(() => { if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 150); }, [hash]);
  const save = async (patch: Partial<Site>) => { await update("sites", s.$id, patch); await reload(); };

  return (
    <>
      <PageHeader title="Store settings" subtitle={s.name} />
      <div className="rounded-xl border border-zinc-200 bg-white px-5 shadow-sm">
        <Section id="general" title="General" desc="Shown on receipts, emails and in your store list."><General site={s} save={save} /></Section>
        <Section id="url" title="Store URL" desc="The web address customers visit. You can add one later or change it any time.">
          <StoreUrl site={s} others={sites.filter(x => x.$id !== s.$id)} save={save} sp={sp} />
        </Section>
        <Section id="connections" title="Connections" desc="Hosting, DNS and Google accounts for this store.">
          {s.domain ? <Connections site={s} save={save} /> : <p className="text-sm text-zinc-500">Add a store URL first.</p>}
        </Section>
        <Section id="email-section" title="Email" desc="Receipts, order alerts and marketing for this store.">
          {s.domain ? <EmailSetup site={s} /> : <p className="text-sm text-zinc-500">Add a store URL first: emails are sent from an address on it.</p>}
        </Section>
        <Section id="sell" title="Sell on your site" desc="Add cart and checkout to this store's website.">
          {s.domain ? <SellOnSite site={s} /> : <p className="text-sm text-zinc-500">Add a store URL first.</p>}
        </Section>
        <Section id="danger" title="Remove store" desc="Removes it from Yancey. Its products and orders stay in your database; DNS and hosting are untouched.">
          <Button variant="danger" onClick={async () => {
            if (!confirm(`Remove ${s.name} from Yancey?`)) return;
            await remove("sites", s.$id); await reload(); navigate("/stores");
          }}>Remove {s.name}</Button>
        </Section>
      </div>
    </>
  );
}

function General({ site, save }: { site: Site; save(p: Partial<Site>): Promise<void> }) {
  const [name, setName] = useState(site.name);
  const [currency, setCurrency] = useState(site.currency);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = name.trim() !== site.name || currency !== site.currency;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Store name"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Currency"><Select value={currency} onChange={e => setCurrency(e.target.value)}>{["USD", "CAD", "EUR", "GBP", "AUD"].map(c => <option key={c}>{c}</option>)}</Select></Field>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={!dirty || !name.trim()} onClick={async () => { await save({ name: name.trim(), currency }); setMsg("Saved."); }}>Save</Button>
        {msg && <span className="text-sm text-emerald-700">{msg}</span>}
      </div>
    </div>
  );
}

/** Add or change the store's URL. Changing it resets what was tied to the old domain. */
function StoreUrl({ site, others, save, sp }: { site: Site; others: Site[]; save(p: Partial<Site>): Promise<void>; sp(p: string): string }) {
  const [editing, setEditing] = useState(!site.domain);
  const [value, setValue] = useState(site.domain ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setValue(site.domain ?? ""); setEditing(!site.domain); }, [site.domain]);

  const submit = async () => {
    const domain = cleanDomain(value);
    setErr(null);
    if (!DOMAIN_RE.test(domain)) { setErr("Enter a domain like mystore.com (no https:// needed)."); return; }
    if (domain === site.domain) { setEditing(false); return; }
    const clash = others.find(o => o.domain === domain);
    if (clash) { setErr(`${domain} is already used by ${clash.name}.`); return; }
    const patch: Partial<Site> = { domain };
    if (site.domain) {
      const resets = [
        site.cloudflareZoneId && "the Cloudflare connection (the new domain has its own zone)",
        site.emailDomainId && "email verification (you'll verify the new domain)",
        site.gscProperty === `sc-domain:${site.domain}` && "the Search Console property (switched to the new domain)",
      ].filter(Boolean);
      if (!confirm(`Change ${site.domain} to ${domain}?${resets.length ? `\n\nThis resets:\n• ${resets.join("\n• ")}` : ""}\n\nYour products, orders and customers are not affected.`)) return;
      Object.assign(patch, {
        cloudflareZoneId: undefined, emailDomainId: undefined, emailStatus: "none",
        senderAddress: site.senderAddress ? `${site.senderAddress.split("@")[0]}@${domain}` : undefined,
        gscProperty: !site.gscProperty || site.gscProperty === `sc-domain:${site.domain}` ? `sc-domain:${domain}` : site.gscProperty,
      });
    } else {
      patch.gscProperty = site.gscProperty || `sc-domain:${domain}`;
    }
    setBusy(true);
    try { await save(patch); setEditing(false); setDone(domain); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {err && <ErrorBox error={err} />}
      {!editing && site.domain ? (
        <div className="flex flex-wrap items-center gap-3">
          <Globe className="size-5 text-zinc-400" />
          <a href={`https://${site.domain}`} target="_blank" rel="noreferrer" className="text-lg font-medium hover:underline">{site.domain}</a>
          <Badge tone={site.cloudflareZoneId ? "green" : "yellow"}>{site.cloudflareZoneId ? "On Cloudflare" : "Not connected"}</Badge>
          <Button className="ml-auto" onClick={() => setEditing(true)}>Change URL</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Input value={value} onChange={e => setValue(e.target.value)} placeholder="mystore.com" className="min-w-0 flex-1" onKeyDown={e => e.key === "Enter" && submit()} autoFocus={!!site.domain} />
          <Button variant="primary" loading={busy} onClick={submit}>{site.domain ? "Change URL" : "Add URL"}</Button>
          {site.domain && <Button onClick={() => { setEditing(false); setValue(site.domain!); setErr(null); }}>Cancel</Button>}
        </div>
      )}
      {done && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <div className="font-medium">{done} saved. Next:</div>
          <ol className="mt-1 list-decimal pl-5">
            <li><a className="underline" href="#connections">Connect it to Cloudflare</a> (Find or Add below). If the domain is at Namecheap, switch its nameservers to Cloudflare's.</li>
            <li>Pick the Appwrite site that hosts it, then <Link className="underline" to={sp("/domains")}>Domain &amp; DNS → Point to Appwrite Sites</Link>.</li>
            <li><a className="underline" href="#email">Verify it for email</a>.</li>
          </ol>
        </div>
      )}
    </div>
  );
}

function Connections({ site, save }: { site: Site; save(p: Partial<Site>): Promise<void> }) {
  const [d, setD] = useState({ cloudflareZoneId: site.cloudflareZoneId ?? "", hostingSiteId: site.hostingSiteId ?? "" });
  useEffect(() => setD({ cloudflareZoneId: site.cloudflareZoneId ?? "", hostingSiteId: site.hostingSiteId ?? "" }), [site]);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hostSites = useAsync(() => ops<{ sites: { id: string; name: string; framework: string }[] }>("/hosting/sites").catch(() => ({ sites: [] })), []);
  const set = (k: keyof typeof d, v: string) => setD(x => ({ ...x, [k]: v }));
  const dirty = (Object.keys(d) as (keyof typeof d)[]).some(k => (d[k] || "") !== (site[k] || ""));

  const zone = async (create: boolean) => {
    setErr(null); setNote(null);
    try {
      const res = await ops(create ? "/cloudflare/zones/create" : "/cloudflare/zones/find", { domain: site.domain });
      const z = create ? res.zone : res.zones?.[0];
      if (z) { set("cloudflareZoneId", z.id); setNote(create ? `Added ${site.domain} to Cloudflare. If it's registered at Namecheap, set its nameservers to: ${z.name_servers.join(", ")}` : `Found ${site.domain} on Cloudflare (${z.status}). Click Save.`); }
      else setNote(`${site.domain} isn't in your Cloudflare account yet. Click "Add to Cloudflare".`);
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="space-y-3">
      {err && <ErrorBox error={err} />}
      {note && <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{note}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cloudflare zone" hint={<span className="flex gap-3"><button type="button" className="underline" onClick={() => zone(false)}>Find by domain</button><button type="button" className="underline" onClick={() => zone(true)}>Add to Cloudflare</button></span>}>
          <Input value={d.cloudflareZoneId} onChange={e => set("cloudflareZoneId", e.target.value)} placeholder="Zone ID" />
        </Field>
        <Field label="Hosting (Appwrite site)" hint="The Appwrite site that serves this store's website.">
          {hostSites.loading ? <Loading /> : hostSites.data?.sites.length ? (
            <Select value={d.hostingSiteId} onChange={e => set("hostingSiteId", e.target.value)}>
              <option value="">None</option>{hostSites.data.sites.map(n => <option key={n.id} value={n.id}>{n.name} ({n.framework})</option>)}
            </Select>
          ) : <Input value={d.hostingSiteId} onChange={e => set("hostingSiteId", e.target.value)} placeholder="Appwrite site ID" />}
        </Field>
      </div>
      <Button variant="primary" disabled={!dirty} loading={busy} onClick={async () => {
        setBusy(true); setErr(null);
        try { await save({ cloudflareZoneId: d.cloudflareZoneId || undefined, hostingSiteId: d.hostingSiteId || undefined }); setNote("Connections saved."); }
        catch (e: any) { setErr(e.message); } finally { setBusy(false); }
      }}>Save connections</Button>
      <GoogleConnect site={site} save={save} />
    </div>
  );
}

export function SellOnSite({ site }: { site: Site }) {
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="${location.origin}/yancey.js"
        data-endpoint="${config.endpoint}"
        data-project="${config.projectId || "YOUR_APPWRITE_PROJECT_ID"}"
        data-site="${site.$id}"
        data-success-url="/thank-you"></script>`;
  const copy = async () => { try { await navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  return (
    <Card title={`Embed snippet for ${site.domain}`} actions={<Button onClick={copy}>{copied ? "Copied!" : "Copy snippet"}</Button>}>
      <p className="mb-2 text-sm text-zinc-600">Paste this into your site's HTML, then use <code>Yancey.cart.add(id)</code> and <code>Yancey.checkout("stripe" | "paypal")</code>. Stripe shows card, Apple Pay and Google Pay on one page. Paid orders appear under Orders automatically.</p>
      <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">{snippet}</pre>
      <p className="mt-2 text-xs text-zinc-500">Also add <strong>{site.domain}</strong> as a Web platform in Appwrite. For a complete starter page, see <code>examples/storefront.html</code> in the repo.</p>
    </Card>
  );
}
