import type { Product, Variant } from "../../lib/types";
import { defaultVariant, hasVariants, variantTitle } from "../../lib/variants";
import type { RenderCtx, SectionCtx, SectionSchema } from "../types";
import { ICONS, blockAttrs, bool, collectionCard, collectionProducts, collectionUrl, editable, esc, findCollection, findProduct, fmt, iconOptions, img, inline, num, pad, priceHtml, productCard, ratioFor, rich, schemeClass, str } from "../util";
import { colorScheme, editorEmpty, headingSize, padding } from "./shared";

const wrap = (s: SectionCtx, inner: string, extra = "") => {
  const hover = str(s.theme.settings.hover_effect, "lift");
  return `<section class="section ${schemeClass(s.settings.color_scheme)} hover-${esc(hover)} ${extra}" style="${pad(s.settings)}" data-reveal>${inner}</section>`;
};

const ratioSetting = { type: "select" as const, id: "image_ratio", label: "Image ratio", default: "square", options: [
  { value: "adapt", label: "Adapt to image" }, { value: "portrait", label: "Portrait" }, { value: "square", label: "Square" }, { value: "landscape", label: "Landscape" }] };

function sortProducts(list: Product[], sort?: string) {
  const out = list.slice();
  switch (sort) {
    case "price-asc": return out.sort((a, b) => a.price - b.price);
    case "price-desc": return out.sort((a, b) => b.price - a.price);
    case "title-asc": return out.sort((a, b) => a.title.localeCompare(b.title));
    case "created-desc": return out.sort((a, b) => b.$createdAt.localeCompare(a.$createdAt));
    default: return out;
  }
}

function grid(s: SectionCtx, products: Product[], o: { cols: number; colsM: number; ratio: string; quickAdd: boolean; swipe?: boolean }) {
  return `<div class="grid${o.swipe ? " slider-mobile" : ""}" style="--cols:${o.cols};--cols-m:${o.colsM}">${products.map(p => productCard(s, p, { ratio: o.ratio, quickAdd: o.quickAdd })).join("")}</div>`;
}

/* ---------------------------------------------------------------- featured collection */
const featuredCollection: SectionSchema = {
  type: "featured-collection", name: "Featured collection", category: "Products",
  settings: [
    { type: "inline_richtext", id: "title", label: "Heading", default: "Featured collection" }, { ...headingSize, default: "h2" },
    { type: "richtext", id: "description", label: "Description" },
    { type: "collection", id: "collection", label: "Collection", info: "Leave empty to show your newest products." },
    { type: "range", id: "products_to_show", label: "Maximum products to show", min: 2, max: 24, step: 1, default: 4 },
    { type: "range", id: "columns", label: "Columns on desktop", min: 1, max: 6, step: 1, default: 4 },
    { type: "checkbox", id: "show_view_all", label: "Enable \"View all\" button", default: true },
    { type: "header", label: "Product card" }, ratioSetting,
    { type: "checkbox", id: "quick_add", label: "Enable quick add button", default: true },
    { type: "header", label: "Mobile layout" },
    { type: "select", id: "columns_mobile", label: "Columns on mobile", default: "2", options: [{ value: "1", label: "1 column" }, { value: "2", label: "2 columns" }] },
    { type: "checkbox", id: "swipe_mobile", label: "Enable swipe on mobile", default: false },
    colorScheme(), ...padding(36, 36),
  ],
  presets: [{ name: "Featured collection" }],
  render(s) {
    const st = s.settings;
    const c = findCollection(s, st.collection);
    const products = collectionProducts(s, c).slice(0, num(st.products_to_show, 4));
    const viewAll = c ? collectionUrl(c) : "/collections/all";
    const body = products.length ? grid(s, products, { cols: num(st.columns, 4), colsM: num(st.columns_mobile, 2), ratio: ratioFor(st.image_ratio), quickAdd: bool(st.quick_add, true), swipe: bool(st.swipe_mobile) })
      : `<div class="grid" style="--cols:${num(st.columns, 4)}">${Array.from({ length: Math.min(4, num(st.products_to_show, 4)) }, () => `<div class="card"><div class="card__media">${img("", "", { ratio: "1/1", placeholder: "product" })}</div><div class="card__info"><h3 class="card__title">Example product</h3><div class="price">${fmt(s, 19.99)}</div></div></div>`).join("")}</div>`;
    return wrap(s, `<div class="page-width">
<div class="title-row"><div><h2 class="${esc(str(st.heading_size, "h2"))}"${editable(s, "title")}>${inline(st.title)}</h2>${str(st.description) ? `<div class="rte subdued">${rich(st.description)}</div>` : ""}</div>
${bool(st.show_view_all, true) ? `<a class="link-arrow" href="${esc(viewAll)}">View all</a>` : ""}</div>${body}</div>`);
  },
};

