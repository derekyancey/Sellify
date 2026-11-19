import type { RenderedSection } from "./render";

/**
 * Bring a live document in line with freshly rendered sections without reloading it:
 * only sections whose HTML changed are replaced, the rest are moved or kept, so scroll
 * position, open drawers and playing slideshows survive edits. Returns the ids that changed.
 */
export function patchSections(doc: Document, sections: RenderedSection[], cache: Map<string, string>): string[] {
  const changed: string[] = [];
  const groups = ["header", "template", "footer", "overlay"] as const;
  const tpl = doc.createElement("template");
  const seen = new Set<string>();
  for (const g of groups) {
    const host = doc.querySelector<HTMLElement>(`[data-yt-group="${g}"]:not([data-yt-section])`);
    if (!host) continue;
    const wanted = sections.filter(s => s.group === g);
    const existing = new Map<string, Element>();
    for (const el of Array.from(host.children)) {
      const id = el.getAttribute("data-yt-section");
      if (id) existing.set(id, el); else el.remove();
    }
    let prev: Element | null = null;
    for (const s of wanted) {
      seen.add(s.id);
      let el = existing.get(s.id) ?? null;
      if (!el || cache.get(s.id) !== s.html) {
        tpl.innerHTML = s.html;
        const fresh = tpl.content.firstElementChild;
        if (!fresh) continue;
        if (el) el.replaceWith(fresh); else host.appendChild(fresh);
        el = fresh;
        cache.set(s.id, s.html);
        changed.push(s.id);
      }
      existing.delete(s.id);
      const want: ChildNode | null = prev ? prev.nextSibling : host.firstChild;
      if (want !== el) host.insertBefore(el, want);
      prev = el;
    }
    for (const el of existing.values()) el.remove();
  }
  for (const id of [...cache.keys()]) if (!seen.has(id)) cache.delete(id);
  return changed;
}

/** Swap the theme's CSS variables / fonts in the head. */
export function patchHead(doc: Document, headHtml: string, title: string) {
  const tpl = doc.createElement("template");
  tpl.innerHTML = headHtml;
  const swap = (sel: string) => {
    const fresh = tpl.content.querySelector(sel), cur = doc.head.querySelector(sel);
    if (fresh && cur) { if (cur.outerHTML !== fresh.outerHTML) cur.replaceWith(fresh); }
    else if (fresh) doc.head.appendChild(fresh);
    else cur?.remove();
  };
  swap("style[data-yt-base]");
  swap("style[data-yt-vars]");
  swap("link[data-yt-fonts]");
  swap("link[rel=icon]");
  doc.title = title;
}
