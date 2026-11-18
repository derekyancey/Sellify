import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useSite } from "../../context/Site";
import { Card, PageHeader } from "../../components/ui";
import { SellOnSite } from "../Settings";

export default function OnlineStore() {
  const { site } = useSite(); const s = site!;
  return (
    <>
      <PageHeader title="Online store" subtitle={`Your storefront at ${s.domain}, hosted on Netlify`}
        actions={<a href={`https://${s.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium">View store <ExternalLink className="size-4" /></a>} />
      <div className="space-y-4">
        <SellOnSite site={s} />
        <Card title="Manage">
          <ul className="space-y-1 text-sm">
            <li><Link className="underline" to="/deploys">Deploys</Link>: publish changes, see build history</li>
            <li><Link className="underline" to="/domains">Domain &amp; DNS</Link>: Cloudflare records and SSL</li>
            <li><Link className="underline" to="/products/collections">Collections</Link>: what shows on your storefront pages</li>
            <li><Link className="underline" to="/seo">SEO</Link>: crawl the store, page speed, sitemaps</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
