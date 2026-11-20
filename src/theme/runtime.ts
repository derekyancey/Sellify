/**
 * storefront.js: renders a store's live theme in the shopper's browser.
 *
 * Published pages are pre-rendered HTML (fast, crawlable). This script then loads the current theme,
 * products and collections, re-renders only what changed (new prices, stock, cart), and wires up the
 * cart drawer, quantity pickers, checkout and email signup. It needs yancey.js loaded first:
 *
 *   <script src="/yancey.js" data-endpoint="…" data-project="…" data-site="…" data-success-url="/thank-you"></script>
 *   <script src="/storefront.js" data-name="Store name" data-currency="USD" data-domain="example.com" defer></script>
 *
 * On a blank page (no pre-rendered HTML) it renders everything itself.
 */
import type { Collection, Product } from "../lib/types";
import { installBehaviors } from "./behaviors";
import { patchHead, patchSections } from "./dom";
import { bodyClass, headHtml, pageTitle, renderSections } from "./render";
import { routeFor } from "./routes";
import type { CartLine, RenderCtx, ThemeDoc } from "./types";
import { money } from "./util";
import { predictiveSearch } from "./search";
import { normalizeProduct } from "../lib/variants";

interface YanceyApi {
  settings: { site: string };
  products(): Promise<Product[]>;
  catalog?(): Promise<Product[]>;
  collections(): Promise<Collection[]>;
  theme(): Promise<{ data: ThemeDoc | null } | null>;
  config(): Promise<{ stripe: boolean; paypal: boolean }>;
  cart: { items(): { productId: string; variantId?: string; quantity: number }[]; add(id: string, q?: number, variantId?: string): void; setQuantity(id: string, q: number, variantId?: string): void };
  checkout(provider: "stripe" | "paypal", opts?: Record<string, unknown>): Promise<void>;
  discount(code: string): Promise<{ subtotal: number; discount: { code: string; amount: number }; total: number }>;
  subscribe(email: string): Promise<unknown>;
  handleReturn(): Promise<unknown>;
}
declare global { interface Window { Yancey?: YanceyApi; YanceyStorefront?: { render(): void } } }

const reveal = () => { document.documentElement.style.visibility = ""; };

async function start() {
  const Y = window.Yancey;
  const me = document.querySelector<HTMLScriptElement>("script[src*='storefront.js']");
  if (!Y) { console.error("storefront.js: load yancey.js first"); reveal(); return; }
  const site = { id: Y.settings.site, name: me?.dataset.name || document.title, currency: me?.dataset.currency || "USD", domain: me?.dataset.domain || location.hostname };

  let theme: ThemeDoc | null = null, products: Product[] = [], collections: Collection[] = [], payments = { stripe: true, paypal: false };
  try {
    const [t, p, c, cfg] = await Promise.all([Y.theme(), Y.catalog ? Y.catalog() : Y.products(), Y.collections(), Y.config().catch(() => payments)]);
    theme = t?.data ?? null; products = p.map(x => normalizeProduct(x)); collections = c; payments = cfg;
  } catch (e) {
    console.warn("storefront.js: showing the published copy (could not load live data)", e);
  }

  const behaviors = installBehaviors(document, {
    addToCart: (id, q, v) => Y.cart.add(id, q, v),
    setQuantity: (id, q, v) => Y.cart.setQuantity(id, q, v),
    checkout: (provider, o) => Y.checkout(provider, { discountCode: o.discountCode }),
    buyNow: (id, q, v) => Y.checkout("stripe", { items: [{ productId: id, quantity: q, ...(v ? { variantId: v } : {}) }] }),
    discount: async code => {
      const r = await Y.discount(code);
      return `${r.discount.code} applied: −${money(r.discount.amount, site.currency)}. New total ${money(r.total, site.currency)} (applied again at checkout).`;
    },
    subscribe: email => Y.subscribe(email).then(() => undefined),
    navigate: url => { location.href = url; },
    search: q => theme ? predictiveSearch(q, { products, collections, currency: site.currency }, theme, theme.settings.search_descriptions !== false) : [],
  });

  if (!theme) { reveal(); return; }
  const cache = new Map<string, string>();
  const render = () => {
    const route = routeFor(location.pathname + location.search, theme!, products, collections, site.id);
    const cart: CartLine[] = Y.cart.items().map(i => {
      const product = products.find(p => p.$id === i.productId);
      return { product: product!, variant: product?.variants?.find(v => v.id === i.variantId), quantity: i.quantity };
    }).filter(l => l.product && (!l.product.variants?.length || l.variant));
    const ctx: RenderCtx = { theme: theme!, editor: false, route, data: { site, products, collections, cart, payments } };
    if (!document.querySelector("[data-yt-group]")) {
      document.body.innerHTML = `<div data-yt-group="header"></div><main id="MainContent" data-yt-group="template"></main><div data-yt-group="footer"></div><div data-yt-group="overlay"></div>`;
    }
    patchSections(document, renderSections(ctx), cache);
    patchHead(document, headHtml(ctx), pageTitle(ctx));
    document.body.className = bodyClass(ctx);
    behaviors.refresh();
    reveal();
  };
  // Seed the cache with the pre-rendered sections so unchanged ones aren't touched.
  document.querySelectorAll<HTMLElement>("[data-yt-group] > [data-yt-section]").forEach(el => cache.set(el.dataset.ytSection!, el.outerHTML));
  if (location.pathname.replace(/\/+$/, "") === "/thank-you") await Y.handleReturn().catch(() => null);
  render();
  window.addEventListener("yancey:cart", render);
  window.YanceyStorefront = { render };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
setTimeout(reveal, 4000); // never leave the page hidden
