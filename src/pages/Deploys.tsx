import { useState } from "react";
import { ExternalLink, Rocket } from "lucide-react";
import { useSite } from "../context/Site";
import { ops } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { dateTime } from "../lib/format";
import { Badge, Button, Card, ErrorBox, Loading, NeedsSetup, PageHeader, Table, Td } from "../components/ui";

const tone = (state: string) => state === "ready" ? "green" : state === "error" ? "red" : ["building", "enqueued", "processing", "uploading", "new"].includes(state) ? "yellow" : "gray";

export default function Deploys() {
  const { site } = useSite(); const s = site!;
  if (!s.netlifySiteId) return <><PageHeader title="Deploys" /><NeedsSetup what="Netlify" /></>;
  return <DeploysInner key={s.$id} siteId={s.netlifySiteId} />;
}

function DeploysInner({ siteId }: { siteId: string }) {
  const { site } = useSite(); const s = site!;
  const info = useAsync(() => ops("/netlify/site", { siteId, domain: s.domain }), [siteId]);
  const deploys = useAsync(() => ops("/netlify/deploys", { siteId }), [siteId]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const build = async (clearCache: boolean) => {
    setBusy(true); setMsg(null);
    try { await ops("/netlify/build", { siteId, clearCache }); setMsg("Build started — refresh in a minute to see it."); setTimeout(deploys.reload, 3000); }
    catch (e: any) { setMsg(`Error: ${e.message}`); } finally { setBusy(false); }
  };
  const n = info.data;

  return (
    <>
      <PageHeader title="Deploys" subtitle="Hosted on Netlify" actions={<>
        <Button onClick={() => build(true)} loading={busy}>Clear cache &amp; deploy</Button>
        <Button variant="primary" onClick={() => build(false)} loading={busy}><Rocket className="size-4" />Trigger deploy</Button>
      </>} />
      {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.startsWith("Error") ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{msg}</div>}
      <Card title="Site" className="mb-4">
        {info.loading ? <Loading /> : info.error ? <ErrorBox error={info.error} /> : (
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div><div className="text-xs text-zinc-500">Live URL</div><a className="inline-flex items-center gap-1 font-medium hover:underline" href={n.ssl_url || n.url} target="_blank" rel="noreferrer">{(n.ssl_url || n.url).replace(/^https?:\/\//, "")}<ExternalLink className="size-3.5" /></a></div>
            <div><div className="text-xs text-zinc-500">Domains</div><div>{[n.custom_domain, ...(n.domain_aliases ?? [])].filter(Boolean).join(", ") || "–"}</div></div>
            <div><div className="text-xs text-zinc-500">HTTPS</div>{n.ssl ? <Badge tone="green">Certificate active</Badge> : <Badge tone="yellow">Not yet</Badge>}</div>
            <div className="sm:col-span-3"><a className="text-xs text-zinc-500 hover:underline" href={n.admin_url} target="_blank" rel="noreferrer">Open in Netlify →</a></div>
          </div>
        )}
      </Card>
      <Card title="Recent deploys" actions={<Button variant="ghost" onClick={deploys.reload}>Refresh</Button>}>
        {deploys.loading ? <Loading /> : deploys.error ? <ErrorBox error={deploys.error} /> : (
          <Table head={["Status", "Message", "Branch", "Commit", "Started", "Build time"]} empty={!deploys.data.deploys.length}>
            {deploys.data.deploys.map((d: any) => (
              <tr key={d.id}>
                <Td><Badge tone={tone(d.state) as any}>{d.state}</Badge></Td>
                <Td className="max-w-xs"><div className="truncate">{d.title || "Manual deploy"}</div>{d.error_message && <div className="truncate text-xs text-red-600">{d.error_message}</div>}</Td>
                <Td>{d.branch}</Td><Td className="font-mono text-xs">{d.commit_ref?.slice(0, 7) ?? "–"}</Td>
                <Td>{dateTime(d.created_at)}</Td><Td>{d.deploy_time ? `${d.deploy_time}s` : "–"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
