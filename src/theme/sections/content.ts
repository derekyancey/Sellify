import type { SectionCtx, SectionSchema } from "../types";
import { ICONS, alignOptions, blockAttrs, bool, button, editable, esc, href, iconOptions, img, inline, num, pad, ratioFor, rich, schemeClass, str } from "../util";
import { TEXT_BLOCKS, colorScheme, editorEmpty, headingSize, padding, textBlocks } from "./shared";

const positions = ["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"]
  .map(v => ({ value: v, label: v.replace("-", " ").replace(/^\w/, c => c.toUpperCase()) }));

const wrap = (s: SectionCtx, inner: string, extra = "") =>
  `<section class="section ${schemeClass(s.settings.color_scheme)} ${extra}" style="${pad(s.settings)}" data-reveal>${inner}</section>`;

/* ---------------------------------------------------------------- image banner */
const imageBanner: SectionSchema = {
  type: "image-banner", name: "Image banner", category: "Banners",
  description: "A large image with text and buttons on top.",
  settings: [
    { type: "image_picker", id: "image", label: "Image" },
    { type: "image_picker", id: "image_mobile", label: "Mobile image", info: "Optional. Shown on small screens instead." },
    { type: "range", id: "overlay", label: "Image overlay opacity", min: 0, max: 100, step: 10, unit: "%", default: 30 },
    { type: "select", id: "height", label: "Banner height", default: "medium", options: [
      { value: "adapt", label: "Adapt to first image" }, { value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }, { value: "full", label: "Full screen" }] },
    { type: "select", id: "position", label: "Desktop content position", default: "middle-center", options: positions },
    { type: "text_alignment", id: "alignment", label: "Desktop content alignment", default: "center", options: alignOptions },
    { type: "checkbox", id: "show_box", label: "Show container on desktop", default: false },
    colorScheme("scheme-3"),
    { type: "header", label: "Mobile layout" },
    { type: "checkbox", id: "stack_mobile", label: "Show content below image on mobile", default: true },
  ],
  blocks: TEXT_BLOCKS, max_blocks: 6,
  presets: [{ name: "Image banner", blocks: [
    { type: "heading", settings: { heading: "Image banner", heading_size: "h0" } },
    { type: "text", settings: { text: "<p>Give customers details about the banner image(s) or content on the template.</p>" } },
    { type: "buttons" }] }],
  render(s) {
    const st = s.settings;
    const h = str(st.height, "medium");
    const mobile = str(st.image_mobile);
    const media = mobile
      ? `<picture class="media" style="height:100%"><source media="(max-width:749px)" srcset="${esc(mobile)}"><img src="${esc(str(st.image))}" alt="" fetchpriority="high"></picture>`
      : img(st.image, "", { placeholder: "lifestyle", eager: true });
    return `<div class="banner banner--${esc(h)}${bool(st.stack_mobile, true) ? " banner--stack-mobile" : ""} ${schemeClass(st.color_scheme)}">
  <div class="banner__media">${media}</div>
  <div class="banner__overlay" style="opacity:${num(st.overlay, 30) / 100}"></div>
  <div class="banner__content pos-${esc(str(st.position, "middle-center"))}">
    <div class="banner__box ${esc(str(st.alignment, "center"))}${bool(st.show_box) ? " has-box" : ""}" data-reveal>${textBlocks(s)}</div>
  </div>
</div>`;
  },
};

