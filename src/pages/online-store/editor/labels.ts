import { SECTIONS, blockSchema, blockSettings } from "../../../theme/registry";
import type { BlockInstance, SectionInstance } from "../../../theme/types";

const plain = (v: unknown) => String(v ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;/g, " ").replace(/\s+/g, " ").trim();

/** Tree label: the custom name, else the section type's name. */
export const sectionLabel = (s: SectionInstance) => s.name || SECTIONS[s.type]?.name || s.type;

/** Like Shopify, blocks are labelled by their main text when they have one. */
export function blockLabel(s: SectionInstance, b: BlockInstance) {
  const bs = blockSchema(SECTIONS[s.type], b.type);
  const st = blockSettings(s, b);
  const key = bs?.settings.find(x => x.id && ["text", "inline_richtext", "textarea"].includes(x.type) && plain(st[x.id]))?.id;
  const text = key ? plain(st[key]) : "";
  return text ? (text.length > 36 ? text.slice(0, 34) + "…" : text) : bs?.name ?? b.type;
}
