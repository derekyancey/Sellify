import { FONTS } from "./fonts";
import type { ColorScheme, SettingSchema, Settings } from "./types";

/** The "Theme settings" panel, grouped like Shopify's (config/settings_schema.json). */
export interface ThemeSettingGroup { id: string; name: string; settings: SettingSchema[] }

const fontOptions = FONTS.map(f => ({ value: f.id, label: f.category === "system" ? (f.id === "system" ? "System sans-serif" : "System serif") : f.family }));

export const THEME_SETTINGS: ThemeSettingGroup[] = [
  { id: "logo", name: "Logo and favicon", settings: [
    { type: "image_picker", id: "logo", label: "Logo", info: "Shown in the header. Leave empty to show the store name as text." },
    { type: "range", id: "logo_width", label: "Desktop logo width", min: 50, max: 300, step: 10, unit: "px", default: 120 },
    { type: "image_picker", id: "favicon", label: "Favicon", info: "Will be scaled down to 32 × 32 px" },
  ] },
  { id: "colors", name: "Colors", settings: [
    { type: "paragraph", info: "Color schemes are applied per section. Edit a scheme to change every section using it." },
  ] },
  { id: "typography", name: "Typography", settings: [
    { type: "header", label: "Headings" },
    { type: "font_picker", id: "font_heading", label: "Font", default: "Fraunces", options: fontOptions },
    { type: "range", id: "heading_scale", label: "Font size scale", min: 80, max: 150, step: 5, unit: "%", default: 100 },
    { type: "select", id: "heading_weight", label: "Weight", default: "600", options: [{ value: "400", label: "Regular" }, { value: "500", label: "Medium" }, { value: "600", label: "Semibold" }, { value: "700", label: "Bold" }] },
    { type: "select", id: "heading_case", label: "Letter case", default: "none", options: [{ value: "none", label: "Default" }, { value: "uppercase", label: "Uppercase" }] },
    { type: "range", id: "heading_spacing", label: "Letter spacing", min: -5, max: 15, step: 1, unit: "%", default: -1 },
    { type: "header", label: "Body" },
    { type: "font_picker", id: "font_body", label: "Font", default: "Inter", options: fontOptions },
    { type: "range", id: "body_scale", label: "Font size scale", min: 90, max: 130, step: 5, unit: "%", default: 100 },
  ] },
  { id: "layout", name: "Layout", settings: [
    { type: "range", id: "page_width", label: "Page width", min: 1000, max: 1800, step: 50, unit: "px", default: 1300 },
    { type: "range", id: "section_spacing", label: "Space between template sections", min: 0, max: 100, step: 4, unit: "px", default: 0 },
    { type: "header", label: "Grid" },
    { type: "range", id: "grid_gap", label: "Horizontal & vertical space", min: 4, max: 40, step: 2, unit: "px", default: 16 },
  ] },
  { id: "animations", name: "Animations", settings: [
    { type: "checkbox", id: "reveal_on_scroll", label: "Reveal sections on scroll", default: true },
    { type: "select", id: "hover_effect", label: "Hover effect", default: "lift", options: [{ value: "none", label: "None" }, { value: "lift", label: "Vertical lift" }, { value: "zoom", label: "Image zoom" }] },
  ] },
  { id: "buttons", name: "Buttons", settings: [
    { type: "range", id: "button_radius", label: "Corner radius", min: 0, max: 40, step: 2, unit: "px", default: 6 },
    { type: "range", id: "button_border", label: "Border thickness", min: 0, max: 4, step: 1, unit: "px", default: 1 },
    { type: "select", id: "button_case", label: "Letter case", default: "none", options: [{ value: "none", label: "Default" }, { value: "uppercase", label: "Uppercase" }] },
    { type: "checkbox", id: "button_shadow", label: "Show shadow", default: false },
  ] },
  { id: "inputs", name: "Inputs", settings: [
    { type: "range", id: "input_radius", label: "Corner radius", min: 0, max: 30, step: 2, unit: "px", default: 6 },
    { type: "range", id: "input_border", label: "Border thickness", min: 1, max: 3, step: 1, unit: "px", default: 1 },
  ] },
  { id: "cards", name: "Product cards", settings: [
    { type: "select", id: "card_style", label: "Style", default: "standard", options: [{ value: "standard", label: "Standard" }, { value: "card", label: "Card" }, { value: "minimal", label: "Minimal" }] },
    { type: "select", id: "card_align", label: "Text alignment", default: "left", options: [{ value: "left", label: "Left" }, { value: "center", label: "Center" }] },
    { type: "checkbox", id: "show_secondary_image", label: "Show second image on hover", default: true },
    { type: "range", id: "card_radius", label: "Corner radius", min: 0, max: 30, step: 2, unit: "px", default: 8 },
    { type: "checkbox", id: "card_shadow", label: "Show shadow", default: false },
  ] },
  { id: "badges", name: "Badges", settings: [
    { type: "select", id: "badge_position", label: "Position on cards", default: "top-left", options: [{ value: "top-left", label: "Top left" }, { value: "top-right", label: "Top right" }, { value: "bottom-left", label: "Bottom left" }] },
    { type: "checkbox", id: "show_sale_badge", label: "Show sale badge", default: true },
    { type: "color", id: "sale_badge_color", label: "Sale badge color", default: "#c0392b" },
  ] },
  { id: "social", name: "Social media", settings: [
    { type: "url", id: "social_instagram", label: "Instagram", placeholder: "https://instagram.com/yourstore" },
    { type: "url", id: "social_facebook", label: "Facebook", placeholder: "https://facebook.com/yourstore" },
    { type: "url", id: "social_tiktok", label: "TikTok", placeholder: "https://tiktok.com/@yourstore" },
    { type: "url", id: "social_youtube", label: "YouTube" },
    { type: "url", id: "social_x", label: "X (Twitter)" },
    { type: "url", id: "social_pinterest", label: "Pinterest" },
  ] },
  { id: "search", name: "Search behavior", settings: [
    { type: "checkbox", id: "search_descriptions", label: "Also search product descriptions", default: true },
  ] },
  { id: "cart", name: "Cart", settings: [
    { type: "select", id: "cart_type", label: "Cart type", default: "drawer", options: [{ value: "drawer", label: "Drawer" }, { value: "page", label: "Page" }] },
    { type: "checkbox", id: "cart_note", label: "Show order note", default: false },
    { type: "checkbox", id: "cart_discount", label: "Show discount code field", default: true },
    { type: "text", id: "free_shipping_threshold", label: "Free shipping threshold", info: "Shows a progress bar in the cart. Leave empty to hide.", placeholder: "50" },
  ] },
  { id: "seo", name: "SEO & sharing", settings: [
    { type: "text", id: "meta_title", label: "Home page title", info: "Defaults to the store name" },
    { type: "textarea", id: "meta_description", label: "Home page meta description" },
    { type: "image_picker", id: "share_image", label: "Social sharing image", info: "1200 × 628 px recommended" },
  ] },
  { id: "custom_css", name: "Custom CSS", settings: [
    { type: "html", id: "custom_css", label: "CSS", info: "Added to every page after the theme styles." },
  ] },
];

