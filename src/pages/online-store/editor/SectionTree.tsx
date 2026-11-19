import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, LayoutTemplate, PanelBottom, PanelTop, Plus, Square, Lock } from "lucide-react";
import { SECTIONS } from "../../../theme/registry";
import type { SectionGroup, SectionInstance } from "../../../theme/types";
import type { Where } from "../../../theme/ops";
import { cx } from "../../../components/ui";
import type { Sel } from "./Preview";
import { blockLabel, sectionLabel } from "./labels";

type Drag = { kind: "section"; where: Where; id: string } | { kind: "block"; sectionId: string; id: string } | null;

interface Props {
  groups: { where: Where; title: string; group: SectionGroup }[];
  selected: Sel;
  expanded: Set<string>;
  onToggleExpand(id: string): void;
  onSelect(s: Sel): void;
  onHover(s: Sel): void;
  onToggleSection(where: Where, id: string): void;
  onToggleBlock(where: Where, sectionId: string, blockId: string): void;
  onMoveSection(from: Where, id: string, to: Where, index: number): void;
  onMoveBlock(where: Where, sectionId: string, blockId: string, index: number): void;
  onAddSection(where: Where, index: number, anchor: DOMRect): void;
  onAddBlock(where: Where, sectionId: string, anchor: DOMRect): void;
}

const groupIcon = { header: PanelTop, template: LayoutTemplate, footer: PanelBottom };

