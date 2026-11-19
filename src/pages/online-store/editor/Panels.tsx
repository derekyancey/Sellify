import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Copy, Eye, EyeOff, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { SECTIONS, blockSchema, blockSettings, sectionSettings } from "../../../theme/registry";
import { SCHEME_FIELDS, THEME_SETTINGS } from "../../../theme/settings";
import type { ColorScheme, SectionInstance, Settings, SettingValue } from "../../../theme/types";
import { cx } from "../../../components/ui";
import { SettingsForm, inputCls } from "./fields";
import { blockLabel, sectionLabel } from "./labels";

function Menu({ items }: { items: { label: string; icon: typeof Copy; onClick(): void; danger?: boolean; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)} className="grid size-7 place-items-center rounded-lg text-zinc-600 hover:bg-zinc-100" aria-label="More actions"><MoreHorizontal className="size-4" /></button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-44 rounded-xl border border-zinc-200 bg-white p-1 shadow-xl">
          {items.filter(i => !i.disabled).map(i => (
            <button key={i.label} type="button" onMouseDown={() => { i.onClick(); setOpen(false); }}
              className={cx("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px]", i.danger ? "text-red-600 hover:bg-red-50" : "hover:bg-zinc-100")}>
              <i.icon className="size-3.5" />{i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SectionPanel({ section, onSetting, onRename, onCss, onToggle, onDuplicate, onRemove, onAddBlock }: {
  section: SectionInstance;
  onSetting(key: string, v: SettingValue): void;
  onRename(name: string): void;
  onCss(css: string): void;
  onToggle(): void; onDuplicate(): void; onRemove(): void;
  onAddBlock(anchor: DOMRect): void;
}) {
  const sc = SECTIONS[section.type];
  const [cssOpen, setCssOpen] = useState(!!section.custom_css);
  if (!sc) return <div className="p-4 text-sm text-zinc-500">Unknown section type “{section.type}”.</div>;
  const canAddBlock = !!sc.blocks?.length && (!sc.max_blocks || section.block_order.length < sc.max_blocks);
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-3">
        <input className="min-w-0 flex-1 rounded px-1 py-0.5 text-sm font-semibold outline-none hover:bg-zinc-100 focus:bg-zinc-100" value={sectionLabel(section)}
          onChange={e => onRename(e.target.value === sc.name ? "" : e.target.value)} title="Rename section" aria-label="Section name" />
        <Menu items={[
          { label: section.disabled ? "Show section" : "Hide section", icon: section.disabled ? Eye : EyeOff, onClick: onToggle },
          { label: "Duplicate", icon: Copy, onClick: onDuplicate, disabled: !!sc.limit },
          { label: "Remove section", icon: Trash2, onClick: onRemove, danger: true, disabled: sc.static },
        ]} />
      </div>
      <div className="p-4">
        {sc.description && <p className="mb-4 text-xs text-zinc-500">{sc.description}</p>}
        {sc.settings.length ? <SettingsForm schema={sc.settings} values={sectionSettings(section)} onChange={onSetting} /> : <p className="text-sm text-zinc-500">This section has no settings.</p>}
        {canAddBlock && (
          <button type="button" onClick={e => onAddBlock(e.currentTarget.getBoundingClientRect())} className="mt-5 flex items-center gap-1.5 text-[13px] text-sky-700 hover:underline">
            <Plus className="size-3.5" />Add block
          </button>
        )}
        <div className="-mx-4 mt-6 border-t border-zinc-200 px-4 pt-3">
          <button type="button" onClick={() => setCssOpen(o => !o)} className="flex w-full items-center gap-1 text-[13px] font-medium text-zinc-700">
            {cssOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}Custom CSS
          </button>
          {cssOpen && <>
            <textarea spellCheck={false} className={cx(inputCls, "mt-2 min-h-28 font-mono text-xs")} placeholder={"h2 {\n  letter-spacing: 0.1em;\n}"} value={section.custom_css ?? ""} onChange={e => onCss(e.target.value)} />
            <p className="mt-1 text-xs text-zinc-500">Applies only to this section.</p>
          </>}
        </div>
        {!sc.static && (
          <button type="button" onClick={onRemove} className="mt-6 flex items-center gap-1.5 text-[13px] text-red-600 hover:underline"><Trash2 className="size-3.5" />Remove section</button>
        )}
      </div>
    </div>
  );
}

export function BlockPanel({ section, blockId, onBack, onSetting, onToggle, onDuplicate, onRemove }: {
  section: SectionInstance; blockId: string; onBack(): void;
  onSetting(key: string, v: SettingValue): void; onToggle(): void; onDuplicate(): void; onRemove(): void;
}) {
  const b = section.blocks[blockId];
  const bs = blockSchema(SECTIONS[section.type], b?.type ?? "");
  if (!b || !bs) return null;
  const count = section.block_order.filter(id => section.blocks[id]?.type === b.type).length;
  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-3">
        <button type="button" onClick={onBack} className="mb-1 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900"><ArrowLeft className="size-3.5" />{sectionLabel(section)}</button>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-sm font-semibold">{blockLabel(section, b)}</div>
          <Menu items={[
            { label: b.disabled ? "Show block" : "Hide block", icon: b.disabled ? Eye : EyeOff, onClick: onToggle },
            { label: "Duplicate", icon: Copy, onClick: onDuplicate, disabled: !!bs.limit && count >= bs.limit },
            { label: "Remove block", icon: Trash2, onClick: onRemove, danger: true },
          ]} />
        </div>
      </div>
      <div className="p-4">
        {bs.settings.length ? <SettingsForm schema={bs.settings} values={blockSettings(section, b)} onChange={onSetting} /> : <p className="text-sm text-zinc-500">This block has no settings. Drag it in the sidebar to change where it appears.</p>}
        <button type="button" onClick={onRemove} className="mt-6 flex items-center gap-1.5 text-[13px] text-red-600 hover:underline"><Trash2 className="size-3.5" />Remove block</button>
      </div>
    </div>
  );
}

/** Theme settings: accordion groups like Shopify's, with a full color-scheme editor. */
export function ThemeSettingsPanel({ values, schemes, open, setOpen, onSetting, onScheme }: {
  values: Settings; schemes: Record<string, ColorScheme>; open: string | null; setOpen(id: string | null): void;
  onSetting(key: string, v: SettingValue): void; onScheme(id: string, s: ColorScheme | null): void;
}) {
  const [scheme, setScheme] = useState<string | null>(null);
  return (
    <div className="p-2">
      {THEME_SETTINGS.map(g => (
        <div key={g.id} className="border-b border-zinc-100 last:border-0">
          <button type="button" onClick={() => setOpen(open === g.id ? null : g.id)} className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left text-[13px] font-medium hover:bg-zinc-50">
            {g.name}{open === g.id ? <ChevronDown className="size-4 text-zinc-400" /> : <ChevronRight className="size-4 text-zinc-400" />}
          </button>
          {open === g.id && (
            <div className="px-2 pb-4">
              <SettingsForm schema={g.settings} values={values} onChange={onSetting} />
              {g.id === "colors" && (
                <div className="mt-3 space-y-2">
                  {Object.entries(schemes).map(([id, c]) => (
                    <div key={id} className="rounded-lg border border-zinc-200">
                      <button type="button" onClick={() => setScheme(scheme === id ? null : id)} className="flex w-full items-center gap-3 p-2 text-left">
                        <span className="grid size-10 shrink-0 place-items-center rounded-md border border-zinc-200 text-sm font-semibold" style={{ background: c.background, color: c.text }}>Aa</span>
                        <span className="flex-1 text-[13px] font-medium">{c.name ?? id}</span>
                        <span className="flex gap-1">{[c.button, c.accent, c.text].map((x, i) => <span key={i} className="size-3 rounded-full border border-zinc-200" style={{ background: x }} />)}</span>
                      </button>
                      {scheme === id && (
                        <div className="space-y-2 border-t border-zinc-100 p-2">
                          <input className={inputCls} value={c.name ?? ""} placeholder="Scheme name" onChange={e => onScheme(id, { ...c, name: e.target.value })} />
                          {SCHEME_FIELDS.map(f => (
                            <label key={f.key} className="flex items-center justify-between gap-2 text-[13px]">
                              <span className="text-zinc-700">{f.label}</span>
                              <span className="flex items-center gap-1.5">
                                <input className="w-20 rounded border border-zinc-300 px-1.5 py-0.5 font-mono text-xs" value={String(c[f.key] ?? "")} onChange={e => onScheme(id, { ...c, [f.key]: e.target.value })} />
                                <input type="color" value={String(c[f.key] || "#000000")} onChange={e => onScheme(id, { ...c, [f.key]: e.target.value })} className="h-7 w-8 cursor-pointer rounded border border-zinc-300 p-0.5" />
                              </span>
                            </label>
                          ))}
                          {Object.keys(schemes).length > 1 && id !== "scheme-1" && (
                            <button type="button" onClick={() => onScheme(id, null)} className="text-xs text-red-600 hover:underline">Delete scheme</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => {
                    const n = Object.keys(schemes).length + 1;
                    let key = `scheme-${n}`; while (schemes[key]) key += "x";
                    onScheme(key, { ...Object.values(schemes)[0], name: `Scheme ${n}` }); setScheme(key);
                  }} className="flex items-center gap-1 text-[13px] text-sky-700 hover:underline"><Plus className="size-3.5" />Add scheme</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
