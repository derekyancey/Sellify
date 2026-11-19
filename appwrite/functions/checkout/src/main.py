"""
checkout: PUBLIC Appwrite Function your storefronts call to take payments.

  POST /stripe/session   {siteId, items:[{productId, quantity}], successUrl, cancelUrl, email?} -> {url}
  POST /stripe/webhook   Stripe calls this (checkout.session.completed / async_payment_succeeded)
  POST /paypal/create    {siteId, items, returnUrl, cancelUrl}                                 -> {url, paypalOrderId}
  POST /paypal/capture   {paypalOrderId}  called from your return page                        -> {orderId, number}
  POST /free/checkout    {siteId, items, email, name?, successUrl?}  for $0 carts (free products or a 100% code)
                                                                       -> {orderId, number, downloads, url}
  POST /order            {checkoutId, key}  the buyer's success page: order status + download links
  GET|POST /download?t=  a buyer's personal download link (GET shows the page, POST counts it and redirects to the file)
  POST /config           {siteId} -> which providers are enabled (so storefronts can show the right buttons)
  POST /discount         {siteId, items, code} -> preview a discount code
  GET|POST /unsubscribe  ?s=siteId&c=customerId&t=token   one-click unsubscribe from marketing email
  GET /feed.xml?site=ID  product feed for Google Merchant Center (free listings), TikTok, Pinterest, Meta
  (optional on any cart route: discountCode, acceptsMarketing)

Prices, stock and currency are always read from Appwrite, never from the browser.
Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV (sandbox|live),
     SHIP_TO_COUNTRIES (optional, e.g. "US,CA"), ALLOWED_RETURN_HOSTS (optional extra hosts for redirect URLs),
     RESEND_API_KEY (order emails; only sent once the site's email setup is verified),
     CHECKOUT_PUBLIC_URL (this function's public domain; download links point here),
     APPWRITE_PUBLIC_ENDPOINT (optional; the Appwrite endpoint buyers' browsers download files from)
"""
import datetime as dt
import html
import re
import json
import os
import sys
from urllib.parse import urlparse

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import downloads  # noqa: E402
import emails  # noqa: E402
import feed  # noqa: E402
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


def _complete(req, store, result, log=print):
    """After a NEW paid order: email the customer a receipt and alert the owner. Never fails the payment."""
    order = result.pop("_order", None)
    if not order:
        return result
    try:
        site = store.site(order["siteId"])
        if not emails.can_send(site):
            return result
        sent = []
        # Orders with downloads always get a receipt: it's how the buyer gets their files again later.
        if (emails.get(site, "emailReceipts") is not False or order.get("downloads")) and order.get("customerEmail"):
            emails.send(site, order["customerEmail"], *emails.order_receipt(site, order, order.get("downloads")),
                        idempotency_key=f"receipt-{order['$id']}")
            sent.append("receipt")
        if emails.get(site, "emailOwnerAlerts") is not False:
            emails.send(site, emails.get(site, "ownerEmail"), *emails.owner_new_order(site, order), idempotency_key=f"alert-{order['$id']}")
            sent.append("owner")
        result["emailed"] = sent
    except Exception as e:  # noqa: BLE001 - the payment already succeeded
        log(f"order email failed for {order.get('$id')}: {e!r}")
    return result


def _safe_url(url, site, field):
    """Only redirect back to the store's own domain (or explicitly allowed hosts) to prevent open redirects."""
    if not url:
        raise HttpError(f"Missing {field}")
    host = (urlparse(url).hostname or "").lower()
    domain = (a(site, "domain") or "").lower()
    if not domain:
        raise HttpError("This store doesn't have a URL yet. Add one in its store settings.", 409)
    allowed = {domain, f"www.{domain}", *[h.strip().lower() for h in os.environ.get("ALLOWED_RETURN_HOSTS", "").split(",") if h.strip()]}
    if urlparse(url).scheme not in ("https", "http") or not (host in allowed or host.endswith("." + domain) or host == "localhost"):
        raise HttpError(f"{field} must be on {domain}")
    return url


