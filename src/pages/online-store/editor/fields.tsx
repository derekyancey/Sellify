import { useEffect, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, ImagePlus, Italic, Link2, List, Pencil, Underline } from "lucide-react";
import type { SettingSchema, Settings, SettingValue } from "../../../theme/types";
import { FONTS } from "../../../theme/fonts";
import { useEnv } from "./context";
import { cx } from "../../../components/ui";

export const inputCls = "w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200";

/** Renders a schema-driven settings form (the right-hand panel in the editor). */
export function SettingsForm({ schema, values, onChange }: { schema: SettingSchema[]; values: Settings; onChange(key: string, v: SettingValue): void }) {
  return (
    <div className="space-y-4">
      {schema.filter(s => !s.visible_if || s.visible_if(values)).map((s, i) => (
        <SettingField key={s.id ?? `x${i}`} s={s} value={s.id ? values[s.id] : undefined} onChange={v => s.id && onChange(s.id, v)} />
      ))}
    </div>
  );
}

function Label({ s, children }: { s: SettingSchema; children: React.ReactNode }) {
  return (
    <div>
      {s.label && <div className="mb-1 text-[13px] font-medium text-zinc-700">{s.label}</div>}
      {children}
      {s.info && <div className="mt-1 text-xs text-zinc-500">{s.info}</div>}
    </div>
  );
}

