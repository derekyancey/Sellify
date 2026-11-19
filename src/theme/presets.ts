import type { Collection } from "../lib/types";
import { SECTIONS, fromPreset } from "./registry";
import { DEFAULT_SCHEMES } from "./settings";
import type { ColorScheme, Menu, SectionGroup, Settings, ThemeDoc } from "./types";
import { uid } from "./util";

type Spec = [type: string, settings?: Settings, blocks?: { type: string; settings?: Settings }[]];

function group(specs: Spec[]): SectionGroup {
  const g: SectionGroup = { order: [], sections: {} };
  for (const [type, settings, blocks] of specs) {
    const sc = SECTIONS[type];
    const preset = blocks ? { name: sc?.name ?? type, blocks } : sc?.presets?.[0];
    const { id, section } = fromPreset(type, preset, settings);
    g.order.push(id); g.sections[id] = section;
  }
  return g;
}

export interface ThemeStyle {
  id: string;
  name: string;
  tagline: string;
  swatch: string[];
  settings: Settings;
  schemes?: Partial<Record<string, ColorScheme>>;
  home(collections: Collection[]): Spec[];
}

const heading = (h: string, size = "h1") => ({ type: "heading", settings: { heading: h, heading_size: size } });
const text = (t: string) => ({ type: "text", settings: { text: `<p>${t}</p>` } });
const buttons = (l1: string, u1 = "/collections/all", l2?: string, u2?: string) =>
  ({ type: "buttons", settings: { button_label_1: l1, button_link_1: u1, button_label_2: l2 ?? "", button_link_2: u2 ?? "" } });

