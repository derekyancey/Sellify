"""Convert a live Shopify (Horizon) storefront into Sellify theme templates.

Reads rendered pages (the HTML a visitor's browser gets, saved with curl) and writes
Sellify's own JSON template format: ordered sections made of layout groups, text,
images, video, buttons and accordions, plus the dynamic product blocks (gallery,
title, price, buy buttons, description). Nothing from the Shopify theme's code is
copied: only the merchant's content and the layout values each block was set to.

    python scripts/horizon_import.py <page.html> <out.json> [--product-json product.js]

Run it once per template: the home page for index.json, and one product that uses
each product template (product.json, product.<suffix>.json).
"""
from __future__ import annotations

import json
import re
import sys

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

# Layout values kept from each block's inline style (all are plain CSS custom properties).
KEEP_VARS = re.compile(
    r"^--(flex-direction|flex-wrap|flex-wrap-mobile|gap|horizontal-alignment|vertical-alignment|vertical-alignment-mobile|"
    r"padding-(block|inline)-(start|end)|size-style-[\w-]+|border-(width|style|color|radius)|ratio|image-height|"
    r"width|max-width|text-align|color|font-[\w-]+|line-height|letter-spacing|text-transform|section-min-height|"
    r"hero-min-height|overlay-[\w-]+|media-[\w-]+|marquee-[\w-]+|blur-opacity|icon-[\w-]+|summary-[\w-]+|"
    r"columns[\w-]*|aspect-ratio|slide-[\w-]+|layered-[\w-]+|card-[\w-]+|image-[\w-]+|button-[\w-]+|"
    r"section-height|height|opacity|background[\w-]*|custom-[\w-]+|resource-list-[\w-]+|gallery-[\w-]+|thumbnail-width)$"
)
ALLOWED_TAGS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "a", "ul", "ol", "li", "br", "span", "s", "small", "sup", "sub", "blockquote", "img", "table", "tr", "td", "th", "tbody", "thead"}


def cdn(url: str | None) -> str | None:
    if not url:
        return None
    url = url.strip()
    if url.startswith("//"):
        url = "https:" + url
    return url


def style_vars(el: Tag) -> dict:
    out = {}
    for part in (el.get("style") or "").split(";"):
        if ":" not in part:
            continue
        k, v = part.split(":", 1)
        k, v = k.strip(), " ".join(v.split())
        if k.startswith("--") and v and KEEP_VARS.match(k) and not v.endswith(("px;", "%;")) and v not in ("px", "%", ";"):
            out[k] = v
    return out


def scheme(el: Tag) -> str | None:
    for k in el.get("class", []):
        if k.startswith("color-scheme-"):
            return k.replace("color-", "")
    return None


def has(el: Tag, *cls: str) -> bool:
    c = el.get("class") or []
    return any(x in c for x in cls)


def block_kind(el: Tag) -> str:
    """The Horizon block name from a class like text-block--ABC__product_title_xyz."""
    for k in el.get("class", []):
        m = re.match(r"[\w-]+--\w+__([a-z_]+?)_[A-Za-z0-9]{6}$", k)
        if m:
            return m.group(1)
    return ""


def clean_html(el: Tag) -> str:
    el = BeautifulSoup(str(el), "lxml").find(el.name)
    for bad in el.find_all(["script", "style", "svg", "form", "input", "button", "template"]):
        bad.decompose()
    for c in el.find_all(string=lambda s: isinstance(s, Comment)):
        c.extract()
    for t in el.find_all(True):
        if t.name not in ALLOWED_TAGS:
            t.unwrap()
            continue
        keep = {}
        if t.name == "a" and t.get("href"):
            keep["href"] = t["href"]
            if t.get("target"):
                keep["target"] = t["target"]
        if t.name == "img":
            keep = {"src": cdn(t.get("src")), "alt": t.get("alt", "")}
        t.attrs = keep
    return "".join(str(c) for c in el.contents).strip()


