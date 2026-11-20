/**
 * Storefront filtering for collection and search pages, using Shopify's URL scheme:
 *   ?filter.v.availability=1&filter.v.price.gte=10&filter.v.price.lte=40&filter.v.option.size=M&filter.v.option.size=L&sort=price-asc&page=2
 */
import type { Product } from "../lib/types";
import { isAvailable, priceRange } from "../lib/variants";
import type { Route } from "./types";

export type Params = Record<string, string[]>;
const OPT = "filter.v.option.";

export const paramsOf = (search: string): Params => {
  const out: Params = {};
  new URLSearchParams(search).forEach((v, k) => { (out[k] ??= []).push(v); });
  return out;
};
export function queryOf(params: Params, patch: Params = {}) {
  const merged = { ...params, ...patch };
  const q = new URLSearchParams();
  for (const [k, vs] of Object.entries(merged)) for (const v of vs) if (v !== "") q.append(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, "-");

export interface Facet { name: string; key: string; values: { value: string; count: number; active: boolean }[] }

/** Options available to filter by within these products, with how many products have each value. */
export function facets(products: Product[], params: Params): Facet[] {
  const map = new Map<string, Facet>();
  for (const p of products) for (const [oi, o] of (p.options ?? []).entries()) {
    const k = key(o.name);
    const f = map.get(k) ?? { name: o.name, key: k, values: [] };
    for (const v of o.values) {
      if (!p.variants?.some(x => x.options[oi] === v)) continue;
      let row = f.values.find(x => x.value === v);
      if (!row) { row = { value: v, count: 0, active: (params[OPT + k] ?? []).includes(v) }; f.values.push(row); }
      row.count++;
    }
    map.set(k, f);
  }
  return [...map.values()].filter(f => f.values.length > 1 || f.values.some(v => v.active));
}

export function applyFilters(products: Product[], params: Params) {
  const inStock = params["filter.v.availability"]?.includes("1");
  const gte = Number(params["filter.v.price.gte"]?.[0]), lte = Number(params["filter.v.price.lte"]?.[0]);
  const optionFilters = Object.entries(params).filter(([k, v]) => k.startsWith(OPT) && v.length).map(([k, v]) => ({ key: k.slice(OPT.length), values: v }));
  return products.filter(p => {
    if (inStock && !isAvailable(p)) return false;
    const r = priceRange(p);
    if (!isNaN(gte) && params["filter.v.price.gte"]?.[0] && r.max < gte) return false;
    if (!isNaN(lte) && params["filter.v.price.lte"]?.[0] && r.min > lte) return false;
    for (const f of optionFilters) {
      const oi = (p.options ?? []).findIndex(o => key(o.name) === f.key);
      if (oi < 0) return false;
      // Match a variant with one of the chosen values (in stock if availability is on).
      if (!p.variants?.some(v => f.values.includes(v.options[oi]) && (!inStock || isAvailable(p, v)))) return false;
    }
    return true;
  });
}

/** Human-readable chips for active filters, each with the URL that removes it. */
export function activeChips(route: Route, params: Params) {
  const base = route.path.split("?")[0];
  const chips: { label: string; href: string }[] = [];
  const without = (k: string, v?: string) => base + queryOf(params, { [k]: v === undefined ? [] : (params[k] ?? []).filter(x => x !== v), page: [] });
  if (params["filter.v.availability"]?.includes("1")) chips.push({ label: "In stock", href: without("filter.v.availability") });
  const g = params["filter.v.price.gte"]?.[0], l = params["filter.v.price.lte"]?.[0];
  if (g || l) chips.push({ label: g && l ? `Price: ${g}–${l}` : g ? `Price: from ${g}` : `Price: up to ${l}`, href: base + queryOf(params, { "filter.v.price.gte": [], "filter.v.price.lte": [], page: [] }) });
  for (const [k, vs] of Object.entries(params)) if (k.startsWith(OPT)) for (const v of vs) chips.push({ label: v, href: without(k, v) });
  const clear = base + queryOf(Object.fromEntries(Object.entries(params).filter(([k]) => k === "sort" || k === "q")));
  return { chips, clear };
}

export { OPT as OPTION_PREFIX };