export const STYLES: ThemeStyle[] = [
  {
    id: "meridian", name: "Meridian", tagline: "Clean and editorial. Serif headings, lots of white space.",
    swatch: ["#ffffff", "#f5f2ec", "#1c1917", "#7c4a2d"], settings: {},
    home: cols => [
      ["image-banner", { height: "large", position: "bottom-left", alignment: "left", overlay: 30 }, [heading("Made slowly, made well", "h0"), text("Small-batch goods for everyday rituals."), buttons("Shop all")]],
      ["featured-collection", { title: cols[0]?.title ?? "Featured products", collection: cols[0]?.handle ?? "" }],
      ["image-with-text", { color_scheme: "scheme-2" }, [{ type: "caption", settings: { caption: "Our story" } }, heading("Crafted by people who care", "h1"), text("Tell customers who you are, where your products come from and why they're worth it."), buttons("Learn more", "/pages/about")]],
      ["multicolumn", { title: "", columns: 3, alignment: "center" }, [
        { type: "column", settings: { icon: "truck", title: "Free shipping", text: "<p>On every order over $50.</p>" } },
        { type: "column", settings: { icon: "return", title: "Easy returns", text: "<p>30 days, no questions asked.</p>" } },
        { type: "column", settings: { icon: "lock", title: "Secure checkout", text: "<p>Cards, Apple Pay, Google Pay and PayPal.</p>" } }]],
      ["testimonials", {}],
      ["newsletter", {}],
    ],
  },
  {
    id: "pantry", name: "Pantry", tagline: "Warm and friendly. Rounded corners, soft colors, great for food and gifts.",
    swatch: ["#fff8ef", "#ffe9cc", "#3b2a1a", "#d9572b"],
    settings: { font_heading: "Fraunces", font_body: "Nunito Sans", button_radius: 40, card_radius: 18, input_radius: 24, card_style: "card", heading_weight: "700" },
    schemes: {
      "scheme-1": { name: "Cream", background: "#fff8ef", text: "#3b2a1a", accent: "#d9572b", button: "#d9572b", button_label: "#ffffff", secondary_button: "#3b2a1a", border: "#f0dfc8" },
      "scheme-2": { name: "Butter", background: "#ffe9cc", text: "#3b2a1a", accent: "#d9572b", button: "#3b2a1a", button_label: "#fff8ef", secondary_button: "#3b2a1a", border: "#f3d2a6" },
      "scheme-3": { name: "Cocoa", background: "#3b2a1a", text: "#fff8ef", accent: "#ffb26b", button: "#ffb26b", button_label: "#3b2a1a", secondary_button: "#fff8ef", border: "#57402b" },
      "scheme-4": { name: "Tomato", background: "#d9572b", text: "#ffffff", accent: "#ffe9cc", button: "#ffffff", button_label: "#d9572b", secondary_button: "#ffffff", border: "#e57750" },
    },
    home: cols => [
      ["slideshow", { height: "medium" }, [{ type: "slide", settings: { heading: "Fresh from our kitchen", subheading: "Baked this morning, at your door tomorrow", button_label: "Shop now", show_box: true } },
        { type: "slide", settings: { heading: "Gifts they'll gobble up", subheading: "Boxes and bundles for every occasion", button_label: "Shop gifts", show_box: true } }]],
      ["marquee", { color_scheme: "scheme-4" }],
      ["featured-collection", { title: cols[0]?.title ?? "Fan favorites", collection: cols[0]?.handle ?? "", columns: 4, color_scheme: "scheme-1" }],
      ["collection-list", { title: "Shop by category", color_scheme: "scheme-2" }, cols.slice(0, 3).map(c => ({ type: "featured_collection", settings: { collection: c.handle } }))],
      ["rich-text", {}, [{ type: "caption", settings: { caption: "Our promise" } }, heading("Real ingredients. No shortcuts.", "h1"), text("Everything is made in small batches with ingredients you can pronounce.")]],
      ["testimonials", { color_scheme: "scheme-2" }],
      ["collapsible-content", { heading: "Questions? We've got answers", layout: "split" }, [
        { type: "row", settings: { heading: "How fast do you ship?", content: "<p>Orders placed before noon ship the same day.</p>" } },
        { type: "row", settings: { heading: "Do you offer gift wrapping?", content: "<p>Yes, add a note at checkout and we'll wrap it for free.</p>" } },
        { type: "row", settings: { heading: "What is your return policy?", content: "<p>If you're not happy, let us know within 30 days for a full refund.</p>" } }]],
      ["newsletter", { color_scheme: "scheme-3" }],
    ],
  },
  {
    id: "noir", name: "Noir", tagline: "Bold and dark. Sharp corners and uppercase type for fashion and streetwear.",
    swatch: ["#0b0b0b", "#1a1a1a", "#f2f2f2", "#d4ff3a"],
    settings: { font_heading: "Syne", font_body: "Inter", heading_case: "uppercase", heading_weight: "700", button_radius: 0, button_case: "uppercase", card_radius: 0, input_radius: 0, card_style: "minimal", heading_spacing: 0 },
    schemes: {
      "scheme-1": { name: "Black", background: "#0b0b0b", text: "#f2f2f2", accent: "#d4ff3a", button: "#f2f2f2", button_label: "#0b0b0b", secondary_button: "#f2f2f2", border: "#2a2a2a" },
      "scheme-2": { name: "Charcoal", background: "#1a1a1a", text: "#f2f2f2", accent: "#d4ff3a", button: "#d4ff3a", button_label: "#0b0b0b", secondary_button: "#f2f2f2", border: "#333333" },
      "scheme-3": { name: "Acid", background: "#d4ff3a", text: "#0b0b0b", accent: "#0b0b0b", button: "#0b0b0b", button_label: "#d4ff3a", secondary_button: "#0b0b0b", border: "#b8e021" },
      "scheme-4": { name: "White", background: "#f2f2f2", text: "#0b0b0b", accent: "#0b0b0b", button: "#0b0b0b", button_label: "#f2f2f2", secondary_button: "#0b0b0b", border: "#dddddd" },
    },
    home: cols => [
      ["image-banner", { height: "full", position: "middle-center", overlay: 40, color_scheme: "scheme-1" }, [heading("New season. No rules.", "h0"), buttons("Shop the drop", "/collections/all", "Lookbook", "/pages/about")]],
      ["marquee", { color_scheme: "scheme-3", size: "3.4rem", speed: 20 }, [{ type: "text", settings: { text: "Limited drop" } }, { type: "text", settings: { text: "Worldwide shipping" } }, { type: "text", settings: { text: "Members get early access" } }]],
      ["featured-collection", { title: cols[0]?.title ?? "Latest", collection: cols[0]?.handle ?? "", columns: 3, image_ratio: "portrait", products_to_show: 6 }],
      ["countdown", { heading: "Next drop in", color_scheme: "scheme-2" }],
      ["collage", { heading: "Lookbook" }],
      ["newsletter", { color_scheme: "scheme-4" }, [heading("Get on the list", "h1"), { type: "paragraph", settings: { text: "<p>First access to drops. No spam.</p>" } }, { type: "email_form", settings: { button: "Join" } }]],
    ],
  },
  {
    id: "bloom", name: "Bloom", tagline: "Fresh and airy. Pastel greens and pill buttons for beauty and wellness.",
    swatch: ["#f7faf5", "#e9f0e6", "#183020", "#2f6b3f"],
    settings: { font_heading: "DM Serif Display", font_body: "DM Sans", heading_weight: "400", button_radius: 40, card_radius: 14, input_radius: 40 },
    schemes: {
      "scheme-1": { name: "Mist", background: "#f7faf5", text: "#183020", accent: "#2f6b3f", button: "#2f6b3f", button_label: "#ffffff", secondary_button: "#183020", border: "#dfe8db" },
      "scheme-2": { name: "Sage", background: "#e9f0e6", text: "#183020", accent: "#2f6b3f", button: "#183020", button_label: "#f7faf5", secondary_button: "#183020", border: "#cddbc8" },
      "scheme-3": { name: "Forest", background: "#183020", text: "#f7faf5", accent: "#b9e3a8", button: "#b9e3a8", button_label: "#183020", secondary_button: "#f7faf5", border: "#2b4a34" },
      "scheme-4": { name: "Blush", background: "#f9e6e1", text: "#3a1f1a", accent: "#b2544a", button: "#3a1f1a", button_label: "#ffffff", secondary_button: "#3a1f1a", border: "#efcfc7" },
    },
    home: cols => [
      ["image-banner", { height: "medium", position: "middle-left", alignment: "left", show_box: true, color_scheme: "scheme-1", overlay: 0 }, [{ type: "caption", settings: { caption: "Clean · Vegan · Cruelty-free" } }, heading("Skin that feels like you", "h1"), text("Gentle formulas made with botanicals."), buttons("Shop bestsellers")]],
      ["logo-list", { heading: "As featured in" }],
      ["featured-collection", { title: cols[0]?.title ?? "Bestsellers", collection: cols[0]?.handle ?? "" }],
      ["image-with-text", { layout: "right", color_scheme: "scheme-2" }, [heading("Rooted in nature", "h1"), text("Every ingredient is sourced from growers we know by name."), buttons("Our ingredients", "/pages/about")]],
      ["multicolumn", { title: "Why customers love us", columns: 4, alignment: "center", background: "column" }, [
        { type: "column", settings: { icon: "leaf", title: "Plant based" } }, { type: "column", settings: { icon: "heart", title: "Cruelty free" } },
        { type: "column", settings: { icon: "gift", title: "Gift ready" } }, { type: "column", settings: { icon: "truck", title: "Carbon-neutral shipping" } }]],
      ["testimonials", {}],
      ["newsletter", { color_scheme: "scheme-4" }],
    ],
  },
];

