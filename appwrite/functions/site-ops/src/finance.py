"""
Payment-processor numbers for the Finance page (read-only): Stripe balance, fees, refunds and payouts, and
PayPal balances and fees. These are account-wide (one Stripe/PayPal account serves every store); per-store
sales come from Yancey's own orders in the dashboard.
"""
import datetime as dt
import os

import requests

from errors import HttpError

TIMEOUT = 20


def _stripe(path, params=None):
    r = requests.get(f"https://api.stripe.com/v1{path}", auth=(os.environ["STRIPE_SECRET_KEY"], ""), params=params, timeout=TIMEOUT)
    body = r.json()
    if not r.ok:
        raise HttpError(f"Stripe: {body.get('error', {}).get('message', r.text[:200])}", 502)
    return body


def stripe_summary(days, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    since = int((now - dt.timedelta(days=days)).timestamp())
    bal = _stripe("/balance")
    totals = {}  # per currency
    params = {"limit": 100, "created[gte]": since}
    for _ in range(20):  # up to 2,000 transactions
        page = _stripe("/balance_transactions", params)
        for t in page["data"]:
            c = totals.setdefault(t["currency"].upper(), {"gross": 0, "fees": 0, "refunds": 0, "net": 0, "payouts": 0})
            if t["type"] in ("charge", "payment"):
                c["gross"] += t["amount"]
            elif t["type"] in ("refund", "payment_refund"):
                c["refunds"] += -t["amount"]
            elif t["type"] == "payout":
                c["payouts"] += -t["amount"]
            if t["type"] != "payout":
                c["fees"] += t["fee"]
                c["net"] += t["net"]
        if not page.get("has_more"):
            break
        params["starting_after"] = page["data"][-1]["id"]
    payouts = _stripe("/payouts", {"limit": 10})["data"]
    to_money = lambda cents: round(cents / 100, 2)
    return {
        "available": [{"currency": b["currency"].upper(), "amount": to_money(b["amount"])} for b in bal.get("available", [])],
        "pending": [{"currency": b["currency"].upper(), "amount": to_money(b["amount"])} for b in bal.get("pending", [])],
        "period": {cur: {k: to_money(v) for k, v in vals.items()} for cur, vals in totals.items()},
        "payouts": [{"id": p["id"], "amount": to_money(p["amount"]), "currency": p["currency"].upper(), "status": p["status"],
                     "arrival": dt.datetime.fromtimestamp(p["arrival_date"], dt.timezone.utc).date().isoformat()} for p in payouts],
    }


def _paypal_base():
    return "https://api-m.paypal.com" if os.environ.get("PAYPAL_ENV", "sandbox") == "live" else "https://api-m.sandbox.paypal.com"


def paypal_summary(days, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    tok = requests.post(f"{_paypal_base()}/v1/oauth2/token", auth=(os.environ["PAYPAL_CLIENT_ID"], os.environ["PAYPAL_CLIENT_SECRET"]),
                        data={"grant_type": "client_credentials"}, timeout=TIMEOUT)
    if not tok.ok:
        raise HttpError("PayPal: could not authenticate", 502)
    h = {"Authorization": f"Bearer {tok.json()['access_token']}"}

    def get(path, params):
        r = requests.get(_paypal_base() + path, headers=h, params=params, timeout=TIMEOUT)
        body = r.json() if r.content else {}
        if not r.ok:
            raise HttpError(f"PayPal: {body.get('message') or body.get('name') or r.text[:200]}", 502)
        return body

    balances = get("/v1/reporting/balances", {"as_of_time": now.strftime("%Y-%m-%dT%H:%M:%SZ")}).get("balances", [])
    totals = {}
    start = now - dt.timedelta(days=days)
    while start < now:  # PayPal allows at most 31 days per request
        end = min(start + dt.timedelta(days=31), now)
        page = 1
        while True:
            d = get("/v1/reporting/transactions", {"start_date": start.strftime("%Y-%m-%dT%H:%M:%SZ"), "end_date": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                                                   "fields": "transaction_info", "page_size": 500, "page": page})
            for t in d.get("transaction_details", []):
                info = t.get("transaction_info", {})
                amt = info.get("transaction_amount") or {}
                cur, val = amt.get("currency_code", "USD"), float(amt.get("value", 0))
                fee = -float((info.get("fee_amount") or {}).get("value", 0))
                c = totals.setdefault(cur, {"gross": 0.0, "fees": 0.0, "refunds": 0.0, "net": 0.0})
                code = info.get("transaction_event_code", "")
                if code.startswith("T11"):  # refunds / reversals
                    c["refunds"] += -val
                elif val > 0 and not code.startswith("T04"):  # incoming payments (ignore transfers to bank)
                    c["gross"] += val
                c["fees"] += fee
                if not code.startswith("T04"):
                    c["net"] += val - fee
            if page >= int(d.get("total_pages", 1)):
                break
            page += 1
        start = end
    return {
        "balances": [{"currency": b.get("currency"), "available": float((b.get("available_balance") or {}).get("value", 0)),
                      "total": float((b.get("total_balance") or {}).get("value", 0))} for b in balances],
        "period": {cur: {k: round(v, 2) for k, v in vals.items()} for cur, vals in totals.items()},
    }


def summary(days):
    """Each provider is optional and independent: one failing doesn't hide the other."""
    out = {"days": days}
    if os.environ.get("STRIPE_SECRET_KEY"):
        try:
            out["stripe"] = stripe_summary(days)
        except (HttpError, requests.RequestException) as e:
            out["stripe"] = {"error": str(e)}
    if os.environ.get("PAYPAL_CLIENT_ID") and os.environ.get("PAYPAL_CLIENT_SECRET"):
        try:
            out["paypal"] = paypal_summary(days)
        except (HttpError, requests.RequestException) as e:
            out["paypal"] = {"error": str(e)}
    return out
