import type { Collection, Product } from "../lib/types";
import type { RenderCtx, SectionCtx, Settings, SettingValue } from "./types";

export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const str = (v: SettingValue, d = "") => (v === undefined || v === null ? d : String(v));
export const num = (v: SettingValue, d = 0) => (v === undefined || v === null || v === "" || isNaN(Number(v)) ? d : Number(v));
export const bool = (v: SettingValue, d = false) => (v === undefined || v === null ? d : v === true || v === "true");
export const uid = (p = "") => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

/** Inline rich text allows <b>, <i>, <em>, <strong>, <a>, <br>, <u> only. */
export function inline(v: SettingValue) {
  return str(v).replace(/<(?!\/?(b|i|em|strong|u|br|a)(\s+href="[^"<>]*")?\s*\/?>)[^>]*>/gi, "");
}
/** Rich text: block tags + inline tags; strips scripts, styles, event handlers and javascript: urls. */
export function rich(v: SettingValue) {
  return str(v)
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2");
}

export function money(n: number, currency = "USD") {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}
export const fmt = (ctx: RenderCtx, n: number) => money(n, ctx.data.site.currency || "USD");

/* ---------------------------------------------------------------- URLs */
export const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 60);
export const productUrl = (p: Product) => `/products/${p.$id}`;
export const collectionUrl = (c: Collection) => `/collections/${c.handle}`;

/** Settings of type "url" store either a path or a reference like "product:<id>" / "collection:<handle>". */
export function href(ctx: RenderCtx, v: SettingValue) {
  const u = str(v).trim();
  if (!u) return "";
  if (u.startsWith("product:")) return `/products/${u.slice(8)}`;
  if (u.startsWith("collection:")) return `/collections/${u.slice(11)}`;
  if (u.startsWith("page:")) return `/pages/${u.slice(5)}`;
  if (/^(javascript|data):/i.test(u)) return "#";
  void ctx;
  return u;
}

export function findProduct(ctx: RenderCtx, id: SettingValue) {
  return ctx.data.products.find(p => p.$id === id);
}
export function findCollection(ctx: RenderCtx, handle: SettingValue) {
  return ctx.data.collections.find(c => c.handle === handle || c.$id === handle);
}
export function collectionProducts(ctx: RenderCtx, c?: Collection) {
  const active = ctx.data.products.filter(p => p.status === "active");
  if (!c) return active;
  const order = c.productIds ?? [];
  return active.filter(p => order.includes(p.$id)).sort((a, b) => order.indexOf(a.$id) - order.indexOf(b.$id));
}

/* ---------------------------------------------------------------- editor hooks */
/** Marks a block so the editor can select it by clicking the preview. */
export const blockAttrs = (s: SectionCtx, blockId: string) => (s.editor ? ` data-yt-block="${esc(blockId)}"` : "");
/** Marks a text setting for inline editing in the preview (improvement over Shopify). */
export const editable = (s: SectionCtx, key: string, blockId?: string) =>
  s.editor ? ` data-yt-edit="${esc(key)}"${blockId ? ` data-yt-edit-block="${esc(blockId)}"` : ""}` : "";

export const schemeClass = (v: SettingValue) => `color-${esc(str(v, "scheme-1"))}`;

/** Section wrapper padding from the common "padding_top/padding_bottom" settings. */
export function pad(st: Settings) {
  const t = num(st.padding_top, 36), b = num(st.padding_bottom, 36);
  return `--pt:${t}px;--pb:${b}px`;
}

/* ---------------------------------------------------------------- media */
export function placeholderSvg(kind: "image" | "product" | "collection" | "lifestyle" = "image") {
  const paths: Record<string, string> = {
    image: '<path d="M30 70l18-22 13 15 9-10 20 17z" fill="currentColor" opacity=".35"/><circle cx="68" cy="38" r="7" fill="currentColor" opacity=".35"/>',
    product: '<rect x="35" y="28" width="30" height="44" rx="6" fill="currentColor" opacity=".3"/><rect x="40" y="22" width="20" height="8" rx="2" fill="currentColor" opacity=".4"/>',
    collection: '<rect x="24" y="30" width="24" height="40" rx="4" fill="currentColor" opacity=".25"/><rect x="52" y="30" width="24" height="40" rx="4" fill="currentColor" opacity=".35"/>',
    lifestyle: '<path d="M10 80c15-25 30-25 40-10s25 15 40-10v20H10z" fill="currentColor" opacity=".3"/><circle cx="72" cy="30" r="9" fill="currentColor" opacity=".3"/>',
  };
  return `<svg class="placeholder-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${paths[kind]}</svg>`;
}

export function img(src: SettingValue, alt: string, opts: { cls?: string; ratio?: string; placeholder?: "image" | "product" | "collection" | "lifestyle"; eager?: boolean } = {}) {
  const s = str(src);
  const style = opts.ratio && opts.ratio !== "adapt" ? ` style="aspect-ratio:${esc(opts.ratio)}"` : "";
  if (!s) return `<div class="media media--placeholder ${opts.cls ?? ""}"${style}>${placeholderSvg(opts.placeholder)}</div>`;
  return `<div class="media ${opts.cls ?? ""}"${style}><img src="${esc(s)}" alt="${esc(alt)}" ${opts.eager ? 'fetchpriority="high"' : 'loading="lazy"'}></div>`;
}

export function ratioFor(v: SettingValue) {
  return ({ square: "1/1", portrait: "4/5", landscape: "4/3", wide: "16/9", adapt: "adapt" } as Record<string, string>)[str(v, "square")] ?? "1/1";
}

/* ---------------------------------------------------------------- shared pieces */
export function button(label: string, url: string, style: "primary" | "secondary" | "link" = "primary", attrs = "") {
  if (!label) return "";
  const cls = style === "link" ? "link-arrow" : `button${style === "secondary" ? " button--secondary" : ""}`;
  return url ? `<a class="${cls}" href="${esc(url)}"${attrs}>${esc(label)}</a>` : `<span class="${cls}"${attrs}>${esc(label)}</span>`;
}

export function priceHtml(ctx: RenderCtx, p: Product) {
  const sale = p.compareAtPrice && p.compareAtPrice > p.price;
  return `<div class="price${sale ? " price--sale" : ""}">${sale ? `<s class="price__compare">${fmt(ctx, p.compareAtPrice!)}</s>` : ""}<span class="price__current">${fmt(ctx, p.price)}</span></div>`;
}

export function productCard(ctx: RenderCtx, p: Product, o: { ratio?: string; quickAdd?: boolean; showSecondary?: boolean } = {}) {
  const ts = ctx.theme.settings;
  const sale = p.compareAtPrice && p.compareAtPrice > p.price;
  const sold = p.inventory <= 0;
  const badgePos = str(ts.badge_position, "bottom-left");
  const badge = sold ? `<span class="badge badge--sold ${badgePos}">Sold out</span>` : sale && bool(ts.show_sale_badge, true) ? `<span class="badge badge--sale ${badgePos}">Sale</span>` : "";
  return `<div class="card card--${esc(str(ts.card_style, "standard"))}">
  <a class="card__link" href="${productUrl(p)}" aria-label="${esc(p.title)}"></a>
  <div class="card__media">${img(p.imageUrl, p.title, { ratio: o.ratio ?? "1/1", placeholder: "product" })}${badge}</div>
  <div class="card__info">
    <h3 class="card__title">${esc(p.title)}</h3>
    ${priceHtml(ctx, p)}
    ${o.quickAdd ? `<button type="button" class="button button--secondary button--small card__quick" data-add-to-cart="${esc(p.$id)}"${sold ? " disabled" : ""}>${sold ? "Sold out" : "Add to cart"}</button>` : ""}
  </div>
</div>`;
}

export function collectionCard(ctx: RenderCtx, c: Collection | undefined, title: string, ratio: string) {
  const first = c ? collectionProducts(ctx, c).find(p => p.imageUrl) : undefined;
  const url = c ? collectionUrl(c) : "";
  return `<div class="card card--collection">
  ${url ? `<a class="card__link" href="${url}" aria-label="${esc(title)}"></a>` : ""}
  <div class="card__media">${img(first?.imageUrl, title, { ratio, placeholder: "collection" })}</div>
  <div class="card__info"><h3 class="card__title">${esc(title)} <span class="icon-arrow">→</span></h3></div>
</div>`;
}

export const ICONS: Record<string, string> = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 7h14l-1.2 12H6.2z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
  account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m6 9 6 6 6-6"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m15 6-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m9 6 6 6-6 6"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
  return: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15z"/><path d="M5 19 14 10"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 5h16v11H8l-4 4z"/></svg>',
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9M12 8v13M12 8c-2-4-6-4-6-1s6 1 6 1 6 2 6-1-4-3-6 1"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 5 5 9-10"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 12h14"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 8h3V4h-3c-2.8 0-4 1.8-4 4.3V10H7v4h3v8h4v-8h3l1-4h-4V8.6c0-.4.3-.6.6-.6z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 3c.3 2.3 1.7 3.8 4 4v3.2c-1.5 0-2.8-.4-4-1.2V15a6 6 0 1 1-6-6v3.3a2.7 2.7 0 1 0 2.7 2.7V3z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 8.2a3 3 0 0 0-2-2C18.2 5.7 12 5.7 12 5.7s-6.2 0-8 .5a3 3 0 0 0-2 2A31 31 0 0 0 1.7 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2 2c1.8.5 8 .5 8 .5s6.2 0 8-.5a3 3 0 0 0 2-2 31 31 0 0 0 .3-3.8 31 31 0 0 0-.3-3.8zM10 15V9l5.2 3z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.7 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2l7.3-8.4L1.7 3h6.4l4.4 5.9zm-1.1 16.2h1.7L7.2 4.7H5.4z"/></svg>',
  pinterest: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.9l1.2-5s-.3-.6-.3-1.5c0-1.4.8-2.4 1.8-2.4.9 0 1.3.6 1.3 1.4 0 .9-.5 2.1-.8 3.3-.2 1 .5 1.8 1.5 1.8 1.8 0 3.1-1.9 3.1-4.6 0-2.4-1.7-4.1-4.2-4.1-2.9 0-4.5 2.1-4.5 4.4 0 .9.3 1.8.8 2.3l.1.4-.3 1.1c0 .2-.2.2-.4.1-1.3-.6-2.1-2.5-2.1-4 0-3.3 2.4-6.3 6.9-6.3 3.6 0 6.4 2.6 6.4 6 0 3.6-2.3 6.5-5.4 6.5-1.1 0-2.1-.6-2.4-1.2l-.7 2.5c-.2.9-.9 2.1-1.3 2.8A10 10 0 1 0 12 2z"/></svg>',
};

export const iconOptions = [
  { value: "none", label: "None" }, { value: "truck", label: "Truck" }, { value: "return", label: "Return" }, { value: "lock", label: "Lock" },
  { value: "heart", label: "Heart" }, { value: "leaf", label: "Leaf" }, { value: "chat", label: "Chat" }, { value: "gift", label: "Gift" },
  { value: "check", label: "Check mark" }, { value: "star", label: "Star" },
];

export function socialLinks(ctx: RenderCtx) {
  const ts = ctx.theme.settings;
  const nets = ["instagram", "facebook", "tiktok", "youtube", "x", "pinterest"] as const;
  const links = nets.filter(n => str(ts[`social_${n}`])).map(n =>
    `<a href="${esc(str(ts[`social_${n}`]))}" class="social__link" target="_blank" rel="noopener" aria-label="${n}">${ICONS[n]}</a>`);
  return links.length ? `<div class="social">${links.join("")}</div>` : "";
}

export const alignOptions = [{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }];
