import { config } from "../../lib/appwrite";
import { list, ops, update } from "../../lib/data";
import type { Site, Theme } from "../../lib/types";
import { renderDocument } from "../../theme/render";
import { routeFor } from "../../theme/routes";
import { esc } from "../../theme/util";

/** Make a theme the store's live one (exactly one theme per store has role "main"). */
export async function publishTheme(siteId: string, themeId: string) {
  const themes = await list("themes", siteId);
  for (const t of themes) if (t.role === "main" && t.$id !== themeId) await update("themes", t.$id, { role: "unpublished" });
  await update("themes", themeId, { role: "main", publishedAt: new Date().toISOString() });
}

/** The two script tags every storefront page needs. */
export function storefrontScripts(site: Site, base = "") {
  return `<script src="${base}/yancey.js" data-endpoint="${esc(config.endpoint)}" data-project="${esc(config.projectId)}" data-site="${esc(site.$id)}" data-database="${esc(config.databaseId)}" data-success-url="/thank-you"></script>
<script src="${base}/storefront.js" data-name="${esc(site.name)}" data-currency="${esc(site.currency || "USD")}" data-domain="${esc(site.domain ?? "")}" defer></script>`;
}

/**
 * Pre-render every page of the store with a theme (home, each product and collection, pages, cart…),
 * bundle the storefront scripts, and upload it all as a new deployment of the store's Appwrite Site.
 */
export async function deployStorefront(site: Site, theme: Theme, force = false) {
  if (!site.hostingSiteId) throw new Error("Pick this store's Appwrite site under Store settings → Connections first.");
  const [products, collections] = await Promise.all([list("products", site.$id), list("collections", site.$id)]);
  const active = products.filter(p => p.status === "active");
  const fetchText = async (path: string) => {
    const r = await fetch(path, { cache: "no-store" });
    const t = await r.text();
    if (!r.ok || t.trimStart().startsWith("<")) throw new Error(`${path} isn't available on this dashboard. Run "npm run build" (it builds storefront.js) and deploy, then try again.`);
    return t;
  };
  const [runtime, yancey] = await Promise.all([fetchText("/storefront.js"), fetchText("/yancey.js")]);

  const paths = ["/", "/collections", "/collections/all", "/cart", "/search", "/thank-you",
    ...active.map(p => `/products/${p.$id}`), ...collections.map(c => `/collections/${c.handle}`),
    ...Object.keys(theme.data.templates).filter(k => k.startsWith("page.")).map(k => `/pages/${k.slice(5)}`)];
  const files: Record<string, string> = { "storefront.js": runtime, "yancey.js": yancey };
  const data = { site: { id: site.$id, name: site.name, currency: site.currency || "USD", domain: site.domain }, products, collections, cart: [], payments: { stripe: true, paypal: true } };
  const page = (path: string) => {
    const route = routeFor(path, theme.data, products, collections, site.$id);
    // Hide the page until storefront.js renders it if the server fell back to another URL's HTML.
    const guard = `<script>if((location.pathname.replace(/\\/+$/,"")||"/")!==${JSON.stringify(path)})document.documentElement.style.visibility="hidden"</script>`;
    return renderDocument({ theme: theme.data, editor: false, route, data }, guard, storefrontScripts(site));
  };
  for (const path of paths) files[path === "/" ? "index.html" : `${path.slice(1)}/index.html`] = page(path);
  files["404.html"] = page("/404");
  const result = await ops<{ deploymentId: string; files: number; bytes: number; fallback?: string }>("/hosting/upload-storefront", { siteId: site.hostingSiteId, files, force });
  await update("themes", theme.$id, { publishedAt: new Date().toISOString() });
  return { ...result, pages: paths.length };
}