# ---------------------------------------------------------------------------- routes
def config(req):
    return {"stripe": bool(os.environ.get("STRIPE_SECRET_KEY")),
            "paypal": bool(os.environ.get("PAYPAL_CLIENT_ID") and os.environ.get("PAYPAL_CLIENT_SECRET")),
            "free": True, "downloads": bool(downloads.base_url())}


def discount_preview(req):
    b, store = _json(req), _store(req)
    site = store.site(str(b.get("siteId", "")))
    cart = store.price_cart(a(site, "$id"), b.get("items"), b.get("code") or b.get("discountCode"))
    return {"subtotal": cart["subtotal"], "discount": cart["discount"], "total": cart["total"]}


def _paid_cart(store, site, b):
    cart = store.price_cart(a(site, "$id"), b.get("items"), b.get("discountCode"))
    if cart["total"] <= 0:
        raise HttpError("This order is free, so there's nothing to pay. Use free checkout instead.", 409)
    return cart


def _with_params(url, **params):
    from urllib.parse import urlencode
    return url + ("&" if "?" in url else "?") + urlencode(params)


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def free_checkout(req):
    """$0 carts: no payment provider involved. The buyer's email is required (that's where their order and downloads go)."""
    b, store = _json(req), _store(req)
    site = store.site(str(b.get("siteId", "")))
    email = str(b.get("email") or "").strip().lower()
    if not EMAIL_RE.match(email) or len(email) > 255:
        raise HttpError("Enter your email address to get your order")
    success = _safe_url(b.get("successUrl"), site, "successUrl") if b.get("successUrl") else None
    cart = store.price_cart(a(site, "$id"), b.get("items"), b.get("discountCode"))
    if cart["total"] > 0:
        raise HttpError("This order isn't free. Choose a payment method.", 409)
    if sum(l["quantity"] for l in cart["lines"]) > 10:
        raise HttpError("Free orders are limited to 10 items", 409)
    free_ids = {l["productId"] for l in cart["lines"]}
    if not cart["discount"] and store.already_claimed(a(site, "$id"), email, free_ids):
        raise HttpError("You've already got this. Check your email for your order, or reply to it if you can't find it.", 409)
    checkout_id, key = store.create_checkout(a(site, "$id"), "free", cart, a(site, "currency") or "USD", email, b.get("acceptsMarketing"))
    name = str(b.get("name") or "").strip()[:128] or None
    result = _complete(req, store, store.finalize(checkout_id, "free", f"free-{checkout_id}", email, name, 0))
    if success:
        result["url"] = _with_params(success, checkout=checkout_id, key=key)
    return {**result, "checkoutId": checkout_id, "key": key}


def order_status(req):
    b = _json(req)
    return _store(req).order_status(str(b.get("checkoutId") or ""), str(b.get("key") or ""))


