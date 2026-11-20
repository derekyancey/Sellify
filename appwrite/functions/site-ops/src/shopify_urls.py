"""
Keep every Shopify URL working after the move (products, collections, pages, blogs, articles).

Yancey storefronts use Shopify's paths (/products/{handle}, /collections/{handle}, /pages/{handle},
/blogs/{blog}/{article}), so most URLs carry over as they are. What moved goes into the `redirects` table.

  scan(db, site_id, shopify_domain)    every URL in the Shopify store's public sitemap, and whether Yancey serves it
                                       (same path), redirects it, or is missing it
  import_content(...)                  blog posts (from each blog's public Atom feed) and pages (/pages/{handle}.json)
                                       into `articles` / `pages`, keeping their handles. Links to the old store inside
                                       the content become relative paths, so they follow the store to its new domain.
  import_redirects(...)                Shopify's URL-redirects export (Online Store → Navigation → URL redirects → Export)
  shopify_redirects(...)               or straight from Shopify with an Admin API token (see below)

Complete content needs a read-only Admin API token: Shopify admin → Settings → Apps → Develop apps → Create an app →
Admin API scopes read_content and read_online_store_navigation → Install → copy the token into SHOPIFY_ADMIN_TOKEN on
this function. Without it, pages still import in full, but Shopify's public blog feed only lists each blog's latest 30
posts, so older posts are reported as missing.

All writes are idempotent upserts with IDs derived from the natural key (store + path / handle).
"""
import hashlib
import json
import re
import time
import xml.etree.ElementTree as ET
from urllib.parse import unquote, urlsplit

import requests

UA = {"User-Agent": "Yancey-migration/1.0"}
SM = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
IMG = "{http://www.google.com/schemas/sitemap-image/1.1}"
ATOM = "{http://www.w3.org/2005/Atom}"
CHUNK = 100


def _h(*parts, n=30):
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:n]


def _a(row, key):
    if isinstance(row, dict):
        return row.get(key)
    data = getattr(row, "data", None)
    if isinstance(data, dict) and key in data:
        return data[key]
    return getattr(row, key.lstrip("$"), None) if key.startswith("$") else getattr(row, key, None)


# ------------------------------------------------------------------------------- paths (mirror src/lib/urls.ts)
def clean_domain(d):
    d = (d or "").strip().lower()
    d = re.sub(r"^[a-z]+://", "", d).split("/")[0]
    return d.removeprefix("www.")


def normalize_path(value):
    s = (value or "").strip()
    s = re.sub(r"^[a-z]+://[^/?#]+", "", s, flags=re.I).split("#")[0]
    if not s.startswith("/"):
        s = "/" + s
    path, _, query = s.partition("?")
    p = re.sub(r"/{2,}", "/", path).lower()
    if len(p) > 1:
        p = p.rstrip("/")
    p = unquote(p)
    return f"{p}?{query}" if query else p


def normalize_target(value, own_hosts=()):
    s = (value or "").strip()
    m = re.match(r"^[a-z]+://([^/?#]+)(.*)$", s, flags=re.I)
    if m and m.group(1).lower().removeprefix("www.") not in own_hosts:
        return s
    rest = (m.group(2) or "/") if m else (s if s.startswith("/") else "/" + s)
    path, sep, query = rest.partition("?")
    p = re.sub(r"/{2,}", "/", path)
    if len(p) > 1:
        p = p.rstrip("/")
    return f"{p}?{query}" if sep else p


def redirect_id(site_id, path):
    return "r" + _h(site_id, path)


def article_id(site_id, blog, handle):
    return "a" + _h(site_id, blog, handle)


def page_id(site_id, handle):
    return "g" + _h(site_id, handle)


def parse_path(path):
    parts = [p for p in normalize_path(path).split("?")[0].split("/") if p]
    a, b, c, d = (parts + [None] * 4)[:4]
    if a == "products" and b:
        return {"type": "product", "handle": b}
    if a == "collections" and b and c == "products" and d:
        return {"type": "product", "handle": d, "collection": b}
    if a == "collections":
        return {"type": "collection", "handle": b or "all"}
    if a == "pages" and b:
        return {"type": "page", "handle": b}
    if a == "blogs" and b and c == "tagged" and d:
        return {"type": "blog", "blog": b, "tag": d}
    if a == "blogs" and b and c:
        return {"type": "article", "blog": b, "handle": c}
    if a == "blogs" and b:
        return {"type": "blog", "blog": b}
    return {"type": "home" if not a else "other"}