/* ---------------------------------------------------------------- collection list */
const collectionList: SectionSchema = {
  type: "collection-list", name: "Collection list", category: "Collections",
  settings: [
    { type: "inline_richtext", id: "title", label: "Heading", default: "Collections" }, { ...headingSize, default: "h2" },
    ratioSetting,
    { type: "range", id: "columns", label: "Columns on desktop", min: 1, max: 6, step: 1, default: 3 },
    { type: "checkbox", id: "show_view_all", label: "Enable \"View all\" button", default: false, info: "Links to the list of all collections." },
    { type: "checkbox", id: "swipe_mobile", label: "Enable swipe on mobile", default: false },
    colorScheme(), ...padding(36, 36),
  ],
  blocks: [{ type: "featured_collection", name: "Collection", settings: [{ type: "collection", id: "collection", label: "Collection" }] }],
  max_blocks: 15,
  presets: [{ name: "Collection list", blocks: [{ type: "featured_collection" }, { type: "featured_collection" }, { type: "featured_collection" }] }],
  render(s) {
    const st = s.settings, ratio = ratioFor(st.image_ratio);
    const cards = s.blocks.map(b => {
      const c = findCollection(s, b.settings.collection);
      return `<div${blockAttrs(s, b.id)}>${collectionCard(s, c, c?.title ?? "Collection title", ratio === "adapt" ? "1/1" : ratio)}</div>`;
    }).join("");
    return wrap(s, `<div class="page-width"><div class="title-row"><h2 class="${esc(str(st.heading_size, "h2"))}"${editable(s, "title")}>${inline(st.title)}</h2>
${bool(st.show_view_all) ? `<a class="link-arrow" href="/collections">View all</a>` : ""}</div>
<div class="grid${bool(st.swipe_mobile) ? " slider-mobile" : ""}" style="--cols:${num(st.columns, 3)};--cols-m:1">${cards}</div></div>`);
  },
};

/* ---------------------------------------------------------------- product page */
const productBlocks = [
  { type: "text", name: "Text", settings: [{ type: "inline_richtext" as const, id: "text", label: "Text", default: "Text block" },
    { type: "select" as const, id: "text_style", label: "Text style", default: "body", options: [{ value: "body", label: "Body" }, { value: "subtitle", label: "Subtitle" }, { value: "caption", label: "Uppercase" }] }] },
  { type: "title", name: "Title", limit: 1, settings: [] },
  { type: "price", name: "Price", limit: 1, settings: [] },
  { type: "inventory", name: "Inventory status", limit: 1, settings: [
    { type: "range" as const, id: "threshold", label: "Low inventory threshold", min: 0, max: 100, step: 1, default: 10, info: "Show \"Low stock\" at or below this number." },
    { type: "checkbox" as const, id: "show_count", label: "Show inventory count", default: true }] },
  { type: "variant_picker", name: "Variant picker", limit: 1, settings: [
    { type: "select" as const, id: "picker_type", label: "Style", default: "button", options: [{ value: "button", label: "Pills" }, { value: "dropdown", label: "Dropdown" }] },
    { type: "checkbox" as const, id: "show_sold_out", label: "Cross out sold-out options", default: true }] },
  { type: "quantity_selector", name: "Quantity selector", limit: 1, settings: [] },
  { type: "buy_buttons", name: "Buy buttons", limit: 1, settings: [
    { type: "checkbox" as const, id: "show_dynamic_checkout", label: "Show dynamic checkout button", default: true, info: "Lets customers pay straight away with Stripe (cards, Apple Pay, Google Pay)." }] },
  { type: "description", name: "Description", limit: 1, settings: [] },
  { type: "collapsible_tab", name: "Collapsible row", settings: [
    { type: "text" as const, id: "heading", label: "Heading", default: "Collapsible row" },
    { type: "select" as const, id: "icon", label: "Icon", default: "none", options: iconOptions },
    { type: "richtext" as const, id: "content", label: "Row content", default: "<p>Add shipping, care or sizing information.</p>" }] },
  { type: "trust", name: "Icons with text", settings: [
    { type: "select" as const, id: "icon_1", label: "First icon", default: "truck", options: iconOptions }, { type: "text" as const, id: "text_1", label: "First text", default: "Free shipping over $50" },
    { type: "select" as const, id: "icon_2", label: "Second icon", default: "return", options: iconOptions }, { type: "text" as const, id: "text_2", label: "Second text", default: "30-day returns" },
    { type: "select" as const, id: "icon_3", label: "Third icon", default: "lock", options: iconOptions }, { type: "text" as const, id: "text_3", label: "Third text", default: "Secure checkout" }] },
  { type: "share", name: "Share", limit: 1, settings: [{ type: "text" as const, id: "label", label: "Label", default: "Share" }] },
  { type: "custom_html", name: "Custom HTML", settings: [{ type: "html" as const, id: "html", label: "HTML" }] },
];

