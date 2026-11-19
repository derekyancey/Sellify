/**
 * Yancey themes use the same data model as Shopify's Online Store 2.0 JSON templates:
 *
 *   ThemeDoc
 *     settings            global theme settings (colors, fonts, layout…)       ~ config/settings_data.json
 *     groups.header       section group shown on every page above the template ~ sections/header-group.json
 *     groups.footer       section group shown on every page below it          ~ sections/footer-group.json
 *     templates[key]      one JSON template per page type ("index", "product", "page.about"…)
 *       order[]           section ids in render order
 *       sections{id}      { type, settings, blocks{id}, block_order[], disabled? }
 *
 * Every section type declares a schema (settings, blocks, presets) the editor builds its UI from.
 */
import type { Collection, Product } from "../lib/types";

export type SettingValue = string | number | boolean | string[] | null | undefined;
export type Settings = Record<string, SettingValue>;

export interface BlockInstance { type: string; settings: Settings; disabled?: boolean }
export interface SectionInstance {
  type: string;
  name?: string;               // custom label in the editor (improvement over Shopify)
  settings: Settings;
  blocks: Record<string, BlockInstance>;
  block_order: string[];
  disabled?: boolean;
  custom_css?: string;
}
export interface SectionGroup { order: string[]; sections: Record<string, SectionInstance> }
export type GroupKey = "header" | "footer";

export interface MenuItem { id: string; title: string; url: string; children?: MenuItem[] }
export interface Menu { title: string; items: MenuItem[] }

export interface ThemeDoc {
  version: 1;
  settings: Settings;
  colorSchemes: Record<string, ColorScheme>;
  menus: Record<string, Menu>;
  groups: Record<GroupKey, SectionGroup>;
  templates: Record<string, SectionGroup & { title?: string }>;
}

export interface ColorScheme {
  name?: string;
  background: string;
  text: string;
  accent: string;              // links, badges
  button: string;
  button_label: string;
  secondary_button: string;    // outline button label/border
  border: string;
}

/* ---------------------------------------------------------------- schema */
export type SettingType =
  | "text" | "textarea" | "inline_richtext" | "richtext" | "html" | "number" | "range" | "checkbox" | "select" | "radio"
  | "text_alignment" | "color" | "color_scheme" | "font_picker" | "image_picker" | "url" | "video_url" | "product"
  | "collection" | "collection_list" | "product_list" | "link_list" | "date" | "header" | "paragraph";

export interface SettingSchema {
  type: SettingType;
  id?: string;                 // header/paragraph have none
  label?: string;
  info?: string;
  default?: SettingValue;
  placeholder?: string;
  options?: { value: string; label: string }[];
  min?: number; max?: number; step?: number; unit?: string;
  /** Only show this setting when another setting matches (improvement: Shopify added `visible_if` late). */
  visible_if?: (s: Settings) => boolean;
}

export interface BlockSchema {
  type: string;
  name: string;
  limit?: number;
  settings: SettingSchema[];
}

export type SectionCategory = "Header" | "Footer" | "Banners" | "Text" | "Products" | "Collections" | "Media" | "Social proof" | "Forms" | "Layout" | "Advanced" | "Template";

export interface SectionPreset { name: string; settings?: Settings; blocks?: { type: string; settings?: Settings }[] }

export interface SectionSchema {
  type: string;
  name: string;
  category: SectionCategory;
  /** Where it may be added. Default: templates only. */
  groups?: ("header" | "footer" | "template")[];
  /** Restrict to these template types (e.g. ["product"]). */
  templates?: string[];
  /** At most this many per page (header, main sections…). */
  limit?: number;
  settings: SettingSchema[];
  blocks?: BlockSchema[];
  max_blocks?: number;
  presets?: SectionPreset[];
  /** Static sections (like main-product) can't be removed from their template. */
  static?: boolean;
  description?: string;
  render(s: SectionCtx): string;
}

/* ---------------------------------------------------------------- render */
export interface CartLine { product: Product; quantity: number }

export interface RenderData {
  site: { id: string; name: string; currency: string; domain?: string };
  products: Product[];
  collections: Collection[];
  cart: CartLine[];
  payments?: { stripe: boolean; paypal: boolean };
}

export interface Route {
  template: string;            // template key, e.g. "index", "product", "page.about"
  product?: Product;
  collection?: Collection;
  query?: string;              // search terms
  sort?: string;
  path: string;
}

export interface RenderCtx {
  theme: ThemeDoc;
  data: RenderData;
  route: Route;
  editor: boolean;
}

export interface SectionCtx extends RenderCtx {
  id: string;
  section: SectionInstance;
  settings: Settings;
  /** Enabled blocks in order, each with its id. */
  blocks: (BlockInstance & { id: string })[];
  schema: SectionSchema;
}
