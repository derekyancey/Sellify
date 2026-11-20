import { list, update } from "./data";
import type { Collection, CollectionCondition, CollectionField, CollectionOp, CollectionRules, CollectionSort, Order, Product } from "./types";

/** Smart-collection conditions, modelled on Shopify's: a field, an operator, and one or more values ("is any of"). */
export const FIELDS: Record<CollectionField, { label: string; kind: "text" | "number" | "tag" | "status" }> = {
  title: { label: "Title", kind: "text" },
  productType: { label: "Type", kind: "text" },
  vendor: { label: "Vendor", kind: "text" },
  tag: { label: "Tag", kind: "tag" },
  price: { label: "Price", kind: "number" },
  compareAtPrice: { label: "Compare-at price", kind: "number" },
  inventory: { label: "Inventory stock", kind: "number" },
  variantTitle: { label: "Variant's title", kind: "text" },
  sku: { label: "SKU", kind: "text" },
  status: { label: "Status", kind: "status" },
};

export const OPS: Record<CollectionOp, string> = {
  is: "is", is_not: "is not", contains: "contains", not_contains: "does not contain",
  starts_with: "starts with", ends_with: "ends with", empty: "is empty", not_empty: "is not empty",
  eq: "is equal to", neq: "is not equal to", gt: "is greater than", lt: "is less than",
};

export function opsFor(f: CollectionField): CollectionOp[] {
  switch (FIELDS[f].kind) {
    case "number": return ["eq", "neq", "gt", "lt"];
    case "tag": return ["is", "is_not", "contains", "not_contains"];
    case "status": return ["is", "is_not"];
    default: return ["is", "is_not", "contains", "not_contains", "starts_with", "ends_with", "empty", "not_empty"];
  }
}
/** Operators that take several values, matched as "any of" (positive) or "none of" (negative). */
export const isMulti = (op: CollectionOp) => !["eq", "neq", "gt", "lt", "empty", "not_empty"].includes(op);
export const needsValue = (op: CollectionOp) => op !== "empty" && op !== "not_empty";

export const SORTS: Record<CollectionSort, string> = {
  manual: "Manually", "best-selling": "Best selling", "title-asc": "Product title A–Z", "title-desc": "Product title Z–A",
  "price-desc": "Highest price", "price-asc": "Lowest price", "created-desc": "Newest", "created-asc": "Oldest",
};

const lc = (s: unknown) => String(s ?? "").trim().toLowerCase();
const variantsOf = (p: Product) => p.variants?.length ? p.variants : [{ title: "Default Title", price: p.price, compareAtPrice: p.compareAtPrice, sku: p.sku, inventory: p.inventory }];

/** The value(s) a condition looks at on one product. Several values (tags, variants) match if any one does. */
function valuesOf(p: Product, f: CollectionField): (string | number | null | undefined)[] {
  switch (f) {
    case "title": return [p.title];
    case "productType": return [p.productType];
    case "vendor": return [p.vendor];
    case "tag": return p.tags ?? [];
    case "status": return [p.status];
    case "price": return variantsOf(p).map(v => v.price);
    case "compareAtPrice": return variantsOf(p).map(v => v.compareAtPrice ?? null);
    case "inventory": return [p.tracksInventory === false ? null : p.inventory];
    case "variantTitle": return variantsOf(p).map(v => v.title);
    case "sku": return variantsOf(p).map(v => v.sku);
  }
}

function textHit(have: string, op: CollectionOp, want: string) {
  switch (op) {
    case "is": case "is_not": return have === want;
    case "contains": case "not_contains": return have.includes(want);
    case "starts_with": return have.startsWith(want);
    case "ends_with": return have.endsWith(want);
    default: return false;
  }
}

export function conditionMatches(p: Product, c: CollectionCondition): boolean {
  const have = valuesOf(p, c.field);
  if (FIELDS[c.field].kind === "number") {
    const want = Number(c.values[0]);
    if (c.values[0] === undefined || c.values[0] === "" || Number.isNaN(want)) return false;
    const nums = have.filter((v): v is number => typeof v === "number");
    switch (c.op) {
      case "eq": return nums.some(n => n === want);
      case "neq": return nums.length > 0 && nums.every(n => n !== want);
      case "gt": return nums.some(n => n > want);
      case "lt": return nums.some(n => n < want);
      default: return false;
    }
  }
  const strs = have.map(lc).filter(Boolean);
  if (c.op === "empty") return strs.length === 0;
  if (c.op === "not_empty") return strs.length > 0;
  const wants = c.values.map(lc).filter(Boolean);
  if (!wants.length) return false;
  const anyHit = wants.some(w => strs.some(h => textHit(h, c.op, w)));
  return c.op === "is_not" || c.op === "not_contains" ? !anyHit : anyHit;
}

export function matchesRules(p: Product, rules: CollectionRules | null | undefined) {
  const conds = (rules?.conditions ?? []).filter(c => !needsValue(c.op) || c.values.some(v => String(v).trim()));
  if (!conds.length) return false;
  return rules!.match === "any" ? conds.some(c => conditionMatches(p, c)) : conds.every(c => conditionMatches(p, c));
}

