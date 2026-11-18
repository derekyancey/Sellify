import type { Campaign, Checkout, Collection, Customer, Discount, EmailTemplate, Order, Product, Site } from "./types";
import { starterTemplate } from "./emailStarter";

// Deterministic pseudo-random so demo numbers stay stable between reloads.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
const id = () => Math.floor(rand() * 1e12).toString(36) + Math.floor(rand() * 1e12).toString(36);
const ago = (days: number) => new Date(Date.now() - days * 864e5 - rand() * 864e5).toISOString();

export function buildDemo() {
  seed = 42;
  const sites: Site[] = [
    { $id: "site_coffee", $createdAt: ago(200), name: "Northline Coffee", domain: "northlinecoffee.com", currency: "USD", cloudflareZoneId: "demo-zone-1", hostingSiteId: "demo-host-1", gscProperty: "sc-domain:northlinecoffee.com", ga4PropertyId: "123456789",
      ownerEmail: "owner@example.com", senderName: "Northline Coffee", senderAddress: "orders@northlinecoffee.com", emailDomainId: "demo-dom-1", emailStatus: "verified",
      emailReceipts: true, emailOwnerAlerts: true, emailShipping: true },
    { $id: "site_candles", $createdAt: ago(120), name: "Ember & Wick", domain: "emberandwick.shop", currency: "USD", cloudflareZoneId: "demo-zone-2", hostingSiteId: "demo-host-2", gscProperty: "sc-domain:emberandwick.shop", ga4PropertyId: "987654321" },
  ];
  sites.push({ $id: "site_bakery", $createdAt: ago(3), name: "Fern & Flour Bakery", currency: "USD", emailStatus: "none" });
  const catalog: Record<string, [string, number][]> = {
    site_bakery: [],
    site_coffee: [["House Blend 12oz", 16], ["Ethiopia Yirgacheffe", 21], ["Cold Brew Pack", 24], ["Decaf Colombia", 18], ["Pour-Over Kit", 45], ["Ceramic Mug", 14]],
    site_candles: [["Cedar & Smoke Candle", 32], ["Fig Leaf Candle", 30], ["Travel Tin Set", 28], ["Wick Trimmer", 12], ["Matchbox Duo", 8]],
  };
  const first = ["Ava", "Liam", "Maya", "Noah", "Zoe", "Eli", "Iris", "Owen", "Nora", "Leo", "Ruby", "Jude"];
  const last = ["Park", "Diaz", "Chen", "Patel", "Brooks", "Nguyen", "Reed", "Kim", "Lopez", "Shaw"];

  const products: Product[] = [], customers: Customer[] = [], orders: Order[] = [];
  const collections: Collection[] = [], discounts: Discount[] = [], templates: EmailTemplate[] = [], campaigns: Campaign[] = [], checkouts: Checkout[] = [];
  for (const s of sites) {
    for (const [title, price] of catalog[s.$id]) {
      products.push({ $id: id(), $createdAt: ago(150), siteId: s.$id, title, price, compareAtPrice: rand() > 0.7 ? price + 6 : undefined,
        sku: title.split(" ").map(w => w[0]).join("").toUpperCase() + "-" + Math.floor(rand() * 900 + 100),
        inventory: Math.floor(rand() * 120), status: rand() > 0.85 ? "draft" : "active", description: "",
        imageUrl: title.includes("Mug") || title.includes("Matchbox") ? undefined : `https://placehold.co/600x600/e7e5e4/44403c?text=${encodeURIComponent(title.split(" ")[0])}` });
    }
    const siteProducts = products.filter(p => p.siteId === s.$id);
    const siteCustomers: Customer[] = Array.from({ length: siteProducts.length ? 18 : 0 }, () => {
      const name = `${pick(first)} ${pick(last)}`;
      return { $id: id(), $createdAt: ago(90), siteId: s.$id, name, email: name.toLowerCase().replace(" ", ".") + "@example.com", ordersCount: 0, totalSpent: 0, acceptsMarketing: rand() > 0.4 };
    });
    customers.push(...siteCustomers);
    let number = 1001;
    for (let d = 45; d >= 0 && siteProducts.length; d--) {
      const count = Math.floor(rand() * (s.$id === "site_coffee" ? 6 : 3));
      for (let i = 0; i < count; i++) {
        const c = pick(siteCustomers);
        const items = Array.from({ length: 1 + Math.floor(rand() * 2) }, () => {
          const p = pick(siteProducts);
          return { productId: p.$id, title: p.title, quantity: 1 + Math.floor(rand() * 2), price: p.price };
        });
        const total = items.reduce((t, li) => t + li.price * li.quantity, 0);
        const financialStatus = rand() > 0.94 ? "refunded" : rand() > 0.1 ? "paid" : "pending";
        const fulfillmentStatus = d > 3 ? "fulfilled" : rand() > 0.5 ? "fulfilled" : "unfulfilled";
        orders.push({ $id: id(), $createdAt: ago(d), siteId: s.$id, number: number++, customerId: c.$id, customerName: c.name, customerEmail: c.email,
          items, total, financialStatus, fulfillmentStatus, ...(rand() > 0.35
            ? { paymentProvider: "stripe" as const, paymentRef: "pi_demo" + id().slice(0, 10) }
            : { paymentProvider: "paypal" as const, paymentRef: "CAPDEMO" + id().slice(0, 8).toUpperCase() }) });
        if (financialStatus === "paid") { c.ordersCount++; c.totalSpent += total; }
      }
    }
  }
  for (const s of sites) {
    const sp = products.filter(p => p.siteId === s.$id);
    collections.push(
      { $id: id(), $createdAt: ago(60), siteId: s.$id, title: "Best sellers", handle: "best-sellers", description: "", productIds: sp.slice(0, 3).map(p => p.$id) },
      { $id: id(), $createdAt: ago(30), siteId: s.$id, title: "Gifts under $30", handle: "gifts-under-30", description: "", productIds: sp.filter(p => p.price < 30).map(p => p.$id) });
    discounts.push(
      { $id: id(), $createdAt: ago(40), siteId: s.$id, code: "WELCOME10", type: "percent", value: 10, usedCount: 14, active: true },
      { $id: id(), $createdAt: ago(20), siteId: s.$id, code: "SAVE5", type: "fixed", value: 5, minSubtotal: 40, usageLimit: 100, usedCount: 100, active: true });
    if (!s.domain) continue;
    const tpl = { $id: id(), $createdAt: ago(15), siteId: s.$id, name: "New arrivals", subject: "Fresh from the shop 🎉", html: starterTemplate(s.name, `https://${s.domain}`) };
    templates.push(tpl);
    campaigns.push({ $id: id(), $createdAt: ago(10), siteId: s.$id, name: "October newsletter", subject: tpl.subject, templateId: tpl.$id, segmentId: "subscribers", status: "sent", sentCount: 11, sentAt: ago(10) });
    const cs = customers.filter(c => c.siteId === s.$id);
    for (let i = 0; i < (sp.length ? 4 : 0); i++) {
      const p = pick(sp), q = 1 + Math.floor(rand() * 2);
      checkouts.push({ $id: id(), $createdAt: ago(i + 0.2), siteId: s.$id, provider: rand() > 0.5 ? "stripe" : "paypal", items: [{ productId: p.$id, title: p.title, quantity: q, price: p.price }],
        total: p.price * q, currency: s.currency, status: i % 2 ? "expired" : "open", email: i === 3 ? undefined : pick(cs).email });
    }
  }
  return { sites, products, customers, orders, collections, discounts, templates, campaigns, checkouts, segments: [] };
}

