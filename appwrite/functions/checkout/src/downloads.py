"""
Digital delivery: personal, counted download links for digital products.

SOURCE OF TRUTH: appwrite/shared/downloads.py (copied into each function by sync_shared.py).

How it works
  * A product's files live in the PRIVATE "downloads" bucket (nobody can read them directly).
    The product row only stores their IDs and names in `digitalFiles`.
  * When an order is created, every file of every digital product in it gets a row in the
    `downloads` table with a random token. Links look like <CHECKOUT_PUBLIC_URL>/download?t=<token>.
  * Opening a link shows a small page; pressing Download counts it (up to the product's limit,
    until its expiry) and redirects to a 10-minute Appwrite file token for that one file.
"""
import datetime as dt
import json
import os
import secrets

from appwrite.id import ID
from appwrite.query import Query

DB = os.environ.get("APPWRITE_DATABASE_ID", "yancey")
BUCKET = os.environ.get("APPWRITE_DOWNLOADS_BUCKET_ID", "downloads")


def _a(obj, key):
    if isinstance(obj, dict):
        return obj.get(key)
    data = getattr(obj, "data", None)
    if isinstance(data, dict) and key in data:
        return data[key]
    return getattr(obj, key.lstrip("$"), None)


def files_of(product):
    """[{fileId, name, size}] attached to a product (empty for physical products)."""
    v = _a(product, "digitalFiles")
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            v = []
    return [f for f in (v or []) if isinstance(f, dict) and f.get("fileId")] if isinstance(v, list) else []


def base_url():
    return (os.environ.get("CHECKOUT_PUBLIC_URL") or "").rstrip("/")


def link(token):
    base = base_url()
    return f"{base}/download?t={token}" if base else None


def issue(db, site_id, order_id, lines, products):
    """Create one download row per file per digital line. `products` maps productId -> product row.
    Returns the links (see `as_links`). Called once, right after the order row is created."""
    now = dt.datetime.now(dt.timezone.utc)
    out = []
    for line in lines:
        p = products.get(line.get("productId"))
        if not p:
            continue
        limit = _a(p, "downloadLimit") or None
        days = _a(p, "downloadDays") or None
        for f in files_of(p):
            row = {"siteId": site_id, "orderId": order_id, "productId": line["productId"], "fileId": f["fileId"],
                   "name": str(f.get("name") or "Download")[:255], "size": int(f.get("size") or 0),
                   "token": secrets.token_urlsafe(32), "downloadCount": 0,
                   # the limit is per file, multiplied by the quantity bought
                   "maxDownloads": int(limit) * max(1, int(line.get("quantity") or 1)) if limit else None,
                   "expiresAt": (now + dt.timedelta(days=int(days))).isoformat() if days else None}
            created = db.create_row(DB, "downloads", ID.unique(), row)
            out.append({**row, "$id": _a(created, "$id"), "days": days})
    return as_links(out)


def for_order(db, order_id):
    rows = db.list_rows(DB, "downloads", queries=[Query.equal("orderId", order_id), Query.limit(100)]).rows
    return as_links(rows)


def as_links(rows):
    """Public shape: what the buyer sees (never the file ID)."""
    out = []
    for r in rows:
        url = link(_a(r, "token"))
        if not url:
            continue
        exp = _a(r, "expiresAt")
        days = _a(r, "days") if isinstance(r, dict) else None
        mx = _a(r, "maxDownloads")
        out.append({"name": _a(r, "name"), "url": url, "size": _a(r, "size") or 0, "limit": mx,
                    "remaining": (mx - (_a(r, "downloadCount") or 0)) if mx else None,
                    "expiresAt": exp, "days": days})
    return out


def by_token(db, token):
    if not token or len(token) > 64:
        return None
    rows = db.list_rows(DB, "downloads", queries=[Query.equal("token", token), Query.limit(1)]).rows
    return rows[0] if rows else None


def problem(row, order=None):
    """Why a link can't be used right now, or None."""
    if not row:
        return "This download link isn't valid. Check the link in your order email."
    if _a(row, "revoked"):
        return "This download link has been turned off by the store."
    if order is not None and _a(order, "financialStatus") in ("refunded", "voided"):
        return "This order was refunded, so its downloads are no longer available."
    exp = _a(row, "expiresAt")
    if exp and dt.datetime.fromisoformat(str(exp).replace("Z", "+00:00")) < dt.datetime.now(dt.timezone.utc):
        return "This download link has expired. Reply to your order email and the store can send a new one."
    if _a(row, "maxDownloads") and (_a(row, "downloadCount") or 0) >= _a(row, "maxDownloads"):
        return "This file has been downloaded the maximum number of times. Reply to your order email if you need it again."
    return None
