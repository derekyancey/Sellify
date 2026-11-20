"""
Shopify -> Yancey importer (products, customers, orders CSV exports).

Idempotent: every record gets a deterministic row ID from its natural key, and rows are written with bulk
upsert, so uploading the same (or a newer) export again updates records instead of duplicating them.

  products   key: store + Handle                 (one product per handle; variants and images grouped)
  customers  key: store + email (else Shopify ID) (latest upload wins, but never re-subscribes someone who
                                                    unsubscribed through Yancey)
  orders     key: store + Shopify order Id (else Name, e.g. #1001); line items grouped by Name

Imports never send email, never change stock, and never touch Yancey-only fields that aren't in the file.
"""
import datetime as dt
import hashlib
import json
import re

DB_DEFAULT = "yancey"
CHUNK = 100

FIN = {"paid": "paid", "pending": "pending", "authorized": "pending", "partially_paid": "pending", "unpaid": "pending",
       "partially_refunded": "partially_refunded", "refunded": "refunded", "voided": "voided", "expired": "voided"}
FUL = {"fulfilled": "fulfilled", "unfulfilled": "unfulfilled", "": "unfulfilled", "partial": "partial",
       "partially_fulfilled": "partial", "restocked": "cancelled", "scheduled": "unfulfilled", "on_hold": "unfulfilled"}
STATUS = {"active": "active", "draft": "draft", "archived": "archived", "unlisted": "unlisted"}


# ----------------------------------------------------------------------------- helpers
def _h(*parts, n=30):
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:n]


def product_id(site_id, handle):
    return "p" + _h(site_id, handle.strip().lower())


def customer_key(email, shopify_id):
    email = (email or "").strip().lower()
    return email or (f"shopify:{shopify_id}" if shopify_id else "")


def customer_id(site_id, email, shopify_id=None):
    key = customer_key(email, shopify_id)
    return "c" + _h(site_id, key) if key else None


def order_id(site_id, external):
    return "o" + _h(site_id, external)


def variant_id(handle, *opts):
    return "v" + _h(handle.strip().lower(), *[o.strip().lower() for o in opts], n=12)


def g(row, *keys):
    for k in keys:
        v = row.get(k)
        if v is not None and str(v).strip() != "":
            return str(v).strip()
    return ""


def money(v):
    try:
        return round(float(str(v).replace(",", "").replace("$", "") or 0), 2)
    except ValueError:
        return 0.0


def integer(v, default=0):
    try:
        return int(float(str(v).replace(",", "")))
    except (TypeError, ValueError):
        return default


def yes(v):
    return str(v).strip().lower() in ("yes", "true", "1", "y", "subscribed")


def when(v):
    """Shopify exports '2026-11-18 17:10:05 -0500' (or ISO); return ISO 8601 UTC, or None."""
    v = (v or "").strip()
    if not v:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S %z", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            d = dt.datetime.strptime(v, fmt)
            if d.tzinfo is None:
                d = d.replace(tzinfo=dt.timezone.utc)
            return d.astimezone(dt.timezone.utc).isoformat()
        except ValueError:
            continue
    try:
        return dt.datetime.fromisoformat(v.replace("Z", "+00:00")).astimezone(dt.timezone.utc).isoformat()
    except ValueError:
        return None


def cut(v, n):
    v = (v or "").strip()
    return v[:n] if v else None


def tags(v):
    return [t.strip() for t in (v or "").split(",") if t.strip()]


def _a(row, key):
    if isinstance(row, dict):
        return row.get(key)
    data = getattr(row, "data", None)
    if isinstance(data, dict) and key in data:
        return data[key]
    return getattr(row, key.lstrip("$"), None)


def _json(v, default):
    if isinstance(v, (list, dict)):
        return v
    try:
        return json.loads(v) if v else default
    except (TypeError, ValueError):
        return default