function sampleProduct(s: RenderCtx): Product {
  return s.data.products.find(p => p.status === "active") ?? {
    $id: "sample", $createdAt: new Date().toISOString(), siteId: s.data.site.id, title: "Example product", price: 29, inventory: 12, status: "active",
    description: "This is a sample product. Add products to see them here.",
  };
}

/** Option pickers. Behaviors read data-variants on the product to switch price, stock, image and the add-to-cart button. */
function variantPicker(s: SectionCtx, p: Product, v: Variant | undefined, settings: Record<string, unknown>, attrs: string) {
  if (!hasVariants(p) || !p.options?.length || (p.variants!.length === 1 && p.options.length === 1 && p.options[0].values.length <= 1)) return s.editor && !hasVariants(p) ? `<p class="subdued"${attrs} style="font-size:.85rem">Options appear here for products with variants.</p>` : "";
  const crossOut = settings.show_sold_out !== false;
  const available = (oi: number, value: string) => p.variants!.some(x => x.options[oi] === value && x.inventory > 0 && x.options.every((o, j) => j === oi || j > oi || o === v?.options[j]));
  return `<div class="variant-picker"${attrs}>${p.options.map((o, oi) => {
    const cur = v?.options[oi];
    if (settings.picker_type === "dropdown") {
      return `<label class="field"><span class="variant-picker__label">${esc(o.name)}</span><select class="select" data-option="${oi}">${o.values.map(val => `<option value="${esc(val)}"${val === cur ? " selected" : ""}>${esc(val)}${crossOut && !available(oi, val) ? " – sold out" : ""}</option>`).join("")}</select></label>`;
    }
    return `<fieldset class="variant-picker__group"><legend class="variant-picker__label">${esc(o.name)}: <span data-option-label="${oi}">${esc(cur ?? "")}</span></legend><div class="pills">${o.values.map(val =>
      `<label class="pill${crossOut && !available(oi, val) ? " pill--soldout" : ""}"><input type="radio" name="opt-${esc(s.id)}-${oi}" value="${esc(val)}" data-option="${oi}"${val === cur ? " checked" : ""}><span>${esc(val)}</span></label>`).join("")}</div></fieldset>`;
  }).join("")}</div>`;
}

/** The variant data the storefront needs to switch variants without a page load. */
const variantData = (p: Product) => hasVariants(p)
  ? ` data-variants="${esc(JSON.stringify(p.variants!.map(v => ({ id: v.id, options: v.options, price: v.price, compareAtPrice: v.compareAtPrice, inventory: v.inventory, imageUrl: v.imageUrl, title: variantTitle(v) }))))}"`
  : "";