export function defaultThemeSettings(): Settings {
  const out: Settings = {};
  for (const g of THEME_SETTINGS) for (const s of g.settings) if (s.id && s.default !== undefined) out[s.id] = s.default;
  return out;
}

export const DEFAULT_SCHEMES: Record<string, ColorScheme> = {
  "scheme-1": { name: "Light", background: "#ffffff", text: "#1c1917", accent: "#1c1917", button: "#1c1917", button_label: "#ffffff", secondary_button: "#1c1917", border: "#e7e5e4" },
  "scheme-2": { name: "Soft", background: "#f5f2ec", text: "#1c1917", accent: "#7c4a2d", button: "#1c1917", button_label: "#ffffff", secondary_button: "#1c1917", border: "#e3ddd2" },
  "scheme-3": { name: "Dark", background: "#1c1917", text: "#fafaf9", accent: "#f5c26b", button: "#fafaf9", button_label: "#1c1917", secondary_button: "#fafaf9", border: "#3a3532" },
  "scheme-4": { name: "Accent", background: "#7c4a2d", text: "#ffffff", accent: "#ffe2b8", button: "#ffffff", button_label: "#7c4a2d", secondary_button: "#ffffff", border: "#94603f" },
  "scheme-5": { name: "Bright", background: "#e9f0e6", text: "#183020", accent: "#2f6b3f", button: "#2f6b3f", button_label: "#ffffff", secondary_button: "#183020", border: "#cddbc8" },
};

export const SCHEME_FIELDS: { key: keyof ColorScheme; label: string }[] = [
  { key: "background", label: "Background" }, { key: "text", label: "Text" }, { key: "accent", label: "Accent" },
  { key: "button", label: "Solid button background" }, { key: "button_label", label: "Solid button label" },
  { key: "secondary_button", label: "Outline button" }, { key: "border", label: "Borders" },
];