/* ---------------------------------------------------------------- slideshow */
const slideshow: SectionSchema = {
  type: "slideshow", name: "Slideshow", category: "Banners",
  settings: [
    { type: "select", id: "height", label: "Slide height", default: "medium", options: [
      { value: "adapt", label: "Adapt to first image" }, { value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }] },
    { type: "checkbox", id: "autoplay", label: "Auto-rotate slides", default: true },
    { type: "range", id: "speed", label: "Change slides every", min: 3, max: 10, step: 1, unit: "s", default: 5, visible_if: st => st.autoplay !== false },
    colorScheme("scheme-3"),
  ],
  blocks: [{ type: "slide", name: "Slide", settings: [
    { type: "image_picker", id: "image", label: "Image" },
    { type: "range", id: "overlay", label: "Image overlay opacity", min: 0, max: 100, step: 10, unit: "%", default: 30 },
    { type: "inline_richtext", id: "heading", label: "Heading", default: "Image slide" }, headingSize,
    { type: "inline_richtext", id: "subheading", label: "Subheading", default: "Tell your brand's story through images" },
    { type: "text", id: "button_label", label: "Button label", default: "Shop now" },
    { type: "url", id: "link", label: "Button link", default: "/collections/all" },
    { type: "select", id: "position", label: "Content position", default: "middle-center", options: positions },
    { type: "checkbox", id: "show_box", label: "Show container", default: false }] }],
  max_blocks: 5,
  presets: [{ name: "Slideshow", blocks: [{ type: "slide" }, { type: "slide", settings: { heading: "Second slide" } }] }],
  render(s) {
    if (!s.blocks.length) return editorEmpty(s, "Add a slide");
    const st = s.settings;
    const slides = s.blocks.map((b, i) => {
      const x = b.settings;
      return `<div class="slideshow__slide banner banner--${esc(str(st.height, "medium"))}${i === 0 ? " is-active" : ""}"${blockAttrs(s, b.id)}>
  <div class="banner__media">${img(x.image, "", { placeholder: "lifestyle", eager: i === 0 })}</div>
  <div class="banner__overlay" style="opacity:${num(x.overlay, 30) / 100}"></div>
  <div class="banner__content pos-${esc(str(x.position, "middle-center"))}"><div class="banner__box center${bool(x.show_box) ? " has-box" : ""}">
    <h2 class="${esc(str(x.heading_size, "h1"))}"${editable(s, "heading", b.id)}>${inline(x.heading)}</h2>
    <p${editable(s, "subheading", b.id)}>${inline(x.subheading)}</p>
    ${str(x.button_label) ? `<div class="buttons center">${button(str(x.button_label), href(s, x.link))}</div>` : ""}
  </div></div></div>`;
    }).join("");
    const n = s.blocks.length;
    return `<div class="slideshow ${schemeClass(st.color_scheme)}" data-slideshow${bool(st.autoplay, true) ? ` data-autoplay="${num(st.speed, 5)}"` : ""}>
<div class="slideshow__track">${slides}</div>
${n > 1 ? `<div class="slideshow__controls"><button class="slideshow__arrow" data-prev aria-label="Previous slide">${ICONS.left}</button>${s.blocks.map((_, i) => `<button class="slideshow__dot${i ? "" : " is-active"}" data-dot="${i}" aria-label="Slide ${i + 1}"></button>`).join("")}<button class="slideshow__arrow" data-next aria-label="Next slide">${ICONS.right}</button></div>` : ""}
</div>`;
  },
};

/* ---------------------------------------------------------------- rich text */
const richText: SectionSchema = {
  type: "rich-text", name: "Rich text", category: "Text",
  settings: [
    { type: "text_alignment", id: "alignment", label: "Content alignment", default: "center", options: alignOptions },
    { type: "checkbox", id: "narrow", label: "Narrow content width", default: true },
    colorScheme(), ...padding(40, 52),
  ],
  blocks: TEXT_BLOCKS, max_blocks: 8,
  presets: [{ name: "Rich text", blocks: [{ type: "heading", settings: { heading_size: "h1" } }, { type: "text" }, { type: "buttons", settings: { button_label_1: "Button label" } }] }],
  render(s) {
    return wrap(s, `<div class="page-width${bool(s.settings.narrow, true) ? " page-width--narrow" : ""} ${esc(str(s.settings.alignment, "center"))}">${textBlocks(s)}</div>`);
  },
};

