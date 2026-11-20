/**
 * Storefront URLs follow Shopify's paths exactly, so links, bookmarks and search rankings carry over from Shopify:
 *
 *   /products/{handle}                 /collections/{handle}            /collections/{handle}/products/{product}
 *   /pages/{handle}                    /blogs/{blog}                    /blogs/{blog}/{article}
 *   /blogs/{blog}/tagged/{tag}         /collections/all                 /cart  /search  /account  /policies/{policy}
 *
 * Anything that moved lives in the `redirects` table (path → target), like Shopify's URL redirects.
 */
import type { Article, Collection, Page, Product, Site } from "./types";

export const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim()
  .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const productPath = (p: Pick<Product, "$id" | "handle" | "title">) => `/products/${p.handle || slug(p.title) || p.$id}`;
export const collectionPath = (c: Pick<Collection, "handle">) => `/collections/${c.handle}`;
export const pagePath = (p: Pick<Page, "handle">) => `/pages/${p.handle}`;
export const blogPath = (blogHandle: string) => `/blogs/${blogHandle}`;
export const articlePath = (a: Pick<Article, "blogHandle" | "handle">) => `/blogs/${a.blogHandle}/${a.handle}`;

/** Full URL on the store's domain, or just the path when it has no domain yet. */
export const storeUrl = (site: Pick<Site, "domain">, path: string) => site.domain ? `https://${site.domain}${path}` : path;

/**
 * A redirect's "from" in the form it's stored and matched: path only (host removed), leading slash, no trailing
 * slash, lower case, query kept (Shopify matches redirects with a query string, e.g. ?variant=…).
 */
export function normalizePath(input: string): string {
  let s = (input || "").trim();
  s = s.replace(/^[a-z]+:\/\/[^/?#]+/i, "");          // drop https://host
  s = s.split("#")[0];
  if (!s.startsWith("/")) s = "/" + s;
  const [path, query] = [s.split("?")[0], s.includes("?") ? s.slice(s.indexOf("?") + 1) : ""];
  let p = path.replace(/\/{2,}/g, "/").toLowerCase();
  if (p.length > 1) p = p.replace(/\/+$/, "");
  try { p = decodeURI(p); } catch { /* keep as is */ }
  return query ? `${p}?${query}` : p;
}

/** A redirect's "to": a store path (normalised like a "from", without lower-casing the query) or a full URL elsewhere. */
export function normalizeTarget(input: string, ownHosts: string[] = []): string {
  const s = (input || "").trim();
  const m = s.match(/^[a-z]+:\/\/([^/?#]+)(.*)$/i);
  if (m && !ownHosts.includes(m[1].toLowerCase().replace(/^www\./, ""))) return s; // another site: keep the full URL
  const rest = m ? m[2] || "/" : s.startsWith("/") ? s : "/" + s;
  const [path, ...q] = rest.split("?");
  let p = path.replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return q.length ? `${p}?${q.join("?")}` : p;
}

export type RouteType = "home" | "product" | "collection" | "page" | "blog" | "article" | "cart" | "search" | "account" | "policy" | "other";
export interface Route { type: RouteType; handle?: string; collection?: string; blog?: string; tag?: string }

/** Which kind of Shopify page a path is. */
export function parsePath(path: string): Route {
  const parts = normalizePath(path).split("?")[0].split("/").filter(Boolean);
  const [a, b, c, d] = parts;
  if (!a) return { type: "home" };
  if (a === "products" && b) return { type: "product", handle: b };
  if (a === "collections" && b && c === "products" && d) return { type: "product", handle: d, collection: b };
  if (a === "collections" && b) return { type: "collection", handle: b };
  if (a === "collections") return { type: "collection", handle: "all" };
  if (a === "pages" && b) return { type: "page", handle: b };
  if (a === "blogs" && b && c === "tagged" && d) return { type: "blog", blog: b, tag: d };
  if (a === "blogs" && b && c) return { type: "article", blog: b, handle: c };
  if (a === "blogs" && b) return { type: "blog", blog: b };
  if (a === "cart") return { type: "cart" };
  if (a === "search") return { type: "search" };
  if (a === "account") return { type: "account" };
  if (a === "policies" && b) return { type: "policy", handle: b };
  return { type: "other" };
}

/** Unique handle among `taken` (Shopify adds -1, -2… the same way). */
export function uniqueHandle(base: string, taken: Iterable<string>) {
  const set = new Set(taken), root = slug(base) || "item";
  if (!set.has(root)) return root;
  for (let i = 1; ; i++) if (!set.has(`${root}-${i}`)) return `${root}-${i}`;
}
