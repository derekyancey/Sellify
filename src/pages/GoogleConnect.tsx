import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ops } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import type { Site } from "../lib/types";
import { Badge, Button, ErrorBox, Field, Input, Loading, Select } from "../components/ui";

const GoogleLogo = () => (
  <svg viewBox="0 0 48 48" className="size-4" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 6.9l7.1 5.5c4.2-3.9 7.2-9.6 7.2-16.9z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.7 2.3-8.8 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
);

/** Per-store Google account: connect with OAuth, then pick GA4 + Search Console properties from lists. */
export default function GoogleConnect({ site, save }: { site: Site; save(p: Partial<Site>): Promise<void> }) {
  const conn = useAsync(() => ops<{ connected: boolean; email?: string; available: boolean }>("/google/connection", { siteId: site.$id }), [site.$id]);
  const props = useAsync(async () => conn.data?.connected ? ops<{ ga4: { id: string; name: string; account: string }[]; gsc: { id: string; permission: string }[] }>("/google/properties", { siteId: site.$id }) : null, [conn.data?.connected, site.$id]);
  const [ga4, setGa4] = useState(site.ga4PropertyId ?? "");
  const [gsc, setGsc] = useState(site.gscProperty ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { setGa4(site.ga4PropertyId ?? ""); setGsc(site.gscProperty ?? ""); }, [site.ga4PropertyId, site.gscProperty]);

  // Suggest the Search Console property matching this store's domain.
  useEffect(() => {
    if (!props.data || gsc) return;
    const match = props.data.gsc.find(p => p.id === `sc-domain:${site.domain}` || p.id.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") === site.domain);
    if (match) setGsc(match.id);
  }, [props.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setBusy("connect"); setErr(null);
    try {
      const { url } = await ops<{ url: string }>("/google/oauth/start", { siteId: site.$id, redirectUri: `${location.origin}/oauth/google` });
      location.href = url;
    } catch (e: any) { setErr(e.message); setBusy(null); }
  };
  const disconnect = async () => {
    if (!confirm(`Disconnect ${conn.data?.email ?? "this Google account"} from ${site.name}? Yancey's access is revoked at Google.`)) return;
    setBusy("disconnect"); setErr(null);
    try { await ops("/google/disconnect", { siteId: site.$id }); await conn.reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };
  const saveProps = async () => {
    setBusy("save"); setErr(null);
    try { await save({ ga4PropertyId: ga4 || undefined, gscProperty: gsc || undefined }); setNote("Saved. Analytics and SEO now use these."); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  if (conn.loading) return <Loading />;
  const c = conn.data;
  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <GoogleLogo /><span className="font-medium">Google Analytics &amp; Search Console</span>
        {c?.connected ? <Badge tone="green">Connected</Badge> : <Badge>Not connected</Badge>}
      </div>
      {(err || conn.error) && <ErrorBox error={err || conn.error!} />}
      {note && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{note}</div>}
      {c?.connected ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-emerald-600" />Signed in as <strong>{c.email ?? "your Google account"}</strong>
            <Button variant="ghost" className="ml-auto" loading={busy === "connect"} onClick={connect}>Switch account</Button>
            <Button variant="ghost" className="text-red-600" loading={busy === "disconnect"} onClick={disconnect}>Disconnect</Button>
          </div>
          {props.loading ? <Loading label="Loading your Google properties…" /> : props.error ? <ErrorBox error={props.error} hint="Make sure the Google Analytics Admin API and Search Console API are enabled in your Google Cloud project." /> : props.data && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="GA4 property" hint={!props.data.ga4.length ? "No GA4 properties on this account." : undefined}>
                <Select value={ga4} onChange={e => setGa4(e.target.value)}>
                  <option value="">None</option>
                  {props.data.ga4.map(p => <option key={p.id} value={p.id}>{p.name} ({p.account})</option>)}
                </Select>
              </Field>
              <Field label="Search Console property" hint={!props.data.gsc.length ? <>No verified sites on this account. Add {site.domain} at search.google.com/search-console.</> : undefined}>
                <Select value={gsc} onChange={e => setGsc(e.target.value)}>
                  <option value="">None</option>
                  {props.data.gsc.map(p => <option key={p.id} value={p.id}>{p.id}{p.permission === "siteRestrictedUser" ? " (restricted)" : ""}</option>)}
                </Select>
              </Field>
            </div>
          )}
          <Button variant="primary" disabled={ga4 === (site.ga4PropertyId ?? "") && gsc === (site.gscProperty ?? "")} loading={busy === "save"} onClick={saveProps}>Save Google properties</Button>
        </>
      ) : (
        <>
          <p className="text-sm text-zinc-600">Sign in with the Google account that owns this store's Analytics and Search Console. Yancey gets read-only Analytics access and Search Console access (to read reports and submit sitemaps).</p>
          {c?.available === false
            ? <p className="text-sm text-amber-700">Google sign-in isn't switched on yet. Add <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code> to the site-ops function (see README).</p>
            : <Button variant="primary" loading={busy === "connect"} onClick={connect}><GoogleLogo />Connect Google account</Button>}
          <details className="text-sm text-zinc-500">
            <summary className="cursor-pointer">Enter IDs manually (shared service account)</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Search Console property"><Input value={gsc} onChange={e => setGsc(e.target.value)} placeholder={`sc-domain:${site.domain}`} /></Field>
              <Field label="GA4 property ID"><Input value={ga4} onChange={e => setGa4(e.target.value.replace(/\D/g, ""))} placeholder="123456789" /></Field>
            </div>
            <Button className="mt-2" disabled={ga4 === (site.ga4PropertyId ?? "") && gsc === (site.gscProperty ?? "")} onClick={saveProps}>Save</Button>
          </details>
        </>
      )}
    </div>
  );
}