export function SettingField({ s, value, onChange }: { s: SettingSchema; value: SettingValue; onChange(v: SettingValue): void }) {
  const env = useEnv();
  const v = value ?? s.default;
  switch (s.type) {
    case "header":
      return <div className="-mx-4 border-t border-zinc-200 px-4 pt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{s.label}</div>;
    case "paragraph":
      return <p className="text-xs text-zinc-500">{s.info}</p>;
    case "text": case "video_url":
      return <Label s={s}><input className={inputCls} value={String(v ?? "")} placeholder={s.placeholder} onChange={e => onChange(e.target.value)} /></Label>;
    case "inline_richtext":
      return <Label s={s}><RichInput value={String(v ?? "")} inline onChange={onChange} /></Label>;
    case "textarea":
      return <Label s={s}><textarea className={cx(inputCls, "min-h-20")} value={String(v ?? "")} placeholder={s.placeholder} onChange={e => onChange(e.target.value)} /></Label>;
    case "richtext":
      return <Label s={s}><RichInput value={String(v ?? "")} onChange={onChange} /></Label>;
    case "html":
      return <Label s={s}><textarea spellCheck={false} className={cx(inputCls, "min-h-36 font-mono text-xs")} value={String(v ?? "")} onChange={e => onChange(e.target.value)} /></Label>;
    case "number":
      return <Label s={s}><input type="number" className={inputCls} value={String(v ?? "")} onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))} /></Label>;
    case "date":
      return <Label s={s}><input type="datetime-local" className={inputCls} value={String(v ?? "")} onChange={e => onChange(e.target.value)} /></Label>;
    case "range":
      return <Label s={s}><RangeInput s={s} value={Number(v ?? s.min ?? 0)} onChange={onChange} /></Label>;
    case "checkbox":
      return (
        <div>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] text-zinc-700">
            <span>{s.label}</span>
            <button type="button" role="switch" aria-checked={!!v} onClick={() => onChange(!v)}
              className={cx("relative h-5 w-9 shrink-0 rounded-full transition", v ? "bg-zinc-900" : "bg-zinc-300")}>
              <span className={cx("absolute top-0.5 size-4 rounded-full bg-white shadow transition", v ? "left-[18px]" : "left-0.5")} />
            </button>
          </label>
          {s.info && <div className="mt-1 text-xs text-zinc-500">{s.info}</div>}
        </div>
      );
    case "select":
      if ((s.options?.length ?? 0) <= 3 && s.options!.every(o => o.label.length < 12)) return <Label s={s}><Segmented options={s.options!} value={String(v)} onChange={onChange} /></Label>;
      return <Label s={s}><select className={inputCls} value={String(v ?? "")} onChange={e => onChange(e.target.value)}>{s.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Label>;
    case "radio":
      return (
        <Label s={s}>
          <div className="space-y-1.5">{s.options!.map(o => (
            <label key={o.value} className="flex items-center gap-2 text-[13px]"><input type="radio" checked={String(v) === o.value} onChange={() => onChange(o.value)} />{o.label}</label>
          ))}</div>
        </Label>
      );
    case "text_alignment": {
      const icons: Record<string, typeof AlignLeft> = { left: AlignLeft, center: AlignCenter, right: AlignRight };
      return <Label s={s}><Segmented options={s.options!} value={String(v)} onChange={onChange} icon={o => icons[o]} /></Label>;
    }
    case "color":
      return (
        <Label s={s}>
          <div className="flex items-center gap-2">
            <input type="color" value={String(v || "#000000")} onChange={e => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-zinc-300 bg-white p-0.5" />
            <input className={inputCls} value={String(v ?? "")} onChange={e => onChange(e.target.value)} />
          </div>
        </Label>
      );
    case "color_scheme":
      return (
        <Label s={s}>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(env.theme.colorSchemes).map(([id, c]) => (
              <button key={id} type="button" onClick={() => onChange(id)} title={c.name ?? id}
                className={cx("rounded-lg border p-1 text-left", v === id ? "border-zinc-900 ring-2 ring-zinc-900/15" : "border-zinc-200 hover:border-zinc-400")}>
                <div className="flex h-10 flex-col justify-between rounded-md p-1.5" style={{ background: c.background, color: c.text }}>
                  <span className="text-xs font-semibold leading-none">Aa</span>
                  <span className="flex gap-1"><span className="h-1.5 w-4 rounded-full" style={{ background: c.button }} /><span className="h-1.5 w-4 rounded-full border" style={{ borderColor: c.secondary_button }} /></span>
                </div>
                <div className="mt-1 truncate px-0.5 text-[11px] text-zinc-600">{c.name ?? id}</div>
              </button>
            ))}
          </div>
          <button type="button" onClick={env.openColors} className="mt-1.5 text-xs text-sky-700 hover:underline">Edit color schemes</button>
        </Label>
      );
    case "font_picker":
      return (
        <Label s={s}>
          <select className={inputCls} value={String(v ?? "")} onChange={e => onChange(e.target.value)}>
            {(["system", "sans", "serif", "display", "mono"] as const).map(cat => (
              <optgroup key={cat} label={{ system: "System (fastest)", sans: "Sans-serif", serif: "Serif", display: "Display", mono: "Monospace" }[cat]}>
                {FONTS.filter(f => f.category === cat).map(f => <option key={f.id} value={f.id}>{s.options?.find(o => o.value === f.id)?.label ?? f.family}</option>)}
              </optgroup>
            ))}
          </select>
        </Label>
      );
    case "image_picker":
      return <Label s={s}><ImageField value={String(v ?? "")} onChange={onChange} /></Label>;
    case "url":
      return <Label s={s}><UrlField value={String(v ?? "")} placeholder={s.placeholder} onChange={onChange} /></Label>;
    case "product":
      return (
        <Label s={s}>
          <select className={inputCls} value={String(v ?? "")} onChange={e => onChange(e.target.value)}>
            <option value="">Select a product</option>
            {env.products.filter(p => p.status !== "archived").map(p => <option key={p.$id} value={p.$id}>{p.title}{p.status === "draft" ? " (draft)" : ""}</option>)}
          </select>
        </Label>
      );
    case "collection":
      return (
        <Label s={s}>
          <select className={inputCls} value={String(v ?? "")} onChange={e => onChange(e.target.value)}>
            <option value="">{s.id === "collection" ? "Newest products" : "Select a collection"}</option>
            {env.collections.map(c => <option key={c.$id} value={c.handle}>{c.title}</option>)}
          </select>
        </Label>
      );
    case "link_list":
      return (
        <Label s={s}>
          <div className="flex gap-2">
            <select className={inputCls} value={String(v ?? "")} onChange={e => onChange(e.target.value)}>
              {Object.entries(env.theme.menus).map(([h, m]) => <option key={h} value={h}>{m.title}</option>)}
            </select>
            <button type="button" onClick={() => env.openMenus(String(v ?? ""))} className="shrink-0 rounded-lg border border-zinc-300 px-2 text-xs hover:bg-zinc-50" title="Edit menu"><Pencil className="size-3.5" /></button>
          </div>
        </Label>
      );
    default:
      return null;
  }
}