# ----------------------------------------------------------------------------- products
def map_products(site_id, rows, existing=None):
    """rows: raw Shopify product CSV rows. Returns (upsert rows, problems)."""
    existing = existing or {}
    groups, order = {}, []
    for r in rows:
        h = g(r, "Handle")
        if not h:
            continue
        if h not in groups:
            groups[h] = []
            order.append(h)
        groups[h].append(r)
    out, problems = [], []
    for h in order:
        rs = groups[h]
        head = next((r for r in rs if g(r, "Title")), None)
        if not head:
            problems.append({"key": h, "error": "No row with a Title for this handle"})
            continue
        opt_names = [g(head, f"Option{i} Name") for i in (1, 2, 3)]
        variants = []
        for r in rs:
            if not g(r, "Variant Price"):
                continue
            opts = [g(r, f"Option{i} Value") for i in (1, 2, 3)]
            title = " / ".join(o for o in opts if o) or "Default Title"
            variants.append({
                "id": variant_id(h, *opts), "title": title,
                "options": {n: o for n, o in zip(opt_names, opts) if n and o},
                "sku": cut(g(r, "Variant SKU"), 64), "price": money(g(r, "Variant Price")),
                "compareAtPrice": money(g(r, "Variant Compare At Price")) or None,
                "inventory": integer(g(r, "Variant Inventory Qty")), "inventoryPolicy": g(r, "Variant Inventory Policy") or "deny",
                "tracked": g(r, "Variant Inventory Tracker").lower() == "shopify",
                "barcode": g(r, "Variant Barcode", "Variant Barcodes") or None, "grams": integer(g(r, "Variant Grams")),
                "weightUnit": g(r, "Variant Weight Unit") or None, "requiresShipping": yes(g(r, "Variant Requires Shipping")),
                "taxable": yes(g(r, "Variant Taxable")), "costPerItem": money(g(r, "Cost per item")) or None,
                "image": g(r, "Variant Image") or None,
            })
        if not variants:
            problems.append({"key": h, "error": "No variant with a price"})
            continue
        prev = existing.get(product_id(site_id, h))
        migrated = {i.get("original"): i for i in _json(_a(prev, "images"), []) if isinstance(i, dict) and i.get("original")} if prev else {}
        images, seen = [], set()
        for r in sorted((r for r in rs if g(r, "Image Src")), key=lambda r: integer(g(r, "Image Position"), 9999)):
            src = g(r, "Image Src")
            if src in seen:
                continue
            seen.add(src)
            m = migrated.get(src)
            images.append({"src": m["src"] if m else src, "alt": g(r, "Image Alt Text") or None, **({"original": src} if m else {})})
        tracked = any(v["tracked"] for v in variants)
        first = min(variants, key=lambda v: v["price"])
        desc = g(head, "Body (HTML)")
        if prev and _a(prev, "description") and "cdn.shopify.com" not in (_a(prev, "description") or "") and desc and "cdn.shopify.com" in desc:
            desc = _a(prev, "description")  # keep the version whose embedded images were already copied off Shopify
        out.append({
            "$id": product_id(site_id, h), "siteId": site_id, "handle": cut(h, 255), "title": cut(g(head, "Title"), 255),
            "description": desc or None, "vendor": cut(g(head, "Vendor"), 255), "productType": cut(g(head, "Type"), 255),
            "tags": json.dumps(tags(g(head, "Tags"))), "status": STATUS.get(g(head, "Status").lower(), "active" if yes(g(head, "Published")) else "draft"),
            "price": first["price"], "compareAtPrice": first["compareAtPrice"], "sku": first["sku"],
            "inventory": sum(max(0, v["inventory"]) for v in variants) if tracked else 0, "tracksInventory": tracked,
            "imageUrl": images[0]["src"] if images else None, "images": json.dumps(images), "variants": json.dumps(variants),
            "seoTitle": cut(g(head, "SEO Title"), 255), "seoDescription": cut(g(head, "SEO Description"), 1024),
            "costPerItem": first["costPerItem"], "externalId": cut(h, 64), "source": "shopify",
            # A title split into title + subtitle in Yancey is kept; re-importing would otherwise restore Shopify's long title.
            **({"title": _a(prev, "title"), "subtitle": _a(prev, "subtitle")} if prev and _a(prev, "subtitle") else {}),
        })
    return out, problems