function productInfo(s: SectionCtx, p: Product, linkTitle = false, v?: Variant) {
  const hasPicker = s.blocks.some(b => b.type === "variant_picker");
  return s.blocks.map(b => {
    const a = blockAttrs(s, b.id), x = b.settings;
    switch (b.type) {
      case "text": { const cls = str(x.text_style) === "caption" ? "caption" : str(x.text_style) === "subtitle" ? "subdued" : ""; return `<p class="${cls}"${a}${editable(s, "text", b.id)}>${inline(x.text)}</p>`; }
      case "title": return `<h1 class="product__title h2"${a}>${linkTitle ? `<a href="/products/${esc(p.$id)}" style="text-decoration:none">${esc(p.title)}</a>` : esc(p.title)}</h1>`;
      case "price": return `<div${a} data-price>${priceHtml(s, p, v).replace('class="price', 'class="price price--large')}<small class="subdued">Taxes and shipping calculated at checkout.</small></div>`;
      case "variant_picker": return variantPicker(s, p, v, x, a);
      case "inventory": {
        const t = num(x.threshold, 10), n = v ? v.inventory : p.inventory;
        const cls = n <= 0 ? "out" : n <= t ? "low" : "";
        const label = n <= 0 ? "Out of stock" : n <= t ? (bool(x.show_count, true) ? `Low stock: ${n} left` : "Low stock") : (bool(x.show_count, true) ? `${n} in stock` : "In stock");
        return `<p class="inventory-note ${cls}"${a} data-inventory data-threshold="${t}" data-show-count="${bool(x.show_count, true) ? 1 : 0}">${label}</p>`;
      }
      case "quantity_selector": return `<div${a}><label class="subdued" style="display:block;font-size:.85rem;margin-bottom:6px">Quantity</label><div class="qty" data-qty><button type="button" data-qty-minus aria-label="Decrease">${ICONS.minus}</button><input type="number" min="1" value="1" aria-label="Quantity" data-qty-input><button type="button" data-qty-plus aria-label="Increase">${ICONS.plus}</button></div></div>`;
      case "buy_buttons": {
        const sold = (v ? v.inventory : p.inventory) <= 0;
        const va = v ? ` data-variant="${esc(v.id)}"` : "";
        // Saved themes from before variants have no picker block: show one above the buttons.
        const picker = !hasPicker && hasVariants(p) ? variantPicker(s, p, v, {}, "") : "";
        return `${picker}<div class="buy-buttons"${a}><button type="button" class="button button--full${bool(x.show_dynamic_checkout, true) ? " button--secondary" : ""}" data-add-to-cart="${esc(p.$id)}"${va}${sold ? " disabled" : ""}>${sold ? "Sold out" : "Add to cart"}</button>
${bool(x.show_dynamic_checkout, true) ? `<button type="button" class="button button--full" data-buy-now="${esc(p.$id)}"${va}${sold ? " hidden" : ""}>Buy it now</button>` : ""}<p class="cart-error" data-cart-error hidden></p></div>`;
      }
      case "description": return p.description ? `<div class="rte"${a}>${/<[a-z]/i.test(p.description) ? rich(p.description) : esc(p.description).split(/\n{2,}/).map(t => `<p>${t.replace(/\n/g, "<br>")}</p>`).join("")}</div>` : (s.editor ? `<div class="rte subdued"${a}><p>The product description appears here.</p></div>` : "");
      case "collapsible_tab": return `<details class="accordion"${a}><summary>${str(x.icon, "none") !== "none" ? `<span class="ico">${ICONS[str(x.icon)] ?? ""}</span>` : ""}<span${editable(s, "heading", b.id)}>${esc(x.heading)}</span><span class="chev">${ICONS.chevron}</span></summary><div class="accordion__content rte">${rich(x.content)}</div></details>`;
      case "trust": return `<div class="trust"${a}>${[1, 2, 3].filter(i => str(x[`text_${i}`])).map(i => `<div>${ICONS[str(x[`icon_${i}`])] ?? ""}<span>${esc(x[`text_${i}`])}</span></div>`).join("")}</div>`;
      case "share": return `<div class="share"${a}><button type="button" data-share>${esc(str(x.label, "Share"))}</button></div>`;
      case "custom_html": return `<div${a}>${s.editor ? str(x.html).replace(/<script[\s\S]*?<\/script>/gi, "") : str(x.html)}</div>`;
      default: return "";
    }
  }).join("");
}