function Segmented({ options, value, onChange, icon }: { options: { value: string; label: string }[]; value: string; onChange(v: string): void; icon?: (v: string) => typeof AlignLeft | undefined }) {
  return (
    <div className="flex rounded-lg bg-zinc-100 p-0.5">
      {options.map(o => {
        const I = icon?.(o.value);
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)} title={o.label}
            className={cx("flex flex-1 items-center justify-center rounded-md px-2 py-1 text-xs font-medium", value === o.value ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900")}>
            {I ? <I className="size-4" /> : o.label}
          </button>
        );
      })}
    </div>
  );
}

function RangeInput({ s, value, onChange }: { s: SettingSchema; value: number; onChange(v: number): void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={s.min} max={s.max} step={s.step} value={value} onChange={e => onChange(Number(e.target.value))} className="flex-1 accent-zinc-900" />
      <div className="flex w-20 items-center rounded-lg border border-zinc-300 bg-white pr-2">
        <input type="number" min={s.min} max={s.max} step={s.step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full min-w-0 bg-transparent px-2 py-1 text-[13px] outline-none" />
        {s.unit && <span className="text-xs text-zinc-500">{s.unit}</span>}
      </div>
    </div>
  );
}

/** Small rich text editor: bold, italic, underline, link (+ lists for block rich text). */
function RichInput({ value, onChange, inline }: { value: string; onChange(v: string): void; inline?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  useEffect(() => { if (ref.current && !focused.current && ref.current.innerHTML !== value) ref.current.innerHTML = value; }, [value]);
  const cmd = (c: string, arg?: string) => { ref.current?.focus(); document.execCommand(c, false, arg); emit(); };
  const emit = () => {
    if (!ref.current) return;
    let html = ref.current.innerHTML.replace(/&nbsp;/g, " ");
    if (inline) html = html.replace(/<\/?(div|p)[^>]*>/g, "").replace(/<br>$/, "");
    else if (html && !/^\s*<(p|ul|ol|h\d)/.test(html)) html = `<p>${html}</p>`;
    onChange(html === "<p></p>" || html === "<br>" ? "" : html);
  };
  const btn = "rounded p-1 text-zinc-600 hover:bg-zinc-200";
  return (
    <div className="rounded-lg border border-zinc-300 bg-white focus-within:border-zinc-500 focus-within:ring-2 focus-within:ring-zinc-200">
      <div className="flex gap-0.5 border-b border-zinc-200 px-1 py-0.5">
        <button type="button" className={btn} onMouseDown={e => { e.preventDefault(); cmd("bold"); }} title="Bold"><Bold className="size-3.5" /></button>
        <button type="button" className={btn} onMouseDown={e => { e.preventDefault(); cmd("italic"); }} title="Italic"><Italic className="size-3.5" /></button>
        <button type="button" className={btn} onMouseDown={e => { e.preventDefault(); cmd("underline"); }} title="Underline"><Underline className="size-3.5" /></button>
        <button type="button" className={btn} onMouseDown={e => { e.preventDefault(); const u = prompt("Link URL", "https://"); if (u) cmd("createLink", u); }} title="Link"><Link2 className="size-3.5" /></button>
        {!inline && <button type="button" className={btn} onMouseDown={e => { e.preventDefault(); cmd("insertUnorderedList"); }} title="Bulleted list"><List className="size-3.5" /></button>}
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning
        className={cx("prose-sm px-2.5 py-1.5 text-[13px] outline-none [&_a]:text-sky-700 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5", inline ? "min-h-8" : "min-h-20 [&_p]:mb-2")}
        onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; emit(); }} onInput={emit}
        onKeyDown={e => { if (inline && e.key === "Enter") e.preventDefault(); }} />
    </div>
  );
}

