/**
 * Product variants, Shopify-style: up to 3 options (Size, Color…) and one variant per combination.
 * A product's own price / compareAtPrice / inventory are kept as roll-ups (cheapest price, total stock)
 * so lists, the feed and older storefront code keep working.
 *
 * Products are stored in one of two shapes, and normalizeProduct() reads both into the one the app uses:
 *   app shape:     options [{name, values}], variant.options ["M", "Red"], variant.imageUrl, images ["https://…"]
 *   Shopify import: no options column, variant.options {"Size": "M"}, variant.image, images [{src, alt}],
 *                   and a lone "Default Title" variant (option "Title") on products without options.
 */
import type { Product, ProductOption, Variant } from "./types";

export const MAX_OPTIONS = 3;
export const MAX_VARIANTS = 100;

/* ------------------------------------------------------------------ reading both formats */
const DEFAULT_TITLE = "Default Title";
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const parse = (v: unknown) => {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
};
/** An image entry: a URL, or an object like {src}, {url} or {originalSrc}. */
const imageUrlOf = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") { const o = v as Record<string, unknown>; return str(o.src ?? o.url ?? o.originalSrc ?? o.original).trim(); }
  return "";
};
const num = (v: unknown, d = 0) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? d : Number(v));

/** Shopify's placeholder option on products without options. */
const isPlaceholderOption = (o: ProductOption) => o.name.toLowerCase() === "title" && o.values.length <= 1 && (!o.values[0] || o.values[0] === DEFAULT_TITLE);

/** Alt text and the original Shopify URL of each image seen, so saving keeps them (the importer relies on "original"). */
const imageMeta = new Map<string, { alt?: string | null; original?: string }>();

/**
 * Images in the stored form: [{src, alt?, original?}], main image first. Shopify imports use this form, and the
 * importer and image copier match on "original", so products saved from the editor keep it too.
 */
export function storedImages(main: string | undefined, rest: string[] = []) {
  return [...new Set([main, ...rest].filter((u): u is string => !!u))].map(src => ({ src, ...(imageMeta.get(src) ?? {}) }));
}

/** Read a product row in either stored format. Safe to call more than once. */
export function normalizeProduct<T extends Partial<Product>>(raw: T): T {
  const p: any = { ...raw };

  // Images: strings or {src} objects; the main image is imageUrl, the rest go in images.
  const rawImages = parse(p.images);
  if (Array.isArray(rawImages)) for (const i of rawImages) if (i && typeof i === "object" && imageUrlOf(i)) {
    imageMeta.set(imageUrlOf(i), { ...(i.alt ? { alt: i.alt } : {}), ...(i.original ? { original: i.original } : {}) });
  }
  const images = (Array.isArray(rawImages) ? rawImages : []).map(imageUrlOf).filter(Boolean);
  p.imageUrl = str(p.imageUrl).trim() || images[0] || "";
  p.images = [...new Set(images.filter((u: string) => u !== p.imageUrl))];

  // Options and variants.
  const rawVariants = parse(p.variants);
  const list: any[] = (Array.isArray(rawVariants) ? rawVariants : []).filter(v => v && typeof v === "object");
  const rawOptions = parse(p.options);
  let options: ProductOption[] = Array.isArray(rawOptions)
    ? rawOptions.filter(o => o && typeof o === "object").map(o => ({ name: str(o.name), values: Array.isArray(o.values) ? o.values.map(str) : [] }))
    : [];
  if (!options.length) {
    // Shopify shape: derive option names (in order) and values (in order of appearance) from {"Size": "M"} maps.
    const byName = new Map<string, string[]>();
    for (const v of list) if (v.options && !Array.isArray(v.options) && typeof v.options === "object") {
      for (const [name, value] of Object.entries(v.options)) {
        const vals = byName.get(name) ?? []; if (!vals.includes(str(value))) vals.push(str(value)); byName.set(name, vals);
      }
    }
    options = [...byName].map(([name, values]) => ({ name, values }));
  }
  const keep = options.map(o => !isPlaceholderOption(o));
  const realOptions = options.filter((_, i) => keep[i]);

  p.variants = list.map((v): Variant => {
    let values: string[];
    if (Array.isArray(v.options)) values = v.options.map(str);
    else if (v.options && typeof v.options === "object") values = options.map(o => str(v.options[o.name]));
    else values = [];
    values = values.filter((_, i) => keep[i] ?? true).slice(0, realOptions.length || undefined);
    if (!realOptions.length) values = [];
    const out: Variant = {
      ...v,
      id: str(v.id) || "v" + Math.random().toString(36).slice(2, 10),
      options: values,
      title: values.length ? values.join(" / ") : (str(v.title) && v.title !== DEFAULT_TITLE ? str(v.title) : undefined),
      price: num(v.price),
      compareAtPrice: v.compareAtPrice == null || v.compareAtPrice === "" ? undefined : num(v.compareAtPrice),
      inventory: Math.trunc(num(v.inventory)),
      imageUrl: imageUrlOf(v.imageUrl ?? v.image) || undefined,
    };
    delete (out as any).image;
    return out;
  });
  p.options = realOptions;
  if (p.tracksInventory === null || p.tracksInventory === undefined) p.tracksInventory = true;
  const tags = parse(p.tags);
  p.tags = Array.isArray(tags) ? tags.map(str).filter(Boolean) : typeof tags === "string" && tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  return p as T;
}