DOWNLOAD_PAGE = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="robots" content="noindex"><title>{title}</title></head>
<body style="font-family:system-ui,sans-serif;background:#f4f4f5;margin:0;display:grid;place-items:center;min-height:100vh;color:#18181b">
<div style="background:#fff;padding:32px;border-radius:12px;max-width:420px;width:calc(100% - 64px);text-align:center">
<h1 style="font-size:20px;margin:0 0 8px;word-break:break-word">{title}</h1><p style="color:#52525b;margin:0 0 20px">{body}</p>{action}</div></body></html>"""


def _size(n):
    n = float(n or 0)
    for unit in ("bytes", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "bytes" else f"{n:.1f} {unit}"
        n /= 1024


def download(req):
    """GET shows the file and a button (so email link-scanners don't use up downloads); POST counts it and sends the file."""
    q = getattr(req, "query", None) or {}
    token = str(q.get("t") or "")
    store = _store(req)
    row = downloads.by_token(store.db, token)
    order = None
    if row:
        try:
            order = store.db.get_row(store_db(), "orders", a(row, "orderId"))
        except Exception:  # noqa: BLE001 - order deleted
            row = None
    why = downloads.problem(row, order)
    if why:
        return ("html", 410 if row else 404, DOWNLOAD_PAGE.format(title="Download unavailable", body=html.escape(why), action=""))
    if req.method != "POST":
        left = f" · {a(row, 'maxDownloads') - (a(row, 'downloadCount') or 0)} downloads left" if a(row, "maxDownloads") else ""
        action = (f'<form method="post" action="?t={html.escape(token)}"><button style="background:#18181b;color:#fff;border:0;border-radius:8px;'
                  f'padding:12px 24px;font-size:16px;cursor:pointer">Download</button></form>')
        return ("html", 200, DOWNLOAD_PAGE.format(title=html.escape(a(row, "name") or "Your download"),
                                                  body=f"{_size(a(row, 'size'))}{left}", action=action))
    from appwrite.client import Client
    from appwrite.exception import AppwriteException
    from appwrite.services.tokens import Tokens
    try:  # atomic: two quick clicks can't go past the limit
        kw = {"max": a(row, "maxDownloads")} if a(row, "maxDownloads") else {}
        store.db.increment_row_column(store_db(), "downloads", a(row, "$id"), "downloadCount", 1, **kw)
    except AppwriteException:
        return ("html", 410, DOWNLOAD_PAGE.format(title="Download unavailable", body=html.escape(downloads.problem({"maxDownloads": 1, "downloadCount": 1})), action=""))
    store.db.update_row(store_db(), "downloads", a(row, "$id"), {"lastDownloadAt": dt.datetime.now(dt.timezone.utc).isoformat()})
    key = _headers(req).get("x-appwrite-key") or os.environ.get("APPWRITE_API_KEY")
    endpoint = os.environ["APPWRITE_FUNCTION_API_ENDPOINT"]
    project = os.environ["APPWRITE_FUNCTION_PROJECT_ID"]
    tokens = Tokens(Client().set_endpoint(endpoint).set_project(project).set_key(key))
    expire = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=10)).isoformat()
    secret = a(tokens.create_file_token(downloads.BUCKET, a(row, "fileId"), expire=expire), "secret")
    public = (os.environ.get("APPWRITE_PUBLIC_ENDPOINT") or endpoint).rstrip("/")
    return ("redirect", 303, f"{public}/storage/buckets/{downloads.BUCKET}/files/{a(row, 'fileId')}/download?project={project}&token={secret}")


def stripe_session(req):
    b, store = _json(req), _store(req)
    site = store.site(str(b.get("siteId", "")))
    success = _safe_url(b.get("successUrl"), site, "successUrl")
    cancel = _safe_url(b.get("cancelUrl"), site, "cancelUrl")
    cart = _paid_cart(store, site, b)
    currency = a(site, "currency") or "USD"
    checkout_id, key = store.create_checkout(a(site, "$id"), "stripe", cart, currency, b.get("email"), b.get("acceptsMarketing"))
    session_id, url = payments.stripe_session(checkout_id, cart["lines"], currency, _with_params(success, checkout=checkout_id, key=key),
                                              cancel, b.get("email"), a(site, "name"), cart["discount"])
    store.set_checkout_ref(checkout_id, session_id)
    return {"url": url, "checkoutId": checkout_id, "key": key}


def stripe_webhook(req):
    raw = _raw(req)
    payments.verify_stripe_signature(raw, _headers(req).get("stripe-signature"), payments.env("STRIPE_WEBHOOK_SECRET"))
    event = json.loads(raw)
    if event.get("type") == "checkout.session.expired":
        s = event["data"]["object"]
        cid = s.get("client_reference_id") or (s.get("metadata") or {}).get("checkoutId")
        if cid:
            _store(req).expire_checkout(cid, (s.get("customer_details") or {}).get("email"))
        return {"received": True, "expired": cid}
    if event.get("type") not in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        return {"received": True, "ignored": event.get("type")}
    s = event["data"]["object"]
    if s.get("payment_status") != "paid":
        return {"received": True, "pending": True}  # e.g. bank debits; async_payment_succeeded follows
    checkout_id = s.get("client_reference_id") or (s.get("metadata") or {}).get("checkoutId")
    if not checkout_id:
        return {"received": True, "ignored": "not a Yancey checkout"}
    details = s.get("customer_details") or {}
    store = _store(req)
    result = store.finalize(checkout_id, "stripe", s.get("payment_intent") or s["id"],
                            details.get("email") or s.get("customer_email"), details.get("name"), s["amount_total"] / 100)
    return {"received": True, **_complete(req, store, result)}