function ImageField({ value, onChange }: { value: string; onChange(v: string): void }) {
  const env = useEnv();
  if (!value) {
    return (
      <button type="button" onClick={() => env.pickImage("", onChange)}
        className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 py-5 text-xs text-zinc-600 hover:border-zinc-400 hover:bg-zinc-100">
        <ImagePlus className="size-5 text-zinc-400" />Select image
      </button>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200">
      <div className="grid h-28 place-items-center bg-[repeating-conic-gradient(#f4f4f5_0_25%,#fff_0_50%)] bg-[length:16px_16px]"><img src={value} alt="" className="max-h-28 max-w-full object-contain" /></div>
      <div className="flex border-t border-zinc-200 text-xs">
        <button type="button" onClick={() => env.pickImage(value, onChange)} className="flex-1 py-1.5 hover:bg-zinc-50">Change</button>
        <button type="button" onClick={() => onChange("")} className="flex-1 border-l border-zinc-200 py-1.5 text-red-600 hover:bg-red-50">Remove</button>
      </div>
    </div>
  );
}

/** A link: type a URL or pick a page, collection or product (stored as a reference so renames don't break it). */
function UrlField({ value, onChange, placeholder }: { value: string; onChange(v: string): void; placeholder?: string }) {
  const env = useEnv();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const pages = Object.entries(env.theme.templates).filter(([k]) => k.startsWith("page.")).map(([k, t]) => ({ value: `/pages/${k.slice(5)}`, label: t.title ?? k.slice(5), kind: "Page" }));
  const opts = [
    { value: "/", label: "Home page", kind: "Store" }, { value: "/collections/all", label: "All products", kind: "Store" },
    { value: "/collections", label: "All collections", kind: "Store" }, { value: "/search", label: "Search", kind: "Store" }, { value: "/cart", label: "Cart", kind: "Store" },
    ...pages,
    ...env.collections.map(c => ({ value: `collection:${c.handle}`, label: c.title, kind: "Collection" })),
    ...env.products.filter(p => p.status !== "archived").map(p => ({ value: `product:${p.$id}`, label: p.title, kind: "Product" })),
  ];
  const labelOf = (v: string) => opts.find(o => o.value === v)?.label;
  const shown = opts.filter(o => !q || o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="relative">
      <input className={inputCls} value={open ? q : (labelOf(value) ?? value)} placeholder={placeholder ?? "Paste a link or search"}
        onFocus={() => { setOpen(true); setQ(labelOf(value) ? "" : value); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => { setQ(e.target.value); if (/^(https?:|\/|mailto:|tel:|#)/.test(e.target.value) || !e.target.value) onChange(e.target.value); }} />
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          {q && /^(https?:|\/|mailto:|tel:|#)/.test(q) && <button type="button" className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-zinc-100" onMouseDown={() => onChange(q)}>Use “{q}”</button>}
          {shown.map(o => (
            <button key={o.value} type="button" onMouseDown={() => { onChange(o.value); setOpen(false); }}
              className={cx("flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-zinc-100", o.value === value && "bg-zinc-50 font-medium")}>
              <span className="truncate">{o.label}</span><span className="shrink-0 text-[11px] text-zinc-400">{o.kind}</span>
            </button>
          ))}
          {!shown.length && <div className="px-3 py-2 text-xs text-zinc-500">No matches. Type a full URL starting with https:// or /</div>}
        </div>
      )}
    </div>
  );
}
