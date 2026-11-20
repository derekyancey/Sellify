"""Appwrite database access for the checkout function (uses the function's dynamic API key)."""
import datetime as dt
import json
import os

from appwrite.client import Client
from appwrite.exception import AppwriteException
from appwrite.id import ID
from appwrite.query import Query
from appwrite.services.tables_db import TablesDB

from errors import HttpError

DB = os.environ.get("APPWRITE_DATABASE_ID", "yancey")


def a(obj, key):
    """Read a field from an SDK model or a dict (row data lives under .data on models)."""
    if isinstance(obj, dict):
        return obj.get(key)
    data = getattr(obj, "data", None)
    if isinstance(data, dict) and key in data:
        return data[key]
    return getattr(obj, key.lstrip("$"), None)


def _variants(p):
    v = a(p, "variants")
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            v = []
    return v if isinstance(v, list) else []


class Store:
    def __init__(self, api_key):
        client = (Client().set_endpoint(os.environ["APPWRITE_FUNCTION_API_ENDPOINT"])
                  .set_project(os.environ["APPWRITE_FUNCTION_PROJECT_ID"]).set_key(api_key))
        self.db = TablesDB(client)

    # ------------------------------------------------------------- reads
    def site(self, site_id):
        try:
            return self.db.get_row(DB, "sites", site_id)
        except AppwriteException:
            raise HttpError("Unknown store", 404)

    def products(self, site_id, ids):
        rows = self.db.list_rows(DB, "products", queries=[Query.equal("siteId", site_id), Query.equal("$id", list(ids)), Query.limit(100)])
        return {a(r, "$id"): r for r in rows.rows}

    def checkout(self, checkout_id):
        try:
            return self.db.get_row(DB, "checkouts", checkout_id)
        except AppwriteException:
            raise HttpError("Unknown checkout", 404)

    # ------------------------------------------------------------- cart -> priced line items (never trust client prices)
    def price_cart(self, site_id, items, code=None):
        if not isinstance(items, list) or not items or len(items) > 50:
            raise HttpError("Cart is empty")
        qty = {}
        for it in items:
            pid, q = str(it.get("productId", "")), int(it.get("quantity", 1))
            vid = str(it.get("variantId") or "") or None
            if not pid or q < 1 or q > 100:
                raise HttpError("Invalid cart item")
            qty[(pid, vid)] = qty.get((pid, vid), 0) + q
        products = self.products(site_id, {pid for pid, _ in qty})
        lines = []
        for (pid, vid), q in qty.items():
            p = products.get(pid)
            if not p or a(p, "status") not in ("active", "unlisted"):  # unlisted = hidden from lists, still buyable by link
                raise HttpError("A product in your cart is no longer available", 409)
            variants = _variants(p)
            v = None
            if variants:
                v = next((x for x in variants if x.get("id") == vid), None) if vid else (variants[0] if len(variants) == 1 else None)
                if v is None:
                    raise HttpError(f"Choose an option for {a(p, 'title')}" if not vid else f"That option of {a(p, 'title')} is no longer available", 409)
            tracked = a(p, "tracksInventory") is not False
            stock = (v.get("inventory", 0) if v else a(p, "inventory")) or 0
            if tracked and stock < q:
                raise HttpError(f"Only {max(0, stock)} of {a(p, 'title')} left in stock", 409)
            price = float(v["price"]) if v else float(a(p, "price"))
            title = a(p, "title") + (f" - {a(p, 'subtitle')}" if a(p, "subtitle") else "") + (f" - {v['title']}" if v and v.get("title") and v["title"] != "Default Title" else "")
            lines.append({"productId": pid, "variantId": v["id"] if v else None, "title": title, "quantity": q, "price": round(price, 2),
                          "imageUrl": (v or {}).get("image") or a(p, "imageUrl") or None, "tracked": tracked})
        subtotal = round(sum(l["price"] * l["quantity"] for l in lines), 2)
        discount = self.discount(site_id, code, subtotal) if code else None
        total = round(subtotal - (discount["amount"] if discount else 0), 2)
        if total <= 0:
            raise HttpError("Cart total must be above zero")
        return {"lines": lines, "subtotal": subtotal, "discount": discount, "total": total}

    def discount(self, site_id, code, subtotal):
        """Validate a discount code server-side. Returns {id, code, amount} or raises a friendly error."""
        code = str(code).strip().upper()
        rows = self.db.list_rows(DB, "discounts", queries=[Query.equal("siteId", site_id), Query.equal("code", code), Query.limit(1)]).rows
        d = rows[0] if rows else None
        now = dt.datetime.now(dt.timezone.utc)
        when = lambda v: dt.datetime.fromisoformat(str(v).replace("Z", "+00:00")) if v else None
        if not d or not a(d, "active"):
            raise HttpError(f"{code} isn't a valid discount code", 404)
        starts, ends = when(a(d, "startsAt")), when(a(d, "endsAt"))
        if (starts and starts > now) or (ends and ends < now):
            raise HttpError(f"{code} isn't active right now", 409)
        if a(d, "usageLimit") and (a(d, "usedCount") or 0) >= a(d, "usageLimit"):
            raise HttpError(f"{code} has been fully used", 409)
        if a(d, "minSubtotal") and subtotal < float(a(d, "minSubtotal")):
            raise HttpError(f"{code} needs an order of at least {float(a(d, 'minSubtotal')):.2f}", 409)
        value = float(a(d, "value"))
        amount = round(subtotal * value / 100, 2) if a(d, "type") == "percent" else min(value, subtotal)
        return {"id": a(d, "$id"), "code": code, "amount": round(amount, 2)}

    # ------------------------------------------------------------- writes
    def create_checkout(self, site_id, provider, cart, currency, email=None, accepts_marketing=False):
        d = cart["discount"] or {}
        row = self.db.create_row(DB, "checkouts", ID.unique(), {
            "siteId": site_id, "provider": provider, "items": json.dumps(cart["lines"]), "total": cart["total"],
            "currency": currency, "status": "open", "email": email or None, "acceptsMarketing": bool(accepts_marketing),
            "discountCode": d.get("code"), "discountId": d.get("id"), "discountAmount": d.get("amount")})
        return a(row, "$id")

    def set_checkout_ref(self, checkout_id, ref):
        self.db.update_row(DB, "checkouts", checkout_id, {"providerRef": ref})

    def expire_checkout(self, checkout_id, email=None):
        co = self.checkout(checkout_id)
        if a(co, "status") == "open":
            patch = {"status": "expired"}
            if email and not a(co, "email"):
                patch["email"] = email.strip().lower()
            self.db.update_row(DB, "checkouts", checkout_id, patch)

    def unsubscribe(self, site_id, customer_id):
        try:
            c = self.db.get_row(DB, "customers", customer_id)
        except AppwriteException:
            return False
        if a(c, "siteId") != site_id:
            return False
        self.db.update_row(DB, "customers", customer_id, {"acceptsMarketing": False, "unsubscribedAt": dt.datetime.now(dt.timezone.utc).isoformat()})
        return True

    def finalize(self, checkout_id, provider, payment_ref, email, name, amount_paid):
        """Turn a paid checkout into an order. Idempotent: the order's row ID *is* the checkout ID."""
        co = self.checkout(checkout_id)
        if a(co, "status") == "completed":
            return {"orderId": checkout_id, "duplicate": True}
        if abs(float(a(co, "total")) - float(amount_paid)) > 0.01:
            raise HttpError(f"Paid amount {amount_paid} does not match checkout total {a(co, 'total')}", 409)
        site_id = a(co, "siteId")
        lines = json.loads(a(co, "items"))
        email = (email or a(co, "email") or "").strip().lower()
        name = name or email.split("@")[0] or "Customer"

        customer_id = self._upsert_customer(site_id, email, name, float(a(co, "total")), bool(a(co, "acceptsMarketing"))) if email else None
        last = self.db.list_rows(DB, "orders", queries=[Query.equal("siteId", site_id), Query.order_desc("number"), Query.limit(1)])
        number = (a(last.rows[0], "number") if last.rows else 1000) + 1
        items = [{k: l.get(k) for k in ("productId", "variantId", "title", "quantity", "price")} for l in lines]
        order = {"siteId": site_id, "number": number, "customerId": customer_id, "customerName": name, "customerEmail": email,
                 "items": json.dumps(items), "total": float(a(co, "total")), "financialStatus": "paid",
                 "fulfillmentStatus": "unfulfilled", "paymentProvider": provider, "paymentRef": payment_ref,
                 "discountCode": a(co, "discountCode"), "discountAmount": a(co, "discountAmount")}
        try:
            self.db.create_row(DB, "orders", checkout_id, order)
        except AppwriteException as e:
            if e.code == 409:  # a concurrent webhook/capture already created it
                return {"orderId": checkout_id, "duplicate": True}
            raise
        for l in lines:
            if l.get("tracked") is False:
                continue  # digital / untracked products: no stock to reduce
            try:
                self.db.decrement_row_column(DB, "products", l["productId"], "inventory", l["quantity"], min=0)
                if l.get("variantId"):  # keep the variant's own count in step
                    p = self.db.get_row(DB, "products", l["productId"])
                    vs = _variants(p)
                    for v in vs:
                        if v.get("id") == l["variantId"]:
                            v["inventory"] = max(0, int(v.get("inventory") or 0) - l["quantity"])
                    self.db.update_row(DB, "products", l["productId"], {"variants": json.dumps(vs)})
            except AppwriteException:
                pass  # product deleted since checkout; the order still stands
        if a(co, "discountId"):
            try:
                self.db.increment_row_column(DB, "discounts", a(co, "discountId"), "usedCount", 1)
            except AppwriteException:
                pass  # discount deleted since checkout
        self.db.update_row(DB, "checkouts", checkout_id, {"status": "completed", "providerRef": payment_ref})
        return {"orderId": checkout_id, "number": number, "_order": {**order, "$id": checkout_id, "items": items}}

    def _upsert_customer(self, site_id, email, name, total, opted_in=False):
        found = self.db.list_rows(DB, "customers", queries=[Query.equal("siteId", site_id), Query.equal("email", email), Query.limit(1)])
        if found.rows:
            c = found.rows[0]
            patch = {"ordersCount": (a(c, "ordersCount") or 0) + 1, "totalSpent": round((a(c, "totalSpent") or 0) + total, 2),
                     "lastOrderAt": dt.datetime.now(dt.timezone.utc).isoformat()}
            if opted_in:  # opting in at checkout subscribes; not ticking the box never unsubscribes
                patch["acceptsMarketing"] = True
            self.db.update_row(DB, "customers", a(c, "$id"), patch)
            return a(c, "$id")
        c = self.db.create_row(DB, "customers", ID.unique(), {
            "siteId": site_id, "name": name, "email": email, "ordersCount": 1, "totalSpent": total, "acceptsMarketing": opted_in,
            "lastOrderAt": dt.datetime.now(dt.timezone.utc).isoformat()})
        return a(c, "$id")