# ----------------------------------------------------------------------------- customers
def _address(r, prefix):
    a = {k: g(r, f"{prefix} {f}") or None for k, f in (("company", "Company"), ("address1", "Address1"), ("address2", "Address2"),
                                                       ("city", "City"), ("provinceCode", "Province Code"), ("countryCode", "Country Code"),
                                                       ("zip", "Zip"), ("phone", "Phone"))}
    return a if any(a.values()) else None


def map_customers(site_id, rows, existing=None, subscribers_only=False, now=None):
    existing = existing or {}
    now = now or dt.datetime.now(dt.timezone.utc).isoformat()
    out, problems, seen = [], [], {}
    for r in rows:
        email = g(r, "Email").lower() or None
        sid = g(r, "Customer ID", "Id")
        rid = customer_id(site_id, email, sid)
        if not rid:
            problems.append({"key": "(blank row)", "error": "No email or customer ID"})
            continue
        subscribed = yes(g(r, "Accepts Email Marketing", "Accepts Marketing"))
        if subscribers_only and not subscribed:
            continue
        prev = existing.get(rid)
        protected = bool(prev and _a(prev, "unsubscribedAt"))
        first, last = g(r, "First Name"), g(r, "Last Name")
        name = " ".join(x for x in (first, last) if x) or (email.split("@")[0] if email else f"Customer {sid}")
        row = {
            "$id": rid, "siteId": site_id, "email": email, "name": cut(name, 128), "firstName": cut(first, 128), "lastName": cut(last, 128),
            "phone": cut(g(r, "Phone", "Default Address Phone"), 32), "acceptsMarketing": subscribed and not protected,
            "acceptsSms": yes(g(r, "Accepts SMS Marketing")), "address": json.dumps(_address(r, "Default Address")) if _address(r, "Default Address") else None,
            "tags": json.dumps(tags(g(r, "Tags"))), "note": g(r, "Note") or None, "taxExempt": yes(g(r, "Tax Exempt")),
            "ordersCount": max(0, integer(g(r, "Total Orders"))), "totalSpent": max(0.0, money(g(r, "Total Spent"))),
            "externalId": cut(sid, 64), "source": "shopify",
        }
        if row["$id"] in seen:  # same person twice in one upload: later row wins
            out[seen[row["$id"]]] = row
        else:
            seen[row["$id"]] = len(out)
            out.append(row)
    return out, problems


