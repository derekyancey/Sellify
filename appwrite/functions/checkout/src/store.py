"""Appwrite database access for the checkout function (uses the function's dynamic API key)."""
import json
import os

from appwrite.client import Client
from appwrite.exception import AppwriteException
from appwrite.id import ID
from appwrite.query import Query
from appwrite.services.tables_db import TablesDB

from errors import HttpError

DB = os.environ.get("APPWRITE_DATABASE_ID", "sellify")


def a(obj, key):
    """Read a field from an SDK model or a dict (row data lives under .data on models)."""
    if isinstance(obj, dict):
        return obj.get(key)
    data = getattr(obj, "data", None)
    if isinstance(data, dict) and key in data:
        return data[key]
    return getattr(obj, key.lstrip("$"), None)


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
    def price_cart(self, site_id, items):
        if not isinstance(items, list) or not items or len(items) > 50:
            raise HttpError("Cart is empty")
        qty = {}
        for it in items:
            pid, q = str(it.get("productId", "")), int(it.get("quantity", 1))
            if not pid or q < 1 or q > 100:
                raise HttpError("Invalid cart item")
            qty[pid] = qty.get(pid, 0) + q
        products = self.products(site_id, qty.keys())
        lines = []
        for pid, q in qty.items():
            p = products.get(pid)
            if not p or a(p, "status") != "active":
                raise HttpError("A product in your cart is no longer available", 409)
            if (a(p, "inventory") or 0) < q:
                raise HttpError(f"Only {a(p, 'inventory')} of {a(p, 'title')} left in stock", 409)
            lines.append({"productId": pid, "title": a(p, "title"), "quantity": q, "price": round(float(a(p, "price")), 2),
                          "imageUrl": a(p, "imageUrl") or None})
        total = round(sum(l["price"] * l["quantity"] for l in lines), 2)
        if total <= 0:
            raise HttpError("Cart total must be above zero")
        return lines, total

    # ------------------------------------------------------------- writes
    def create_checkout(self, site_id, provider, lines, total, currency, email=None):
        row = self.db.create_row(DB, "checkouts", ID.unique(), {
            "siteId": site_id, "provider": provider, "items": json.dumps(lines), "total": total,
            "currency": currency, "status": "open", "email": email or None})
        return a(row, "$id")

    def set_checkout_ref(self, checkout_id, ref):
        self.db.update_row(DB, "checkouts", checkout_id, {"providerRef": ref})

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

        customer_id = self._upsert_customer(site_id, email, name, float(a(co, "total"))) if email else None
        last = self.db.list_rows(DB, "orders", queries=[Query.equal("siteId", site_id), Query.order_desc("number"), Query.limit(1)])
        number = (a(last.rows[0], "number") if last.rows else 1000) + 1
        try:
            self.db.create_row(DB, "orders", checkout_id, {
                "siteId": site_id, "number": number, "customerId": customer_id, "customerName": name, "customerEmail": email,
                "items": json.dumps([{k: l[k] for k in ("productId", "title", "quantity", "price")} for l in lines]),
                "total": float(a(co, "total")), "financialStatus": "paid", "fulfillmentStatus": "unfulfilled",
                "paymentProvider": provider, "paymentRef": payment_ref})
        except AppwriteException as e:
            if e.code == 409:  # a concurrent webhook/capture already created it
                return {"orderId": checkout_id, "duplicate": True}
            raise
        for l in lines:
            try:
                self.db.decrement_row_column(DB, "products", l["productId"], "inventory", l["quantity"], min=0)
            except AppwriteException:
                pass  # product deleted since checkout; the order still stands
        self.db.update_row(DB, "checkouts", checkout_id, {"status": "completed", "providerRef": payment_ref})
        return {"orderId": checkout_id, "number": number}

    def _upsert_customer(self, site_id, email, name, total):
        found = self.db.list_rows(DB, "customers", queries=[Query.equal("siteId", site_id), Query.equal("email", email), Query.limit(1)])
        if found.rows:
            c = found.rows[0]
            self.db.update_row(DB, "customers", a(c, "$id"), {
                "ordersCount": (a(c, "ordersCount") or 0) + 1, "totalSpent": round((a(c, "totalSpent") or 0) + total, 2)})
            return a(c, "$id")
        c = self.db.create_row(DB, "customers", ID.unique(), {
            "siteId": site_id, "name": name, "email": email, "ordersCount": 1, "totalSpent": total})
        return a(c, "$id")
