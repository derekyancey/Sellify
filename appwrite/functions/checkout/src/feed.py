"""Google Merchant Center product feed (RSS 2.0 + g: namespace). TikTok, Pinterest and Meta catalogs accept the same file."""
from xml.sax.saxutils import escape

from store import a


def product_url(site, product):
    path = a(site, "feedProductPath") or "/?product={id}"
    return f"https://{a(site, 'domain')}" + path.replace("{id}", a(product, "$id"))


def build(site, products):
    cur = (a(site, "currency") or "USD").upper()
    money = lambda v: f"{float(v):.2f} {cur}"
    items, skipped = [], []
    for p in products:
        if a(p, "status") != "active":
            continue
        if not a(p, "imageUrl"):
            skipped.append(a(p, "title"))  # Google requires an image
            continue
        price, compare = float(a(p, "price")), float(a(p, "compareAtPrice") or 0)
        fields = {
            "g:id": a(p, "$id"), "g:title": a(p, "title")[:150],
            "g:description": (a(p, "description") or a(p, "title"))[:5000],
            "g:link": product_url(site, p), "g:image_link": a(p, "imageUrl"),
            "g:availability": "in_stock" if (a(p, "inventory") or 0) > 0 else "out_of_stock",
            "g:price": money(compare if compare > price else price), "g:condition": "new",
            "g:brand": a(site, "name"), "g:identifier_exists": "no",
        }
        if compare > price:
            fields["g:sale_price"] = money(price)
        if a(p, "sku"):
            fields["g:mpn"] = a(p, "sku")
        items.append("<item>" + "".join(f"<{k}>{escape(str(v))}</{k}>" for k, v in fields.items()) + "</item>")
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>'
           f"<title>{escape(a(site, 'name') or '')}</title><link>https://{escape(a(site, 'domain') or '')}</link>"
           f"<description>{escape(a(site, 'name') or '')} products</description>" + "".join(items) + "</channel></rss>")
    return xml, len(items), skipped
