"""A small Screaming-Frog-style SEO crawler. Same-host BFS with a time budget (Appwrite sync executions cap at ~30s)."""
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urldefrag, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

UA = "Mozilla/5.0 (compatible; YanceyBot/1.0; +site-audit)"
SKIP_EXT = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".pdf", ".zip", ".mp4", ".mp3", ".css", ".js", ".ico", ".xml", ".woff", ".woff2")
BUDGET_S = 24
EMPTY = {"title": "", "metaDescription": "", "h1": [], "canonical": "", "noindex": False, "wordCount": 0, "imagesMissingAlt": 0}


def _host(u):
    h = urlparse(u).netloc.lower()
    return h[4:] if h.startswith("www.") else h


def _norm(u):
    u = urldefrag(u)[0]
    p = urlparse(u)
    path = p.path or "/"
    return f"{p.scheme}://{p.netloc.lower()}{path}" + (f"?{p.query}" if p.query else "")


def fetch(sess, url):
    t0 = time.time()
    try:
        r = sess.get(url, timeout=10, allow_redirects=False)
        ms = int((time.time() - t0) * 1000)
        return url, r, ms, None
    except requests.RequestException as e:
        return url, None, int((time.time() - t0) * 1000), str(e)


def parse(url, r):
    page = {"title": "", "metaDescription": "", "h1": [], "canonical": "", "noindex": False, "wordCount": 0, "imagesMissingAlt": 0, "links": []}
    if "text/html" not in r.headers.get("content-type", ""):
        return page
    soup = BeautifulSoup(r.text, "html.parser")
    page["title"] = (soup.title.string or "").strip() if soup.title and soup.title.string else ""
    desc = soup.find("meta", attrs={"name": "description"})
    page["metaDescription"] = (desc.get("content") or "").strip() if desc else ""
    robots = soup.find("meta", attrs={"name": "robots"})
    page["noindex"] = bool(robots and "noindex" in (robots.get("content") or "").lower()) or "noindex" in r.headers.get("x-robots-tag", "").lower()
    canon = soup.find("link", rel="canonical")
    page["canonical"] = canon.get("href", "") if canon else ""
    page["h1"] = [h.get_text(" ", strip=True) for h in soup.find_all("h1")]
    page["imagesMissingAlt"] = sum(1 for img in soup.find_all("img") if not (img.get("alt") or "").strip())
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    page["wordCount"] = len(soup.get_text(" ", strip=True).split())
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        page["links"].append(_norm(urljoin(url, href)))
    return page


def crawl(start_url, max_pages=50):
    if not start_url.startswith("http"):
        start_url = "https://" + start_url
    start = _norm(start_url)
    root = _host(start)
    origin = f"{urlparse(start).scheme}://{urlparse(start).netloc}"
    sess = requests.Session()
    sess.headers["User-Agent"] = UA

    seen, pages, inlinks, depth = {start}, [], defaultdict(int), {start: 0}
    frontier, deadline, partial = [start], time.time() + BUDGET_S, False

    with ThreadPoolExecutor(max_workers=8) as pool:
        while frontier and len(pages) < max_pages:
            if time.time() > deadline:
                partial = True
                break
            batch, frontier = frontier[: max_pages - len(pages)], frontier[max_pages - len(pages):]
            for url, r, ms, err in pool.map(lambda u: fetch(sess, u), batch):
                rec = {"url": url, "status": r.status_code if r is not None else 0, "responseMs": ms, "depth": depth[url], "error": err}
                found = []
                if r is not None and 300 <= r.status_code < 400 and r.headers.get("location"):
                    found = [_norm(urljoin(url, r.headers["location"]))]
                    rec["redirectTo"] = found[0]
                    rec.update(EMPTY)
                elif r is not None and r.status_code < 300:
                    p = parse(url, r)
                    found = p.pop("links")
                    rec.update(p)
                else:
                    rec.update(EMPTY)
                rec["titleLength"] = len(rec["title"])
                pages.append(rec)
                for link in found:
                    if _host(link) != root or link.lower().endswith(SKIP_EXT):
                        continue
                    inlinks[link] += 1
                    if link not in seen:
                        seen.add(link)
                        depth[link] = depth[url] + 1
                        frontier.append(link)
        if frontier:
            partial = True

    for p in pages:
        p["inlinks"] = inlinks.get(p["url"], 0)

    def exists(path):
        try:
            return sess.get(origin + path, timeout=8).status_code == 200
        except requests.RequestException:
            return False

    return {
        "start": start, "pagesCrawled": len(pages), "partial": partial,
        "robotsTxt": exists("/robots.txt"), "sitemap": exists("/sitemap.xml"),
        "pages": pages, "issues": issues(pages),
    }


def issues(pages):
    html = [p for p in pages if 200 <= p["status"] < 300]
    titles = Counter(p["title"] for p in html if p["title"])
    descs = Counter(p["metaDescription"] for p in html if p["metaDescription"])
    checks = [
        ("error", "Broken pages (4xx/5xx or unreachable)", [p for p in pages if p["status"] >= 400 or p["status"] == 0]),
        ("warning", "Redirects (3xx)", [p for p in pages if 300 <= p["status"] < 400]),
        ("warning", "Missing title", [p for p in html if not p["title"]]),
        ("warning", "Duplicate titles", [p for p in html if p["title"] and titles[p["title"]] > 1]),
        ("notice", "Title over 60 characters", [p for p in html if p["titleLength"] > 60]),
        ("warning", "Missing meta description", [p for p in html if not p["metaDescription"]]),
        ("notice", "Duplicate meta descriptions", [p for p in html if p["metaDescription"] and descs[p["metaDescription"]] > 1]),
        ("notice", "Meta description over 160 characters", [p for p in html if len(p["metaDescription"]) > 160]),
        ("warning", "Missing H1", [p for p in html if not p["h1"]]),
        ("notice", "Multiple H1s", [p for p in html if len(p["h1"]) > 1]),
        ("warning", "Noindex pages", [p for p in html if p["noindex"]]),
        ("notice", "Missing canonical tag", [p for p in html if not p["canonical"]]),
        ("notice", "Images missing alt text", [p for p in html if p["imagesMissingAlt"]]),
        ("notice", "Thin content (< 200 words)", [p for p in html if p["wordCount"] < 200]),
        ("notice", "Slow response (> 1s)", [p for p in pages if p["responseMs"] > 1000]),
    ]
    return [{"type": t, "issue": name, "urls": [p["url"] for p in ps]} for t, name, ps in checks if ps]