/* ---------------------------------------------------------------- image with text */
const imageWithText: SectionSchema = {
  type: "image-with-text", name: "Image with text", category: "Media",
  settings: [
    { type: "image_picker", id: "image", label: "Image" },
    { type: "select", id: "height", label: "Image height", default: "medium", options: [{ value: "adapt", label: "Adapt to image" }, { value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }] },
    { type: "radio", id: "layout", label: "Desktop image placement", default: "left", options: [{ value: "left", label: "Image first" }, { value: "right", label: "Image second" }] },
    { type: "select", id: "v_align", label: "Desktop content position", default: "middle", options: [{ value: "top", label: "Top" }, { value: "middle", label: "Middle" }, { value: "bottom", label: "Bottom" }] },
    { type: "text_alignment", id: "alignment", label: "Content alignment", default: "left", options: alignOptions },
    { type: "checkbox", id: "show_box", label: "Show content container", default: false },
    colorScheme(), ...padding(36, 36),
  ],
  blocks: TEXT_BLOCKS, max_blocks: 6,
  presets: [{ name: "Image with text", blocks: [{ type: "heading", settings: { heading: "Image with text", heading_size: "h1" } },
    { type: "text", settings: { text: "<p>Pair text with an image to focus on your chosen product, collection, or blog post. Add details on availability, style, or even provide a review.</p>" } },
    { type: "buttons", settings: { button_label_1: "Button label" } }] }],
  render(s) {
    const st = s.settings;
    return wrap(s, `<div class="page-width"><div class="iwt iwt--${esc(str(st.layout, "left"))}">
  <div class="iwt__media h-${esc(str(st.height, "medium"))}">${img(st.image, "", { placeholder: "lifestyle" })}</div>
  <div class="iwt__content v-${esc(str(st.v_align, "middle"))} ${esc(str(st.alignment, "left"))}${bool(st.show_box) ? " has-box" : ""}">${textBlocks(s)}</div>
</div></div>`);
  },
};

/* ---------------------------------------------------------------- multicolumn */
const multicolumn: SectionSchema = {
  type: "multicolumn", name: "Multicolumn", category: "Text",
  description: "Columns of image or icon, title and text — great for benefits or features.",
  settings: [
    { type: "inline_richtext", id: "title", label: "Heading", default: "Multicolumn" }, headingSize,
    { type: "select", id: "image_width", label: "Image width", default: "full", options: [{ value: "third", label: "One-third width of column" }, { value: "half", label: "Half width of column" }, { value: "full", label: "Full width of column" }] },
    { type: "select", id: "image_ratio", label: "Image ratio", default: "adapt", options: [{ value: "adapt", label: "Adapt to image" }, { value: "portrait", label: "Portrait" }, { value: "square", label: "Square" }, { value: "landscape", label: "Landscape" }] },
    { type: "range", id: "columns", label: "Columns on desktop", min: 1, max: 6, step: 1, default: 3 },
    { type: "text_alignment", id: "alignment", label: "Column alignment", default: "left", options: alignOptions },
    { type: "select", id: "background", label: "Background", default: "none", options: [{ value: "none", label: "None" }, { value: "column", label: "Column" }] },
    { type: "text", id: "button_label", label: "Button label" }, { type: "url", id: "button_link", label: "Button link" },
    { type: "checkbox", id: "swipe_mobile", label: "Enable swipe on mobile", default: false },
    colorScheme(), ...padding(36, 36),
  ],
  blocks: [{ type: "column", name: "Column", settings: [
    { type: "select", id: "icon", label: "Icon", default: "none", options: iconOptions, info: "Shown when no image is selected." },
    { type: "image_picker", id: "image", label: "Image" },
    { type: "inline_richtext", id: "title", label: "Heading", default: "Column" },
    { type: "richtext", id: "text", label: "Description", default: "<p>Pair text with an image to focus on your chosen product, collection, or blog post.</p>" },
    { type: "text", id: "link_label", label: "Link label" }, { type: "url", id: "link", label: "Link" }] }],
  max_blocks: 18,
  presets: [{ name: "Multicolumn", blocks: [{ type: "column" }, { type: "column" }, { type: "column" }] }],
  render(s) {
    const st = s.settings;
    const ratio = ratioFor(st.image_ratio);
    const cols = s.blocks.map(b => {
      const x = b.settings;
      const media = str(x.image) ? `<div class="column__media w-${esc(str(st.image_width, "full"))}">${img(x.image, "", { ratio: ratio === "adapt" ? undefined : ratio })}</div>`
        : str(x.icon, "none") !== "none" ? `<div class="column__icon">${ICONS[str(x.icon)] ?? ""}</div>` : "";
      return `<div class="column${str(st.background) === "column" ? " column--bg" : ""}"${blockAttrs(s, b.id)}>${media}
<h3${editable(s, "title", b.id)}>${inline(x.title)}</h3><div class="rte">${rich(x.text)}</div>${button(str(x.link_label), href(s, x.link), "link")}</div>`;
    }).join("");
    return wrap(s, `<div class="page-width multicolumn ${esc(str(st.alignment, "left"))}">
${str(st.title) ? `<div class="title-row" style="justify-content:${str(st.alignment) === "center" ? "center" : "flex-start"}"><h2 class="${esc(str(st.heading_size, "h1"))}"${editable(s, "title")}>${inline(st.title)}</h2></div>` : ""}
<div class="grid${bool(st.swipe_mobile) ? " slider-mobile" : ""}" style="--cols:${num(st.columns, 3)}">${cols}</div>
${str(st.button_label) ? `<div class="buttons center">${button(str(st.button_label), href(s, st.button_link))}</div>` : ""}</div>`, "multicolumn-section");
  },
};

