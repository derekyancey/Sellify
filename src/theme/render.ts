import { BASE_CSS, themeVars } from "./css";
import { googleFontsUrl } from "./fonts";
import { SECTIONS, blockSettings, sectionSettings, templateType, themeSettings } from "./registry";
import { cartDrawer } from "./sections/commerce";
import type { RenderCtx, SectionGroup, SectionInstance, ThemeDoc } from "./types";
import { bool, esc, str } from "./util";

export type GroupRef = "header" | "footer" | "template";
export interface RenderedSection { id: string; group: GroupRef | "overlay"; html: string }

/** Which template a route uses; falls back from "product.alt" to "product", then to "404". */
export function resolveTemplate(theme: ThemeDoc, key: string): { key: string; group: SectionGroup } {
  if (theme.templates[key]) return { key, group: theme.templates[key] };
  const base = templateType(key);
  if (theme.templates[base]) return { key: base, group: theme.templates[base] };
  return { key: "404", group: theme.templates["404"] ?? { order: [], sections: {} } };
}

/** Theme settings resolved with defaults, so sections can read them directly. */
function withDefaults(ctx: RenderCtx): RenderCtx {
  return { ...ctx, theme: { ...ctx.theme, settings: themeSettings(ctx.theme) } };
}

export function renderSection(ctx: RenderCtx, id: string, inst: SectionInstance, group: GroupRef): string {
  const sc = SECTIONS[inst.type];
  if (!sc) return ctx.editor ? `<div data-yt-section="${esc(id)}" data-yt-group="${group}"><div class="yt-empty">Unknown section “${esc(inst.type)}”</div></div>` : "";
  const blocks = inst.block_order.map(bid => ({ bid, b: inst.blocks[bid] })).filter(x => x.b && !x.b.disabled)
    .map(({ bid, b }) => ({ ...b, id: bid, settings: blockSettings(inst, b) }));
  let html = "";
  try {
    html = sc.render({ ...ctx, id, section: inst, settings: sectionSettings(inst), blocks, schema: sc });
  } catch (e) {
    html = ctx.editor ? `<div class="yt-empty">This section failed to render: ${esc((e as Error).message)}</div>` : "";
  }
  const css = str(inst.custom_css).trim() ? `<style>#ys-${esc(id)}{${inst.custom_css!.replace(/<\/style/gi, "")}}</style>` : "";
  return `<div id="ys-${esc(id)}" class="section-wrap section-${esc(inst.type)}" data-yt-section="${esc(id)}" data-yt-group="${group}">${css}${html}</div>`;
}

/** Every section on the page, in order, plus the cart drawer. */
export function renderSections(raw: RenderCtx): RenderedSection[] {
  const ctx = withDefaults(raw);
  const out: RenderedSection[] = [];
  const add = (group: GroupRef, g: SectionGroup | undefined) => {
    for (const id of g?.order ?? []) {
      const inst = g!.sections[id];
      if (!inst || inst.disabled) continue;
      out.push({ id, group, html: renderSection(ctx, id, inst, group) });
    }
  };
  add("header", ctx.theme.groups.header);
  add("template", resolveTemplate(ctx.theme, ctx.route.template).group);
  add("footer", ctx.theme.groups.footer);
  if (str(ctx.theme.settings.cart_type, "drawer") === "drawer") {
    const headerScheme = Object.values(ctx.theme.groups.header.sections).find(s => s.type === "header")?.settings.color_scheme;
    out.push({ id: "__cart-drawer", group: "overlay", html: `<div data-yt-section="__cart-drawer">${cartDrawer(ctx, str(headerScheme, "scheme-1"))}</div>` });
  }
  return out;
}

export function pageTitle(ctx: RenderCtx) {
  const ts = themeSettings(ctx.theme), name = ctx.data.site.name;
  const r = ctx.route;
  if (r.template === "index") return str(ts.meta_title) || name;
  if (r.product) return `${r.product.title} – ${name}`;
  if (r.collection) return `${r.collection.title} – ${name}`;
  const t = resolveTemplate(ctx.theme, r.template);
  const label = t.key === "404" ? "Page not found" : (ctx.theme.templates[r.template]?.title ?? ({ cart: "Your cart", search: "Search", "list-collections": "Collections", collection: "Products" } as Record<string, string>)[r.template] ?? "");
  return label ? `${label} – ${name}` : name;
}

export function headHtml(ctx: RenderCtx) {
  const t = { ...ctx.theme, settings: themeSettings(ctx.theme) };
  const ts = t.settings;
  const desc = ctx.route.product?.description?.replace(/<[^>]+>/g, "").slice(0, 160) || str(ts.meta_description);
  const image = ctx.route.product?.imageUrl || str(ts.share_image);
  const fonts = googleFontsUrl([ts.font_heading, ts.font_body]);
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pageTitle(ctx))}</title>
${desc ? `<meta name="description" content="${esc(desc)}">` : ""}
<meta property="og:title" content="${esc(pageTitle(ctx))}"><meta property="og:site_name" content="${esc(ctx.data.site.name)}">
${desc ? `<meta property="og:description" content="${esc(desc)}">` : ""}${image ? `<meta property="og:image" content="${esc(image)}">` : ""}
${ctx.data.site.domain ? `<link rel="canonical" href="https://${esc(ctx.data.site.domain)}${esc(ctx.route.path)}">` : ""}
${str(ts.favicon) ? `<link rel="icon" href="${esc(str(ts.favicon))}">` : ""}
${fonts ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${fonts}" data-yt-fonts>` : ""}
<style data-yt-base>${BASE_CSS}</style>
<style data-yt-vars>${themeVars(t)}</style>`;
}

export function bodyClass(ctx: RenderCtx) {
  const ts = themeSettings(ctx.theme);
  return `color-scheme-1${bool(ts.reveal_on_scroll, true) ? " reveal" : ""} template-${esc(templateType(ctx.route.template))}`;
}

/** Group containers; sections are patched into these by dom.ts. */
export function bodyHtml(sections: RenderedSection[]) {
  const of = (g: string) => sections.filter(s => s.group === g).map(s => s.html).join("\n");
  return `<a class="visually-hidden" href="#MainContent">Skip to content</a>
<div data-yt-group="header">${of("header")}</div>
<main id="MainContent" data-yt-group="template">${of("template")}</main>
<div data-yt-group="footer">${of("footer")}</div>
<div data-yt-group="overlay">${of("overlay")}</div>`;
}

/** A complete standalone HTML page (used for publishing pre-rendered pages). */
export function renderDocument(ctx: RenderCtx, extraHead = "", extraBody = "") {
  const sections = renderSections(ctx);
  return `<!doctype html><html lang="en"><head>${headHtml(ctx)}${extraHead}</head>
<body class="${bodyClass(ctx)}">${bodyHtml(sections)}${extraBody}</body></html>`;
}
