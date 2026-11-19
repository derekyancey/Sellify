/**
 * Product variants, Shopify-style: up to 3 options (Size, Color…) and one variant per combination.
 * A product's own price / compareAtPrice / inventory are kept as roll-ups (cheapest price, total stock)
 * so lists, the feed and older storefront code keep working.
 */
import type { Product, ProductOption, Variant } from "./types";

export const MAX_OPTIONS = 3;
export const MAX_VARIANTS = 100;

export const hasVariants = (p: Pick<Product, "variants">) => (p.variants?.length ?? 0) > 0;
export const variantTitle = (v: Pick<Variant, "options">) => v.options.join(" / ");
export const findVariant = (p: Pick<Product, "variants">, id?: string | null) => (id ? p.variants?.find(v => v.id === id) : undefined);

/** Title for order lines, emails and payment pages: "House Blend — 2lb / Ground". */
export const lineTitle = (p: Pick<Product, "title">, v?: Pick<Variant, "options">) => (v ? `${p.title} — ${variantTitle(v)}` : p.title);

const vid = () => "v" + Math.random().toString(36).slice(2, 9);

function combos(options: ProductOption[]): string[][] {
  return options.filter(o => o.values.length).reduce<string[][]>((acc, o) => acc.flatMap(c => o.values.map(v => [...c, v])), [[]]).filter(c => c.length);
}

/**
 * Rebuild the variant list after options change. Existing variants keep their price, stock and SKU
 * when their values still exist (also when an option was added: the old values are matched as a prefix).
 */
export function generateVariants(options: ProductOption[], existing: Variant[], base: { price: number; compareAtPrice?: number; inventory?: number }): Variant[] {
  const list = combos(options).slice(0, MAX_VARIANTS);
  const used = new Set<string>();
  return list.map(values => {
    const key = values.join("\u0000");
    const match = existing.find(v => !used.has(v.id) && v.options.join("\u0000") === key)
      ?? existing.find(v => !used.has(v.id) && v.options.length < values.length && v.options.every((x, i) => values[i] === x))
      ?? existing.find(v => !used.has(v.id) && values.length < v.options.length && values.every((x, i) => v.options[i] === x));
    if (match) { used.add(match.id); return { ...match, options: values }; }
    return { id: vid(), options: values, price: base.price, compareAtPrice: base.compareAtPrice, inventory: list.length === 1 ? base.inventory ?? 0 : 0 };
  });
}

/** Keep the product-level roll-ups in sync with its variants. */
export function withRollups<T extends Partial<Product>>(p: T): T {
  if (!p.variants?.length) return { ...p, options: [], variants: [] };
  const cheapest = p.variants.reduce((m, v) => (v.price < m.price ? v : m), p.variants[0]);
  return { ...p, price: cheapest.price, compareAtPrice: cheapest.compareAtPrice, inventory: p.variants.reduce((t, v) => t + Math.max(0, v.inventory || 0), 0) };
}

/** "$16 – $48" style range info for cards. */
export function priceRange(p: Product) {
  if (!p.variants?.length) return { min: p.price, max: p.price, varies: false };
  const prices = p.variants.map(v => v.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  return { min, max, varies: min !== max };
}

/** The variant to show first: the one asked for, else the first in stock, else the first. */
export function defaultVariant(p: Product, wanted?: string | null) {
  return findVariant(p, wanted) ?? p.variants?.find(v => v.inventory > 0) ?? p.variants?.[0];
}

/** Stock for a product or one of its variants. */
export const stockOf = (p: Product, v?: Variant) => (v ? v.inventory : p.inventory);

/** Every image of a product in gallery order: main image, extra images, then variant images not already listed. */
export function galleryOf(p: Pick<Product, "imageUrl" | "images" | "variants">): string[] {
  const all = [p.imageUrl, ...(p.images ?? []), ...(p.variants ?? []).map(v => v.imageUrl)].filter((u): u is string => !!u);
  return [...new Set(all)];
}