# ------------------------------------------------------------------------------- fetching
def _get(url, timeout=15):
    r = requests.get(url, headers=UA, timeout=timeout)
    r.raise_for_status()
    return r


def sitemap_urls(domain):
    """[{path, type, image}] from https://{domain}/sitemap.xml (Shopify's index → products/collections/pages/blogs/articles)."""
    root = ET.fromstring(_get(f"https://{domain}/sitemap.xml").content)
    children = [l.text.strip() for l in root.iter(f"{SM}loc")] if root.tag.endswith("sitemapindex") else []
    docs = [root] if not children else []
    for url in children:
        if "agentic" in url:  # Shopify's AI-agent sitemap repeats the product URLs
            continue
        docs.append(ET.fromstring(_get(url).content))
    out, seen = [], set()
    for doc in docs:
        for u in doc.iter(f"{SM}url"):
            loc = u.find(f"{SM}loc")
            if loc is None or not loc.text:
                continue
            path = normalize_path(loc.text)
            if path in seen:
                continue
            seen.add(path)
            img = u.find(f"{IMG}image/{IMG}loc")
            out.append({"path": path, "type": parse_path(path)["type"], "image": img.text.strip() if img is not None and img.text else None})
    return out


def _relative_links(html, hosts):
    """https://(www.)moonbear.shop/products/x → /products/x, so content links follow the store to its new domain."""
    if not html:
        return html
    pattern = r"(href|src)=([\"'])https?://(?:www\.)?(" + "|".join(re.escape(h) for h in hosts) + r")(/[^\"']*)?\2"
    return re.sub(pattern, lambda m: f"{m.group(1)}={m.group(2)}{m.group(4) or '/'}{m.group(2)}", html, flags=re.I)


def _text(html, limit=320):
    t = re.sub(r"<[^>]+>", " ", html or "")
    t = re.sub(r"\s+", " ", t).strip()
    return t[:limit].rsplit(" ", 1)[0] + "…" if len(t) > limit else t


def blog_articles(domain, blog, max_pages=40, deadline=None):
    """Every post in a Shopify blog, from its public Atom feed (30 per page)."""
    posts, blog_title, seen = [], None, set()
    for page in range(1, max_pages + 1):
        if deadline and time.time() > deadline:
            raise TimeoutError
        root = ET.fromstring(_get(f"https://{domain}/blogs/{blog}.atom?page={page}").content)
        if blog_title is None:
            t = (root.findtext(f"{ATOM}title") or "").strip()
            blog_title = t.split(" - ", 1)[1] if " - " in t else t or blog.title()
        entries = root.findall(f"{ATOM}entry")
        new = 0
        for e in entries:
            link = next((l.get("href") for l in e.findall(f"{ATOM}link") if l.get("rel") in (None, "alternate")), None) or e.findtext(f"{ATOM}id")
            route = parse_path(link or "")
            if route["type"] != "article" or route["handle"] in seen:
                continue
            seen.add(route["handle"])
            new += 1
            summary = (e.findtext(f"{ATOM}summary") or "").strip()
            summary = re.sub(r'<p>\s*<a class="read-more"[^>]*>.*?</a>\s*</p>\s*$', "", summary, flags=re.S | re.I).strip()
            posts.append({
                "handle": route["handle"], "title": (e.findtext(f"{ATOM}title") or "").strip(),
                "bodyHtml": (e.findtext(f"{ATOM}content") or "").strip(), "summaryHtml": summary,
                "author": (e.findtext(f"{ATOM}author/{ATOM}name") or "").strip() or None,
                "publishedAt": e.findtext(f"{ATOM}published"), "tags": [c.get("term") for c in e.findall(f"{ATOM}category") if c.get("term")],
            })
        if len(entries) < 30 or not new:  # Shopify ignores ?page= on most stores: the same 30 come back
            break
    return blog_title, posts


def _strip_shop(title, shop):
    """Themes append " – Shop name" to <title>; the SEO title is the part before it."""
    t = re.sub(r"\s+", " ", title).strip()
    if shop:
        t = re.sub(r"\s*[–—|-]\s*" + re.escape(shop) + r"$", "", t)
    return t