/* ---------------------------------------------------------------- collapsible content */
const collapsible: SectionSchema = {
  type: "collapsible-content", name: "Collapsible content", category: "Text",
  description: "FAQ-style rows that open and close.",
  settings: [
    { type: "inline_richtext", id: "caption", label: "Caption" },
    { type: "inline_richtext", id: "heading", label: "Heading", default: "Collapsible content" }, headingSize,
    { type: "select", id: "layout", label: "Layout", default: "stacked", options: [{ value: "stacked", label: "Stacked" }, { value: "split", label: "Heading beside rows" }] },
    { type: "checkbox", id: "open_first", label: "Open first row by default", default: false },
    colorScheme(), ...padding(36, 36),
  ],
  blocks: [{ type: "row", name: "Row", settings: [
    { type: "select", id: "icon", label: "Icon", default: "none", options: iconOptions },
    { type: "text", id: "heading", label: "Heading", default: "Collapsible row" },
    { type: "richtext", id: "content", label: "Row content", default: "<p>Use this text to share information about your product or your policies.</p>" }] }],
  max_blocks: 24,
  presets: [{ name: "Collapsible content", blocks: [{ type: "row" }, { type: "row" }, { type: "row" }] }],
  render(s) {
    const st = s.settings;
    const rows = s.blocks.map((b, i) => `<details class="accordion"${i === 0 && bool(st.open_first) ? " open" : ""}${blockAttrs(s, b.id)}>
<summary>${str(b.settings.icon, "none") !== "none" ? `<span class="ico">${ICONS[str(b.settings.icon)] ?? ""}</span>` : ""}<span${editable(s, "heading", b.id)}>${esc(b.settings.heading)}</span><span class="chev">${ICONS.chevron}</span></summary>
<div class="accordion__content rte">${rich(b.settings.content)}</div></details>`).join("");
    const head = `<div>${str(st.caption) ? `<p class="caption"${editable(s, "caption")}>${inline(st.caption)}</p>` : ""}<h2 class="${esc(str(st.heading_size, "h1"))}"${editable(s, "heading")}>${inline(st.heading)}</h2></div>`;
    return wrap(s, `<div class="page-width"><div class="faq${str(st.layout) === "split" ? " faq--split" : " center"}">${head}<div style="text-align:left">${rows}</div></div></div>`);
  },
};