/* ---------- Mock responses for the Python "site-ops" function in demo mode ---------- */
const series = (days: number, base: number, spread: number) =>
  Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 864e5).toISOString().slice(0, 10);
    return { date: d, value: Math.round(base + Math.sin(i / 3) * spread + rand() * spread) };
  });

export function demoOps(path: string, body: any): any {
  const domain = body?.domain || String(body?.property || "").replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "") || "example.com";
  switch (path) {
    case "/email/setup": return { domainId: "demo-dom-" + id().slice(0, 5), status: "pending", addedToCloudflare: ["TXT resend._domainkey", "MX send", "TXT send"], alreadyPresent: [], records: demoEmailRecords(domain, "pending") };
    case "/email/status": return { status: "verified", records: demoEmailRecords(domain, "verified") };
    case "/email/test": return { ok: true, id: "em_demo", to: body.site?.ownerEmail };
    case "/email/order": return { ok: true, id: "em_demo" };
    case "/automations/preview": return { dryRun: true, budgetLeft: 50, results: [
      { siteId: body.siteId, type: "abandoned_cart", eligible: 2, sent: 0 }, { siteId: body.siteId, type: "welcome", eligible: 3, sent: 0 }, { siteId: body.siteId, type: "winback", eligible: 1, sent: 0 }] };
    case "/automations/run": return { dryRun: false, budgetLeft: 44, results: [
      { siteId: body.siteId, type: "abandoned_cart", eligible: 2, sent: 2 }, { siteId: body.siteId, type: "welcome", eligible: 3, sent: 3 }, { siteId: body.siteId, type: "winback", eligible: 1, sent: 1 }] };
    case "/email/campaign": return { ok: true, sent: (body.recipients ?? []).length, failed: 0 };
    case "/email/recovery": return { ok: true, id: "em_demo" };
    case "/payments/refund": return { ok: true, refundId: "re_demo", status: "succeeded" };
    case "/health": return { ok: true, integrations: { cloudflare: true, hosting: true, google: true, stripe: true, paypal: true, email: true }, serviceAccountEmail: "yancey@your-project.iam.gserviceaccount.com" };
    case "/cloudflare/zone": return { id: body.zoneId, name: domain, status: "active", name_servers: ["ada.ns.cloudflare.com", "rob.ns.cloudflare.com"], original_name_servers: ["dns1.registrar-servers.com", "dns2.registrar-servers.com"], plan: { name: "Free Website" } };
    case "/cloudflare/zones/find": return { zones: [] };
    case "/cloudflare/zones/create": return { zone: { id: "demo-zone-" + id().slice(0, 6), status: "pending", name_servers: ["ada.ns.cloudflare.com", "rob.ns.cloudflare.com"] } };
    case "/cloudflare/dns/list": return { records: [
      { id: "r1", type: "CNAME", name: domain, content: "sites.appwrite.example", proxied: false, ttl: 1 },
      { id: "r2", type: "CNAME", name: `www.${domain}`, content: "sites.appwrite.example", proxied: false, ttl: 1 },
      { id: "r3", type: "MX", name: domain, content: "mx1.improvmx.com", priority: 10, proxied: false, ttl: 1 },
      { id: "r4", type: "TXT", name: domain, content: "v=spf1 include:spf.improvmx.com ~all", proxied: false, ttl: 1 },
    ] };
    case "/cloudflare/dns/create": case "/cloudflare/dns/update": return { record: { id: id(), ...body.record } };
    case "/cloudflare/dns/delete": return { ok: true };
    case "/cloudflare/purge": return { ok: true };
    case "/cloudflare/connect-hosting": return { created: [`CNAME ${domain}`, `CNAME www.${domain}`], domainsAdded: [domain, `www.${domain}`] };
    case "/hosting/sites": return { sites: [{ id: "demo-host-1", name: "Northline storefront", framework: "astro", status: "ready" }, { id: "demo-host-2", name: "Ember & Wick storefront", framework: "vite", status: "ready" }] };
    case "/hosting/site": return { id: body.siteId, name: "Storefront", framework: "astro", live: true, deploymentId: "d0", deployedAt: ago(1), repository: true, branch: "main",
      domains: [{ id: "r1", domain: `${body.siteId}.appwrite.network`, status: "verified", certificate: "generated" }] };
    case "/hosting/deployments": return { deployments: Array.from({ length: 8 }, (_, i) => ({ id: "d" + i, status: i === 2 ? "failed" : "ready", active: i === 0, branch: "main",
      message: pick(["Update homepage copy", "Add holiday collection", "Fix checkout button", "Bump deps", "New product photos"]), commit: id().slice(0, 7), createdAt: ago(i * 2), buildSeconds: 20 + Math.floor(rand() * 60), type: "vcs" })) };
    case "/hosting/redeploy": return { ok: true, deploymentId: "dnew" };
    case "/google/ga4": return {
      totals: { sessions: 8421, activeUsers: 6110, screenPageViews: 21950, conversions: 312, bounceRate: 0.41 },
      daily: series(28, 280, 60).map(r => ({ date: r.date, sessions: r.value, users: Math.round(r.value * 0.72) })),
      sources: [{ name: "Organic Search", sessions: 3610 }, { name: "Direct", sessions: 2140 }, { name: "Organic Social", sessions: 1320 }, { name: "Referral", sessions: 801 }, { name: "Email", sessions: 550 }],
      pages: [{ path: "/", views: 7210 }, { path: "/shop", views: 4402 }, { path: "/products/house-blend", views: 2210 }, { path: "/about", views: 990 }, { path: "/blog/brew-guide", views: 860 }],
    };
    case "/google/gsc": return {
      totals: { clicks: 2634, impressions: 98120, ctr: 0.0268, position: 18.4 },
      daily: series(28, 95, 25).map(r => ({ date: r.date, clicks: r.value, impressions: r.value * 37 })),
      queries: [
        { key: "best coffee subscription", clicks: 310, impressions: 9100, ctr: 0.034, position: 6.2 },
        { key: "ethiopia yirgacheffe beans", clicks: 244, impressions: 5300, ctr: 0.046, position: 4.1 },
        { key: "cold brew coffee pack", clicks: 190, impressions: 7800, ctr: 0.024, position: 9.8 },
        { key: "pour over kit", clicks: 120, impressions: 11200, ctr: 0.011, position: 14.5 },
        { key: domain.split(".")[0], clicks: 610, impressions: 1400, ctr: 0.43, position: 1.1 },
      ],
      pages: [
        { key: `https://${domain}/`, clicks: 900, impressions: 21000, ctr: 0.043, position: 7.3 },
        { key: `https://${domain}/shop`, clicks: 520, impressions: 18000, ctr: 0.029, position: 11.0 },
      ],
    };
    case "/google/gsc/sitemaps": return { sitemaps: [{ path: `https://${domain}/sitemap.xml`, lastSubmitted: ago(10), isPending: false, errors: 0, warnings: 1 }] };
    case "/google/gsc/submit-sitemap": return { ok: true };
    case "/seo/crawl": return demoCrawl(domain);
    default: throw new Error(`Demo mode has no mock for ${path}`);
  }
}