def article_from_html(domain, path):
    """A post read from its public page: metadata from the Article JSON-LD, HTML body from the theme's rich-text block.
    Used for posts the Atom feed doesn't list (it only has the latest 30)."""
    html = _get(f"https://{domain}{path}").text
    meta = {}
    for m in re.finditer(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S):
        try:
            d = json.loads(m.group(1))
        except ValueError:
            continue
        if isinstance(d, dict) and d.get("@type") in ("Article", "BlogPosting"):
            meta = d
            break
    body = None
    for pattern in (r"<rte-formatter[^>]*>(.*?)</rte-formatter>",                       # Horizon / newer Shopify themes
                    r'<div class="[^"]*article-template__content[^"]*"[^>]*>(.*?)</div>\s*</div>',  # Dawn
                    r'<div class="rte[^"]*"[^>]*itemprop="articleBody"[^>]*>(.*?)</div>'):
        m = re.search(pattern, html, re.S | re.I)
        if m:
            body = m.group(1).strip()
            break
    if body is None and meta.get("articleBody"):
        body = "".join(f"<p>{p.strip()}</p>" for p in re.split(r"\n\s*\n", meta["articleBody"]) if p.strip())
    if body is None:
        raise ValueError("couldn't find the post's content on its page")
    desc = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', html)
    title = re.search(r"<title>(.*?)</title>", html, re.S)
    image = meta.get("image")
    image = image.get("url") if isinstance(image, dict) else image[0] if isinstance(image, list) and image else image
    from html import unescape
    return {"title": unescape(meta.get("headline") or (title.group(1).split("–")[0].split(" - ")[0].strip() if title else "")),
            "bodyHtml": body, "summaryHtml": "", "author": (meta.get("author") or {}).get("name") if isinstance(meta.get("author"), dict) else None,
            "publishedAt": meta.get("datePublished"), "tags": [], "imageUrl": re.sub(r"[?&]width=\d+", "", image) if image else None,
            "seoTitle": _strip_shop(unescape(title.group(1)), (meta.get("publisher") or {}).get("name"))[:255] if title else None,
            "seoDescription": unescape(desc.group(1)).strip() if desc else None}


# ------------------------------------------------------------------------------- Shopify Admin API (optional token)
ADMIN_VERSION = "2025-10"


def admin_token():
    import os
    return os.environ.get("SHOPIFY_ADMIN_TOKEN") or None


def admin_domain(domain):
    """The store's xxx.myshopify.com domain (the Admin API only answers there), from its public /meta.json."""
    import os
    if os.environ.get("SHOPIFY_ADMIN_DOMAIN"):
        return clean_domain(os.environ["SHOPIFY_ADMIN_DOMAIN"])
    if domain.endswith(".myshopify.com"):
        return domain
    return clean_domain(_get(f"https://{domain}/meta.json").json().get("myshopify_domain"))


def admin_query(domain, query, variables=None):
    r = requests.post(f"https://{admin_domain(domain)}/admin/api/{ADMIN_VERSION}/graphql.json", timeout=20,
                      headers={**UA, "X-Shopify-Access-Token": admin_token(), "Content-Type": "application/json"},
                      json={"query": query, "variables": variables or {}})
    if r.status_code in (401, 403):
        raise PermissionError("Shopify rejected SHOPIFY_ADMIN_TOKEN; it needs the read_content and read_online_store_navigation scopes")
    r.raise_for_status()
    data = r.json()
    if data.get("errors"):
        raise RuntimeError(f"Shopify: {data['errors']}")
    return data["data"]


def admin_all(domain, field, nodes, deadline=None):
    out, after = [], None
    q = f"query($after: String) {{ {field}(first: 100, after: $after) {{ nodes {{ {nodes} }} pageInfo {{ hasNextPage endCursor }} }} }}"
    while True:
        if deadline and time.time() > deadline:
            raise TimeoutError
        page = admin_query(domain, q, {"after": after})[field]
        out += page["nodes"]
        if not page["pageInfo"]["hasNextPage"]:
            return out
        after = page["pageInfo"]["endCursor"]


SEO = 't: metafield(namespace: "global", key: "title_tag") { value } d: metafield(namespace: "global", key: "description_tag") { value }'


