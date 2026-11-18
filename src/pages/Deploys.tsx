import { useState } from "react";
import { ExternalLink, Rocket } from "lucide-react";
import { useSite } from "../context/Site";
import { config } from "../lib/appwrite";
import { ops } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { dateTime } from "../lib/format";
import { Badge, Button, Card, ErrorBox, Loading, NeedsSetup, PageHeader, Table, Td } from "../components/ui";

const tone = (s: string) => s === "ready" ? "green" : s === "failed" ? "red" : ["building", "processing", "waiting"].includes(s) ? "yellow" : "gray";
const consoleUrl = (siteId: string) => `${config.endpoint.replace(/\/v1\/?$/, "").replace(/\/\/[a-z0-9-]+\.cloud\./, "//cloud.")}/console/project-${config.projectId}/sites/site-${siteId}`;

export default function Deploys() {
  const { site } = useSite(); const s = site!;
  if (!s.hostingSiteId) return <><PageHeader title="Deploys" /><NeedsSetup what="Hosting (Appwrite Sites)" /></>;
  return <DeploysInner key={s.$id} siteId={s.hostingSiteId} />;
}

function DeploysInner({ siteId }: { siteId: string }) {
  const info = useAsync(() => ops("/hosting/site", { siteId }), [siteId]);
  const deps = useAsync(() => ops("/hosting/deployments", { siteId }), [siteId]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const redeploy = async () => {
    setBusy(true); setMsg(null);
    try { await ops("/hosting/redeploy", { siteId }); setMsg("New deployment started. It usually takes a minute or two."); setTimeout(deps.reload, 3000); }
    catch (e: any) { setMsg(`Error: ${e.message}`); } finally { setBusy(false); }
  };
  const n = info.data;

  return (
    <>
      <PageHeader title="Deploys" subtitle="Hosted on Appwrite Sites" actions={<Button variant="primary" onClick={redeploy} loading={busy}><Rocket className="size-4" />Redeploy</Button>} />
      {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.startsWith("Error") ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{msg}</div>}
      <Card title="Site" className="mb-4">
        {info.loading ? <Loading /> : info.error ? <ErrorBox error={info.error} /> : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{n.name}</span>
              <Badge tone={n.live ? "green" : "yellow"}>{n.live ? "Live" : "Not live"}</Badge>
              <Badge>{n.framework}</Badge>
              {n.repository ? <Badge tone="blue">Deploys from Git ({n.branch})</Badge> : <Badge>Manual uploads</Badge>}
              {config.projectId && <a className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-500 hover:underline" href={consoleUrl(siteId)} target="_blank" rel="noreferrer">Open in Appwrite <ExternalLink className="size-3" /></a>}
            </div>
            <div>
              <div className="mb-1 text-xs text-zinc-500">Domains</div>
              <ul className="space-y-1">
                {n.domains.map((d: any) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2">
                    <a href={`https://${d.domain}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">{d.domain}</a>
                    <Badge tone={d.status === "verified" ? "green" : d.status === "unverified" ? "red" : "yellow"}>{d.status}</Badge>
                    {d.certificate && <span className="text-xs text-zinc-500">certificate: {d.certificate}</span>}
                  </li>
                ))}
                {!n.domains.length && <li className="text-zinc-500">No domains yet.</li>}
              </ul>
            </div>
          </div>
        )}
      </Card>
      <Card title="Recent deployments" actions={<Button variant="ghost" onClick={deps.reload}>Refresh</Button>}>
        {deps.loading ? <Loading /> : deps.error ? <ErrorBox error={deps.error} /> : (
          <Table head={["Status", "Message", "Branch", "Commit", "Started", "Build time"]} empty={!deps.data.deployments.length}>
            {deps.data.deployments.map((d: any) => (
              <tr key={d.id}>
                <Td><Badge tone={tone(d.status) as any}>{d.status}</Badge>{d.active && <span className="ml-1"><Badge tone="blue">active</Badge></span>}</Td>
                <Td className="max-w-xs truncate">{d.message || (d.type === "manual" ? "Manual upload" : "Deployment")}</Td>
                <Td>{d.branch || "–"}</Td><Td className="font-mono text-xs">{d.commit?.slice(0, 7) ?? "–"}</Td>
                <Td>{dateTime(d.createdAt)}</Td><Td>{d.buildSeconds ? `${d.buildSeconds}s` : "–"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
