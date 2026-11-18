"""
checkout: PUBLIC Appwrite Function your storefronts call to take payments.

  POST /stripe/session   {siteId, items:[{productId, quantity}], successUrl, cancelUrl, email?} -> {url}
  POST /stripe/webhook   Stripe calls this (checkout.session.completed / async_payment_succeeded)
  POST /paypal/create    {siteId, items, returnUrl, cancelUrl}                                 -> {url, paypalOrderId}
  POST /paypal/capture   {paypalOrderId}  called from your return page                        -> {orderId, number}
  POST /config           {siteId} -> which providers are enabled (so storefronts can show the right buttons)

Prices, stock and currency are always read from Appwrite, never from the browser.
Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV (sandbox|live),
     SHIP_TO_COUNTRIES (optional, e.g. "US,CA"), ALLOWED_RETURN_HOSTS (optional extra hosts for redirect URLs)
"""
import json
import os
import sys
from urllib.parse import urlparse

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import payments  # noqa: E402
from errors import HttpError  # noqa: E402
from store import Store, a  # noqa: E402


def _headers(req):
    return {k.lower(): v for k, v in (req.headers or {}).items()}


def _raw(req):
    for attr in ("body_text", "body_raw"):
        v = getattr(req, attr, None)
        if isinstance(v, (bytes, bytearray)):
            return v.decode()
        if isinstance(v, str):
            return v
    b = getattr(req, "body", "")
    return b if isinstance(b, str) else json.dumps(b)


def _json(req):
    raw = _raw(req)
    try:
        data = json.loads(raw) if raw.strip() else {}
    except ValueError:
        raise HttpError("Body must be JSON")
    return data if isinstance(data, dict) else {}


def _store(req):
    key = _headers(req).get("x-appwrite-key") or os.environ.get("APPWRITE_API_KEY")
    if not key:
        raise HttpError("No Appwrite key available to the checkout function (enable scopes in appwrite.json)", 500)
    return Store(key)


def _safe_url(url, site, field):
    """Only redirect back to the store's own domain (or explicitly allowed hosts) to prevent open redirects."""
    if not url:
        raise HttpError(f"Missing {field}")
    host = (urlparse(url).hostname or "").lower()
    domain = a(site, "domain").lower()
    allowed = {domain, f"www.{domain}", *[h.strip().lower() for h in os.environ.get("ALLOWED_RETURN_HOSTS", "").split(",") if h.strip()]}
    if urlparse(url).scheme not in ("https", "http") or not (host in allowed or host.endswith("." + domain) or host == "localhost"):
        raise HttpError(f"{field} must be on {domain}")
    return url


# ---------------------------------------------------------------------------- routes
def config(req):
    return {"stripe": bool(os.environ.get("STRIPE_SECRET_KEY")),
            "paypal": bool(os.environ.get("PAYPAL_CLIENT_ID") and os.environ.get("PAYPAL_CLIENT_SECRET"))}


def stripe_session(req):
    b, store = _json(req), _store(req)
    site = store.site(str(b.get("siteId", "")))
    success = _safe_url(b.get("successUrl"), site, "successUrl")
    cancel = _safe_url(b.get("cancelUrl"), site, "cancelUrl")
    lines, total = store.price_cart(a(site, "$id"), b.get("items"))
    currency = a(site, "currency") or "USD"
    checkout_id = store.create_checkout(a(site, "$id"), "stripe", lines, total, currency, b.get("email"))
    sep = "&" if "?" in success else "?"
    session_id, url = payments.stripe_session(checkout_id, lines, currency, f"{success}{sep}checkout={checkout_id}",
                                              cancel, b.get("email"), a(site, "name"))
    store.set_checkout_ref(checkout_id, session_id)
    return {"url": url, "checkoutId": checkout_id}


def stripe_webhook(req):
    raw = _raw(req)
    payments.verify_stripe_signature(raw, _headers(req).get("stripe-signature"), payments.env("STRIPE_WEBHOOK_SECRET"))
    event = json.loads(raw)
    if event.get("type") not in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        return {"received": True, "ignored": event.get("type")}
    s = event["data"]["object"]
    if s.get("payment_status") != "paid":
        return {"received": True, "pending": True}  # e.g. bank debits; async_payment_succeeded follows
    checkout_id = s.get("client_reference_id") or (s.get("metadata") or {}).get("checkoutId")
    if not checkout_id:
        return {"received": True, "ignored": "not a Sellify checkout"}
    details = s.get("customer_details") or {}
    result = _store(req).finalize(checkout_id, "stripe", s.get("payment_intent") or s["id"],
                                  details.get("email") or s.get("customer_email"), details.get("name"), s["amount_total"] / 100)
    return {"received": True, **result}


def paypal_create(req):
    b, store = _json(req), _store(req)
    site = store.site(str(b.get("siteId", "")))
    ret = _safe_url(b.get("returnUrl"), site, "returnUrl")
    cancel = _safe_url(b.get("cancelUrl"), site, "cancelUrl")
    lines, total = store.price_cart(a(site, "$id"), b.get("items"))
    currency = a(site, "currency") or "USD"
    checkout_id = store.create_checkout(a(site, "$id"), "paypal", lines, total, currency, b.get("email"))
    order_id, url = payments.paypal_create(checkout_id, lines, total, currency, ret, cancel, a(site, "name"))
    store.set_checkout_ref(checkout_id, order_id)
    return {"url": url, "paypalOrderId": order_id, "checkoutId": checkout_id}


def paypal_capture(req):
    b = _json(req)
    order_id = str(b.get("paypalOrderId") or b.get("token") or "")
    if not order_id:
        raise HttpError("Missing paypalOrderId")
    checkout_id, capture_id, amount, email, name = payments.paypal_capture(order_id)
    return _store(req).finalize(checkout_id, "paypal", capture_id, email, name, amount)


ROUTES = {
    "/config": config,
    "/stripe/session": stripe_session,
    "/stripe/webhook": stripe_webhook,
    "/paypal/create": paypal_create,
    "/paypal/capture": paypal_capture,
}


def main(context):
    path = (context.req.path or "/").rstrip("/") or "/"
    handler = ROUTES.get(path)
    if context.req.method == "OPTIONS":
        return context.res.json({}, 204)
    if not handler:
        return context.res.json({"error": f"Unknown route {path}"}, 404)
    try:
        return context.res.json(handler(context.req))
    except HttpError as e:
        if e.status >= 500:
            context.error(f"{path}: {e}")
        return context.res.json({"error": str(e)}, e.status)
    except requests.RequestException as e:
        context.error(f"{path}: {e!r}")
        return context.res.json({"error": "Payment provider unreachable, please try again"}, 502)
    except Exception as e:  # noqa: BLE001
        context.error(f"{path}: {e!r}")
        return context.res.json({"error": "Checkout failed, please try again"}, 500)