export default function SectionTree(p: Props) {
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<string | null>(null);   // drop indicator key

  const sectionRow = (where: Where, g: SectionGroup, id: string, index: number) => {
    const s = g.sections[id];
    const sc = SECTIONS[s.type];
    const open = p.expanded.has(id);
    const selected = p.selected?.sectionId === id && !p.selected.blockId;
    const hasBlocks = !!sc?.blocks?.length;
    const canAddBlock = hasBlocks && (!sc!.max_blocks || s.block_order.length < sc!.max_blocks);
    return (
      <div key={id}
        onDragOver={e => { if (drag?.kind === "section") { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver(`${where}:${e.clientY < r.top + 18 ? index : index + 1}`); } }}
        onDrop={e => { e.preventDefault(); if (drag?.kind === "section" && over) { const [w, i] = over.split(":"); p.onMoveSection(drag.where, drag.id, w as Where, Number(i)); } setDrag(null); setOver(null); }}>
        {over === `${where}:${index}` && <DropLine />}
        <div
          draggable onDragStart={e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); setDrag({ kind: "section", where, id }); }}
          onDragEnd={() => { setDrag(null); setOver(null); }}
          onMouseEnter={() => p.onHover({ sectionId: id })} onMouseLeave={() => p.onHover(null)}
          onClick={() => p.onSelect({ sectionId: id })}
          className={cx("group flex h-8 cursor-pointer items-center gap-1 rounded-lg pr-1 text-[13px]", selected ? "bg-zinc-200/80 font-medium" : "hover:bg-zinc-100", s.disabled && "text-zinc-400", drag?.kind === "section" && drag.id === id && "opacity-40")}>
          <button type="button" onClick={e => { e.stopPropagation(); if (hasBlocks) p.onToggleExpand(id); }} className={cx("grid size-6 place-items-center rounded text-zinc-500", hasBlocks ? "hover:bg-zinc-200" : "invisible")} aria-label={open ? "Collapse" : "Expand"}>
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
          <Square className="size-3.5 shrink-0 text-zinc-400" />
          <span className={cx("flex-1 truncate", s.disabled && "line-through decoration-zinc-300")}>{sectionLabel(s)}</span>
          {sc?.static && <Lock className="size-3 text-zinc-400" aria-label="Required on this template" />}
          <button type="button" onClick={e => { e.stopPropagation(); p.onToggleSection(where, id); }}
            className={cx("grid size-6 place-items-center rounded text-zinc-500 hover:bg-zinc-200", !s.disabled && "opacity-0 group-hover:opacity-100")} title={s.disabled ? "Show section" : "Hide section"}>
            {s.disabled ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          <GripVertical className="size-3.5 cursor-grab text-zinc-400 opacity-0 group-hover:opacity-100" />
        </div>
        {open && hasBlocks && (
          <div className="ml-6 border-l border-zinc-200 pl-1">
            {s.block_order.map((bid, bi) => blockRow(where, id, s, bid, bi))}
            {over === `b:${id}:${s.block_order.length}` && <DropLine />}
            {canAddBlock && (
              <button type="button" onClick={e => p.onAddBlock(where, id, e.currentTarget.getBoundingClientRect())}
                className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[13px] text-sky-700 hover:bg-zinc-100">
                <Plus className="size-3.5 rounded-full bg-sky-700 p-0.5 text-white" />Add {sc!.blocks!.length === 1 ? sc!.blocks![0].name.toLowerCase() : "block"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const blockRow = (where: Where, sectionId: string, s: SectionInstance, bid: string, index: number) => {
    const b = s.blocks[bid];
    if (!b) return null;
    const selected = p.selected?.sectionId === sectionId && p.selected.blockId === bid;
    return (
      <div key={bid}
        onDragOver={e => { if (drag?.kind === "block" && drag.sectionId === sectionId) { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setOver(`b:${sectionId}:${e.clientY < r.top + 16 ? index : index + 1}`); } }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); if (drag?.kind === "block" && over?.startsWith(`b:${sectionId}:`)) { let to = Number(over.split(":")[2]); const from = s.block_order.indexOf(drag.id); if (from < to) to--; p.onMoveBlock(where, sectionId, drag.id, to); } setDrag(null); setOver(null); }}>
        {over === `b:${sectionId}:${index}` && <DropLine />}
        <div draggable onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("text/plain", bid); setDrag({ kind: "block", sectionId, id: bid }); }}
          onDragEnd={() => { setDrag(null); setOver(null); }}
          onMouseEnter={() => p.onHover({ sectionId, blockId: bid })} onMouseLeave={() => p.onHover(null)}
          onClick={() => p.onSelect({ sectionId, blockId: bid })}
          className={cx("group flex h-8 cursor-pointer items-center gap-2 rounded-lg pl-2 pr-1 text-[13px]", selected ? "bg-zinc-200/80 font-medium" : "hover:bg-zinc-100", b.disabled && "text-zinc-400")}>
          <span className="size-1.5 shrink-0 rounded-full bg-zinc-400" />
          <span className={cx("flex-1 truncate", b.disabled && "line-through decoration-zinc-300")}>{blockLabel(s, b)}</span>
          <button type="button" onClick={e => { e.stopPropagation(); p.onToggleBlock(where, sectionId, bid); }}
            className={cx("grid size-6 place-items-center rounded text-zinc-500 hover:bg-zinc-200", !b.disabled && "opacity-0 group-hover:opacity-100")} title={b.disabled ? "Show block" : "Hide block"}>
            {b.disabled ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          <GripVertical className="size-3.5 cursor-grab text-zinc-400 opacity-0 group-hover:opacity-100" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3 p-2">
      {p.groups.map(({ where, title, group }) => {
        const Icon = groupIcon[where];
        return (
          <div key={where} className="border-b border-zinc-200 pb-3 last:border-0">
            <div className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-xs font-semibold text-zinc-600"><Icon className="size-3.5" />{title}</div>
            <div
              onDragOver={e => { if (drag?.kind === "section" && !group.order.length) { e.preventDefault(); setOver(`${where}:0`); } }}
              onDrop={e => { e.preventDefault(); if (drag?.kind === "section" && over) { const [w, i] = over.split(":"); p.onMoveSection(drag.where, drag.id, w as Where, Number(i)); } setDrag(null); setOver(null); }}>
              {group.order.map((id, i) => group.sections[id] ? sectionRow(where, group, id, i) : null)}
              {over === `${where}:${group.order.length}` && group.order.length > 0 && <DropLine />}
              {!group.order.length && over === `${where}:0` && <DropLine />}
            </div>
            <button type="button" onClick={e => p.onAddSection(where, group.order.length, e.currentTarget.getBoundingClientRect())}
              className="mt-0.5 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[13px] text-sky-700 hover:bg-zinc-100">
              <Plus className="size-3.5 rounded-full bg-sky-700 p-0.5 text-white" />Add section
            </button>
          </div>
        );
      })}
    </div>
  );
}

const DropLine = () => <div className="mx-2 h-0.5 rounded bg-sky-600" />;