function demoEmailRecords(domain: string, status: string) {
  return [
    { type: "TXT", name: `resend._domainkey.${domain}`, value: "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDdemo…", status, purpose: "DKIM" },
    { type: "MX", name: `send.${domain}`, value: "feedback-smtp.us-east-1.amazonses.com", priority: 10, status, purpose: "SPF" },
    { type: "TXT", name: `send.${domain}`, value: "v=spf1 include:amazonses.com ~all", status, purpose: "SPF" },
  ];
}

function demoCrawl(domain: string) {
  const pages = ["/", "/shop", "/about", "/contact", "/blog", "/blog/brew-guide", "/products/house-blend", "/products/old-blend", "/faq"].map((p, i) => ({
    url: `https://${domain}${p}`, status: p === "/products/old-blend" ? 404 : 200, title: p === "/faq" ? "" : `${p === "/" ? "Home" : p.split("/").pop()} | ${domain}`,
    titleLength: 28 + i * 3, metaDescription: i % 3 === 0 ? "" : "Small-batch, freshly roasted coffee shipped to your door.", h1: i === 4 ? [] : ["Heading"],
    canonical: `https://${domain}${p}`, wordCount: 150 + i * 90, depth: p === "/" ? 0 : p.split("/").length - 1, responseMs: 120 + i * 37, inlinks: 9 - i, noindex: false, imagesMissingAlt: i % 4,
  }));
  return { start: `https://${domain}/`, pagesCrawled: pages.length, pages, robotsTxt: true, sitemap: true,
    issues: summarizeIssues(pages) };
}
function summarizeIssues(pages: any[]) {
  return [
    { type: "error", issue: "Broken pages (4xx/5xx)", urls: pages.filter(p => p.status >= 400).map(p => p.url) },
    { type: "warning", issue: "Missing title", urls: pages.filter(p => !p.title).map(p => p.url) },
    { type: "warning", issue: "Missing meta description", urls: pages.filter(p => !p.metaDescription).map(p => p.url) },
    { type: "warning", issue: "Missing H1", urls: pages.filter(p => !p.h1.length).map(p => p.url) },
    { type: "notice", issue: "Images missing alt text", urls: pages.filter(p => p.imagesMissingAlt).map(p => p.url) },
  ].filter(i => i.urls.length);
}