def media_of(el: Tag) -> dict | None:
    """First video (preferred) or image inside el."""
    v = el.find("video")
    if v:
        src = v.get("src") or (v.find("source") or {}).get("src")
        poster = v.get("poster") or (v.find("img") or {}).get("src")
        if src:
            return {"video": cdn(src), "poster": cdn(poster)}
    img = el.find("img")
    if img and img.get("src"):
        return {"image": cdn(img["src"]).split("&width=")[0], "alt": img.get("alt", "")}
    return None


class Converter:
    def __init__(self, product: dict | None = None, styles: list[str] | None = None):
        product = product or {}
        self.desc = norm(BeautifulSoup(product.get("description") or "", "lxml").get_text(" "))[:120]
        self.title = norm(product.get("title") or "")
        self.images = {img_key(u) for u in product.get("images") or []}
        self.styles = styles or []

    def css_for(self, el: Tag) -> str:
        """The page's inline <style> rules for the merchant's own (AI-generated) blocks."""
        keys = {k for t in [el, *el.find_all(True)] for k in t.get("class", []) if k.startswith("ai-")}
        root = {k for k in keys if not ("__" in k)} or keys
        return "\n".join(css for css in self.styles if any(k in css for k in root))

    # ---- blocks -------------------------------------------------------
    def children(self, el: Tag) -> list:
        out = []
        for c in el.children:
            if isinstance(c, Tag):
                n = self.node(c)
                if isinstance(n, list):
                    out.extend(n)
                elif n:
                    out.append(n)
        return out

    def node(self, el: Tag):
        cls = el.get("class") or []
        name = el.name
        if name in ("script", "style", "template", "noscript", "svg", "input") or has(el, "visually-hidden", "skip-to-content-link", "sticky-add-to-cart"):
            return None
        kind = block_kind(el)
        if has(el, "group-block"):
            content = el.find(class_="group-block-content", recursive=False) or el
            bg = el.find(class_="group-block__media-wrapper", recursive=False)
            node = {"t": "group", "style": {**style_vars(el), **style_vars(content)}, "children": self.children(content)}
            if "mobile-column" in (content.get("class") or []):
                node["mobileColumn"] = True
            if bg and media_of(bg):
                node["bg"] = media_of(bg)
                ov = bg.find(class_="overlay")
                if ov:
                    node["bg"]["overlay"] = style_vars(ov)
            for k in cls:
                if k.startswith("group-block--width-") or k.startswith("group-block--height-"):
                    node.setdefault("sizes", []).append(k.replace("group-block--", ""))
            if scheme(el):
                node["scheme"] = scheme(el)
            if el.name == "a" and el.get("href"):
                node["href"] = el["href"]
            return node
        if has(el, "layout-panel-flex"):
            return {"t": "group", "style": style_vars(el), "mobileColumn": "mobile-column" in cls, "children": self.children(el)}
        if name == "media-gallery":
            layout = "carousel" if "media-gallery--carousel" in cls else "grid"
            return {"t": "gallery", "layout": layout, "thumbnails": bool(el.find(class_="slideshow-controls__thumbnails")),
                    "columns": 1 if "media-gallery--one-column" in cls else 2,
                    "extend": "media-gallery--extend" in cls, "style": style_vars(el)}
        if name == "product-price":
            return {"t": "price", "style": style_vars(el), "taxNote": bool(el.find(class_="tax-note"))}
        if has(el, "buy-buttons-block") or name == "product-form-component":
            return {"t": "buy", "accelerated": bool(el.find("shopify-accelerated-checkout"))}
        if name == "variant-picker":
            return {"t": "variants"}
        if has(el, "view-product-title"):
            return None
        if has(el, "text-block"):
            text = norm(el.get_text(" "))
            if kind == "product_title" or (self.title and text == self.title):
                return {"t": "title", "cls": text_cls(cls), "style": style_vars(el)}
            if self.desc and text.startswith(self.desc[:60]):
                return {"t": "description", "cls": text_cls(cls), "style": style_vars(el)}
            return {"t": "text", "cls": text_cls(cls), "style": style_vars(el), "html": clean_html(el)}
        if has(el, "accordion"):
            items = []
            for d in el.find_all("details"):
                summ = d.find("summary")
                body = d.find(class_="details-content") or d
                content = self.children(body)
                if len(content) == 1 and content[0]["t"] == "description":
                    content = [{"t": "description"}]
                items.append({"title": norm(summ.get_text(" ")) if summ else "", "open": d.has_attr("open"), "children": content})
            return {"t": "accordion", "style": style_vars(el), "items": items, "plus": "accordion--plus" in cls, "dividers": "accordion--dividers" in cls}
        if has(el, "image-block", "media-block"):
            m = media_of(el) or {}
            a = el.find("a") if el.name != "a" else el
            n = {"t": "video" if "video" in m else "image", **m, "style": style_vars(el)}
            if m.get("image") and img_key(m["image"]) in self.images:
                n["dynamic"] = "featured"   # the product's own image, so other products show theirs
            inner = el.find(class_=re.compile("image-block__image|media-block__media"))
            if inner:
                n["style"].update(style_vars(inner))
            if a is not None and a.get("href"):
                n["href"] = a["href"]
            return n
        if has(el, "icon-block"):
            img = el.find("img")
            if not img:
                return None
            w = re.search(r"(?:^|;)\s*width:\s*([\d.]+px)", img.get("style") or "")
            return {"t": "icon", "src": cdn(img["src"]).split("&width=")[0], "style": {"--icon-width": w.group(1)} if w else {}}
        if has(el, "logo-block"):
            return {"t": "logo", "style": style_vars(el)}
        if name == "video" or name == "deferred-media":
            m = media_of(el)
            return {"t": "video", **m, "style": style_vars(el)} if m else None
        if name == "a" and (has(el, "button", "button-secondary", "link") or kind == "button"):
            variant = "secondary" if has(el, "button-secondary") else "primary" if has(el, "button") else "link"
            return {"t": "button", "variant": variant, "label": norm(el.get_text(" ")), "href": el.get("href", "#"), "style": style_vars(el)}
        if name == "img" and el.get("src"):
            return {"t": "image", "image": cdn(el["src"]).split("&width=")[0], "alt": el.get("alt", ""), "style": style_vars(el)}
        if name == "comparison-slider-component":
            imgs = [cdn(i["src"]).split("&width=")[0] for i in el.select(".comparison-slider__layer img") if i.get("src")]
            labels = [norm(x.get_text(" ")) for x in el.select("[class*=comparison-slider__label], [class*=comparison-slider__text]")]
            return {"t": "compare", "before": imgs[0] if imgs else None, "after": imgs[1] if len(imgs) > 1 else None,
                    "labels": [x for x in labels if x], "style": style_vars(el)}
        if name == "jumbo-text":
            return {"t": "jumbo", "text": norm(el.get_text(" ")), "style": style_vars(el)}
        if re.match(r"definition-panel", name) or name.startswith("ai-") or any(k.startswith("ai-") for k in cls):
            return {"t": "html", "html": raw_html(el), "css": self.css_for(el)}
        # wrappers: keep walking
        return self.children(el)

    # ---- sections -----------------------------------------------------
    def section(self, sec: Tag) -> dict | None:
        sid = sec.get("id", "").split("__")[-1]
        stype = re.sub(r"_[A-Za-z0-9]{6}$", "", sid)
        inner = sec.find(class_=re.compile(r"^(section|hero|product-information)$")) or sec
        sch = sec.find(class_="section-background") or sec.find(class_=re.compile(r"^(hero|product-information|section)$")) or sec.find(class_=re.compile("color-scheme-"))
        s = {"id": sid, "scheme": scheme(sch or sec) or "scheme-1"}
        sty = {}
        for e in [sec, *sec.find_all(class_=re.compile(r"^(section|hero|hero__container|section-content-wrapper)$"), limit=4)]:
            sty.update(style_vars(e))
        full = bool(sec.find(class_="section--full-width"))

        if stype == "hero":
            hero = sec.find(class_="hero")
            media = []
            for w in sec.select(".hero__media-wrapper"):
                m = media_of(w)
                if m:
                    wc = w.get("class", [])
                    m["desktop"] = "hero__media-wrapper--desktop" in wc
                    m["mobile"] = "hero__media-wrapper--mobile" in wc
                    media.append(m)
            ov = sec.find(class_="overlay")
            content = sec.find(class_="hero__content-wrapper")
            mg = sec.find(class_="hero__media-grid")
            return {**s, "type": "hero", "style": {**sty, **style_vars(hero), **(style_vars(mg) if mg else {})},
                    "media": media, "overlay": {**style_vars(ov), "kind": "gradient" if "overlay--gradient" in ov.get("class", []) else "solid"} if ov else None,
                    "href": (sec.find("a", class_="hero__link") or {}).get("href"),
                    "content": self.node(content) if content else None}
        if stype == "marquee":
            mc = sec.find("marquee-component")
            items = []
            rep = sec.select(".marquee__repeated-items")
            for b in rep[0].find_all(lambda t: has(t, "icon-block", "text-block")) if rep else []:
                n = self.node(b)
                if n:
                    items.append(n)
            return {**s, "type": "marquee", "style": style_vars(mc) if mc else sty, "items": items}
        if stype == "product_list":
            handles = []
            for a in sec.select("product-card a[href^='/products/']"):
                h = a["href"].split("/products/")[1].split("?")[0]
                if h not in handles:
                    handles.append(h)
            head = sec.find(class_="section-resource-list__header") or sec.find(class_=re.compile("resource-list__header"))
            return {**s, "type": "product-list", "style": sty, "products": handles, "carousel": bool(sec.find("slideshow-component")),
                    "header": self.node(head) if head else None}
        if stype == "collection_list":
            items, card_style = [], {}
            for card in sec.select(".collection-card"):
                a = card.find("a", href=True)
                img = card.find("img")
                title = card.find(class_=re.compile("collection_title"))
                card_style = style_vars(card)
                items.append({"title": norm((title or a.find(class_="visually-hidden") or a).get_text(" ")), "href": a["href"],
                              "image": cdn(img["src"]).split("&width=")[0] if img else None, "showTitle": bool(title)})
            rl = sec.find(class_="resource-list")
            return {**s, "type": "collection-list", "style": {**sty, **(style_vars(rl) if rl else {})}, "cardStyle": card_style, "items": items,
                    "variant": "icons" if any(i["image"] for i in items) else "pills"}
        if stype == "layered_slideshow":
            slides = []
            for sl in sec.find_all(class_=re.compile(r"layered-slideshow__(slide|panel)$")) or sec.find_all("slideshow-slide"):
                bg = media_of(sl)
                body = sl.find(class_=re.compile("layout-panel-flex|group-block"))
                slides.append({"bg": bg, "content": self.node(body) if body else None})
            if not slides:  # fall back: pair each media with the content that follows it
                for img in sec.find_all("img"):
                    body = img.find_parent().find_next(class_=re.compile("layout-panel-flex"))
                    slides.append({"bg": {"image": cdn(img["src"]).split("&width=")[0]}, "content": self.node(body) if body else None})
            tabs = [norm(t.get_text(" ")) for t in sec.select("[role=tab]")]
            return {**s, "type": "layered-slideshow", "style": sty, "slides": slides, "tabs": tabs}
        if stype == "featured_blog_posts":
            posts = []
            for it in sec.select(".resource-list__item"):
                a = it.find("a", href=True)
                if not a:
                    continue
                img = it.find("img")
                title = it.find(re.compile("h[1-6]")) or a
                meta = [norm(x.get_text(" ")) for x in it.select(".blog-post-details > span")]
                posts.append({"title": norm(title.get_text(" ")), "href": a["href"],
                              "image": cdn(img["src"]).split("&width=")[0] if img else None,
                              "meta": [m for m in meta if m and m != "|"]})
            head = next((t for t in sec.find_all(class_="text-block") if not t.find_parent(class_="resource-list")), None)
            rl = sec.find(class_="resource-list")
            return {**s, "type": "blog-posts", "style": {**sty, **(style_vars(rl) if rl else {})}, "posts": posts, "header": self.node(head) if head else None}
        if stype in ("main", "product_information") and sec.find(class_="product-information"):
            pi = sec.find(class_="product-information")
            grid = pi.find(class_=re.compile("product-information__grid"))
            details = pi.find(class_="product-details")
            media = pi.find(class_="product-information__media")
            gcls = grid.get("class", []) if grid else []
            return {**s, "type": "main-product", "style": {**sty, **style_vars(pi)},
                    "mediaPosition": "right" if "product-information--media-right" in gcls else "left",
                    "split": next((k.replace("product-information__grid--", "") for k in gcls if k.startswith("product-information__grid--") and "limit" not in k), "half"),
                    "gallery": self.node(media.find("media-gallery")) if media and media.find("media-gallery") else {"t": "gallery", "layout": "grid"},
                    "details": self.children(details) if details else []}
        if stype in ("product_recommendations", "product-recommendations") or sec.find("product-recommendations"):
            h = sec.find(re.compile("h[1-6]")) or sec.find(class_="text-block")
            return {**s, "type": "product-recommendations", "style": sty, "heading": norm(h.get_text(" ")) if h else "You may also like"}
        if stype == "slideshow":
            slides = []
            for sl in sec.find_all("slideshow-slide"):
                body = sl.find(class_=re.compile("layout-panel-flex|group-block"))
                slides.append({"bg": media_of(sl), "content": self.node(body) if body else None})
            return {**s, "type": "slideshow", "style": sty, "slides": slides}
        if stype == "media_with_content":
            m = sec.find(class_=re.compile("media-with-content__media"))
            c = sec.find(class_=re.compile("media-with-content__content"))
            return {**s, "type": "media-with-content", "style": sty, "media": media_of(m) if m else None,
                    "content": self.node(c) if c else None, "mediaPosition": "right" if sec.find(class_=re.compile("media-right")) else "left"}
        if stype in ("section", "blocks") or stype.startswith("section") or sec.find(class_="custom-section-content"):
            bg = sec.find(class_="custom-section-background")
            content = sec.find(class_="section-content-wrapper")
            n = {**s, "type": "section", "full": full, "style": sty, "content": self.node(content) if content else {"t": "group", "children": self.children(sec)}}
            if bg and media_of(bg):
                n["bg"] = media_of(bg)
                ov = bg.find(class_="overlay")
                if ov:
                    n["bg"]["overlay"] = style_vars(ov)
            return n
        # The merchant's own custom sections (shotclub-*, claude-b4-after, apps): keep their markup and styles.
        html = raw_html(sec)
        return {**s, "type": "custom", "name": stype, "html": html} if html.strip() else None


