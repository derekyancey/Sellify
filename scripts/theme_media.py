"""Copy a theme's images and videos off Shopify into Appwrite Storage and point the theme at them.

    APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1 APPWRITE_PROJECT_ID=... APPWRITE_API_KEY=... \
    python scripts/theme_media.py public/themes/moonbear [--bucket files] [--cache /tmp/theme-media]

Finds every moonbear.shop/cdn/... or cdn.shopify.com/... URL in theme.json and templates/*.json,
uploads each file once (ids are "img" + sha1 of the URL without its query, the same scheme the
Shopify importer uses, so re-runs skip files already uploaded), then rewrites the URLs, including
srcset sizes, to the Appwrite view URL. The bucket must allow the file sizes (videos can be 30 MB+).
"""
from __future__ import annotations

import argparse
import hashlib
import os
import pathlib
import re

import requests

CHUNK = 5 * 1024 * 1024
URL_RE = re.compile(r"(?:https?:)?//(?:[\w.-]+\.myshopify\.com|moonbear\.shop|cdn\.shopify\.com)/(?:cdn/)?(?:shop/|s/files/)[^\s\"'),\\]+")


def file_id(url: str) -> str:
    return "img" + hashlib.sha1(url.split("?")[0].encode()).hexdigest()[:32]


def base(url: str) -> str:
    url = url.replace("&amp;", "&")
    return ("https:" + url if url.startswith("//") else url).split("?")[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("theme")
    ap.add_argument("--bucket", default="files")
    ap.add_argument("--cache", default="/tmp/theme-media")
    a = ap.parse_args()
    endpoint = os.environ["APPWRITE_ENDPOINT"].rstrip("/")
    project, key = os.environ["APPWRITE_PROJECT_ID"], os.environ["APPWRITE_API_KEY"]
    s = requests.Session()
    s.headers.update({"X-Appwrite-Project": project, "X-Appwrite-Key": key})
    files_url = f"{endpoint}/storage/buckets/{a.bucket}/files"
    view = lambda fid: f"{endpoint}/storage/buckets/{a.bucket}/files/{fid}/view?project={project}"

    theme = pathlib.Path(a.theme)
    paths = [theme / "theme.json", *sorted((theme / "templates").glob("*.json"))]
    found = sorted({base(m) for p in paths for m in URL_RE.findall(p.read_text(encoding="utf-8"))})
    print(f"{len(found)} files referenced")
    cache = pathlib.Path(a.cache)
    cache.mkdir(parents=True, exist_ok=True)

    mapping = {}
    for i, url in enumerate(found, 1):
        fid = file_id(url)
        mapping[url] = view(fid)
        if s.get(f"{files_url}/{fid}").status_code == 200:
            continue
        name = url.rsplit("/", 1)[-1]
        local = cache / f"{fid}.{name.rsplit('.', 1)[-1].lower()}"
        if not local.exists() or not local.stat().st_size:
            r = requests.get(url, timeout=120)
            r.raise_for_status()
            local.write_bytes(r.content)
        data, total = local.read_bytes(), local.stat().st_size
        if data[:200].lstrip().lower().startswith((b"<!doctype", b"<html")):
            local.unlink()
            raise SystemExit(f"{url} is a web page, not a media file (moved or deleted on Shopify?). Fix the theme's link and re-run.")
        for start in range(0, total, CHUNK):   # Appwrite takes files over 5 MB in chunks
            end = min(start + CHUNK, total) - 1
            headers = {"Content-Range": f"bytes {start}-{end}/{total}"}
            if start:
                headers["X-Appwrite-ID"] = fid
            r = s.post(files_url, headers=headers, data={"fileId": fid}, files={"file": (name, data[start:end + 1])}, timeout=300)
            if r.status_code >= 400:
                raise SystemExit(f"Upload failed for {url}: {r.status_code} {r.text[:300]}")
        print(f"[{i}/{len(found)}] {name} ({total // 1024} KB)")

    def swap(m: re.Match) -> str:
        return mapping.get(base(m.group(0)), m.group(0))
    for p in paths:
        text = p.read_text(encoding="utf-8")
        new = URL_RE.sub(swap, text)
        if new != text:
            p.write_text(new, encoding="utf-8")
            print("updated", p)


if __name__ == "__main__":
    main()
