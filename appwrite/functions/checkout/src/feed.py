"""Google Merchant Center product feed (RSS 2.0 + g: namespace). TikTok, Pinterest and Meta catalogs accept the same file."""
import json
from xml.sax.saxutils import escape

from store import a, variant_title, variants_of


def product_url(site, product):
    path = a(site, "feedProductPath") or "/?product={id}"
    return f"https://{a(site, 'domain')}" + path.replace("{id}", a(product, "$id"))


def build(site, products):
    if not a(site, "domain"):
        from errors import HttpError
        raise HttpError("This store doesn't have a URL yet", 409)
    cur = (a(site, "currency") or "USD").upper()
    money = lambda v: f"{float(v):.2f} {cur}"
    items, skipped = [], []
    def item(fields):
        return "<item>" + "".join(f"<{k}>{escape(str(v))}</{k}>" for k, v in fields.items() if v not in (None, "")) + "</item>"

    for p in products:
        if a(p, "status") != "active":
            continue
        variants = variants_of(p)
        if not a(p, "imageUrl") and not any(v.get("imageUrl") for v in variants):
            skipped.append(a(p, "title"))  # Google requires an image
            continue
        base = {
            "g:description": (a(p, "description") or a(p, "title"))[:5000],
            "g:condition": "new", "g:brand": a(site, "name"), "g:identifier_exists": "no",
        }
        rows = [(None, float(a(p, "price")), float(a(p, "compareAtPrice") or 0), a(p, "inventory") or 0, a(p, "sku"), a(p, "imageUrl"))] if not variants else [
            (v, float(v.get("price") or 0), float(v.get("compareAtPrice") or 0), int(v.get("inventory") or 0), v.get("sku"), v.get("imageUrl") or a(p, "imageUrl"))
            for v in variants]
        for v, price, compare, stock, sku, image in rows:
            if not image:
                continue
            fields = {
                "g:id": f"{a(p, '$id')}-{v['id']}" if v else a(p, "$id"),
                "g:title": (f"{a(p, 'title')} - {variant_title(v)}" if v else a(p, "title"))[:150],
                **base,
                "g:link": product_url(site, p) + (("&" if "?" in product_url(site, p) else "?") + f"variant={v['id']}" if v else ""),
                "g:image_link": image,
                "g:availability": "in_stock" if stock > 0 else "out_of_stock",
                "g:price": money(compare if compare > price else price),
                "g:sale_price": money(price) if compare > price else None,
                "g:mpn": sku,
            }
            if v:  # variants of one product share an item group; Google reads size/color from these
                fields["g:item_group_id"] = a(p, "$id")
                names = [str(o.get("name", "")).lower() for o in (json.loads(a(p, "options")) if isinstance(a(p, "options"), str) else (a(p, "options") or []))]
                for name, value in zip(names, v.get("options") or []):
                    if name in ("size", "color", "colour", "material", "pattern"):
                        fields["g:" + ("color" if name == "colour" else name)] = value
            items.append(item(fields))
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>'
           f"<title>{escape(a(site, 'name') or '')}</title><link>https://{escape(a(site, 'domain') or '')}</link>"
           f"<description>{escape(a(site, 'name') or '')} products</description>" + "".join(items) + "</channel></rss>")
    return xml, len(items), skipped