function defaultMenus(cols: Collection[]): Record<string, Menu> {
  const item = (title: string, url: string, children?: { title: string; url: string }[]) =>
    ({ id: uid("m"), title, url, children: children?.map(c => ({ id: uid("m"), ...c })) });
  return {
    "main-menu": { title: "Main menu", items: [
      item("Home", "/"),
      item("Shop", "/collections/all", cols.length ? cols.map(c => ({ title: c.title, url: `/collections/${c.handle}` })) : undefined),
      item("About", "/pages/about"), item("Contact", "/pages/contact")] },
    footer: { title: "Footer menu", items: [item("Search", "/search"), item("All products", "/collections/all"), item("About us", "/pages/about"), item("Contact", "/pages/contact")] },
  };
}

/** A complete theme: header/footer groups, every template, menus and color schemes. */
export function createTheme(styleId: string, collections: Collection[]): ThemeDoc {
  const style = STYLES.find(s => s.id === styleId) ?? STYLES[0];
  const schemes = { ...DEFAULT_SCHEMES };
  for (const [k, v] of Object.entries(style.schemes ?? {})) if (v) schemes[k] = v;
  return {
    version: 1,
    settings: { ...style.settings },
    colorSchemes: schemes,
    menus: defaultMenus(collections),
    groups: {
      header: group([["announcement-bar"], ["header"]]),
      footer: group([["footer", {}, [{ type: "link_list" }, { type: "text", settings: { heading: "About us" } }]]]),
    },
    templates: {
      index: { ...group(style.home(collections)), title: "Home page" },
      product: { ...group([["main-product"], ["product-recommendations"]]), title: "Default product" },
      collection: { ...group([["main-collection-banner"], ["main-collection-product-grid"]]), title: "Default collection" },
      "list-collections": { ...group([["main-list-collections"]]), title: "Collections list" },
      cart: { ...group([["main-cart"]]), title: "Cart" },
      search: { ...group([["main-collection-product-grid", { padding_top: 36 }]]), title: "Search" },
      "404": { ...group([["main-404"]]), title: "404 page" },
      "thank-you": { ...group([["rich-text", { padding_top: 80, padding_bottom: 80 }, [{ type: "caption", settings: { caption: "Order confirmed" } }, heading("Thank you for your order!", "h1"), text("We've emailed your receipt and will let you know when it ships."), buttons("Continue shopping")]]]), title: "Order confirmation" },
      "page.about": { ...group([
        ["rich-text", { padding_top: 60 }, [{ type: "caption", settings: { caption: "About us" } }, heading("Our story", "h0"), text("Use this page to tell customers who you are and what you stand for.")]],
        ["image-with-text", {}, [heading("How it started", "h2"), text("Every brand has a beginning. Share yours.")]],
        ["image-with-text", { layout: "right" }, [heading("What we believe", "h2"), text("Quality, honesty and a little bit of fun.")]]]), title: "About" },
      "page.contact": { ...group([["contact-form", { padding_top: 60 }], ["collapsible-content", { heading: "Frequently asked questions" }]]), title: "Contact" },
    },
  };
}

/** A blank page template for "Create page". */
export function blankPage(title: string): SectionGroup & { title: string } {
  return { ...group([["rich-text", { padding_top: 60 }, [heading(title, "h0"), text("Add sections to build this page.")]]]), title };
}
