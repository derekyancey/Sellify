"""
Signed, expiring download links for digital orders.

SOURCE OF TRUTH: appwrite/shared/downloads.py (copied into each function by `python appwrite/sync_shared.py`).

A link is  <CHECKOUT_PUBLIC_URL>/download?token=<payload>.<signature>
  payload   = base64url(JSON {d: download row id, o: order id, p: product id, e: expiry unix seconds})
  signature = base64url(HMAC-SHA256(DOWNLOAD_LINK_SECRET, payload))

The checkout function verifies the signature, then checks the downloads row: same order/product, `e` equal to the
row's current expiresAt (so a reissue, which moves expiresAt, kills older links), not expired, not revoked, under
the download limit, and the order still paid. Never log a token, the secret or a storage URL.
"""
import base64
import datetime as dt
import hashlib
import hmac
import json
import os

LINK_DAYS = 7
MAX_DOWNLOADS = 5


class BadToken(Exception):
    pass


def _secret():
    s = os.environ.get("DOWNLOAD_LINK_SECRET")
    if not s or len(s) < 16:
        raise BadToken("DOWNLOAD_LINK_SECRET is not set (or shorter than 16 characters) on this function")
    return s.encode()


def configured():
    return len(os.environ.get("DOWNLOAD_LINK_SECRET") or "") >= 16


def _b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def epoch(value):
    """Appwrite datetime string (or datetime) -> whole unix seconds."""
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        value = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone.utc)
    return int(value.timestamp())


def new_expiry(now=None, days=LINK_DAYS):
    """A fresh expiry, truncated to whole seconds so the token and the stored row agree exactly."""
    now = (now or dt.datetime.now(dt.timezone.utc)).replace(microsecond=0)
    return now + dt.timedelta(days=days)


def make_token(download_id, order_id, product_id, expires_at):
    payload = _b64(json.dumps({"d": download_id, "o": order_id, "p": product_id, "e": epoch(expires_at)},
                              separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def read_token(token):
    """Verify the signature and return {d, o, p, e}. Raises BadToken for anything malformed or tampered with."""
    token = str(token or "")
    if len(token) > 512 or token.count(".") != 1:
        raise BadToken("malformed")
    payload, sig = token.split(".")
    want = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(want, sig):
        raise BadToken("bad signature")
    try:
        data = json.loads(_unb64(payload))
    except ValueError:
        raise BadToken("malformed")
    if not (isinstance(data, dict) and all(isinstance(data.get(k), str) and data[k] for k in "dop") and isinstance(data.get("e"), int)):
        raise BadToken("malformed")
    return data


def link(token, base_url=None):
    base = (base_url or os.environ.get("CHECKOUT_PUBLIC_URL") or "").rstrip("/")
    return f"{base}/download?token={token}"