def paypal_create(req):
    b, store = _json(req), _store(req)
    site = store.site(str(b.get("siteId", "")))
    ret = _safe_url(b.get("returnUrl"), site, "returnUrl")
    cancel = _safe_url(b.get("cancelUrl"), site, "cancelUrl")
    cart = _paid_cart(store, site, b)
    currency = a(site, "currency") or "USD"
    checkout_id, key = store.create_checkout(a(site, "$id"), "paypal", cart, currency, b.get("email"), b.get("acceptsMarketing"))
    order_id, url = payments.paypal_create(checkout_id, cart["lines"], cart["total"], currency, ret, cancel, a(site, "name"),
                                           cart["subtotal"], cart["discount"])
    store.set_checkout_ref(checkout_id, order_id)
    return {"url": url, "paypalOrderId": order_id, "checkoutId": checkout_id, "key": key}


def paypal_capture(req):
    b = _json(req)
    order_id = str(b.get("paypalOrderId") or b.get("token") or "")
    if not order_id:
        raise HttpError("Missing paypalOrderId")
    checkout_id, capture_id, amount, email, name = payments.paypal_capture(order_id)
    store = _store(req)
    return _complete(req, store, store.finalize(checkout_id, "paypal", capture_id, email, name, amount))


UNSUB_PAGE = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>{title}</title></head><body style="font-family:system-ui,sans-serif;background:#f4f4f5;margin:0;display:grid;place-items:center;min-height:100vh">
<div style="background:#fff;padding:32px;border-radius:12px;max-width:420px;text-align:center"><h1 style="font-size:20px">{title}</h1>
<p style="color:#52525b">{body}</p></div></body></html>"""


def unsubscribe(req):
    q = getattr(req, "query", None) or {}
    b = {**q, **(_json(req) if req.method == "POST" and _raw(req).strip().startswith("{") else {})}
    site_id, customer_id, token = str(b.get("s", "")), str(b.get("c", "")), str(b.get("t", ""))
    if not (site_id and customer_id and emails.check_unsubscribe_token(customer_id, token)):
        return ("html", 400, UNSUB_PAGE.format(title="Link not valid", body="This unsubscribe link is invalid or incomplete."))
    _store(req).unsubscribe(site_id, customer_id)
    return ("html", 200, UNSUB_PAGE.format(title="You're unsubscribed", body="You won't receive marketing emails from this store any more. Order receipts still arrive as usual."))


def product_feed(req):
    q = getattr(req, "query", None) or {}
    store = _store(req)
    site = store.site(str(q.get("site", "")))
    from appwrite.query import Query
    products, cursor = [], None
    while True:
        page = store.db.list_rows(store_db(), "products", queries=[Query.equal("siteId", a(site, "$id")), Query.limit(100)]
                                  + ([Query.cursor_after(cursor)] if cursor else [])).rows
        products += page
        if len(page) < 100:
            break
        cursor = a(page[-1], "$id")
    xml, count, skipped = feed.build(site, products)
    if q.get("format") == "summary":
        return {"products": count, "skippedNoImage": skipped}
    return ("xml", 200, xml)


def store_db():
    from store import DB
    return DB


ROUTES = {
    "/config": config,
    "/feed.xml": product_feed,
    "/discount": discount_preview,
    "/unsubscribe": unsubscribe,
    "/free/checkout": free_checkout,
    "/order": order_status,
    "/download": download,
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
        out = handler(context.req)
        if isinstance(out, tuple) and out[0] == "redirect":
            return context.res.redirect(out[2], out[1])
        if isinstance(out, tuple) and out[0] in ("html", "xml"):
            ctype = "text/html; charset=utf-8" if out[0] == "html" else "application/xml; charset=utf-8"
            cache = "public, max-age=900" if out[0] == "xml" else "no-store"
            return context.res.text(out[2], out[1], {"content-type": ctype, "cache-control": cache})
        return context.res.json(out)
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