/* ------------------------------------------------------------------ helpers */
/** True when the product has real options to choose from (not just one default variant). */
export const hasVariants = (p: Pick<Product, "options" | "variants">) => (p.options?.length ?? 0) > 0 && (p.variants?.length ?? 0) > 0;
export const variantTitle = (v: Pick<Variant, "options" | "title">) => (v.options.length ? v.options.join(" / ") : v.title ?? "");
export const findVariant = (p: Pick<Product, "variants">, id?: string | null) => (id ? p.variants?.find(v => v.id === id) : undefined);

/** Title for order lines, emails and payment pages: "House Blend — 2lb / Ground". */
export const lineTitle = (p: Pick<Product, "title">, v?: Pick<Variant, "options" | "title">) => {
  const t = v ? variantTitle(v) : "";
  return t ? `${p.title} — ${t}` : p.title;
};

/** Is stock counted for this product (or variant)? Untracked items (digital goods) are always available. */
export const isTracked = (p: Pick<Product, "tracksInventory">, v?: Pick<Variant, "tracked">) => p.tracksInventory !== false && v?.tracked !== false;
/** Can it be bought right now? */
export function isAvailable(p: Product, v?: Variant): boolean {
  if (v) return !isTracked(p, v) || v.inventory > 0;
  if (p.variants?.length) return p.variants.some(x => isAvailable(p, x));
  return !isTracked(p) || p.inventory > 0;
}

const vid = () => "v" + Math.random().toString(36).slice(2, 9);

function combos(options: ProductOption[]): string[][] {
  return options.filter(o => o.values.length).reduce<string[][]>((acc, o) => acc.flatMap(c => o.values.map(v => [...c, v])), [[]]).filter(c => c.length);
}

/**
 * Rebuild the variant list after options change. Existing variants keep their price, stock and SKU
 * when their values still exist (also when an option was added: the old values are matched as a prefix).
 */
export function generateVariants(options: ProductOption[], existing: Variant[], base: { price: number; compareAtPrice?: number | null; inventory?: number }): Variant[] {
  const list = combos(options).slice(0, MAX_VARIANTS);
  const used = new Set<string>();
  return list.map(values => {
    const key = values.join("\u0000");
    const match = existing.find(v => !used.has(v.id) && v.options.join("\u0000") === key)
      ?? existing.find(v => !used.has(v.id) && v.options.length < values.length && v.options.every((x, i) => values[i] === x))
      ?? existing.find(v => !used.has(v.id) && values.length < v.options.length && values.every((x, i) => v.options[i] === x));
    if (match) { used.add(match.id); return { ...match, options: values, title: values.join(" / ") }; }
    return { id: vid(), options: values, title: values.join(" / "), price: base.price, compareAtPrice: base.compareAtPrice ?? undefined, inventory: list.length === 1 ? base.inventory ?? 0 : 0 };
  });
}

/**
 * Keep the product-level roll-ups in sync with its variants before saving. A product without options
 * keeps (or gets) one default variant carrying its price, SKU and stock, as Shopify imports do.
 */
export function withRollups<T extends Partial<Product>>(p: T): T {
  if (!p.options?.length || !p.variants?.length) {
    const base = p.variants?.find(v => !v.options.length) ?? p.variants?.[0];
    if (!base) return { ...p, options: [], variants: [] };
    // One default variant mirrors the product-level fields edited in the form.
    const v: Variant = { ...base, options: [], title: undefined, price: p.price ?? base.price, compareAtPrice: p.compareAtPrice ?? undefined, sku: p.sku ?? base.sku, inventory: p.inventory ?? base.inventory };
    return { ...p, options: [], variants: [v] };
  }
  const cheapest = p.variants.reduce((m, v) => (v.price < m.price ? v : m), p.variants[0]);
  return { ...p, price: cheapest.price, compareAtPrice: cheapest.compareAtPrice ?? undefined, inventory: p.variants.reduce((t, v) => t + Math.max(0, v.inventory || 0), 0) };
}

/** "$16 – $48" style range info for cards. */
export function priceRange(p: Product) {
  if (!p.variants?.length) return { min: p.price, max: p.price, varies: false };
  const prices = p.variants.map(v => v.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  return { min, max, varies: min !== max };
}

/** The variant to show first: the one asked for, else the first available, else the first. */
export function defaultVariant(p: Product, wanted?: string | null) {
  return findVariant(p, wanted) ?? p.variants?.find(v => isAvailable(p, v)) ?? p.variants?.[0];
}

/** Stock for a product or one of its variants. */
export const stockOf = (p: Product, v?: Variant) => (v ? v.inventory : p.inventory);

/** Every image of a product in gallery order: main image, extra images, then variant images not already listed. */
export function galleryOf(p: Pick<Product, "imageUrl" | "images" | "variants">): string[] {
  const all = [p.imageUrl, ...(p.images ?? []), ...(p.variants ?? []).map(v => v.imageUrl)].filter((u): u is string => !!u);
  return [...new Set(all)];
}