const productSettings = [
  { type: "select" as const, id: "media_size", label: "Desktop media width", default: "55%", options: [{ value: "45%", label: "Small" }, { value: "55%", label: "Medium" }, { value: "65%", label: "Large" }] },
  { type: "radio" as const, id: "media_position", label: "Desktop media position", default: "left", options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }] },
  { type: "select" as const, id: "image_ratio", label: "Image ratio", default: "square", options: [{ value: "adapt", label: "Adapt to image" }, { value: "portrait", label: "Portrait" }, { value: "square", label: "Square" }] },
];
const defaultProductBlocks = [{ type: "title" }, { type: "price" }, { type: "variant_picker" }, { type: "inventory" }, { type: "quantity_selector" }, { type: "buy_buttons" }, { type: "description" }, { type: "trust" }, { type: "collapsible_tab", settings: { heading: "Shipping & returns", icon: "truck" } }, { type: "share" }];

const mainProduct: SectionSchema = {
  type: "main-product", name: "Product information", category: "Template", templates: ["product"], limit: 1, static: true,
  settings: [...productSettings, { type: "checkbox", id: "sticky_info", label: "Enable sticky content on desktop", default: true }, colorScheme(), ...padding(36, 12)],
  blocks: productBlocks,
  presets: [{ name: "Product information", blocks: defaultProductBlocks }],
  render(s) {
    const st = s.settings, p = s.route.product ?? sampleProduct(s), v = defaultVariant(p, s.route.variant);
    return wrap(s, `<div class="page-width"><div class="product product--${esc(str(st.media_position, "left"))}" style="--media-w:${esc(str(st.media_size, "55%"))}" data-product="${esc(p.$id)}" data-currency="${esc(s.data.site.currency || "USD")}" data-product-image="${esc(p.imageUrl ?? "")}" data-update-url${variantData(p)}>
<div class="product__media" data-product-media>${img(v?.imageUrl || p.imageUrl, p.title, { ratio: ratioFor(st.image_ratio) === "adapt" ? undefined : ratioFor(st.image_ratio), placeholder: "product", eager: true })}</div>
<div class="product__info${bool(st.sticky_info, true) ? " is-sticky" : ""}">${productInfo(s, p, false, v)}</div></div></div>`);
  },
};

const featuredProduct: SectionSchema = {
  type: "featured-product", name: "Featured product", category: "Products",
  settings: [{ type: "product", id: "product", label: "Product" }, ...productSettings, colorScheme("scheme-2"), ...padding(36, 36)],
  blocks: productBlocks.filter(b => b.type !== "share"),
  presets: [{ name: "Featured product", blocks: [{ type: "text", settings: { text: "Featured", text_style: "caption" } }, { type: "title" }, { type: "price" }, { type: "variant_picker" }, { type: "quantity_selector" }, { type: "buy_buttons" }, { type: "description" }] }],
  render(s) {
    const st = s.settings, p = findProduct(s, st.product) ?? sampleProduct(s), v = defaultVariant(p);
    return wrap(s, `<div class="page-width"><div class="product product--${esc(str(st.media_position, "left"))}" style="--media-w:${esc(str(st.media_size, "55%"))}" data-product="${esc(p.$id)}" data-currency="${esc(s.data.site.currency || "USD")}" data-product-image="${esc(p.imageUrl ?? "")}"${variantData(p)}>
<div class="product__media" data-product-media><a href="/products/${esc(p.$id)}">${img(v?.imageUrl || p.imageUrl, p.title, { ratio: ratioFor(st.image_ratio) === "adapt" ? undefined : ratioFor(st.image_ratio), placeholder: "product" })}</a></div>
<div class="product__info">${productInfo(s, p, true, v)}</div></div></div>`);
  },
};

