"""
checkout: PUBLIC Appwrite Function your storefronts call to take payments.

  POST /stripe/session   {siteId, items:[{productId, quantity}], successUrl, cancelUrl, email?} -> {url}
  POST /stripe/webhook   Stripe calls this (checkout.session.completed / async_payment_succeeded)
  POST /paypal/create    {siteId, items, returnUrl, cancelUrl}                                 -> {url, paypalOrderId}
  POST /paypal/capture   {paypalOrderId}  called from your return page                        -> {orderId, number}
  POST /config           {siteId} -> which providers are enabled (so storefronts can show the right buttons)
  POST /discount         {siteId, items, code} -> preview a discount code
  GET|POST /unsubscribe  ?s=siteId&c=customerId&t=token   one-click unsubscribe from marketing email
  GET /feed.xml?site=ID  product feed for Google Merchant Center (free listings), TikTok, Pinterest, Meta
  GET /download?token=T  confirmation page for a paid digital download (email links land here)
  POST /download         token=T (form): checks the link, uses one download, redirects to a 5-minute private R2 URL
  (optional on any cart route: discountCode, acceptsMarketing)

Prices, stock and currency are always read from Appwrite, never from the browser.
Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV (sandbox|live),
     SHIP_TO_COUNTRIES (optional, e.g. "US,CA"), ALLOWED_RETURN_HOSTS (optional extra hosts for redirect URLs),
     RESEND_API_KEY (order emails; only sent once the site's email setup is verified),
     DOWNLOAD_LINK_SECRET (signs download links; 16+ random characters), CHECKOUT_PUBLIC_URL,
     R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (private storage for download files)
Stripe webhook events: checkout.session.completed, checkout.session.async_payment_succeeded,
     checkout.session.expired, charge.refunded (refunds made in Stripe revoke download links)
"""
import datetime as dt
import html
import json
import os
import sys
from urllib.parse import parse_qs, urlparse

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import downloads as dl  # noqa: E402
import emails  # noqa: E402
import feed  # noqa: E402
import payments  # noqa: E402
import r2  # noqa: E402
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
        if emails.get(site, "emailReceipts") is not False and order.get("customerEmail"):
            emails.send(site, order["customerEmail"], *emails.order_receipt(site, order), idempotency_key=f"receipt-{order['$id']}")
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
            "paypal": bool(os.environ.get("PAYPAL_CLIENT_ID") and os.environ.get("PAYPAL_CLIENT_SECRET"))}


def discount_preview(req):
    b, store = _json(req), _store(req)
    site = store.site(str(b.get("siteId", "")))
    cart = store.price_cart(a(site, "$id"), b.get("items"), b.get("code") or b.get("discountCode"))
    return {"subtotal": cart["subtotal"], "discount": cart["discount"], "total": cart["total"]}


def stripe_session(req):
    b, store = _json(req), _store(req)
    site = store.site(str(b.get("siteId", "")))
    success = _safe_url(b.get("successUrl"), site, "successUrl")
    cancel = _safe_url(b.get("cancelUrl"), site, "cancelUrl")
    cart = store.price_cart(a(site, "$id"), b.get("items"), b.get("discountCode"))
    currency = a(site, "currency") or "USD"
    checkout_id = store.create_checkout(a(site, "$id"), "stripe", cart, currency, b.get("email"), b.get("acceptsMarketing"))
    sep = "&" if "?" in success else "?"
    session_id, url = payments.stripe_session(checkout_id, cart["lines"], currency, f"{success}{sep}checkout={checkout_id}",
                                              cancel, b.get("email"), a(site, "name"), cart["discount"])
    store.set_checkout_ref(checkout_id, session_id)
    return {"url": url, "checkoutId": checkout_id}


def stripe_webhook(req):
    raw = _raw(req)
    payments.verify_stripe_signature(raw, _headers(req).get("stripe-signature"), payments.env("STRIPE_WEBHOOK_SECRET"))
    event = json.loads(raw)
    if event.get("type") == "charge.refunded":
        c = event["data"]["object"]
        ref = c.get("payment_intent") or c.get("id")
        full = bool(c.get("refunded")) or c.get("amount_refunded", 0) >= c.get("amount", 0)
        order_id = _store(req).refund_by_payment_ref(ref, c.get("amount_refunded", 0) / 100, full) if ref else None
        return {"received": True, "refunded": order_id}
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
    cart = store.price_cart(a(site, "$id"), b.get("items"), b.get("discountCode"))
    currency = a(site, "currency") or "USD"
    checkout_id = store.create_checkout(a(site, "$id"), "paypal", cart, currency, b.get("email"), b.get("acceptsMarketing"))
    order_id, url = payments.paypal_create(checkout_id, cart["lines"], cart["total"], currency, ret, cancel, a(site, "name"),
                                           cart["subtotal"], cart["discount"])
    store.set_checkout_ref(checkout_id, order_id)
    return {"url": url, "paypalOrderId": order_id, "checkoutId": checkout_id}


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


