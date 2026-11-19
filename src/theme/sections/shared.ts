import type { BlockSchema, SectionCtx, SettingSchema } from "../types";
import { blockAttrs, button, editable, esc, href, inline, rich, str } from "../util";

export const colorScheme = (d = "scheme-1"): SettingSchema => ({ type: "color_scheme", id: "color_scheme", label: "Color scheme", default: d });
export const padding = (t = 36, b = 36): SettingSchema[] => [
  { type: "header", label: "Section padding" },
  { type: "range", id: "padding_top", label: "Top padding", min: 0, max: 100, step: 4, unit: "px", default: t },
  { type: "range", id: "padding_bottom", label: "Bottom padding", min: 0, max: 100, step: 4, unit: "px", default: b },
];
export const headingSize: SettingSchema = { type: "select", id: "heading_size", label: "Heading size", default: "h1", options: [
  { value: "hxs", label: "Small" }, { value: "h2", label: "Medium" }, { value: "h1", label: "Large" }, { value: "h0", label: "Extra large" }] };

/** The heading / caption / text / buttons blocks shared by banners, rich text and image-with-text. */
export const TEXT_BLOCKS: BlockSchema[] = [
  { type: "heading", name: "Heading", settings: [
    { type: "inline_richtext", id: "heading", label: "Heading", default: "Talk about your brand" }, headingSize] },
  { type: "caption", name: "Caption", settings: [
    { type: "inline_richtext", id: "caption", label: "Text", default: "Add a tagline" },
    { type: "select", id: "text_style", label: "Text style", default: "caption", options: [{ value: "caption", label: "Uppercase" }, { value: "subdued", label: "Subtitle" }] }] },
  { type: "text", name: "Text", settings: [
    { type: "richtext", id: "text", label: "Text", default: "<p>Share information about your brand with your customers. Describe a product, make announcements, or welcome customers to your store.</p>" }] },
  { type: "buttons", name: "Buttons", settings: [
    { type: "text", id: "button_label_1", label: "First button label", default: "Shop all", info: "Leave the label blank to hide the button." },
    { type: "url", id: "button_link_1", label: "First button link", default: "/collections/all" },
    { type: "checkbox", id: "button_style_secondary_1", label: "Use outline button style", default: false },
    { type: "text", id: "button_label_2", label: "Second button label" },
    { type: "url", id: "button_link_2", label: "Second button link" },
    { type: "checkbox", id: "button_style_secondary_2", label: "Use outline button style", default: true }] },
];

export function textBlocks(s: SectionCtx, opts: { headingTag?: string; firstIsH1?: boolean } = {}) {
  let headingCount = 0;
  return s.blocks.map(b => {
    const st = b.settings, a = blockAttrs(s, b.id);
    switch (b.type) {
      case "heading": {
        const tag = opts.firstIsH1 && headingCount++ === 0 ? "h1" : opts.headingTag ?? "h2";
        return `<${tag} class="${esc(str(st.heading_size, "h1"))}"${a}${editable(s, "heading", b.id)}>${inline(st.heading)}</${tag}>`;
      }
      case "caption": return `<p class="${str(st.text_style) === "subdued" ? "subdued" : "caption"}"${a}${editable(s, "caption", b.id)}>${inline(st.caption)}</p>`;
      case "text": return `<div class="rte"${a}>${rich(st.text)}</div>`;
      case "buttons": {
        const b1 = button(str(st.button_label_1), href(s, st.button_link_1), st.button_style_secondary_1 ? "secondary" : "primary");
        const b2 = button(str(st.button_label_2), href(s, st.button_link_2), st.button_style_secondary_2 ? "secondary" : "primary");
        return b1 || b2 ? `<div class="buttons"${a}>${b1}${b2}</div>` : (s.editor ? `<div${a}></div>` : "");
      }
      default: return "";
    }
  }).join("");
}

export const editorEmpty = (s: SectionCtx, text: string) => (s.editor ? `<div class="page-width"><div class="yt-empty">${esc(text)}</div></div>` : "");
