"""
Transactional email via Resend (free tier: 3,000 emails/month).

NOTE: this file is duplicated in appwrite/functions/checkout/src/emails.py and
appwrite/functions/site-ops/src/emails.py (each Appwrite function deploys its own folder).
Edit one, then copy it over the other.

Nothing is sent unless the site's email setup is complete (see can_send).
"""
import html
import os

import requests

from errors import HttpError

API = "https://api.resend.com"


def resend(method, path, json=None, idempotency_key=None):
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        raise HttpError("RESEND_API_KEY is not set on this function", 500)
    headers = {"Authorization": f"Bearer {key}"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key[:256]
    r = requests.request(method, API + path, json=json, headers=headers, timeout=20)
    body = r.json() if r.content else {}
    if not r.ok:
        raise HttpError(f"Resend: {body.get('message') or r.text[:200]}", 502)
    return body


# --------------------------------------------------------------------------- gating
def get(site, key):
    if isinstance(site, dict):
        return site.get(key)
    data = getattr(site, "data", None)
    return data.get(key) if isinstance(data, dict) else getattr(site, key, None)


def can_send(site):
    """Emails go out only after the owner gave their email and the sending domain is verified."""
    return bool(get(site, "ownerEmail") and get(site, "senderAddress") and get(site, "emailStatus") == "verified"
                and os.environ.get("RESEND_API_KEY"))


def sender(site):
    name = (get(site, "senderName") or get(site, "name") or "").replace('"', "").strip()
    return f"{name} <{get(site, 'senderAddress')}>" if name else get(site, "senderAddress")


def send(site, to, subject, body_html, text, idempotency_key=None):
    payload = {"from": sender(site), "to": [to], "subject": subject, "html": body_html, "text": text}
    if get(site, "ownerEmail"):
        payload["reply_to"] = get(site, "ownerEmail")
    return resend("POST", "/emails", payload, idempotency_key)


# --------------------------------------------------------------------------- templates
def _money(v, currency):
    sym = {"USD": "$", "CAD": "$", "AUD": "$", "EUR": "€", "GBP": "£"}.get((currency or "USD").upper(), "")
    return f"{sym}{float(v):,.2f}" + ("" if sym else f" {currency}")


def _layout(site, heading, intro, items, total, currency, footer):
    e = html.escape
    rows = "".join(
        f'<tr><td style="padding:6px 0">{e(str(i["quantity"]))} × {e(i["title"])}</td>'
        f'<td style="padding:6px 0;text-align:right">{_money(i["price"] * i["quantity"], currency)}</td></tr>' for i in items)
    total_row = (f'<tr><td style="padding:8px 0;border-top:1px solid #e4e4e7"><strong>Total</strong></td>'
                 f'<td style="padding:8px 0;border-top:1px solid #e4e4e7;text-align:right"><strong>{_money(total, currency)}</strong></td></tr>') if total is not None else ""
    store = e(get(site, "senderName") or get(site, "name") or "")
    domain = e(get(site, "domain") or "")
    return f"""<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
<div style="max-width:520px;margin:0 auto;padding:24px">
  <div style="font-weight:700;font-size:18px;margin-bottom:16px">{store}</div>
  <div style="background:#fff;border-radius:12px;padding:24px">
    <h1 style="font-size:20px;margin:0 0 8px">{e(heading)}</h1>
    <p style="margin:0 0 16px;color:#52525b">{intro}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">{rows}{total_row}</table>
  </div>
  <p style="font-size:12px;color:#71717a;margin-top:16px">{footer} <a href="https://{domain}" style="color:#71717a">{domain}</a></p>
</div></body></html>"""


def _text(heading, intro, items, total, currency):
    lines = [heading, "", intro, ""] + [f"{i['quantity']} x {i['title']}  {_money(i['price'] * i['quantity'], currency)}" for i in items]
    if total is not None:
        lines += ["", f"Total: {_money(total, currency)}"]
    return "\n".join(lines)


def order_receipt(site, order):
    cur = get(site, "currency") or "USD"
    heading = f"Thanks for your order #{order['number']}"
    intro = f"Hi {html.escape(order.get('customerName') or 'there')}, we've received your payment and are getting your order ready."
    return (f"Order #{order['number']} confirmed",
            _layout(site, heading, intro, order["items"], order["total"], cur, "Questions? Just reply to this email."),
            _text(heading, intro, order["items"], order["total"], cur))


def order_shipped(site, order, tracking=None):
    cur = get(site, "currency") or "USD"
    heading = f"Your order #{order['number']} is on its way"
    intro = "Good news: your order has shipped."
    if tracking:
        intro += f" Tracking: {html.escape(tracking)}"
    return (f"Order #{order['number']} has shipped",
            _layout(site, heading, intro, order["items"], None, cur, "Questions? Just reply to this email."),
            _text(heading, intro, order["items"], None, cur))


def owner_new_order(site, order):
    cur = get(site, "currency") or "USD"
    heading = f"New order #{order['number']}: {_money(order['total'], cur)}"
    intro = f"{html.escape(order.get('customerName') or '')} ({html.escape(order.get('customerEmail') or 'no email')}) paid via {html.escape(order.get('paymentProvider') or 'checkout')}."
    return (heading, _layout(site, heading, intro, order["items"], order["total"], cur, "Sent by Sellify for"),
            _text(heading, intro, order["items"], order["total"], cur))


def test_email(site):
    heading = "Email is set up 🎉"
    intro = "This is a test from Sellify. Order receipts and alerts for this store will look like this."
    sample = [{"title": "Sample product", "quantity": 1, "price": 10}]
    cur = get(site, "currency") or "USD"
    return ("Sellify test email", _layout(site, heading, intro, sample, 10, cur, "Sent by Sellify for"),
            _text(heading, intro, sample, 10, cur))