def _seo(n, key):
    v = (n.get(key) or {}).get("value") if n.get(key) else None
    return (v or "").strip() or None


def admin_articles(domain, deadline=None):
    nodes = admin_all(domain, "articles", "id handle title body summary author { name } tags image { url } publishedAt isPublished blog { handle title } " + SEO, deadline)
    return [{"blog": n["blog"]["handle"], "blogTitle": n["blog"]["title"], "handle": n["handle"], "title": n["title"], "bodyHtml": n.get("body") or "",
             "summaryHtml": n.get("summary") or "", "author": (n.get("author") or {}).get("name"), "tags": n.get("tags") or [],
             "imageUrl": (n.get("image") or {}).get("url"), "publishedAt": n.get("publishedAt"), "published": bool(n.get("isPublished")),
             "seoTitle": _seo(n, "t"), "seoDescription": _seo(n, "d"), "externalId": n["id"]} for n in nodes]


def admin_pages(domain, deadline=None):
    nodes = admin_all(domain, "pages", "id handle title body publishedAt isPublished " + SEO, deadline)
    return [{"handle": n["handle"], "title": n["title"], "bodyHtml": n.get("body") or "", "publishedAt": n.get("publishedAt"),
             "published": bool(n.get("isPublished")), "seoTitle": _seo(n, "t"), "seoDescription": _seo(n, "d"), "externalId": n["id"]} for n in nodes]


def shopify_redirects(domain):
    return [{"path": n["path"], "target": n["target"]} for n in admin_all(domain, "urlRedirects", "path target")]


# ------------------------------------------------------------------------------- Yancey side
class Store:
    def __init__(self, db, database_id, site_id):
        self.db, self.DB, self.site = db, database_id, site_id

    def all(self, table, select=None):
        from appwrite.query import Query
        out, cursor = [], None
        while True:
            q = [Query.equal("siteId", self.site), Query.limit(CHUNK)] + ([Query.select(select)] if select else []) \
                + ([Query.cursor_after(cursor)] if cursor else [])
            page = self.db.list_rows(self.DB, table, queries=q).rows
            out += page
            if len(page) < CHUNK:
                return out
            cursor = _a(page[-1], "$id")

    def upsert(self, table, rows):
        written, problems = 0, []
        for i in range(0, len(rows), CHUNK):
            chunk = rows[i:i + CHUNK]
            try:
                self.db.upsert_rows(self.DB, table, chunk)
                written += len(chunk)
            except Exception:  # noqa: BLE001 - retry one by one so one bad row doesn't block the rest
                for row in chunk:
                    try:
                        self.db.upsert_rows(self.DB, table, [row])
                        written += 1
                    except Exception as e:  # noqa: BLE001
                        problems.append({"key": row.get("path") or row.get("handle") or row["$id"], "error": getattr(e, "message", None) or str(e)})
        return written, problems

    def served(self):
        """What Yancey serves now, as normalised paths, plus the redirects map."""
        paths = {"/", "/collections/all", "/cart", "/search", "/account", "/blogs"}
        for p in self.all("products", ["handle", "status"]):
            if _a(p, "handle") and _a(p, "status") in ("active", "unlisted"):
                paths.add(f"/products/{_a(p, 'handle').lower()}")
        for c in self.all("collections", ["handle", "published"]):
            if _a(c, "published") is not False:
                paths.add(f"/collections/{_a(c, 'handle').lower()}")
        for g in self.all("pages", ["handle", "published"]):
            if _a(g, "published") is not False:
                paths.add(f"/pages/{_a(g, 'handle').lower()}")
        for a in self.all("articles", ["blogHandle", "handle", "published"]):
            if _a(a, "published") is not False:
                paths.add(f"/blogs/{_a(a, 'blogHandle').lower()}")
                paths.add(f"/blogs/{_a(a, 'blogHandle').lower()}/{_a(a, 'handle').lower()}")
        redirects = {_a(r, "path"): _a(r, "target") for r in self.all("redirects", ["path", "target"])}
        return paths, redirects


def _is_served(path, served):
    if path in served:
        return True
    r = parse_path(path)
    if r["type"] == "product" and r.get("collection"):  # /collections/{c}/products/{p} shows product p, like Shopify
        return f"/products/{r['handle']}" in served and (r["collection"] == "all" or f"/collections/{r['collection']}" in served)
    if r["type"] == "blog" and r.get("tag"):            # /blogs/{blog}/tagged/{tag}
        return f"/blogs/{r['blog']}" in served
    return False