/* ---------------------------------------------------------------- video */
function embedUrl(u: string) {
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&rel=0`;
  const vm = u.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?autoplay=1`;
  return "";
}
const video: SectionSchema = {
  type: "video", name: "Video", category: "Media",
  settings: [
    { type: "inline_richtext", id: "heading", label: "Heading" },
    { type: "video_url", id: "video_url", label: "YouTube or Vimeo URL", default: "https://www.youtube.com/watch?v=_9VUPq3SxOc", placeholder: "https://www.youtube.com/watch?v=…" },
    { type: "image_picker", id: "cover", label: "Cover image" },
    { type: "text", id: "description", label: "Video alt text", info: "Describe the video for people using screen readers.", default: "Video" },
    { type: "checkbox", id: "full_width", label: "Make section full width", default: false },
    colorScheme(), ...padding(36, 36),
  ],
  presets: [{ name: "Video" }],
  render(s) {
    const st = s.settings, src = embedUrl(str(st.video_url));
    const cover = str(st.cover) ? img(st.cover, "") : `<div class="media" style="height:100%;background:#222"></div>`;
    const player = src ? `<div class="video"><button class="video__cover" data-video="${esc(src)}" aria-label="Play ${esc(str(st.description))}">${cover}<span class="video__play">${ICONS.play}</span></button></div>`
      : `<div class="video">${img("", "", { placeholder: "image" })}</div>`;
    return wrap(s, `<div class="${bool(st.full_width) ? "" : "page-width"}">${str(st.heading) ? `<div class="title-row page-width"><h2${editable(s, "heading")}>${inline(st.heading)}</h2></div>` : ""}${player}</div>`);
  },
};

/* ---------------------------------------------------------------- newsletter */
const newsletter: SectionSchema = {
  type: "newsletter", name: "Email signup", category: "Forms",
  description: "Collect subscribers. They appear in Customers with marketing turned on.",
  settings: [colorScheme("scheme-2"), { type: "checkbox", id: "full_width", label: "Make section full width", default: true }, ...padding(48, 52)],
  blocks: [
    { type: "heading", name: "Heading", settings: [{ type: "inline_richtext", id: "heading", label: "Heading", default: "Subscribe to our emails" }, headingSize] },
    { type: "paragraph", name: "Subheading", settings: [{ type: "richtext", id: "text", label: "Description", default: "<p>Be the first to know about new collections and exclusive offers.</p>" }] },
    { type: "email_form", name: "Email form", limit: 1, settings: [{ type: "text", id: "button", label: "Button label", default: "Subscribe" }] },
  ],
  presets: [{ name: "Email signup", blocks: [{ type: "heading", settings: { heading_size: "h2" } }, { type: "paragraph" }, { type: "email_form" }] }],
  render(s) {
    const inner = s.blocks.map(b => {
      const a = blockAttrs(s, b.id);
      if (b.type === "heading") return `<h2 class="${esc(str(b.settings.heading_size, "h2"))}"${a}${editable(s, "heading", b.id)}>${inline(b.settings.heading)}</h2>`;
      if (b.type === "paragraph") return `<div class="rte"${a}>${rich(b.settings.text)}</div>`;
      return `<div${a}><form class="inline-form" data-newsletter><input class="input" type="email" name="email" required placeholder="Email" aria-label="Email"><button class="button" type="submit">${esc(str(b.settings.button, "Subscribe"))}</button></form><p class="form-msg" hidden></p></div>`;
    }).join("");
    return wrap(s, `<div class="page-width page-width--narrow center">${inner}</div>`);
  },
};