DOWNLOAD_MESSAGES = {
    "invalid": ("Link not valid", "This download link is invalid or incomplete. Use the link in your receipt email."),
    "unpaid": ("Payment not complete", "This order hasn't been paid yet, so the download isn't available."),
    "expired": ("Link expired", "This download link has expired. Reply to your receipt email and we'll send a new one."),
    "used": ("Download limit reached", "This link has been used the maximum number of times. Reply to your receipt email for a new one."),
    "replaced": ("Link replaced", "A newer download link was sent for this item. Use the most recent email from the store."),
    "revoked": ("Link no longer active", "This order was refunded, so its download links have been turned off."),
    "nofile": ("Download coming soon", "The file for this item isn't ready yet. Reply to your receipt email and we'll send it as soon as it is."),
}
DOWNLOAD_PAGE = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="robots" content="noindex"><title>{title}</title></head>
<body style="font-family:system-ui,sans-serif;background:#f4f4f5;margin:0;display:grid;place-items:center;min-height:100vh">
<div style="background:#fff;padding:32px;border-radius:12px;max-width:440px;text-align:center"><h1 style="font-size:20px">{title}</h1>
<p style="color:#52525b">{body}</p>{form}</div></body></html>"""


def _download_page(status, info, token=None):
    if status != 200:
        title, body = DOWNLOAD_MESSAGES[info.get("reason", "invalid")]
        return ("html", status, DOWNLOAD_PAGE.format(title=html.escape(title), body=html.escape(body), form=""))
    left = info["remaining"]
    until = dt.datetime.fromtimestamp(info["expiresAt"], dt.timezone.utc).strftime("%B %-d, %Y")
    body = (f"{html.escape(info['title'] or 'Your download')}"
            f"{' (' + html.escape(info['name']) + ')' if info.get('name') else ''}. "
            f"{left} download{'s' if left != 1 else ''} left on this link, valid until {until}.")
    form = ('<form method="post" action="download"><input type="hidden" name="token" value="' + html.escape(token, quote=True) + '">'
            '<button style="background:#18181b;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:15px;cursor:pointer">'
            'Download</button></form>')
    return ("html", 200, DOWNLOAD_PAGE.format(title="Your download", body=body, form=form))


def download(req):
    """GET shows a confirmation page (so email link scanners can't use up downloads); POST uses one download and
    redirects to a short-lived private R2 URL. Never logs the token or the storage URL."""
    store = _store(req)
    if req.method == "GET":
        token = str((getattr(req, "query", None) or {}).get("token") or "")
        status, info = store.check_download(token)
        return _download_page(status, info, token)
    raw = _raw(req)
    try:
        body = json.loads(raw) if raw.strip().startswith("{") else {k: v[0] for k, v in parse_qs(raw).items()}
    except ValueError:
        body = {}
    token = str(body.get("token") or "")
    status, info = store.check_download(token)
    if status != 200:
        return _download_page(status, info)
    if not store.count_download(info["record"]):
        return _download_page(410, {"reason": "used"})
    try:
        url = r2.download_url(info["siteId"], info["fileId"], info.get("name") or info["title"])
    except r2.NotConfigured as e:
        raise HttpError(str(e), 500)
    return ("redirect", 303, url)


def store_db():
    from store import DB
    return DB


ROUTES = {
    "/config": config,
    "/feed.xml": product_feed,
    "/discount": discount_preview,
    "/unsubscribe": unsubscribe,
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
            return context.res.redirect(out[2], out[1], {"cache-control": "no-store", "referrer-policy": "no-referrer"})
        if isinstance(out, tuple) and out[0] in ("html", "xml"):
            ctype = "text/html; charset=utf-8" if out[0] == "html" else "application/xml; charset=utf-8"
            cache = "public, max-age=900" if out[0] == "xml" else "no-store"
            return context.res.text(out[2], out[1], {"content-type": ctype, "cache-control": cache, "referrer-policy": "no-referrer"})
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