const recommendations: SectionSchema = {
  type: "product-recommendations", name: "Related products", category: "Products", templates: ["product"],
  description: "Products from the same collections as the one being viewed.",
  settings: [
    { type: "inline_richtext", id: "heading", label: "Heading", default: "You may also like" }, { ...headingSize, default: "h2" },
    { type: "range", id: "products_to_show", label: "Maximum products to show", min: 2, max: 10, step: 1, default: 4 },
    { type: "range", id: "columns", label: "Columns on desktop", min: 1, max: 5, step: 1, default: 4 },
    ratioSetting, colorScheme(), ...padding(36, 36),
  ],
  presets: [{ name: "Related products" }],
  render(s) {
    const st = s.settings, cur = s.route.product ?? sampleProduct(s);
    const related = s.data.collections.filter(c => c.productIds.includes(cur.$id)).flatMap(c => c.productIds);
    const pool = s.data.products.filter(p => p.status === "active" && p.$id !== cur.$id);
    const picked = [...pool.filter(p => related.includes(p.$id)), ...pool.filter(p => !related.includes(p.$id))].slice(0, num(st.products_to_show, 4));
    if (!picked.length) return editorEmpty(s, "Related products appear once you have more products.");
    return wrap(s, `<div class="page-width"><div class="title-row"><h2 class="${esc(str(st.heading_size, "h2"))}"${editable(s, "heading")}>${inline(st.heading)}</h2></div>
${grid(s, picked, { cols: num(st.columns, 4), colsM: 2, ratio: ratioFor(st.image_ratio), quickAdd: false })}</div>`);
  },
};

/* ---------------------------------------------------------------- collection pages */
const collectionBanner: SectionSchema = {
  type: "main-collection-banner", name: "Collection banner", category: "Template", templates: ["collection"], limit: 1,
  settings: [{ type: "checkbox", id: "show_description", label: "Show collection description", default: true }, colorScheme(), ...padding(36, 0)],
  presets: [{ name: "Collection banner" }],
  render(s) {
    const c = s.route.collection;
    return wrap(s, `<div class="page-width"><h1>${esc(c?.title ?? "Products")}</h1>${bool(s.settings.show_description, true) && c?.description ? `<div class="rte subdued">${rich(c.description)}</div>` : ""}</div>`);
  },
};

