/** Pure, immutable edits on a ThemeDoc. The editor keeps every result for undo/redo. */
import { SECTIONS, fromPreset, newBlock } from "./registry";
import type { ColorScheme, Menu, SectionGroup, SectionInstance, SectionPreset, SettingValue, ThemeDoc } from "./types";
import { uid } from "./util";

export type Where = "header" | "footer" | "template";
export interface Loc { where: Where; template: string }

const clone = <T,>(v: T): T => structuredClone(v);

export function getGroup(t: ThemeDoc, loc: Loc): SectionGroup {
  return loc.where === "template" ? t.templates[loc.template] : t.groups[loc.where];
}
function edit(t: ThemeDoc, loc: Loc, fn: (g: SectionGroup, doc: ThemeDoc) => void): ThemeDoc {
  const doc = clone(t);
  const g = getGroup(doc, loc);
  if (g) fn(g, doc);
  return doc;
}
function editSection(t: ThemeDoc, loc: Loc, id: string, fn: (s: SectionInstance) => void) {
  return edit(t, loc, g => { if (g.sections[id]) fn(g.sections[id]); });
}

export function findSection(t: ThemeDoc, template: string, id: string): { loc: Loc; section: SectionInstance } | null {
  for (const where of ["header", "template", "footer"] as Where[]) {
    const loc = { where, template };
    const s = getGroup(t, loc)?.sections[id];
    if (s) return { loc, section: s };
  }
  return null;
}

export const setSectionSetting = (t: ThemeDoc, loc: Loc, id: string, key: string, v: SettingValue) =>
  editSection(t, loc, id, s => { s.settings[key] = v; });
export const setBlockSetting = (t: ThemeDoc, loc: Loc, id: string, blockId: string, key: string, v: SettingValue) =>
  editSection(t, loc, id, s => { if (s.blocks[blockId]) s.blocks[blockId].settings[key] = v; });
export const setSectionProp = (t: ThemeDoc, loc: Loc, id: string, patch: Partial<Pick<SectionInstance, "name" | "custom_css" | "disabled">>) =>
  editSection(t, loc, id, s => { Object.assign(s, patch); });

export function addSection(t: ThemeDoc, loc: Loc, type: string, index?: number, preset?: SectionPreset): { doc: ThemeDoc; id: string } {
  const { id, section } = fromPreset(type, preset);
  const doc = edit(t, loc, g => {
    g.sections[id] = section;
    g.order.splice(index ?? g.order.length, 0, id);
  });
  return { doc, id };
}
export const removeSection = (t: ThemeDoc, loc: Loc, id: string) =>
  edit(t, loc, g => { delete g.sections[id]; g.order = g.order.filter(x => x !== id); });

export function duplicateSection(t: ThemeDoc, loc: Loc, id: string): { doc: ThemeDoc; id: string } {
  const nid = uid((getGroup(t, loc).sections[id]?.type ?? "section").replace(/\W/g, "_") + "_");
  const doc = edit(t, loc, g => {
    const src = g.sections[id];
    if (!src) return;
    const copy = clone(src);
    const blocks: SectionInstance["blocks"] = {};
    copy.block_order = copy.block_order.map(b => { const n = uid(src.blocks[b].type + "_"); blocks[n] = copy.blocks[b]; return n; });
    copy.blocks = blocks;
    if (copy.name) copy.name += " copy";
    g.sections[nid] = copy;
    g.order.splice(g.order.indexOf(id) + 1, 0, nid);
  });
  return { doc, id: nid };
}
export const moveSection = (t: ThemeDoc, loc: Loc, id: string, to: number) =>
  edit(t, loc, g => { const from = g.order.indexOf(id); if (from < 0) return; g.order.splice(from, 1); g.order.splice(Math.max(0, Math.min(to, g.order.length)), 0, id); });

/** Move a section between groups (header ↔ template ↔ footer), like dragging in Shopify's tree. */
export function moveSectionTo(t: ThemeDoc, from: Loc, id: string, to: Loc, index: number): ThemeDoc {
  if (from.where === to.where) return moveSection(t, from, id, index);
  const doc = clone(t);
  const a = getGroup(doc, from), b = getGroup(doc, to);
  const s = a.sections[id];
  if (!s) return t;
  delete a.sections[id]; a.order = a.order.filter(x => x !== id);
  b.sections[id] = s; b.order.splice(Math.max(0, Math.min(index, b.order.length)), 0, id);
  return doc;
}

export function addBlock(t: ThemeDoc, loc: Loc, id: string, type: string, index?: number): { doc: ThemeDoc; blockId: string } {
  const blockId = uid(type.replace(/\W/g, "_") + "_");
  const doc = editSection(t, loc, id, s => { s.blocks[blockId] = newBlock(type); s.block_order.splice(index ?? s.block_order.length, 0, blockId); });
  return { doc, blockId };
}
export const removeBlock = (t: ThemeDoc, loc: Loc, id: string, blockId: string) =>
  editSection(t, loc, id, s => { delete s.blocks[blockId]; s.block_order = s.block_order.filter(b => b !== blockId); });
export function duplicateBlock(t: ThemeDoc, loc: Loc, id: string, blockId: string): { doc: ThemeDoc; blockId: string } {
  const nid = uid("block_");
  const doc = editSection(t, loc, id, s => {
    if (!s.blocks[blockId]) return;
    s.blocks[nid] = clone(s.blocks[blockId]);
    s.block_order.splice(s.block_order.indexOf(blockId) + 1, 0, nid);
  });
  return { doc, blockId: nid };
}
export const moveBlock = (t: ThemeDoc, loc: Loc, id: string, blockId: string, to: number) =>
  editSection(t, loc, id, s => { const from = s.block_order.indexOf(blockId); if (from < 0) return; s.block_order.splice(from, 1); s.block_order.splice(to, 0, blockId); });
export const toggleBlock = (t: ThemeDoc, loc: Loc, id: string, blockId: string) =>
  editSection(t, loc, id, s => { const b = s.blocks[blockId]; if (b) b.disabled = !b.disabled; });

export function setThemeSetting(t: ThemeDoc, key: string, v: SettingValue): ThemeDoc {
  const doc = clone(t); doc.settings[key] = v; return doc;
}
export function setScheme(t: ThemeDoc, id: string, scheme: ColorScheme | null): ThemeDoc {
  const doc = clone(t);
  if (scheme) doc.colorSchemes[id] = scheme; else delete doc.colorSchemes[id];
  return doc;
}
export function setMenu(t: ThemeDoc, handle: string, menu: Menu | null): ThemeDoc {
  const doc = clone(t);
  if (menu) doc.menus[handle] = menu; else delete doc.menus[handle];
  return doc;
}
export function setTemplate(t: ThemeDoc, key: string, g: (SectionGroup & { title?: string }) | null): ThemeDoc {
  const doc = clone(t);
  if (g) doc.templates[key] = g; else delete doc.templates[key];
  return doc;
}

/** Can this section still be added on this page (respects per-page limits)? */
export function underLimit(t: ThemeDoc, template: string, type: string) {
  const limit = SECTIONS[type]?.limit;
  if (!limit) return true;
  const all = [t.groups.header, t.templates[template], t.groups.footer].filter(Boolean).flatMap(g => Object.values(g.sections));
  return all.filter(s => s.type === type).length < limit;
}
