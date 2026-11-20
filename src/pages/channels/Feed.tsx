import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { useSite } from "../../context/Site";
import { config, isDemo } from "../../lib/appwrite";
import { list, update } from "../../lib/data";
import { useAsync } from "../../lib/useAsync";
import { Badge, Button, Card, Field, Input, Loading, PageHeader } from "../../components/ui";

const DEFAULT_PATH = "/products/{handle}";
const PLATFORMS = {
  google: {
    title: "Google & YouTube", subtitle: "Free product listings on Google Search, Shopping, Images, Maps and YouTube",
    steps: [
      <>Create a free <a className="underline" href="https://merchants.google.com" target="_blank" rel="noreferrer">Google Merchant Center</a> account and verify your website (the same Google account as Search Console makes this one click).</>,
      <>Go to <em>Products → Add products → Add products from a file</em>, choose <em>Enter a link to your file</em>, paste the feed URL below, and set it to fetch <em>daily</em>.</>,
      <>Under <em>Growth → Manage programs</em>, turn on <em>Free listings</em> (and <em>YouTube</em> if you like). Products usually appear within a few days.</>,
    ],
    url: "https://merchants.google.com",
  },
  tiktok: {
    title: "TikTok", subtitle: "Show your products in TikTok Shop and TikTok ads using the same feed",
    steps: [
      <>In <a className="underline" href="https://ads.tiktok.com" target="_blank" rel="noreferrer">TikTok Ads Manager</a> open <em>Assets → Catalogs</em> and create an e-commerce catalog.</>,
      <>Choose <em>Add products → Data feed → Scheduled feed</em>, paste the feed URL below and set a daily schedule. TikTok accepts Google's feed format.</>,
      <>Use the catalog in Shopping ads, or connect it to TikTok Shop.</>,
    ],
    url: "https://ads.tiktok.com",
  },
} as const;

export default function Feed({ platform }: { platform: keyof typeof PLATFORMS }) {
  const P = PLATFORMS[platform];
  const { site, reload } = useSite(); const s = site!;
  const { data: products, loading } = useAsync(() => list("products", s.$id), [s.$id]);
  const [path, setPath] = useState(s.feedProductPath || DEFAULT_PATH);
  const [copied, setCopied] = useState(false);
  const feedUrl = config.checkoutPublicUrl ? `${config.checkoutPublicUrl}/feed.xml?site=${s.$id}` : "";
  const active = (products ?? []).filter(p => p.status === "active");
  const listed = active.filter(p => p.imageUrl);
  const noImage = active.filter(p => !p.imageUrl);

  return (
    <>
      <PageHeader title={P.title} subtitle={P.subtitle} actions={<a href={P.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium">Open {P.title.split(" ")[0]} <ExternalLink className="size-4" /></a>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Your product feed" className="lg:col-span-2">
          {feedUrl ? (
            <div className="flex gap-2"><Input readOnly value={feedUrl} className="flex-1 font-mono text-xs" onFocus={e => e.target.select()} />
              <Button onClick={async () => { try { await navigator.clipboard.writeText(feedUrl); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* ignore */ } }}><Copy className="size-4" />{copied ? "Copied" : "Copy"}</Button></div>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{isDemo ? "In demo mode there's no live feed. " : ""}Set <code>VITE_CHECKOUT_PUBLIC_URL</code> to your checkout function's domain to get the feed URL. The feed is served at <code>/feed.xml?site={s.$id}</code>.</p>
          )}
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-zinc-700">{P.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
          <div className="mt-4 border-t border-zinc-100 pt-4">
            <Field label="Product page path" hint={<>Where each product lives on {s.domain}. <code>{"{handle}"}</code> is the product's URL handle (or use <code>{"{id}"}</code>). The default, <code>/products/{"{handle}"}</code>, is Shopify's, so links match your old store. Shared by every feed.</>}>
              <div className="flex gap-2"><Input value={path} onChange={e => setPath(e.target.value)} className="flex-1 font-mono" />
                <Button disabled={path === (s.feedProductPath || DEFAULT_PATH) || !/\{(id|handle)\}/.test(path)} onClick={async () => { await update("sites", s.$id, { feedProductPath: path }); reload(); }}>Save</Button></div>
            </Field>
          </div>
        </Card>
        <Card title="What's in the feed">
          {loading ? <Loading /> : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Listed</span><Badge tone="green">{listed.length}</Badge></div>
              <div className="flex justify-between"><span>Missing an image (left out)</span><Badge tone={noImage.length ? "yellow" : "gray"}>{noImage.length}</Badge></div>
              {noImage.length > 0 && <ul className="text-xs text-zinc-500">{noImage.slice(0, 6).map(p => <li key={p.$id}>• {p.title}</li>)}</ul>}
              <p className="pt-2 text-xs text-zinc-500">Active products only. Out-of-stock products are listed as out of stock. A compare-at price shows as a sale.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