/* ---------------------------------------------------------------- testimonials (not in Shopify's free themes) */
const testimonials: SectionSchema = {
  type: "testimonials", name: "Testimonials", category: "Social proof",
  description: "Customer quotes with star ratings.",
  settings: [
    { type: "inline_richtext", id: "heading", label: "Heading", default: "What customers are saying" }, headingSize,
    { type: "range", id: "columns", label: "Columns on desktop", min: 1, max: 4, step: 1, default: 3 },
    { type: "checkbox", id: "swipe_mobile", label: "Enable swipe on mobile", default: true },
    colorScheme(), ...padding(48, 48),
  ],
  blocks: [{ type: "quote", name: "Testimonial", settings: [
    { type: "range", id: "rating", label: "Star rating", min: 0, max: 5, step: 1, default: 5 },
    { type: "textarea", id: "quote", label: "Quote", default: "The quality is outstanding and shipping was fast. I've already ordered again!" },
    { type: "text", id: "author", label: "Author", default: "Happy customer" },
    { type: "image_picker", id: "avatar", label: "Photo" }] }],
  max_blocks: 12,
  presets: [{ name: "Testimonials", blocks: [{ type: "quote", settings: { author: "Jamie L." } }, { type: "quote", settings: { author: "Priya S.", quote: "Beautiful packaging, and it made the perfect gift." } }, { type: "quote", settings: { author: "Marcus T.", quote: "Customer service answered within an hour. Highly recommend." } }] }],
  render(s) {
    const st = s.settings;
    const cards = s.blocks.map(b => {
      const x = b.settings, r = num(x.rating, 5);
      return `<figure class="testimonial"${blockAttrs(s, b.id)}>${r ? `<div class="stars" aria-label="${r} out of 5 stars">${ICONS.star.repeat(r)}</div>` : ""}
<blockquote${editable(s, "quote", b.id)}>${esc(x.quote)}</blockquote>
<figcaption class="testimonial__author">${str(x.avatar) ? img(x.avatar, "") : ""}<span${editable(s, "author", b.id)}>${esc(x.author)}</span></figcaption></figure>`;
    }).join("");
    return wrap(s, `<div class="page-width testimonials">${str(st.heading) ? `<div class="title-row" style="justify-content:center"><h2 class="${esc(str(st.heading_size, "h2"))}"${editable(s, "heading")}>${inline(st.heading)}</h2></div>` : ""}
<div class="grid${bool(st.swipe_mobile, true) ? " slider-mobile" : ""}" style="--cols:${num(st.columns, 3)}">${cards}</div></div>`);
  },
};

/* ---------------------------------------------------------------- logo list */
const logoList: SectionSchema = {
  type: "logo-list", name: "Logo list", category: "Social proof",
  description: "Press mentions, partners or brands you carry.",
  settings: [
    { type: "inline_richtext", id: "heading", label: "Heading", default: "As seen in" },
    { type: "range", id: "logo_height", label: "Logo height", min: 20, max: 120, step: 4, unit: "px", default: 44 },
    { type: "checkbox", id: "grayscale", label: "Show logos in grayscale", default: true },
    colorScheme(), ...padding(36, 36),
  ],
  blocks: [{ type: "logo", name: "Logo", settings: [{ type: "image_picker", id: "image", label: "Logo" }, { type: "url", id: "link", label: "Link" }] }],
  max_blocks: 16,
  presets: [{ name: "Logo list", blocks: [{ type: "logo" }, { type: "logo" }, { type: "logo" }, { type: "logo" }] }],
  render(s) {
    const st = s.settings;
    const logos = s.blocks.map(b => {
      const u = href(s, b.settings.link);
      const inner = str(b.settings.image) ? `<img src="${esc(str(b.settings.image))}" alt="" loading="lazy">` : `<div class="media media--placeholder"></div>`;
      return `<div${blockAttrs(s, b.id)}>${u ? `<a href="${esc(u)}">${inner}</a>` : inner}</div>`;
    }).join("");
    return wrap(s, `<div class="page-width center">${str(st.heading) ? `<p class="caption"${editable(s, "heading")}>${inline(st.heading)}</p>` : ""}
<div class="logos" style="--logo-h:${num(st.logo_height, 44)}px;${bool(st.grayscale, true) ? "--logo-filter:grayscale(1)" : ""}">${logos}</div></div>`);
  },
};

