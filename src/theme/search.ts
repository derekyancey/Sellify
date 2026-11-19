import type { Collection, Product } from "../lib/types";
import { galleryOf, priceRange } from "../lib/variants";
import type { ThemeDoc } from "./types";
import { money } from "./util";

export interface Suggestion { kind: "product" | "collection" | "page"; title: string; url: string; image?: string; price?: string }

/** Predictive search: as-you-type matches across products (title, SKU, options), collections and pages. */
export function predictiveSearch(q: string, data: { products: Product[]; collections: Collection[]; currency: string }, theme: ThemeDoc, descriptions = true): Suggestion[] {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hit = (text: string) => terms.every(t => text.includes(t));
  const score = (title: string) => (title.toLowerCase().startsWith(terms[0]) ? 0 : 1);
  const products = data.products.filter(p => p.status === "active").filter(p => {
    const text = [p.title, p.sku, ...(p.variants ?? []).flatMap(v => [v.sku, ...v.options]), descriptions ? p.description : ""].join(" ").toLowerCase();
    return hit(text);
  }).sort((a, b) => score(a.title) - score(b.title)).slice(0, 6).map<Suggestion>(p => {
    const r = priceRange(p);
    return { kind: "product", title: p.title, url: `/products/${p.$id}`, image: galleryOf(p)[0], price: `${r.varies ? "From " : ""}${money(r.min, data.currency)}` };
  });
  const collections = data.collections.filter(c => hit(c.title.toLowerCase())).slice(0, 3)
    .map<Suggestion>(c => ({ kind: "collection", title: c.title, url: `/collections/${c.handle}` }));
  const pages = Object.entries(theme.templates).filter(([k, t]) => k.startsWith("page.") && hit((t.title ?? k).toLowerCase())).slice(0, 3)
    .map<Suggestion>(([k, t]) => ({ kind: "page", title: t.title ?? k.slice(5), url: `/pages/${k.slice(5)}` }));
  return [...products, ...collections, ...pages];
}
