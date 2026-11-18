"""
"Connect Google account" for each store (OAuth 2.0, web server flow).

The refresh token is kept in the `connections` table, which has no client permissions: only this function's
server key can read it, so it never reaches the browser.
Env: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, UNSUBSCRIBE_SECRET (reused to sign the OAuth state).
"""
import base64
import hashlib
import hmac
import json
import os
import time
from urllib.parse import urlencode, urlparse

import requests

from errors import HttpError

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
SCOPES = ["openid", "email", "https://www.googleapis.com/auth/webmasters", "https://www.googleapis.com/auth/analytics.readonly"]
DB = os.environ.get("APPWRITE_DATABASE_ID", "yancey")
STATE_TTL = 15 * 60


def configured():
    return bool(os.environ.get("GOOGLE_OAUTH_CLIENT_ID") and os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET"))


def _need_config():
    if not configured():
        raise HttpError("Google sign-in isn't set up yet: add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to site-ops", 409)


def _secret():
    s = os.environ.get("UNSUBSCRIBE_SECRET") or os.environ.get("OAUTH_STATE_SECRET")
    if not s:
        raise HttpError("UNSUBSCRIBE_SECRET is not set on site-ops (used to sign the Google sign-in)", 500)
    return s.encode()


def _b64(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_state(site_id, user_id, now=None):
    payload = _b64(json.dumps({"s": site_id, "u": user_id, "e": int((now or time.time()) + STATE_TTL)}, separators=(",", ":")).encode())
    return payload + "." + _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())


def read_state(state, user_id, now=None):
    try:
        payload, sig = state.split(".", 1)
        good = hmac.compare_digest(_b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest()), sig)
        data = json.loads(_unb64(payload))
    except Exception:  # noqa: BLE001
        raise HttpError("Invalid sign-in state, please try connecting again", 400)
    if not good or data.get("u") != user_id:
        raise HttpError("Invalid sign-in state, please try connecting again", 400)
    if data["e"] < (now or time.time()):
        raise HttpError("The Google sign-in took too long, please try again", 400)
    return data["s"]


def _check_redirect(uri):
    p = urlparse(uri or "")
    if p.scheme != "https" and p.hostname != "localhost":
        raise HttpError("redirectUri must be https")
    if p.path != "/oauth/google":
        raise HttpError("redirectUri must end in /oauth/google")
    return uri


def start_url(site_id, user_id, redirect_uri, login_hint=None):
    _need_config()
    params = {"client_id": os.environ["GOOGLE_OAUTH_CLIENT_ID"], "redirect_uri": _check_redirect(redirect_uri), "response_type": "code",
              "scope": " ".join(SCOPES), "access_type": "offline", "prompt": "consent select_account", "include_granted_scopes": "true",
              "state": make_state(site_id, user_id)}
    if login_hint:
        params["login_hint"] = login_hint
    return f"{AUTH_URL}?{urlencode(params)}"


def exchange(code, redirect_uri):
    _need_config()
    r = requests.post(TOKEN_URL, data={"code": code, "client_id": os.environ["GOOGLE_OAUTH_CLIENT_ID"],
                                       "client_secret": os.environ["GOOGLE_OAUTH_CLIENT_SECRET"],
                                       "redirect_uri": _check_redirect(redirect_uri), "grant_type": "authorization_code"}, timeout=20)
    body = r.json() if r.content else {}
    if not r.ok:
        raise HttpError(f"Google: {body.get('error_description') or body.get('error') or r.text[:200]}", 502)
    if not body.get("refresh_token"):
        raise HttpError("Google didn't return offline access. Remove Yancey under myaccount.google.com → Security → Third-party access, then connect again.", 502)
    granted = set((body.get("scope") or "").split())
    missing = [s.rsplit("/", 1)[-1] for s in SCOPES[2:] if s not in granted]
    if missing:
        raise HttpError(f"Please allow access to {', '.join(missing)} on Google's consent screen.", 400)
    email = None
    if body.get("id_token"):  # received straight from Google over TLS; we only read the email claim
        try:
            email = json.loads(_unb64(body["id_token"].split(".")[1])).get("email")
        except Exception:  # noqa: BLE001
            pass
    return body["refresh_token"], email


def revoke(refresh_token):
    try:
        requests.post(REVOKE_URL, params={"token": refresh_token}, timeout=10)
    except requests.RequestException:
        pass


# ------------------------------------------------------------------ storage (server key only)
def _row_id(site_id):
    return f"google-{site_id}"[:36]


def _a(row, key):
    if isinstance(row, dict):
        return row.get(key)
    data = getattr(row, "data", None)
    return data.get(key) if isinstance(data, dict) else getattr(row, key, None)


def save(db, site_id, refresh_token, email):
    data = {"siteId": site_id, "provider": "google", "accountEmail": email, "refreshToken": refresh_token}
    try:
        old = db.get_row(DB, "connections", _row_id(site_id))
        revoke(_a(old, "refreshToken"))  # replacing an account: drop the old grant
        db.update_row(DB, "connections", _row_id(site_id), data)
    except Exception as e:  # noqa: BLE001
        if getattr(e, "code", None) != 404:
            raise
        db.create_row(DB, "connections", _row_id(site_id), data)


def load(db, site_id):
    try:
        return db.get_row(DB, "connections", _row_id(site_id))
    except Exception as e:  # noqa: BLE001
        if getattr(e, "code", None) == 404:
            return None
        raise


def delete(db, site_id):
    row = load(db, site_id)
    if row:
        revoke(_a(row, "refreshToken"))
        db.delete_row(DB, "connections", _row_id(site_id))
    return bool(row)