/* ---------------------------------------------------------------- scrolling text */
const marquee: SectionSchema = {
  type: "marquee", name: "Scrolling text", category: "Text", groups: ["template", "header", "footer"],
  settings: [
    { type: "range", id: "speed", label: "Speed", min: 5, max: 60, step: 5, unit: "s", default: 25, info: "Time for one full loop. Lower is faster." },
    { type: "select", id: "size", label: "Text size", default: "2rem", options: [{ value: "1.1rem", label: "Small" }, { value: "2rem", label: "Medium" }, { value: "3.4rem", label: "Large" }, { value: "5rem", label: "Extra large" }] },
    { type: "radio", id: "direction", label: "Direction", default: "left", options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }] },
    colorScheme("scheme-4"), ...padding(20, 20),
  ],
  blocks: [{ type: "text", name: "Text", settings: [{ type: "text", id: "text", label: "Text", default: "Free shipping over $50" }, { type: "url", id: "link", label: "Link" }] }],
  max_blocks: 10,
  presets: [{ name: "Scrolling text", blocks: [{ type: "text" }, { type: "text", settings: { text: "Small-batch, made with care" } }, { type: "text", settings: { text: "Easy 30-day returns" } }] }],
  render(s) {
    if (!s.blocks.length) return editorEmpty(s, "Add text to scroll");
    const st = s.settings;
    const items = s.blocks.map(b => {
      const u = href(s, b.settings.link), t = esc(b.settings.text);
      return `<span class="marquee__item"${blockAttrs(s, b.id)}>${u ? `<a href="${esc(u)}" style="text-decoration:none">${t}</a>` : t}</span>`;
    }).join("");
    const track = (hidden: boolean) => `<div class="marquee__track"${hidden ? ' aria-hidden="true"' : ""}>${items}${items}</div>`;
    return wrap(s, `<div class="marquee${str(st.direction) === "right" ? " marquee--reverse" : ""}" style="--speed:${num(st.speed, 25)}s;--size:${esc(str(st.size, "2rem"))}">${track(false)}${track(true)}</div>`);
  },
};

/* ---------------------------------------------------------------- countdown (not in Shopify's free themes) */
const countdown: SectionSchema = {
  type: "countdown", name: "Countdown timer", category: "Banners",
  description: "Build urgency for a sale or launch.",
  settings: [
    { type: "inline_richtext", id: "caption", label: "Caption", default: "Limited time" },
    { type: "inline_richtext", id: "heading", label: "Heading", default: "Holiday sale ends in" }, headingSize,
    { type: "date", id: "ends_at", label: "Ends at", info: "In the visitor's time zone." },
    { type: "text", id: "ended_text", label: "Text after it ends", default: "This offer has ended." },
    { type: "text", id: "button_label", label: "Button label", default: "Shop the sale" }, { type: "url", id: "button_link", label: "Button link", default: "/collections/all" },
    colorScheme("scheme-3"), ...padding(52, 52),
  ],
  presets: [{ name: "Countdown timer" }],
  render(s) {
    const st = s.settings;
    const end = str(st.ends_at) || new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 16);
    const unit = (k: string, l: string) => `<div class="countdown__unit"><span class="countdown__num" data-cd="${k}">00</span><span class="countdown__label">${l}</span></div>`;
    return wrap(s, `<div class="page-width center" data-countdown="${esc(end)}" data-ended="${esc(str(st.ended_text))}">
${str(st.caption) ? `<p class="caption"${editable(s, "caption")}>${inline(st.caption)}</p>` : ""}<h2 class="${esc(str(st.heading_size, "h1"))}"${editable(s, "heading")}>${inline(st.heading)}</h2>
<div class="countdown">${unit("d", "Days")}${unit("h", "Hours")}${unit("m", "Minutes")}${unit("s", "Seconds")}</div>
${str(st.button_label) ? `<div class="buttons center">${button(str(st.button_label), href(s, st.button_link))}</div>` : ""}</div>`);
  },
};

/* ---------------------------------------------------------------- contact form */
const contactForm: SectionSchema = {
  type: "contact-form", name: "Contact form", category: "Forms",
  settings: [
    { type: "inline_richtext", id: "heading", label: "Heading", default: "Contact us" },
    { type: "text", id: "email", label: "Send messages to", info: "Opens the visitor's email app addressed to you.", placeholder: "hello@yourstore.com" },
    colorScheme(), ...padding(36, 36),
  ],
  presets: [{ name: "Contact form" }],
  render(s) {
    const st = s.settings;
    return wrap(s, `<div class="page-width"><div class="contact-form">
<h2${editable(s, "heading")}>${inline(st.heading)}</h2>
<form data-contact="${esc(str(st.email))}"><div class="row"><div class="field"><label for="cf-name-${s.id}">Name</label><input class="input" id="cf-name-${s.id}" name="name"></div>
<div class="field"><label for="cf-email-${s.id}">Email *</label><input class="input" id="cf-email-${s.id}" type="email" name="email" required></div></div>
<div class="field"><label for="cf-phone-${s.id}">Phone number</label><input class="input" id="cf-phone-${s.id}" type="tel" name="phone"></div>
<div class="field"><label for="cf-msg-${s.id}">Comment</label><textarea class="textarea" id="cf-msg-${s.id}" name="message"></textarea></div>
<button class="button" type="submit">Send</button></form></div></div>`);
  },
};

