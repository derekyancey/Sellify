import type { Collection, Product } from "../lib/types";
import type { Route, ThemeDoc } from "./types";

/** The pseudo collection behind /collections/all. */
export const allCollection = (products: Product[], siteId: string): Collection =>
  ({ $id: "all", $createdAt: "", siteId, title: "All products", handle: "all", productIds: products.filter(p => p.status === "active").map(p => p.$id) });

/** Map a storefront URL to the template and resources it shows (Shopify's URL scheme). */
export function routeFor(url: string, theme: ThemeDoc, products: Product[], collections: Collection[], siteId: string): Route {
  const u = new URL(url, "https://store.invalid");
  const path = u.pathname.replace(/\/index\.html$/, "/").replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const base = { path: path + u.search, sort: u.searchParams.get("sort") ?? undefined };
  if (!parts.length) return { ...base, template: "index" };
  const [kind, handle] = parts;
  if (kind === "products" && handle) {
    const product = products.find(p => p.$id === handle && p.status !== "archived");
    return product ? { ...base, template: "product", product } : { ...base, template: "404" };
  }
  if (kind === "collections" && !handle) return { ...base, template: "list-collections" };
  if (kind === "collections") {
    if (parts[2] === "products" && parts[3]) return routeFor(`/products/${parts[3]}`, theme, products, collections, siteId);
    const collection = handle === "all" ? allCollection(products, siteId) : collections.find(c => c.handle === handle);
    return collection ? { ...base, template: "collection", collection } : { ...base, template: "404" };
  }
  if (kind === "thank-you") return { ...base, template: theme.templates["thank-you"] ? "thank-you" : "index" };
  if (kind === "cart") return { ...base, template: "cart" };
  if (kind === "search") return { ...base, template: "search", query: u.searchParams.get("q") ?? "" };
  if (kind === "pages" && handle && theme.templates[`page.${handle}`]) return { ...base, template: `page.${handle}` };
  return { ...base, template: "404" };
}

/** A representative URL for previewing a template in the editor. */
export function urlForTemplate(key: string, products: Product[], collections: Collection[], pick?: string) {
  const [type, suffix] = key.split(".");
  switch (type) {
    case "index": return "/";
    case "product": return `/products/${pick || products.find(p => p.status === "active")?.$id || "sample"}`;
    case "collection": return `/collections/${pick || collections[0]?.handle || "all"}`;
    case "list-collections": return "/collections";
    case "cart": return "/cart";
    case "search": return "/search?q=" + encodeURIComponent(pick ?? "");
    case "page": return `/pages/${suffix}`;
    default: return "/404";
  }
}