def resolve(path, served, redirects, hops=5):
    """Follow redirects from `path` the way storefronts do (Yancey.redirect(): exact path with query first, then the
    page itself, then the path without query). Returns (status, final): same | redirect | broken_redirect | missing."""
    seen, cur = [], normalize_path(path)
    for _ in range(hops):
        base = cur.split("?")[0]
        target = redirects.get(cur) if cur != base else None
        if not target:
            if _is_served(base, served):
                return ("same" if not seen else "redirect"), cur
            target = redirects.get(base)
        if not target:
            break
        if re.match(r"^https?://", target):
            return "redirect", target
        seen.append(cur)
        cur = normalize_path(target)
        if cur in seen:
            return "broken_redirect", cur
    return ("broken_redirect" if seen else "missing"), cur


def scan(db, database_id, site_id, shopify_domain):
    domain = clean_domain(shopify_domain)
    urls = sitemap_urls(domain)
    served, redirects = Store(db, database_id, site_id).served()
    rows, counts = [], {"same": 0, "redirect": 0, "missing": 0, "broken_redirect": 0}
    for u in urls:
        status, final = resolve(u["path"], served, redirects)
        counts[status] += 1
        rows.append({**u, "status": status, "to": final if status != "same" else None})
    order = {"missing": 0, "broken_redirect": 1, "redirect": 2, "same": 3}
    rows.sort(key=lambda r: (order[r["status"]], r["type"], r["path"]))
    return {"domain": domain, "total": len(rows), "counts": counts, "urls": rows}