# ----------------------------------------------------------------------------- orders
def map_orders(site_id, rows, products=None):
    """products: existing product rows for this store (to link line items by SKU / title)."""
    by_sku, by_title = {}, {}
    # Match names loosely (case, spaces and punctuation ignored) so "Replica 3 Title Presets" in a Shopify order still
    # finds a product stored as title "Replica 3" + subtitle "Title Presets".
    key = lambda s: re.sub(r"[^0-9a-z]+", "", (s or "").lower())
    title_only = {}
    for p in products or []:
        pid, title = _a(p, "$id"), (_a(p, "title") or "")
        vs = _json(_a(p, "variants"), [])
        hit = (pid, vs[0]["id"] if vs else None, vs)
        by_title[key(title + (_a(p, "subtitle") or ""))] = hit
        title_only.setdefault(key(title), hit)
    for k, hit in title_only.items():  # bare titles only where no product's full name already claims that key
        by_title.setdefault(k, hit)
        for v in vs:
            if v.get("sku"):
                by_sku[v["sku"].lower()] = (pid, v["id"])

    def link(name, sku):
        if sku and sku.lower() in by_sku:
            return by_sku[sku.lower()]
        if key(name) in by_title:
            return by_title[key(name)][:2]
        if " - " in name:
            base, var = name.rsplit(" - ", 1)
            hit = by_title.get(key(base))
            if hit:
                v = next((v for v in hit[2] if v.get("title", "").lower() == var.lower()), None)
                return hit[0], (v or {}).get("id") or hit[1]
        return None, None

    groups, order = {}, []
    for r in rows:
        name = g(r, "Name")
        if not name:
            continue
        if name not in groups:
            groups[name] = []
            order.append(name)
        groups[name].append(r)
    out, problems, customers_last = [], [], {}
    for name in order:
        rs = groups[name]
        head = next((r for r in rs if g(r, "Financial Status") or g(r, "Total")), rs[0])
        external = g(head, "Id") or name
        items = []
        for r in rs:
            title = g(r, "Lineitem name")
            if not title:
                continue
            pid, vid = link(title, g(r, "Lineitem sku"))
            items.append({"productId": pid, "variantId": vid, "title": title, "quantity": max(1, integer(g(r, "Lineitem quantity"), 1)),
                          "price": money(g(r, "Lineitem price")), "sku": g(r, "Lineitem sku") or None,
                          "discount": money(g(r, "Lineitem discount")) or None})
        email = g(head, "Email").lower() or None
        num = re.sub(r"\D", "", name)
        cancelled = when(g(head, "Cancelled at"))
        fin = FIN.get(g(head, "Financial Status").lower())
        if fin is None:
            problems.append({"key": name, "error": f"Unknown payment status '{g(head, 'Financial Status')}'"})
            continue
        bill, ship = _address(head, "Billing"), _address(head, "Shipping")
        if bill is not None:
            bill["name"] = g(head, "Billing Name") or None
            bill["province"] = g(head, "Billing Province Name", "Billing Province") or None
            bill["country"] = g(head, "Billing Country") or None
        if ship is not None:
            ship["name"] = g(head, "Shipping Name") or None
        placed = when(g(head, "Created at"))
        out.append({
            "$id": order_id(site_id, external), "siteId": site_id, "number": integer(num) if num else integer(_h(name, n=6), 0),
            "externalId": cut(external, 64), "placedAt": placed, "customerId": customer_id(site_id, email),
            "customerName": cut(g(head, "Billing Name", "Shipping Name") or email or "Customer", 128), "customerEmail": email,
            "items": json.dumps(items), "subtotal": money(g(head, "Subtotal")), "shippingTotal": money(g(head, "Shipping")),
            "taxTotal": money(g(head, "Taxes")), "total": max(0.0, money(g(head, "Total"))),
            "discountCode": cut(g(head, "Discount Code"), 64), "discountAmount": money(g(head, "Discount Amount")) or None,
            "refundedAmount": money(g(head, "Refunded Amount")) or None, "financialStatus": fin,
            "fulfillmentStatus": "cancelled" if cancelled else FUL.get(g(head, "Fulfillment Status").lower(), "unfulfilled"),
            "cancelledAt": cancelled, "currency": cut(g(head, "Currency"), 8),
            "billingAddress": json.dumps(bill) if bill else None, "shippingAddress": json.dumps(ship) if ship else None,
            "paymentProvider": "shopify", "paymentMethod": cut(g(head, "Payment Method") or "Shopify", 128),
            "paymentRef": cut(g(head, "Payment Reference", "Payment ID"), 128), "source": "shopify",
            "tags": json.dumps(tags(g(head, "Tags"))),
        })
        if email and placed and (email not in customers_last or placed > customers_last[email]):
            customers_last[email] = placed
    return out, problems, customers_last