def raw_html(el: Tag) -> str:
    el = BeautifulSoup(str(el), "lxml").find(el.name)
    for bad in el.find_all(["script", "noscript"]):
        bad.decompose()
    for t in el.find_all(True):
        for a in list(t.attrs):
            if a.startswith("on") or a in ("data-shopify-editor-block", "data-shopify-editor-section"):
                del t[a]
        for a in ("src", "href", "poster"):
            if t.get(a, "").startswith("//"):
                t[a] = "https:" + t[a]
        if t.get("srcset"):
            t["srcset"] = re.sub(r"(^|[\s,])//", r"\1https://", t["srcset"])
    return str(el)


def img_key(url: str) -> str:
    return re.sub(r"[?].*$", "", url or "").rsplit("/", 1)[-1]


def text_cls(cls: list) -> str:
    for k in ("h1", "h2", "h3", "h4", "h5", "h6", "paragraph"):
        if k in cls:
            return k
    return "custom" if "custom-typography" in cls else "rte"


def norm(s: str) -> str:
    return " ".join((s or "").split())


def convert(html: str, product: dict | None = None) -> dict:
    soup = BeautifulSoup(html, "lxml")
    c = Converter(product, [st.get_text() for st in soup.find_all("style")])
    sections = []
    for sec in soup.select("[id^=shopify-section-template]"):
        n = c.section(sec)
        if n:
            sections.append(n)
    return {"sections": sections}


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    product = None
    if "--product-json" in sys.argv:  # https://<shop>/products/<handle>.js
        product = json.load(open(sys.argv[sys.argv.index("--product-json") + 1]))
    data = convert(open(src, encoding="utf-8").read(), product)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(out, len(data["sections"]), "sections:", " ".join(s["type"] for s in data["sections"]))