def import_content(db, database_id, site_id, shopify_domain, kind, budget_seconds=24):
    """kind: "articles" or "pages". Safe to repeat: rows are keyed by store + handle."""
    domain = clean_domain(shopify_domain)
    hosts = [domain]
    deadline = time.time() + budget_seconds
    store, problems, rows = Store(db, database_id, site_id), [], []
    use_admin = bool(admin_token())
    if use_admin:
        try:
            hosts.append(clean_domain(admin_domain(domain)))
        except Exception:  # noqa: BLE001
            pass
    if kind == "articles":
        if use_admin:
            posts = admin_articles(domain, deadline)
            missing = []
        else:
            urls = sitemap_urls(domain)
            images = {u["path"]: u["image"] for u in urls if u["type"] == "article" and u["image"]}
            listed = [u["path"] for u in urls if u["type"] == "article"]
            posts = []
            for blog in sorted({parse_path(u["path"])["blog"] for u in urls if u["type"] in ("blog", "article")}):
                title, found = blog_articles(domain, blog, deadline=deadline)
                posts += [{**p, "blog": blog, "blogTitle": title, "published": True, "seoTitle": None, "seoDescription": None,
                           "imageUrl": images.get(f"/blogs/{blog}/{p['handle']}"), "externalId": None} for p in found]
            got = {f"/blogs/{p['blog']}/{p['handle']}" for p in posts}
            have = {f"/blogs/{_a(r, 'blogHandle')}/{_a(r, 'handle')}" for r in store.all("articles", ["blogHandle", "handle", "source"])
                    if _a(r, "source") == "shopify"}
            missing = []
            for path in (x for x in listed if x not in got and x not in have):  # older posts: read their pages
                if time.time() > deadline:
                    missing.append(path)
                    continue
                r = parse_path(path)
                try:
                    one = article_from_html(domain, path)
                except Exception as e:  # noqa: BLE001
                    problems.append({"key": path, "error": str(e)})
                    continue
                blog_title = next((p["blogTitle"] for p in posts if p["blog"] == r["blog"]), r["blog"].replace("-", " ").title())
                posts.append({**one, "blog": r["blog"], "blogTitle": blog_title, "handle": r["handle"], "published": True,
                              "imageUrl": one["imageUrl"] or images.get(path), "externalId": None})
        for p in posts:
            path = f"/blogs/{p['blog']}/{p['handle']}"
            rows.append({"$id": article_id(site_id, p["blog"], p["handle"]), "siteId": site_id, "blogHandle": p["blog"], "blogTitle": p["blogTitle"],
                         "handle": p["handle"], "title": (p["title"] or p["handle"])[:255], "bodyHtml": _relative_links(p["bodyHtml"], hosts),
                         "summaryHtml": _relative_links(p["summaryHtml"], hosts) or None, "author": p["author"], "tags": json.dumps(p["tags"]),
                         "imageUrl": p["imageUrl"], "publishedAt": p["publishedAt"], "published": p["published"],
                         "seoTitle": (p["seoTitle"] or "")[:255] or None,
                         "seoDescription": (p["seoDescription"] or _text(p["summaryHtml"] or p["bodyHtml"], 300))[:1024] or None,
                         "source": "shopify", "externalId": (p["externalId"] or path)[:64]})
        if missing:
            problems.append({"key": f"{len(missing)} more posts", "error": "Ran out of time. Run the import again to continue "
                             "(or set SHOPIFY_ADMIN_TOKEN on site-ops to import everything at once, with tags)."})
    elif kind == "pages":
        found = admin_pages(domain, deadline) if use_admin else None
        if found is None:
            found = []
            for u in (x for x in sitemap_urls(domain) if x["type"] == "page"):
                if time.time() > deadline:
                    problems.append({"key": u["path"], "error": "Ran out of time; run the import again to finish"})
                    break
                handle = parse_path(u["path"])["handle"]
                try:
                    pg = _get(f"https://{domain}/pages/{handle}.json").json()["page"]
                except Exception as e:  # noqa: BLE001
                    problems.append({"key": u["path"], "error": str(e)})
                    continue
                found.append({"handle": pg.get("handle") or handle, "title": pg.get("title"), "bodyHtml": pg.get("body_html") or "",
                              "publishedAt": pg.get("published_at"), "published": True, "seoTitle": None, "seoDescription": None,
                              "externalId": str(pg.get("id") or "") or None})
        for pg in found:
            rows.append({"$id": page_id(site_id, pg["handle"]), "siteId": site_id, "handle": pg["handle"], "title": (pg["title"] or pg["handle"])[:255],
                         "bodyHtml": _relative_links(pg["bodyHtml"], hosts), "publishedAt": pg["publishedAt"], "published": pg["published"],
                         "seoTitle": (pg["seoTitle"] or "")[:255] or None,
                         "seoDescription": (pg["seoDescription"] or _text(pg["bodyHtml"], 300))[:1024] or None,
                         "source": "shopify", "externalId": (pg["externalId"] or "")[:64] or None})
    else:
        raise ValueError("kind must be articles or pages")
    written, write_problems = store.upsert(kind, rows)
    return {"kind": kind, "found": len(rows), "written": written, "source": "admin" if use_admin else "public",
            "remaining": len(missing) if kind == "articles" else 0,
            "problems": (problems + write_problems)[:100]}


def import_redirects(db, database_id, site_id, rows, own_hosts=()):
    """rows: [{path|"Redirect from", target|"Redirect to"}] → upserted redirects (one per path)."""
    out, problems = {}, []
    hosts = tuple(clean_domain(h) for h in own_hosts if h)
    store = Store(db, database_id, site_id)
    ids = {_a(r, "path"): _a(r, "$id") for r in store.all("redirects", ["path"])}  # keep one row per path
    for r in rows:
        src = r.get("path") or r.get("Redirect from") or r.get("from") or ""
        dst = r.get("target") or r.get("Redirect to") or r.get("to") or ""
        if not src.strip() or not dst.strip():
            problems.append({"key": src or dst or "?", "error": "Needs both a from and a to"})
            continue
        path, target = normalize_path(src), normalize_target(dst, hosts)
        if len(path) > 512:
            problems.append({"key": path[:80], "error": "Path is longer than 512 characters"})
            continue
        if path == normalize_path(target):
            continue
        out[path] = {"$id": ids.get(path) or redirect_id(site_id, path), "siteId": site_id, "path": path, "target": target[:2048], "source": r.get("source") or "shopify"}
    written, write_problems = store.upsert("redirects", list(out.values()))
    return {"received": len(rows), "records": len(out), "written": written, "added": sum(1 for p in out if p not in ids),
            "updated": sum(1 for p in out if p in ids), "problems": (problems + write_problems)[:100], "problemCount": len(problems) + len(write_problems)}