const collectionGrid: SectionSchema = {
  type: "main-collection-product-grid", name: "Product grid", category: "Template", templates: ["collection", "search"], limit: 1, static: true,
  settings: [
    { type: "range", id: "products_per_page", label: "Products per page", min: 4, max: 48, step: 4, default: 16 },
    { type: "range", id: "columns", label: "Columns on desktop", min: 1, max: 6, step: 1, default: 4 },
    { type: "select", id: "columns_mobile", label: "Columns on mobile", default: "2", options: [{ value: "1", label: "1 column" }, { value: "2", label: "2 columns" }] },
    { type: "checkbox", id: "enable_sorting", label: "Enable sorting", default: true },
    { type: "header", label: "Product card" }, ratioSetting,
    { type: "checkbox", id: "quick_add", label: "Enable quick add button", default: true },
    colorScheme(), ...padding(24, 48),
  ],
  presets: [{ name: "Product grid" }],
  render(s) {
    const st = s.settings;
    let list: Product[];
    let heading = "";
    if (s.route.template === "search") {
      const q = (s.route.query ?? "").trim().toLowerCase();
      const desc = bool(s.theme.settings.search_descriptions, true);
      list = q ? collectionProducts(s).filter(p => p.title.toLowerCase().includes(q) || (desc && (p.description ?? "").toLowerCase().includes(q))) : [];
      heading = `<h1 class="h2">${q ? `Results for “${esc(s.route.query)}”` : "Search our store"}</h1>
<form action="/search" class="inline-form" style="margin-bottom:24px"><input class="input" type="search" name="q" value="${esc(s.route.query ?? "")}" placeholder="Search" aria-label="Search"><button class="button">Search</button></form>`;
    } else list = collectionProducts(s, s.route.collection);
    const sorted = sortProducts(list, s.route.sort).slice(0, num(st.products_per_page, 16));
    const sorts = [["manual", "Featured"], ["price-asc", "Price, low to high"], ["price-desc", "Price, high to low"], ["title-asc", "Alphabetically, A-Z"], ["created-desc", "Date, new to old"]];
    const toolbar = `<div class="collection-toolbar"><span class="subdued">${list.length} product${list.length === 1 ? "" : "s"}</span>${bool(st.enable_sorting, true) && s.route.template !== "search" ? `<label style="display:flex;align-items:center;gap:8px">Sort by <select class="select" data-sort>${sorts.map(([v, l]) => `<option value="${v}"${(s.route.sort ?? "manual") === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}</div>`;
    const body = sorted.length ? grid(s, sorted, { cols: num(st.columns, 4), colsM: num(st.columns_mobile, 2), ratio: ratioFor(st.image_ratio), quickAdd: bool(st.quick_add, true) })
      : `<div class="empty-state"><p>${s.route.template === "search" && s.route.query ? "No products match your search." : "No products found."}</p><a class="button" href="/collections/all">Continue shopping</a></div>`;
    return wrap(s, `<div class="page-width">${heading}${toolbar}${body}</div>`);
  },
};

const listCollections: SectionSchema = {
  type: "main-list-collections", name: "Collections list page", category: "Template", templates: ["list-collections"], limit: 1, static: true,
  settings: [{ type: "inline_richtext", id: "title", label: "Heading", default: "Collections" }, ratioSetting,
    { type: "range", id: "columns", label: "Columns on desktop", min: 1, max: 5, step: 1, default: 3 }, colorScheme(), ...padding(36, 48)],
  presets: [{ name: "Collections list page" }],
  render(s) {
    const st = s.settings, ratio = ratioFor(st.image_ratio);
    const cards = s.data.collections.map(c => collectionCard(s, c, c.title, ratio === "adapt" ? "1/1" : ratio)).join("");
    return wrap(s, `<div class="page-width"><h1${editable(s, "title")}>${inline(st.title)}</h1><div class="grid" style="--cols:${num(st.columns, 3)};--cols-m:1">${cards || "<p>No collections yet.</p>"}</div></div>`);
  },
};

/* ---------------------------------------------------------------- cart */
/** Cart lines are keyed "productId:variantId" so each variant is its own line. */
export const lineKey = (l: { product: Product; variant?: Variant }) => `${l.product.$id}:${l.variant?.id ?? ""}`;
const linePrice = (l: { product: Product; variant?: Variant }) => l.variant?.price ?? l.product.price;

export function cartLines(ctx: RenderCtx) {
  return ctx.data.cart.map(l => {
    const k = esc(lineKey(l)), url = `/products/${esc(l.product.$id)}${l.variant ? `?variant=${esc(l.variant.id)}` : ""}`;
    return `<div class="cart-line" data-line="${k}">
<a href="${url}">${img(l.variant?.imageUrl || l.product.imageUrl, l.product.title, { ratio: "1/1", placeholder: "product" })}</a>
<div><a class="cart-line__title" href="${url}">${esc(l.product.title)}</a>${l.variant ? `<div class="cart-line__variant">${esc(variantTitle(l.variant))}</div>` : ""}<div class="subdued">${fmt(ctx, linePrice(l))}</div>
<div style="display:flex;gap:12px;align-items:center;margin-top:8px"><div class="qty" style="height:38px"><button type="button" data-line-qty="${k}" data-delta="-1" aria-label="Decrease">${ICONS.minus}</button><input type="number" min="0" value="${l.quantity}" data-line-input="${k}" aria-label="Quantity"><button type="button" data-line-qty="${k}" data-delta="1" aria-label="Increase">${ICONS.plus}</button></div>
<button type="button" class="cart-line__remove" data-line-remove="${k}">Remove</button></div></div>
<div style="font-weight:600">${fmt(ctx, linePrice(l) * l.quantity)}</div></div>`;
  }).join("");
}

export function cartSummary(ctx: RenderCtx) {
  const ts = ctx.theme.settings;
  const subtotal = ctx.data.cart.reduce((t, l) => t + linePrice(l) * l.quantity, 0);
  const threshold = num(ts.free_shipping_threshold, 0);
  const ship = threshold > 0 ? `<div class="free-ship">${subtotal >= threshold ? "You've unlocked free shipping!" : `You're ${fmt(ctx, threshold - subtotal)} away from free shipping.`}<div class="free-ship__bar"><span style="width:${Math.min(100, (subtotal / threshold) * 100)}%"></span></div></div>` : "";
  const pay = ctx.data.payments ?? { stripe: true, paypal: true };
  return `${ship}
${bool(ts.cart_note) ? `<label class="field"><span class="subdued">Order special instructions</span><textarea class="textarea" data-cart-note style="min-height:70px"></textarea></label>` : ""}
${bool(ts.cart_discount, true) ? `<div class="inline-form" style="max-width:none"><input class="input" placeholder="Discount code" data-discount-input aria-label="Discount code"><button type="button" class="button button--secondary" data-apply-discount>Apply</button></div><p class="subdued" data-discount-msg hidden></p>` : ""}
<div class="cart-summary__row"><span>Subtotal</span><strong data-subtotal>${fmt(ctx, subtotal)}</strong></div>
<small class="subdued">Taxes and shipping calculated at checkout.</small>
${pay.stripe !== false ? `<button type="button" class="button button--full" data-checkout="stripe">Check out</button>` : ""}
${pay.paypal ? `<button type="button" class="button button--full paypal-button" data-checkout="paypal">Pay with PayPal</button>` : ""}
<p class="cart-error" data-cart-error hidden></p>`;
}

const mainCart: SectionSchema = {
  type: "main-cart", name: "Cart", category: "Template", templates: ["cart"], limit: 1, static: true,
  settings: [{ type: "inline_richtext", id: "title", label: "Heading", default: "Your cart" }, colorScheme(), ...padding(36, 48)],
  presets: [{ name: "Cart" }],
  render(s) {
    const empty = !s.data.cart.length;
    return wrap(s, `<div class="page-width" data-cart-section><div class="title-row"><h1${editable(s, "title")}>${inline(s.settings.title)}</h1>${empty ? "" : `<a class="link-arrow" href="/collections/all">Continue shopping</a>`}</div>
${empty ? `<div class="empty-state"><p>Your cart is empty.</p><a class="button" href="/collections/all">Continue shopping</a></div>` : `<div>${cartLines(s)}</div><div class="cart-summary">${cartSummary(s)}</div>`}</div>`);
  },
};

export function cartDrawer(ctx: RenderCtx, scheme: string) {
  const count = ctx.data.cart.reduce((n, l) => n + l.quantity, 0);
  return `<div class="cart-drawer-overlay" data-close-cart></div>
<aside class="cart-drawer color-${esc(scheme)}" data-cart-drawer aria-label="Cart" aria-hidden="true">
<div class="cart-drawer__head"><h2>Your cart${count ? ` (${count})` : ""}</h2><button class="icon-btn" data-close-cart aria-label="Close cart">${ICONS.close}</button></div>
${ctx.data.cart.length ? `<div class="cart-drawer__body">${cartLines(ctx)}</div><div class="cart-drawer__foot">${cartSummary(ctx)}</div>`
    : `<div class="cart-drawer__body empty-state"><p>Your cart is empty.</p><a class="button" href="/collections/all">Continue shopping</a></div>`}
</aside>`;
}

/* ---------------------------------------------------------------- 404 */
const main404: SectionSchema = {
  type: "main-404", name: "Page not found", category: "Template", templates: ["404"], limit: 1,
  settings: [{ type: "inline_richtext", id: "title", label: "Heading", default: "Page not found" }, { type: "text", id: "text", label: "Text", default: "The page you were looking for doesn't exist." }, colorScheme(), ...padding(80, 80)],
  presets: [{ name: "Page not found" }],
  render(s) {
    return wrap(s, `<div class="page-width center"><p class="caption">404</p><h1${editable(s, "title")}>${inline(s.settings.title)}</h1><p${editable(s, "text")}>${esc(s.settings.text)}</p><div class="buttons center"><a class="button" href="/collections/all">Continue shopping</a></div></div>`);
  },
};

export const COMMERCE_SECTIONS = [featuredCollection, featuredProduct, collectionList, recommendations, mainProduct, collectionBanner, collectionGrid, listCollections, mainCart, main404];