# ----------------------------------------------------------------------------- writing
class Writer:
    def __init__(self, db, database_id=DB_DEFAULT):
        self.db, self.DB = db, database_id

    def existing(self, table, ids):
        from appwrite.query import Query
        found = {}
        ids = list(dict.fromkeys(i for i in ids if i))
        for i in range(0, len(ids), CHUNK):
            chunk = ids[i:i + CHUNK]
            for r in self.db.list_rows(self.DB, table, queries=[Query.equal("$id", chunk), Query.limit(CHUNK)]).rows:
                found[_a(r, "$id")] = r
        return found

    def all_for_site(self, table, site_id):
        from appwrite.query import Query
        out, cursor = [], None
        while True:
            q = [Query.equal("siteId", site_id), Query.limit(CHUNK)] + ([Query.cursor_after(cursor)] if cursor else [])
            page = self.db.list_rows(self.DB, table, queries=q).rows
            out += page
            if len(page) < CHUNK:
                return out
            cursor = _a(page[-1], "$id")

    def upsert(self, table, rows):
        """Bulk upsert; if a chunk is rejected, retry row by row so one bad row doesn't block the rest."""
        written, problems = 0, []
        for i in range(0, len(rows), CHUNK):
            chunk = rows[i:i + CHUNK]
            try:
                self.db.upsert_rows(self.DB, table, chunk)
                written += len(chunk)
            except Exception:  # noqa: BLE001
                for row in chunk:
                    try:
                        self.db.upsert_rows(self.DB, table, [row])
                        written += 1
                    except Exception as e:  # noqa: BLE001
                        problems.append({"key": row.get("handle") or row.get("email") or row.get("externalId") or row["$id"],
                                         "error": getattr(e, "message", None) or str(e)})
        return written, problems


def run(db, kind, site_id, rows, options=None, database_id=DB_DEFAULT):
    options = options or {}
    w = Writer(db, database_id)
    if kind == "products":
        ids = [product_id(site_id, g(r, "Handle")) for r in rows if g(r, "Handle")]
        prev = w.existing("products", ids)
        mapped, problems = map_products(site_id, rows, prev)
        table = "products"
    elif kind == "customers":
        ids = [customer_id(site_id, g(r, "Email"), g(r, "Customer ID", "Id")) for r in rows]
        prev = w.existing("customers", ids)
        mapped, problems = map_customers(site_id, rows, prev, subscribers_only=bool(options.get("subscribersOnly")))
        table = "customers"
    elif kind == "orders":
        mapped, problems, last = map_orders(site_id, rows, w.all_for_site("products", site_id))
        prev = w.existing("orders", [m["$id"] for m in mapped])
        table = "orders"
    else:
        raise ValueError(f"Unknown import type {kind}")
    written, write_problems = w.upsert(table, mapped)
    result = {"kind": kind, "received": len(rows), "records": len(mapped), "written": written,
              "added": sum(1 for m in mapped if m["$id"] not in prev), "updated": sum(1 for m in mapped if m["$id"] in prev),
              "problems": (problems + write_problems)[:200], "problemCount": len(problems) + len(write_problems)}
    if kind == "customers":
        result["subscribers"] = sum(1 for m in mapped if m["acceptsMarketing"])
        result["keptUnsubscribed"] = sum(1 for m in mapped if m["$id"] in prev and _a(prev[m["$id"]], "unsubscribedAt"))
    if kind == "orders" and last:
        # keep customers' last-order date current (used by win-back automations); only for customers that exist
        cids = {customer_id(site_id, e): t for e, t in last.items()}
        known = w.existing("customers", list(cids))
        # Appwrite's bulk upsert validates required columns even on update, so send them along.
        bumps = [{"$id": cid, "siteId": site_id, "name": _a(known[cid], "name") or "Customer", "lastOrderAt": t} for cid, t in cids.items()
                 if cid in known and (not _a(known[cid], "lastOrderAt") or _a(known[cid], "lastOrderAt") < t)]
        if bumps:
            _, bump_problems = w.upsert("customers", bumps)
            result["problems"] = (result["problems"] + bump_problems)[:200]
            result["problemCount"] += len(bump_problems)
        result["customersLinked"] = len(known)
    return result