/** Units sold per product id, for "best selling". */
export function salesByProduct(orders: Order[]) {
  const m = new Map<string, number>();
  for (const o of orders) {
    if (o.cancelledAt || o.financialStatus === "voided") continue;
    for (const li of o.items ?? []) if (li.productId) m.set(li.productId, (m.get(li.productId) ?? 0) + (li.quantity || 0));
  }
  return m;
}

const minPrice = (p: Product) => Math.min(...variantsOf(p).map(v => v.price ?? 0));

export function sortProducts(ps: Product[], sort: CollectionSort, manualOrder: string[] = [], sales?: Map<string, number>) {
  const out = ps.slice();
  const pos = new Map(manualOrder.map((id, i) => [id, i]));
  const byTitle = (a: Product, b: Product) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
  switch (sort) {
    case "title-asc": return out.sort(byTitle);
    case "title-desc": return out.sort((a, b) => byTitle(b, a));
    case "price-asc": return out.sort((a, b) => minPrice(a) - minPrice(b) || byTitle(a, b));
    case "price-desc": return out.sort((a, b) => minPrice(b) - minPrice(a) || byTitle(a, b));
    case "created-desc": return out.sort((a, b) => b.$createdAt.localeCompare(a.$createdAt));
    case "created-asc": return out.sort((a, b) => a.$createdAt.localeCompare(b.$createdAt));
    case "best-selling": return out.sort((a, b) => (sales?.get(b.$id) ?? 0) - (sales?.get(a.$id) ?? 0) || byTitle(a, b));
    default: return out.sort((a, b) => (pos.get(a.$id) ?? 1e9) - (pos.get(b.$id) ?? 1e9) || byTitle(a, b));
  }
}

export const isSmart = (c: Pick<Collection, "type">) => c.type === "smart";
export const sortOf = (c: Pick<Collection, "sortOrder" | "type">): CollectionSort => c.sortOrder ?? (isSmart(c) ? "best-selling" : "manual");

/** The products in a collection, in display order. Smart collections are recalculated from their conditions. */
export function collectionProducts(c: Pick<Collection, "type" | "rules" | "productIds" | "sortOrder">, products: Product[], sales?: Map<string, number>) {
  const members = isSmart(c) ? products.filter(p => matchesRules(p, c.rules)) : products.filter(p => (c.productIds ?? []).includes(p.$id));
  return sortProducts(members, sortOf(c), c.productIds ?? [], sales);
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Recalculate the stored product list of every collection in a store so the storefront (which reads productIds)
 * stays current after products change. Only collections whose list actually changed are written.
 */
export async function syncCollections(siteId: string, known?: { products?: Product[]; collections?: Collection[] }) {
  const collections = known?.collections ?? await list("collections", siteId);
  if (!collections.length) return 0;
  const products = known?.products ?? await list("products", siteId);
  const sales = collections.some(c => sortOf(c) === "best-selling") ? salesByProduct(await list("orders", siteId)) : undefined;
  let changed = 0;
  for (const c of collections) {
    const ids = collectionProducts(c, products, sales).map(p => p.$id);
    if (!same(ids, c.productIds ?? [])) { await update("collections", c.$id, { productIds: ids }); c.productIds = ids; changed++; }
  }
  return changed;
}

/** Collection ideas from a store's products: one per product type, plus frequently used tags. */
export function suggestions(products: Product[], existing: Collection[]) {
  const taken = new Set(existing.map(c => lc(c.title)));
  const count = (vals: (string | undefined)[]) => {
    const m = new Map<string, { label: string; n: number }>();
    for (const v of vals) { const k = lc(v); if (!k) continue; const e = m.get(k); if (e) e.n++; else m.set(k, { label: String(v).trim(), n: 1 }); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  };
  const types = count(products.map(p => p.productType)).filter(t => t.n >= 2);
  const typeKeys = new Set(types.map(t => lc(t.label)));
  const tags = count(products.flatMap(p => p.tags ?? [])).filter(t => t.n >= 3 && !typeKeys.has(lc(t.label)));
  const mk = (field: CollectionField, t: { label: string; n: number }) => ({
    key: `${field}:${lc(t.label)}`, title: t.label, field, count: t.n, exists: taken.has(lc(t.label)),
    rules: { match: "all", conditions: [{ field, op: "is", values: [t.label] }] } as CollectionRules,
  });
  return { types: types.map(t => mk("productType", t)), tags: tags.map(t => mk("tag", t)) };
}

/** Distinct values per field, for the condition value suggestions. */
export function valueOptions(products: Product[]): Partial<Record<CollectionField, string[]>> {
  const uniq = (xs: (string | null | undefined)[]) => {
    const m = new Map<string, string>();
    for (const x of xs) { const k = lc(x); if (k && !m.has(k)) m.set(k, String(x).trim()); }
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  };
  return {
    productType: uniq(products.map(p => p.productType)), vendor: uniq(products.map(p => p.vendor)),
    tag: uniq(products.flatMap(p => p.tags ?? [])), variantTitle: uniq(products.flatMap(p => (p.variants ?? []).map(v => v.title))),
    title: uniq(products.map(p => p.title)), status: ["active", "unlisted", "draft", "archived"],
  };
}

export const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
