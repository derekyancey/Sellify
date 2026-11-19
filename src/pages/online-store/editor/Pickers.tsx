import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Square } from "lucide-react";
import { SECTION_LIST, SECTIONS, canAddTo } from "../../../theme/registry";
import type { SectionInstance } from "../../../theme/types";
import type { Where } from "../../../theme/ops";
import { cx } from "../../../components/ui";

function usePopover(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    setTimeout(() => document.addEventListener("mousedown", down));
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [onClose]);
  return ref;
}

const position = (anchor: DOMRect, h: number) => ({ left: Math.min(anchor.right + 8, window.innerWidth - 760), top: Math.max(8, Math.min(anchor.top - 40, window.innerHeight - h - 8)) });

/** "Add section": searchable list by category with a live preview of the hovered section (Shopify shows a static image). */
export function AddSectionPicker({ where, template, anchor, isAllowed, preview, onAdd, onClose }: {
  where: Where; template: string; anchor: DOMRect;
  isAllowed(type: string): boolean;
  preview(type: string): string;          // full HTML document for the preview iframe
  onAdd(type: string): void; onClose(): void;
}) {
  const ref = usePopover(onClose);
  const [q, setQ] = useState("");
  const options = useMemo(() => SECTION_LIST.filter(s => canAddTo(s, where, template) && s.presets?.length && !s.static), [where, template]);
  const shown = options.filter(s => !q || `${s.name} ${s.category} ${s.description ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const cats = [...new Set(shown.map(s => s.category))];
  const [hoverRaw, setHover] = useState<string | null>(null);
  const hover = hoverRaw && shown.some(s => s.type === hoverRaw) ? hoverRaw : shown[0]?.type ?? null;
  const h = 520;
  return (
    <div ref={ref} className="fixed z-[90] flex overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl" style={{ ...position(anchor, h), height: h, width: 740 }}>
      <div className="flex w-64 shrink-0 flex-col border-r border-zinc-200">
        <div className="border-b border-zinc-200 p-2">
          <div className="flex items-center gap-2 rounded-lg border border-zinc-300 px-2"><Search className="size-4 text-zinc-400" />
            <input autoFocus className="w-full py-1.5 text-[13px] outline-none" placeholder="Search sections" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {cats.map(c => (
            <div key={c} className="mb-2">
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{c}</div>
              {shown.filter(s => s.category === c).map(s => {
                const ok = isAllowed(s.type);
                return (
                  <button key={s.type} type="button" disabled={!ok} onMouseEnter={() => setHover(s.type)} onFocus={() => setHover(s.type)} onClick={() => onAdd(s.type)}
                    className={cx("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px]", hover === s.type ? "bg-zinc-100" : "hover:bg-zinc-50", !ok && "opacity-40")}
                    title={ok ? undefined : "Already on this page"}>
                    <Square className="size-3.5 text-zinc-400" />{s.name}
                  </button>
                );
              })}
            </div>
          ))}
          {!shown.length && <div className="p-3 text-sm text-zinc-500">No sections match “{q}”.</div>}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-zinc-50">
        {hover && SECTIONS[hover] ? <>
          <div className="relative flex-1 overflow-hidden">
            <iframe key={hover} title="Section preview" srcDoc={preview(hover)} className="pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-white" style={{ width: 1200, height: 1100, transform: "scale(0.39)" }} />
          </div>
          <div className="border-t border-zinc-200 bg-white p-3">
            <div className="text-sm font-semibold">{SECTIONS[hover].name}</div>
            {SECTIONS[hover].description && <div className="mt-0.5 text-xs text-zinc-500">{SECTIONS[hover].description}</div>}
          </div>
        </> : <div className="grid flex-1 place-items-center text-sm text-zinc-500">Hover a section to preview it</div>}
      </div>
    </div>
  );
}

export function AddBlockPicker({ section, anchor, onAdd, onClose }: { section: SectionInstance; anchor: DOMRect; onAdd(type: string): void; onClose(): void }) {
  const ref = usePopover(onClose);
  const sc = SECTIONS[section.type];
  const blocks = sc?.blocks ?? [];
  const count = (t: string) => section.block_order.filter(id => section.blocks[id]?.type === t).length;
  return (
    <div ref={ref} className="fixed z-[90] w-60 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xl" style={{ left: anchor.right + 8, top: Math.min(anchor.top - 8, window.innerHeight - 40 - blocks.length * 34) }}>
      <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Blocks</div>
      {blocks.map(b => {
        const full = !!b.limit && count(b.type) >= b.limit;
        return (
          <button key={b.type} type="button" disabled={full} onClick={() => onAdd(b.type)} title={full ? "Limit reached" : undefined}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-zinc-100 disabled:opacity-40">
            <span className="size-1.5 rounded-full bg-zinc-400" />{b.name}
          </button>
        );
      })}
    </div>
  );
}
