import { useEffect, useRef } from "react";
import { installBehaviors, type StoreApi } from "../../../theme/behaviors";
import { patchHead, patchSections } from "../../../theme/dom";
import type { RenderedSection } from "../../../theme/render";
import { inline } from "../../../theme/util";

export type Sel = { sectionId: string; blockId?: string } | null;
export type Device = "desktop" | "mobile";
export type ToolbarAction = "up" | "down" | "duplicate" | "hide" | "remove";

interface Props {
  sections: RenderedSection[];
  head: string;
  title: string;
  bodyClass: string;
  device: Device;
  inspector: boolean;
  selected: Sel;
  highlight: Sel;                    // hovered in the sidebar tree
  scrollKey: number;                 // bump to scroll the selection into view
  label(sectionId: string, blockId?: string): string;
  canMove(sectionId: string): { up: boolean; down: boolean; remove: boolean };
  onSelect(sel: Sel): void;
  onAction(a: ToolbarAction, sectionId: string, blockId?: string): void;
  onInlineEdit(sectionId: string, blockId: string | undefined, key: string, value: string): void;
  onNavigate(url: string): void;
  api: StoreApi;
  cartOpenKey?: number;              // bump to open the cart drawer (Theme settings → Cart)
}

const EDITOR_CSS = `
#yt-ui{position:absolute;left:0;top:0;width:0;height:0;z-index:2147483000;pointer-events:none;font:12px/1.2 system-ui,-apple-system,sans-serif}
.yt-box{position:absolute;border:2px solid #2c6ecb;border-radius:2px;display:none;box-sizing:border-box}
.yt-box.block{border-style:dashed;border-width:1px}
.yt-box.sel{border-color:#2c6ecb;box-shadow:0 0 0 1px #fff inset}
.yt-tag{position:absolute;left:-2px;top:-24px;background:#2c6ecb;color:#fff;padding:5px 8px;border-radius:4px 4px 0 0;white-space:nowrap;display:flex;align-items:center;gap:2px;pointer-events:auto}
.yt-tag.in{top:0;border-radius:0 0 4px 0}
.yt-tag button{all:unset;cursor:pointer;width:20px;height:16px;display:grid;place-items:center;border-radius:3px;opacity:.9}
.yt-tag button:hover{background:rgba(255,255,255,.2)}.yt-tag button[disabled]{opacity:.35;pointer-events:none}
.yt-tag svg{width:14px;height:14px}
.yt-tag .yt-name{margin-right:6px;font-weight:600}
[data-yt-edit]:hover{outline:1px dashed rgba(44,110,203,.6);outline-offset:2px;cursor:text}
[data-yt-edit][contenteditable=true]{outline:2px solid #2c6ecb;outline-offset:2px;cursor:text}
body.yt-inspect a,body.yt-inspect button,body.yt-inspect label{cursor:default}
`;
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const TB = {
  up: svg('<path d="m6 15 6-6 6 6"/>'), down: svg('<path d="m6 9 6 6 6-6"/>'),
  duplicate: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>'),
  hide: svg('<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2A9.8 9.8 0 0 1 12 5c5 0 9 5 9 7a7 7 0 0 1-2.2 3.1M6.1 6.1C4.1 7.4 3 9.3 3 12c0 2 4 7 9 7a9.5 9.5 0 0 0 3.9-.8"/>'),
  remove: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
};

