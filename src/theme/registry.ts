import { COMMERCE_SECTIONS } from "./sections/commerce";
import { CONTENT_SECTIONS } from "./sections/content";
import { LAYOUT_SECTIONS } from "./sections/layout";
import { THEME_SETTINGS } from "./settings";
import type { BlockInstance, BlockSchema, SectionInstance, SectionPreset, SectionSchema, SettingSchema, Settings, ThemeDoc } from "./types";
import { uid } from "./util";

export const SECTION_LIST: SectionSchema[] = [...LAYOUT_SECTIONS, ...CONTENT_SECTIONS, ...COMMERCE_SECTIONS];
export const SECTIONS: Record<string, SectionSchema> = Object.fromEntries(SECTION_LIST.map(s => [s.type, s]));

export const defaultsOf = (settings: SettingSchema[]): Settings =>
  Object.fromEntries(settings.filter(s => s.id && s.default !== undefined).map(s => [s.id!, s.default]));

export const blockSchema = (section: SectionSchema | undefined, type: string): BlockSchema | undefined => section?.blocks?.find(b => b.type === type);

/** Effective settings = schema defaults + what the merchant changed (like Shopify, only changes are stored). */
export function sectionSettings(inst: SectionInstance): Settings {
  const sc = SECTIONS[inst.type];
  return sc ? { ...defaultsOf(sc.settings), ...inst.settings } : inst.settings;
}
export function blockSettings(inst: SectionInstance, b: BlockInstance): Settings {
  const bs = blockSchema(SECTIONS[inst.type], b.type);
  return bs ? { ...defaultsOf(bs.settings), ...b.settings } : b.settings;
}
export function themeSettings(t: ThemeDoc): Settings {
  return { ...defaultsOf(THEME_SETTINGS.flatMap(g => g.settings)), ...t.settings };
}

export function newBlock(type: string, settings: Settings = {}): BlockInstance {
  return { type, settings: { ...settings } };
}

/** A new section instance from its preset (preset blocks get fresh ids). */
export function fromPreset(type: string, preset?: SectionPreset, overrides: Settings = {}): { id: string; section: SectionInstance } {
  const sc = SECTIONS[type];
  const p = preset ?? sc?.presets?.[0];
  const blocks: Record<string, BlockInstance> = {}, order: string[] = [];
  for (const b of p?.blocks ?? []) {
    const id = uid(b.type.replace(/\W/g, "_") + "_");
    blocks[id] = newBlock(b.type, b.settings);
    order.push(id);
  }
  return { id: uid(type.replace(/\W/g, "_") + "_"), section: { type, settings: { ...(p?.settings ?? {}), ...overrides }, blocks, block_order: order } };
}

/** Template type from a key: "page.about" -> "page", "product.alt" -> "product". */
export const templateType = (key: string) => key.split(".")[0];

export function canAddTo(sc: SectionSchema, group: "header" | "footer" | "template", templateKey: string) {
  const groups = sc.groups ?? (sc.category === "Template" ? ["template"] : ["template", "footer"]);
  if (!groups.includes(group)) return false;
  if (group === "template" && sc.templates && !sc.templates.includes(templateType(templateKey))) return false;
  return sc.category !== "Template" || !!sc.templates?.includes(templateType(templateKey));
}
