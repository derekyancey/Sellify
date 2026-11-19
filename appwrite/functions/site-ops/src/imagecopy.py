"""
Copy product images off Shopify's CDN into Appwrite Storage (product galleries, variant images, and images
embedded in descriptions), so the catalog keeps working after the Shopify store is closed.

Resumable and safe to repeat: each source URL maps to a fixed file ID, files that already exist are reused,
and each call stops after a time budget so it fits in one function execution. Copied images keep their
original URL in `original`, which the importer uses to keep them copied on re-import.
"""
import hashlib
import json
import os
import re
import time
from urllib.parse import unquote, urlparse

import requests

SHOPIFY_CDN = re.compile(r"https?://cdn\.shopify\.com/[^\"'\s)<>]+")
ALLOWED = {"jpg", "jpeg", "png", "gif", "webp", "svg", "avif"}


def file_id(url):
    return "img" + hashlib.sha1(url.split("?")[0].encode()).hexdigest()[:32]


def _a(row, key):
    if isinstance(row, dict):
        return row.get(key)
    data = getattr(row, "data", None)
    if isinstance(data, dict) and key in data:
        return data[key]
    return getattr(row, key.lstrip("$"), None)


def _json(v, default):
    if isinstance(v, (list, dict)):
        return v
    try:
        return json.loads(v) if v else default
    except (TypeError, ValueError):
        return default


def pending_urls(product):
    urls = [i["src"] for i in _json(_a(product, "images"), []) if isinstance(i, dict) and "cdn.shopify.com" in (i.get("src") or "")]
    urls += [v["image"] for v in _json(_a(product, "variants"), []) if "cdn.shopify.com" in (v.get("image") or "")]
    urls += SHOPIFY_CDN.findall(_a(product, "description") or "")
    return list(dict.fromkeys(urls))


class Copier:
    def __init__(self, storage, bucket, public_endpoint, project_id, site_id, http=requests):
        self.storage, self.bucket, self.site_id, self.http = storage, bucket, site_id, http
        self.view = lambda fid: f"{public_endpoint.rstrip('/')}/storage/buckets/{bucket}/files/{fid}/view?project={project_id}"

    def copy(self, url):
        """Return the Yancey URL for a Shopify image (uploading it if needed) or raise with a reason."""
        from appwrite.exception import AppwriteException
        from appwrite.input_file import InputFile
        fid = file_id(url)
        try:
            self.storage.get_file(self.bucket, fid)
            return self.view(fid), False
        except AppwriteException as e:
            if e.code != 404:
                raise
        r = self.http.get(url, timeout=20)
        if r.status_code != 200:
            raise RuntimeError(f"Shopify returned {r.status_code}")
        name = unquote(os.path.basename(urlparse(url).path)) or "image.jpg"
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext not in ALLOWED:
            raise RuntimeError(f"file type .{ext} isn't allowed in the files bucket")
        try:
            self.storage.create_file(self.bucket, fid, InputFile.from_bytes(r.content, filename=f"{self.site_id}--{name}"))
        except AppwriteException as e:
            if e.code != 409:  # 409: uploaded by a concurrent run
                raise RuntimeError(getattr(e, "message", str(e)))
        return self.view(fid), True


def run(db, storage, site_id, *, database_id, bucket, public_endpoint, project_id, budget_seconds=20, http=requests, now=time.time):
    from appwrite.query import Query
    start = now()
    products, cursor = [], None
    while True:
        q = [Query.equal("siteId", site_id), Query.limit(100)] + ([Query.cursor_after(cursor)] if cursor else [])
        page = db.list_rows(database_id, "products", queries=q).rows
        products += page
        if len(page) < 100:
            break
        cursor = _a(page[-1], "$id")
    copier = Copier(storage, bucket, public_endpoint, project_id, site_id, http)
    copied = reused = 0
    failed = []
    out_of_time = False
    for p in products:
        urls = pending_urls(p)
        if not urls:
            continue
        mapping = {}
        for u in urls:
            if now() - start > budget_seconds:
                out_of_time = True
                break
            try:
                mapping[u], new = copier.copy(u)
                copied += new
                reused += not new
            except Exception as e:  # noqa: BLE001 - keep the Shopify URL and report it
                failed.append({"product": _a(p, "title"), "url": u, "error": str(e)[:200]})
        if mapping:
            images = []
            for i in _json(_a(p, "images"), []):
                src = i.get("src")
                images.append({**i, "src": mapping[src], "original": src} if src in mapping else i)
            variants = [{**v, "image": mapping.get(v.get("image"), v.get("image"))} for v in _json(_a(p, "variants"), [])]
            desc = _a(p, "description") or ""
            for old, new in mapping.items():
                desc = desc.replace(old, new)
            db.upsert_rows(database_id, "products", [{  # bulk upsert needs the required columns even on update
                "$id": _a(p, "$id"), "siteId": _a(p, "siteId") or site_id, "title": _a(p, "title"), "price": _a(p, "price") or 0,
                "images": json.dumps(images), "variants": json.dumps(variants),
                "imageUrl": images[0]["src"] if images else _a(p, "imageUrl"), "description": desc or None}])
        if out_of_time:
            break
    failed_urls = {f["url"] for f in failed}
    remaining = sum(1 for p in products for u in pending_urls(p) if u not in failed_urls) if out_of_time else 0
    return {"copied": copied, "reused": reused, "failed": failed[:100], "failedCount": len(failed), "done": not out_of_time,
            "remaining": remaining if out_of_time else 0}