export default function Preview(p: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const props = useRef(p); props.current = p;
  const st = useRef({ ready: false, cache: new Map<string, string>(), editing: null as string | null, behaviors: null as ReturnType<typeof installBehaviors> | null, hover: null as Sel });

  const doc = () => frame.current?.contentDocument ?? null;

  /* ------------------------------------------------ overlay boxes */
  const place = () => {
    const d = doc(); if (!d || !st.current.ready) return;
    const win = d.defaultView!;
    const ui = d.getElementById("yt-ui"); if (!ui) return;
    const P = props.current;
    const find = (s: Sel) => {
      if (!s) return null;
      const sec = d.querySelector<HTMLElement>(`[data-yt-section="${CSS.escape(s.sectionId)}"]`);
      if (!sec) return null;
      return s.blockId ? sec.querySelector<HTMLElement>(`[data-yt-block="${CSS.escape(s.blockId)}"]`) ?? sec : sec;
    };
    const put = (box: HTMLElement, el: HTMLElement | null, isBlock: boolean) => {
      if (!el) { box.style.display = "none"; return; }
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { display: "block", left: `${r.left + win.scrollX}px`, top: `${r.top + win.scrollY}px`, width: `${r.width}px`, height: `${Math.max(r.height, 4)}px` });
      box.classList.toggle("block", isBlock);
      const tag = box.querySelector<HTMLElement>(".yt-tag");
      tag?.classList.toggle("in", r.top + win.scrollY < 26);
    };
    const hov = st.current.hover ?? P.highlight;
    const sameAsSel = hov && P.selected && hov.sectionId === P.selected.sectionId && hov.blockId === P.selected.blockId;
    const hoverBox = ui.querySelector<HTMLElement>(".yt-hover")!, selBox = ui.querySelector<HTMLElement>(".yt-sel")!;
    put(hoverBox, P.inspector && hov && !sameAsSel ? find(hov) : null, !!hov?.blockId);
    if (hov && !sameAsSel) hoverBox.querySelector(".yt-name")!.textContent = P.label(hov.sectionId, hov.blockId);
    put(selBox, P.inspector ? find(P.selected) : null, !!P.selected?.blockId);
    if (P.selected) {
      selBox.querySelector(".yt-name")!.textContent = P.label(P.selected.sectionId, P.selected.blockId);
      const m = P.canMove(P.selected.sectionId);
      const isBlock = !!P.selected.blockId;
      selBox.querySelectorAll<HTMLButtonElement>("button[data-a]").forEach(b => {
        const a = b.dataset.a as ToolbarAction;
        b.disabled = (a === "up" && !m.up && !isBlock) || (a === "down" && !m.down && !isBlock) || (a === "remove" && !m.remove && !isBlock);
        b.style.display = isBlock && (a === "up" || a === "down") ? "none" : "";
      });
    }
  };

  /* ------------------------------------------------ patching */
  const patch = () => {
    const d = doc(); if (!d || !st.current.ready) return;
    const P = props.current;
    const editing = st.current.editing;
    const list = editing ? P.sections.map(s => s.id === editing ? { ...s, html: st.current.cache.get(s.id) ?? s.html } : s) : P.sections;
    patchSections(d, list, st.current.cache);
    patchHead(d, P.head, P.title);
    d.body.className = `${P.bodyClass}${P.inspector ? " yt-inspect" : ""}`;
    st.current.behaviors?.refresh();
    // In the editor, show content right away instead of waiting for the scroll animation.
    d.querySelectorAll("[data-reveal]").forEach(el => el.classList.add("is-visible"));
    showSelectedBlock();
    place();
  };

  /** Slides and rotating announcements: show the one being edited. */
  const showSelectedBlock = () => {
    const d = doc(), s = props.current.selected;
    if (!d || !s?.blockId) return;
    const el = d.querySelector<HTMLElement>(`[data-yt-section="${CSS.escape(s.sectionId)}"] [data-yt-block="${CSS.escape(s.blockId)}"]`);
    if (!el) return;
    if (el.classList.contains("slideshow__slide")) {
      const show = el.closest<HTMLElement>("[data-slideshow]")!;
      show.dataset.paused = "1";
      const slides = Array.from(show.querySelectorAll(".slideshow__slide"));
      slides.forEach(x => x.classList.toggle("is-active", x === el));
      show.querySelectorAll(".slideshow__dot").forEach((x, i) => x.classList.toggle("is-active", slides[i] === el));
    }
    if (el.classList.contains("announcement__slide")) {
      el.parentElement!.querySelectorAll<HTMLElement>(".announcement__slide").forEach(x => { x.hidden = x !== el; });
      el.closest<HTMLElement>("[data-rotate]")?.removeAttribute("data-rotate");
    }
    if (el.tagName === "DETAILS") (el as HTMLDetailsElement).open = true;
  };

  /* ------------------------------------------------ setup once */
  useEffect(() => {
    const f = frame.current!;
    f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style id="yt-editor-css">${EDITOR_CSS}</style></head>
<body><div data-yt-group="header"></div><main id="MainContent" data-yt-group="template"></main><div data-yt-group="footer"></div><div data-yt-group="overlay"></div>
<div id="yt-ui"><div class="yt-box yt-hover"><div class="yt-tag"><span class="yt-name"></span></div></div>
<div class="yt-box yt-sel sel"><div class="yt-tag"><span class="yt-name"></span>${(["up", "down", "duplicate", "hide", "remove"] as const).map(a => `<button data-a="${a}" title="${{ up: "Move up", down: "Move down", duplicate: "Duplicate", hide: "Hide", remove: "Remove" }[a]}">${TB[a]}</button>`).join("")}</div></div></div></body></html>`;
    const onLoad = () => {
      const d = f.contentDocument!, win = d.defaultView!;
      st.current.ready = true;
      st.current.cache.clear();
      st.current.behaviors?.destroy();
      st.current.behaviors = installBehaviors(d, {
        addToCart: (id, q, v) => props.current.api.addToCart(id, q, v),
        setQuantity: (id, q, v) => props.current.api.setQuantity(id, q, v),
        checkout: (pr, o) => props.current.api.checkout(pr, o),
        buyNow: (id, q, v) => props.current.api.buyNow(id, q, v),
        discount: c => props.current.api.discount(c),
        subscribe: e => props.current.api.subscribe(e),
        navigate: u => props.current.onNavigate(u),
        search: q => props.current.api.search?.(q) ?? [],
      });

      const targetOf = (t: EventTarget | null): Sel => {
        const el = t as HTMLElement | null;
        const sec = el?.closest?.<HTMLElement>("[data-yt-section]");
        if (!sec || sec.dataset.ytSection === "__cart-drawer") return null;
        const blk = el!.closest<HTMLElement>("[data-yt-block]");
        return { sectionId: sec.dataset.ytSection!, blockId: blk && sec.contains(blk) ? blk.dataset.ytBlock : undefined };
      };
      d.addEventListener("mousemove", e => {
        if (!props.current.inspector) return;
        const t = targetOf(e.target);
        if (t?.sectionId !== st.current.hover?.sectionId || t?.blockId !== st.current.hover?.blockId) { st.current.hover = t; place(); }
      });
      d.addEventListener("mouseleave", () => { st.current.hover = null; place(); });

      // Clicks: toolbar buttons, then inspector selection, then normal navigation.
      d.addEventListener("click", e => {
        const t = e.target as HTMLElement;
        const tb = t.closest<HTMLButtonElement>("#yt-ui button[data-a]");
        if (tb) {
          e.preventDefault(); e.stopPropagation();
          const s = props.current.selected;
          if (s) props.current.onAction(tb.dataset.a as ToolbarAction, s.sectionId, s.blockId);
          return;
        }
        if (t.closest("[contenteditable=true]")) return;
        const a = t.closest<HTMLAnchorElement>("a[href]");
        if (props.current.inspector) {
          const allowed = t.closest("summary, .pill, [data-option], [data-thumb], [data-facets-toggle], .facet__check, [data-prev], [data-next], [data-dot], [data-qty-minus], [data-qty-plus], [data-close-cart], [data-close-details], [data-close-search]");
          const sel = targetOf(t);
          if (sel) props.current.onSelect(sel);
          if (!allowed) { e.preventDefault(); e.stopPropagation(); }
          return;
        }
        if (a) {
          const href = a.getAttribute("href") ?? "";
          if (href.startsWith("#")) return;
          e.preventDefault();
          if (href.startsWith("/")) props.current.onNavigate(href);
          else win.open(a.href, "_blank", "noopener");
        }
      }, true);
      d.addEventListener("submit", e => {
        if (props.current.inspector) { e.preventDefault(); e.stopPropagation(); }
      }, true);

      // Inline text editing: double-click any text that maps to a setting.
      d.addEventListener("dblclick", e => {
        const el = (e.target as HTMLElement).closest<HTMLElement>("[data-yt-edit]");
        if (!el) return;
        const sec = el.closest<HTMLElement>("[data-yt-section]")!;
        e.preventDefault();
        st.current.editing = sec.dataset.ytSection!;
        el.contentEditable = "true";
        el.focus();
        const range = d.createRange(); range.selectNodeContents(el);
        const selection = win.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
        const emit = () => props.current.onInlineEdit(sec.dataset.ytSection!, el.dataset.ytEditBlock, el.dataset.ytEdit!, inline(el.innerHTML.replace(/&nbsp;/g, " ")).trim());
        const onKey = (k: KeyboardEvent) => { if (k.key === "Enter" || k.key === "Escape") { k.preventDefault(); el.blur(); } };
        const done = () => {
          el.contentEditable = "false";
          el.removeEventListener("input", emit); el.removeEventListener("keydown", onKey);
          st.current.editing = null;
          emit();
          st.current.cache.delete(sec.dataset.ytSection!);
          patch();
        };
        el.addEventListener("input", emit);
        el.addEventListener("keydown", onKey);
        el.addEventListener("blur", done, { once: true });
      });

      win.addEventListener("scroll", place, { passive: true });
      win.addEventListener("resize", place);
      d.addEventListener("keydown", e => {
        // Let the editor's shortcuts work while the preview has focus.
        if ((e.metaKey || e.ctrlKey) && ["z", "y", "s"].includes(e.key.toLowerCase()) && !st.current.editing) {
          e.preventDefault();
          window.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey }));
        }
      });
      patch();
    };
    f.addEventListener("load", onLoad);
    const timer = setInterval(place, 400);
    return () => { f.removeEventListener("load", onLoad); clearInterval(timer); st.current.behaviors?.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(patch, [p.sections, p.head, p.bodyClass, p.inspector]);
  useEffect(() => { showSelectedBlock(); place(); }, [p.selected, p.highlight]);
  useEffect(() => { if (p.cartOpenKey) st.current.behaviors?.openCart(); }, [p.cartOpenKey]);
  useEffect(() => {
    if (!p.scrollKey || !p.selected) return;
    const d = doc(); if (!d) return;
    const sec = d.querySelector<HTMLElement>(`[data-yt-section="${CSS.escape(p.selected.sectionId)}"]`);
    const el = (p.selected.blockId && sec?.querySelector<HTMLElement>(`[data-yt-block="${CSS.escape(p.selected.blockId)}"]`)) || sec;
    if (!el) return;
    const r = el.getBoundingClientRect(), h = d.defaultView!.innerHeight;
    if (r.top < 0 || r.top > h * 0.7) el.scrollIntoView({ behavior: "smooth", block: r.height > h ? "start" : "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.scrollKey]);

  return (
    <div className="flex h-full justify-center overflow-hidden">
      <iframe ref={frame} title="Store preview"
        className={p.device === "mobile" ? "my-4 h-[calc(100%-2rem)] w-[390px] rounded-[28px] border-[10px] border-zinc-900 bg-white shadow-xl" : "h-full w-full bg-white"} />
    </div>
  );
}
