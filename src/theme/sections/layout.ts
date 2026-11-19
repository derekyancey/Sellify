import type { MenuItem, SectionCtx, SectionSchema } from "../types";
import { ICONS, blockAttrs, bool, editable, esc, href, img, inline, num, rich, schemeClass, socialLinks, str } from "../util";
import { colorScheme, padding } from "./shared";

function menuItems(s: SectionCtx, handle: unknown): MenuItem[] {
  return s.theme.menus[str(handle as string, "main-menu")]?.items ?? [];
}

const announcementBar: SectionSchema = {
  type: "announcement-bar", name: "Announcement bar", category: "Header", groups: ["header"],
  description: "Short messages above the header, rotating if there are several.",
  settings: [
    colorScheme("scheme-3"),
    { type: "checkbox", id: "auto_rotate", label: "Auto-rotate announcements", default: true },
    { type: "range", id: "speed", label: "Change slides every", min: 3, max: 10, step: 1, unit: "s", default: 5 },
    { type: "checkbox", id: "show_social", label: "Show social media icons", default: false, info: "Set your accounts in Theme settings → Social media" },
  ],
  blocks: [{ type: "announcement", name: "Announcement", settings: [
    { type: "inline_richtext", id: "text", label: "Text", default: "Welcome to our store" },
    { type: "url", id: "link", label: "Link" }] }],
  max_blocks: 12,
  presets: [{ name: "Announcement bar", blocks: [{ type: "announcement", settings: { text: "Free shipping on orders over $50" } }] }],
  render(s) {
    if (!s.blocks.length) return "";
    const slides = s.blocks.map((b, i) => {
      const u = href(s, b.settings.link), t = inline(b.settings.text);
      return `<p class="announcement__slide"${i ? " hidden" : ""}${blockAttrs(s, b.id)}${editable(s, "text", b.id)}>${u ? `<a href="${esc(u)}">${t}</a>` : t}</p>`;
    }).join("");
    return `<div class="announcement ${schemeClass(s.settings.color_scheme)}" ${s.blocks.length > 1 && bool(s.settings.auto_rotate, true) ? `data-rotate="${num(s.settings.speed, 5)}"` : ""}>
<div class="page-width"><div class="announcement__slides">${slides}</div></div>${bool(s.settings.show_social) ? socialLinks(s) : ""}</div>`;
  },
};

function navList(items: MenuItem[]) {
  return `<ul>${items.map(i => i.children?.length
    ? `<li><details><summary>${esc(i.title)}${ICONS.chevron}</summary><ul>${i.children.map(c => `<li><a href="${esc(c.url)}">${esc(c.title)}</a></li>`).join("")}</ul></details></li>`
    : `<li><a href="${esc(i.url)}">${esc(i.title)}</a></li>`).join("")}</ul>`;
}

