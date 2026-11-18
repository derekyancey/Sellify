"""Stripe (cards, Apple Pay, Google Pay via Checkout) and PayPal (Orders v2) over plain HTTPS."""
import hashlib
import hmac
import os
import time

import requests

from errors import HttpError

TIMEOUT = 20


def env(name):
    v = os.environ.get(name)
    if not v:
        raise HttpError(f"{name} is not set on the checkout function", 500)
    return v


def cents(amount):
    return int(round(float(amount) * 100))


# ============================================================================ Stripe
def stripe(method, path, data=None):
    r = requests.request(method, f"https://api.stripe.com/v1{path}", auth=(env("STRIPE_SECRET_KEY"), ""), data=data, timeout=TIMEOUT)
    body = r.json()
    if not r.ok:
        raise HttpError(f"Stripe: {body.get('error', {}).get('message', r.text[:200])}", 502)
    return body


def stripe_session(checkout_id, lines, currency, success_url, cancel_url, email=None, store_name=None):
    """Hosted Stripe Checkout. Apple Pay / Google Pay appear automatically when enabled in the Stripe dashboard."""
    data = {
        "mode": "payment",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "client_reference_id": checkout_id,
        "metadata[checkoutId]": checkout_id,
        "payment_intent_data[metadata][checkoutId]": checkout_id,
        "billing_address_collection": "auto",
        "expires_at": int(time.time()) + 60 * 60,
    }
    if store_name:
        data["payment_intent_data[description]"] = f"{store_name} order"
    if email:
        data["customer_email"] = email
    countries = [c.strip().upper() for c in os.environ.get("SHIP_TO_COUNTRIES", "").split(",") if c.strip()]
    for i, c in enumerate(countries):
        data[f"shipping_address_collection[allowed_countries][{i}]"] = c
    for i, l in enumerate(lines):
        p = f"line_items[{i}]"
        data[f"{p}[quantity]"] = l["quantity"]
        data[f"{p}[price_data][currency]"] = currency.lower()
        data[f"{p}[price_data][unit_amount]"] = cents(l["price"])
        data[f"{p}[price_data][product_data][name]"] = l["title"]
        if l.get("imageUrl", "") and str(l["imageUrl"]).startswith("https://"):
            data[f"{p}[price_data][product_data][images][0]"] = l["imageUrl"]
    s = stripe("POST", "/checkout/sessions", data)
    return s["id"], s["url"]


def verify_stripe_signature(payload: str, header: str, secret: str, tolerance=300):
    """Stripe-Signature: t=<ts>,v1=<hex hmac>[,v1=...]  over "<ts>.<raw body>"."""
    parts = [p.split("=", 1) for p in (header or "").split(",") if "=" in p]
    ts = next((v for k, v in parts if k == "t"), None)
    sigs = [v for k, v in parts if k == "v1"]
    if not ts or not sigs:
        raise HttpError("Missing Stripe signature", 400)
    if abs(time.time() - int(ts)) > tolerance:
        raise HttpError("Stripe signature too old", 400)
    expected = hmac.new(secret.encode(), f"{ts}.{payload}".encode(), hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, s) for s in sigs):
        raise HttpError("Invalid Stripe signature", 400)


# ============================================================================ PayPal
def paypal_base():
    return "https://api-m.paypal.com" if os.environ.get("PAYPAL_ENV", "sandbox") == "live" else "https://api-m.sandbox.paypal.com"


_token = {"value": None, "exp": 0}


def paypal_token():
    if _token["value"] and _token["exp"] > time.time() + 60:
        return _token["value"]
    r = requests.post(f"{paypal_base()}/v1/oauth2/token", auth=(env("PAYPAL_CLIENT_ID"), env("PAYPAL_CLIENT_SECRET")),
                      data={"grant_type": "client_credentials"}, timeout=TIMEOUT)
    if not r.ok:
        raise HttpError("PayPal: could not authenticate (check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_ENV)", 502)
    body = r.json()
    _token.update(value=body["access_token"], exp=time.time() + int(body.get("expires_in", 300)))
    return _token["value"]


def paypal(method, path, json=None, idempotency_key=None):
    headers = {"Authorization": f"Bearer {paypal_token()}", "Content-Type": "application/json"}
    if idempotency_key:
        headers["PayPal-Request-Id"] = idempotency_key
    r = requests.request(method, paypal_base() + path, json=json, headers=headers, timeout=TIMEOUT)
    body = r.json() if r.content else {}
    if not r.ok:
        detail = (body.get("details") or [{}])[0].get("description") or body.get("message") or r.text[:200]
        raise HttpError(f"PayPal: {detail}", 502)
    return body


def money(v, currency):
    return {"currency_code": currency.upper(), "value": f"{float(v):.2f}"}


def paypal_create(checkout_id, lines, total, currency, return_url, cancel_url, store_name=None):
    order = paypal("POST", "/v2/checkout/orders", idempotency_key=f"create-{checkout_id}", json={
        "intent": "CAPTURE",
        "purchase_units": [{
            "reference_id": checkout_id,
            "custom_id": checkout_id,
            "amount": {**money(total, currency), "breakdown": {"item_total": money(total, currency)}},
            "items": [{"name": l["title"][:127], "quantity": str(l["quantity"]), "unit_amount": money(l["price"], currency)} for l in lines],
        }],
        "payment_source": {"paypal": {"experience_context": {
            **({"brand_name": store_name[:127]} if store_name else {}), "user_action": "PAY_NOW",
            "return_url": return_url, "cancel_url": cancel_url,
            "shipping_preference": "GET_FROM_FILE" if os.environ.get("SHIP_TO_COUNTRIES") else "NO_SHIPPING",
        }}},
    })
    approve = next((l["href"] for l in order.get("links", []) if l["rel"] in ("payer-action", "approve")), None)
    return order["id"], approve


def paypal_capture(order_id):
    """Capture an approved PayPal order. Returns (checkout_id, capture_id, amount, email, name)."""
    try:
        o = paypal("POST", f"/v2/checkout/orders/{order_id}/capture", idempotency_key=f"capture-{order_id}", json={})
    except HttpError:
        o = paypal_get(order_id)  # e.g. ORDER_ALREADY_CAPTURED when the buyer reloads the return page
    if o.get("status") != "COMPLETED":
        raise HttpError(f"PayPal payment not completed ({o.get('status')})", 402)
    unit = o["purchase_units"][0]
    cap = unit["payments"]["captures"][0]
    payer = o.get("payer", {})
    name = " ".join(filter(None, [payer.get("name", {}).get("given_name"), payer.get("name", {}).get("surname")]))
    checkout_id = cap.get("custom_id") or unit.get("custom_id") or unit.get("reference_id")
    return checkout_id, cap["id"], float(cap["amount"]["value"]), payer.get("email_address"), name


def paypal_get(order_id):
    return paypal("GET", f"/v2/checkout/orders/{order_id}")