/* ---------------------------------------------------------------- collage */
const collage: SectionSchema = {
  type: "collage", name: "Collage", category: "Media",
  settings: [
    { type: "inline_richtext", id: "heading", label: "Heading", default: "Multimedia collage" },
    { type: "radio", id: "layout", label: "Desktop layout", default: "left", options: [{ value: "left", label: "Large block first" }, { value: "right", label: "Large block last" }] },
    colorScheme(), ...padding(36, 36),
  ],
  blocks: [{ type: "image", name: "Image", settings: [{ type: "image_picker", id: "image", label: "Image" }, { type: "url", id: "link", label: "Link" }, { type: "text", id: "label", label: "Label" }] }],
  max_blocks: 3,
  presets: [{ name: "Collage", blocks: [{ type: "image" }, { type: "image" }, { type: "image" }] }],
  render(s) {
    const items = s.blocks.map(b => {
      const u = href(s, b.settings.link);
      const inner = `${img(b.settings.image, str(b.settings.label), { placeholder: "lifestyle" })}${str(b.settings.label) ? `<p style="margin-top:8px;font-weight:600">${esc(b.settings.label)} →</p>` : ""}`;
      return `<div${blockAttrs(s, b.id)}>${u ? `<a href="${esc(u)}" style="text-decoration:none;display:block;height:100%">${inner}</a>` : inner}</div>`;
    }).join("");
    return wrap(s, `<div class="page-width">${str(s.settings.heading) ? `<div class="title-row"><h2${editable(s, "heading")}>${inline(s.settings.heading)}</h2></div>` : ""}<div class="collage${str(s.settings.layout) === "right" ? " collage--right" : ""}">${items}</div></div>`);
  },
};

/* ---------------------------------------------------------------- custom code & spacing */
const customHtml: SectionSchema = {
  type: "custom-html", name: "Custom HTML", category: "Advanced",
  description: "Paste embed codes or your own HTML. Scripts run on the live store only.",
  settings: [
    { type: "html", id: "html", label: "HTML", default: '<div style="text-align:center;padding:24px">Your custom HTML</div>' },
    { type: "checkbox", id: "page_width", label: "Keep within page width", default: true },
    colorScheme(), ...padding(36, 36),
  ],
  presets: [{ name: "Custom HTML" }],
  render(s) {
    const html = str(s.settings.html);
    const safe = s.editor ? html.replace(/<script[\s\S]*?<\/script>/gi, "<!-- script runs on the live store -->") : html;
    return wrap(s, bool(s.settings.page_width, true) ? `<div class="page-width">${safe}</div>` : safe);
  },
};

const spacer: SectionSchema = {
  type: "spacer", name: "Spacer / divider", category: "Layout",
  settings: [
    { type: "range", id: "height", label: "Height", min: 0, max: 200, step: 8, unit: "px", default: 48 },
    { type: "checkbox", id: "line", label: "Show divider line", default: false },
    colorScheme(),
  ],
  presets: [{ name: "Spacer / divider" }],
  render(s) {
    const h = num(s.settings.height, 48);
    return `<div class="${schemeClass(s.settings.color_scheme)}" style="padding:${h / 2}px 0">${bool(s.settings.line) ? '<div class="page-width"><hr class="divider"></div>' : ""}</div>`;
  },
};

export const CONTENT_SECTIONS = [imageBanner, slideshow, richText, imageWithText, multicolumn, collage, collapsible, video, newsletter, testimonials, logoList, marquee, countdown, contactForm, customHtml, spacer];