const header: SectionSchema = {
  type: "header", name: "Header", category: "Header", groups: ["header"], limit: 1,
  settings: [
    colorScheme(),
    { type: "select", id: "logo_position", label: "Desktop logo position", default: "left", options: [
      { value: "left", label: "Left, menu next to it" }, { value: "middle", label: "Left, menu in the middle" }, { value: "center", label: "Center" }] },
    { type: "link_list", id: "menu", label: "Menu", default: "main-menu" },
    { type: "select", id: "sticky", label: "Sticky header", default: "scroll-up", options: [
      { value: "none", label: "None" }, { value: "scroll-up", label: "On scroll up" }, { value: "always", label: "Always" }] },
    { type: "checkbox", id: "show_border", label: "Show separator line", default: true },
    { type: "checkbox", id: "show_search", label: "Show search icon", default: true },
    { type: "checkbox", id: "show_account", label: "Show account icon", default: false },
    { type: "url", id: "account_url", label: "Account link", visible_if: st => !!st.show_account },
  ],
  presets: [{ name: "Header" }],
  render(s) {
    const st = s.settings, ts = s.theme.settings;
    const items = menuItems(s, st.menu);
    const pos = str(st.logo_position, "left");
    const logo = str(ts.logo)
      ? `<img src="${esc(str(ts.logo))}" alt="${esc(s.data.site.name)}">`
      : esc(s.data.site.name);
    const count = s.data.cart.reduce((n, l) => n + l.quantity, 0);
    const cartLink = str(ts.cart_type, "drawer") === "drawer" ? `href="/cart" data-open-cart` : `href="/cart"`;
    const isHome = s.route.template === "index";
    const sticky = str(st.sticky, "scroll-up");
    return `<header class="site-header ${schemeClass(st.color_scheme)}${bool(st.show_border, true) ? " has-border" : ""}${sticky !== "none" ? " is-sticky" : ""}" data-sticky="${esc(sticky)}">
<div class="page-width header header--${esc(pos === "middle" ? "left" : pos)}">
  <details class="menu-drawer"><summary class="icon-btn menu-drawer-toggle" aria-label="Menu">${ICONS.menu}</summary>
    <div class="overlay" data-close-details></div>
    <div class="menu-drawer__panel ${schemeClass(st.color_scheme)}"><button class="icon-btn" data-close-details aria-label="Close">${ICONS.close}</button>
      <ul>${items.map(i => `<li><a href="${esc(i.url)}">${esc(i.title)}</a>${i.children?.length ? `<ul>${i.children.map(c => `<li><a href="${esc(c.url)}">${esc(c.title)}</a></li>`).join("")}</ul>` : ""}</li>`).join("")}</ul>
      ${socialLinks(s)}</div></details>
  ${isHome ? `<h1 class="header__logo">` : `<div class="header__logo">`}<a href="/" style="text-decoration:none;display:flex">${logo}</a>${isHome ? "</h1>" : "</div>"}
  <nav class="header__nav"${pos === "middle" ? ' style="justify-self:center"' : ""}>${navList(items)}</nav>
  <div class="header__icons">
    ${bool(st.show_search, true) ? `<button class="icon-btn" data-open-search aria-label="Search">${ICONS.search}</button>` : ""}
    ${bool(st.show_account) ? `<a class="icon-btn" href="${esc(href(s, st.account_url) || "#")}" aria-label="Account">${ICONS.account}</a>` : ""}
    <a class="icon-btn" ${cartLink} aria-label="Cart">${ICONS.cart}<span class="cart-count" data-cart-count${count ? "" : " hidden"}>${count}</span></a>
  </div>
</div>
<div class="search-modal ${schemeClass(st.color_scheme)}" hidden data-search-modal><div class="page-width"><form action="/search" method="get" role="search">
  <input class="input" type="search" name="q" placeholder="Search" aria-label="Search" value="${esc(s.route.query ?? "")}"><button class="button" type="submit">Search</button>
  <button type="button" class="icon-btn" data-close-search aria-label="Close">${ICONS.close}</button></form></div></div>
</header>`;
  },
};

const footer: SectionSchema = {
  type: "footer", name: "Footer", category: "Footer", groups: ["footer"],
  settings: [
    colorScheme("scheme-2"),
    { type: "header", label: "Email signup" },
    { type: "checkbox", id: "newsletter_enable", label: "Show email signup", default: true },
    { type: "inline_richtext", id: "newsletter_heading", label: "Heading", default: "Subscribe to our emails", visible_if: st => st.newsletter_enable !== false },
    { type: "header", label: "Social media icons" },
    { type: "checkbox", id: "show_social", label: "Show social media icons", default: true },
    { type: "header", label: "Bottom bar" },
    { type: "checkbox", id: "payment_icons", label: "Show payment icons", default: true },
    { type: "inline_richtext", id: "copyright", label: "Copyright text", placeholder: "© 2026 Your store" },
    ...padding(48, 24),
  ],
  blocks: [
    { type: "link_list", name: "Menu", settings: [
      { type: "inline_richtext", id: "heading", label: "Heading", default: "Quick links" },
      { type: "link_list", id: "menu", label: "Menu", default: "footer" }] },
    { type: "text", name: "Text", settings: [
      { type: "inline_richtext", id: "heading", label: "Heading", default: "About us" },
      { type: "richtext", id: "subtext", label: "Text", default: "<p>Share contact information, store details, and brand content with your customers.</p>" }] },
    { type: "image", name: "Image", settings: [
      { type: "image_picker", id: "image", label: "Image" },
      { type: "range", id: "width", label: "Width", min: 50, max: 300, step: 10, unit: "px", default: 120 }] },
  ],
  max_blocks: 6,
  presets: [{ name: "Footer", blocks: [{ type: "link_list" }, { type: "text" }] }],
  render(s) {
    const st = s.settings;
    const blocks = s.blocks.map(b => {
      const a = blockAttrs(s, b.id);
      if (b.type === "link_list") {
        const items = menuItems(s, b.settings.menu);
        return `<div${a}><h2${editable(s, "heading", b.id)}>${inline(b.settings.heading)}</h2><ul>${items.map(i => `<li><a href="${esc(i.url)}">${esc(i.title)}</a></li>`).join("")}</ul></div>`;
      }
      if (b.type === "text") return `<div${a}><h2${editable(s, "heading", b.id)}>${inline(b.settings.heading)}</h2><div class="rte">${rich(b.settings.subtext)}</div></div>`;
      if (b.type === "image") return `<div${a} style="width:${num(b.settings.width, 120)}px">${img(b.settings.image, "", {})}</div>`;
      return "";
    }).join("");
    const signup = bool(st.newsletter_enable, true) ? `<div><h2${editable(s, "newsletter_heading")}>${inline(st.newsletter_heading)}</h2>
      <form class="inline-form" data-newsletter><input class="input" type="email" name="email" required placeholder="Email" aria-label="Email"><button class="button" type="submit">Subscribe</button></form><p class="form-msg" hidden></p></div>` : "";
    const copyright = str(st.copyright) ? inline(st.copyright) : `© ${new Date().getFullYear()}, ${esc(s.data.site.name)}`;
    const pays = bool(st.payment_icons, true) ? `<div class="payment-icons" aria-label="Payment methods">${["VISA", "MC", "AMEX", "Apple Pay", "G Pay", ...(s.data.payments?.paypal !== false ? ["PayPal"] : [])].map(p => `<span>${p}</span>`).join("")}</div>` : "";
    return `<footer class="footer section ${schemeClass(st.color_scheme)}" style="--pt:${num(st.padding_top, 48)}px;--pb:${num(st.padding_bottom, 24)}px"><div class="page-width">
<div class="footer__blocks">${blocks}${signup}</div>
${bool(st.show_social, true) ? socialLinks(s) : ""}
<div class="footer__bottom"><span${editable(s, "copyright")}>${copyright}</span>${pays}</div>
</div></footer>`;
  },
};

export const LAYOUT_SECTIONS = [announcementBar, header, footer];
