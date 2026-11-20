"""
One-time (and safe to re-run) Appwrite setup for Yancey.

Creates the admin team, the database, the sites / products / orders / customers tables,
their columns and indexes, and (optionally) your first admin login.

    pip install -r appwrite/requirements.txt
    export APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1   # or your region, e.g. https://nyc.cloud.appwrite.io/v1
    export APPWRITE_PROJECT_ID=...                          # Appwrite console → project settings
    export APPWRITE_API_KEY=...                             # key with databases, tables, teams, users scopes
    export ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=...   # optional: creates your login and adds it to the team
    export STORE_NAME="My Shop" STORE_DOMAIN=myshop.com     # optional: creates your first store (URL optional)
    python appwrite/setup.py
"""
import os
import sys
import time

from appwrite.client import Client
from appwrite.enums.tables_db_index_type import TablesDBIndexType
from appwrite.exception import AppwriteException
from appwrite.id import ID
from appwrite.permission import Permission
from appwrite.query import Query
from appwrite.role import Role
from appwrite.services.storage import Storage
from appwrite.services.tables_db import TablesDB
from appwrite.services.teams import Teams
from appwrite.services.users import Users

DB_ID = os.environ.get("APPWRITE_DATABASE_ID", "yancey")
BUCKET_ID = os.environ.get("APPWRITE_BUCKET_ID", "files")
TEAM_ID = os.environ.get("ADMIN_TEAM_ID", "admins")

# column helpers: (kind, key, required, extra kwargs)
S = lambda key, size=255, req=False: ("varchar", key, req, {"size": size})
LT = lambda key, req=False: ("longtext", key, req, {})
F = lambda key, req=False, **kw: ("float", key, req, kw)
I = lambda key, req=False, **kw: ("integer", key, req, kw)
B = lambda key, req=False, **kw: ("boolean", key, req, kw)
D = lambda key, req=False: ("datetime", key, req, {})
SA = lambda key, size=36: ("varchar", key, False, {"size": size, "array": True})
E = lambda key, elements, default: ("enum", key, False, {"elements": elements, "default": default})

PRODUCT_STATUSES = ["active", "draft", "archived", "unlisted"]
FINANCIAL_STATUSES = ["pending", "paid", "partially_refunded", "refunded", "voided"]
FULFILLMENT_STATUSES = ["unfulfilled", "partial", "fulfilled", "cancelled"]
PAYMENT_PROVIDERS = ["manual", "stripe", "paypal", "shopify"]

# Changes to columns that already exist on older installs (safe to re-run).
MIGRATIONS = [
    ("customers", "email", lambda db: db.update_varchar_column(DB_ID, "customers", "email", False, None)),
    ("orders", "discountCode", lambda db: db.update_varchar_column(DB_ID, "orders", "discountCode", False, None, size=64)),
    ("products", "status", lambda db: db.update_enum_column(DB_ID, "products", "status", PRODUCT_STATUSES, False, "draft")),
    ("orders", "financialStatus", lambda db: db.update_enum_column(DB_ID, "orders", "financialStatus", FINANCIAL_STATUSES, False, "pending")),
    ("orders", "fulfillmentStatus", lambda db: db.update_enum_column(DB_ID, "orders", "fulfillmentStatus", FULFILLMENT_STATUSES, False, "unfulfilled")),
    ("orders", "paymentProvider", lambda db: db.update_enum_column(DB_ID, "orders", "paymentProvider", PAYMENT_PROVIDERS, False, "manual")),
]

SCHEMA = {
    "sites": {
        "public_read": False,
        "columns": [S("name", 128, True), S("domain", 255), S("currency", 8), S("cloudflareZoneId", 64),
                    S("hostingSiteId", 64), S("gscProperty", 255), S("ga4PropertyId", 32), S("feedProductPath", 255),
                    # email setup: nothing is sent until ownerEmail is confirmed and emailStatus is "verified"
                    S("ownerEmail", 255), S("senderName", 128), S("senderAddress", 255), S("emailDomainId", 64),
                    E("emailStatus", ["none", "pending", "verified", "failed"], "none"),
                    B("emailReceipts", default=True), B("emailOwnerAlerts", default=True), B("emailShipping", default=True)],
        "indexes": [("domain_unique", TablesDBIndexType.UNIQUE, ["domain"])],
    },
    "products": {
        "public_read": True,  # lets your storefront sites read the catalog with the public Web SDK
        "columns": [S("siteId", 36, True), S("title", 255, True), LT("description"), F("price", True, min=0), F("compareAtPrice", min=0),
                    S("sku", 64), I("inventory", min=0, default=0), E("status", PRODUCT_STATUSES, "draft"), S("imageUrl", 2048),
                    # imported / richer catalog data (Shopify-compatible)
                    S("handle", 255), S("vendor", 255), S("productType", 255), LT("tags"), LT("images"), LT("variants"),
                    S("seoTitle", 255), S("seoDescription", 1024), B("tracksInventory", default=True), F("costPerItem", min=0),
                    S("externalId", 64), S("source", 32),
                    # option names for the variants above: [{name, values}]. Shopify imports leave it empty and keep
                    # the names inside each variant ({"Size": "M"}); the app reads both.
                    LT("options")],
        "indexes": [("by_site", TablesDBIndexType.KEY, ["siteId"]), ("by_handle", TablesDBIndexType.KEY, ["siteId", "handle"])],
    },
    "customers": {
        "public_read": False,
        "columns": [S("siteId", 36, True), S("name", 128, True), S("email", 255), S("phone", 32),
                    I("ordersCount", min=0, default=0), F("totalSpent", min=0, default=0), B("acceptsMarketing", default=False),
                    D("lastOrderAt"), D("welcomedAt"), D("winbackAt"),
                    S("firstName", 128), S("lastName", 128), B("acceptsSms", default=False), LT("address"), LT("tags"), LT("note"),
                    B("taxExempt", default=False), D("unsubscribedAt"), S("externalId", 64), S("source", 32)],
        "indexes": [("by_site", TablesDBIndexType.KEY, ["siteId"]), ("by_email", TablesDBIndexType.KEY, ["email"])],
    },
    "orders": {
        "public_read": False,
        "columns": [S("siteId", 36, True), I("number", True, min=0), S("customerId", 36), S("customerName", 128), S("customerEmail", 255),
                    LT("items"), F("total", True, min=0), E("financialStatus", FINANCIAL_STATUSES, "pending"),
                    E("fulfillmentStatus", FULFILLMENT_STATUSES, "unfulfilled"),
                    E("paymentProvider", PAYMENT_PROVIDERS, "manual"), S("paymentRef", 128),
                    S("discountCode", 64), F("discountAmount", min=0),
                    # imported order details (Shopify-compatible)
                    D("placedAt"), S("externalId", 64), F("subtotal", min=0), F("shippingTotal", min=0), F("taxTotal", min=0),
                    F("refundedAmount", min=0), D("cancelledAt"), S("currency", 8), LT("billingAddress"), LT("shippingAddress"),
                    S("paymentMethod", 128), S("source", 32), LT("tags")],
        "indexes": [("by_site", TablesDBIndexType.KEY, ["siteId"]), ("by_number", TablesDBIndexType.KEY, ["siteId", "number"])],
    },
    # Carts that were sent to Stripe/PayPal. Only the checkout function (server key) touches these.
    "checkouts": {
        "public_read": False,
        "columns": [S("siteId", 36, True), E("provider", ["stripe", "paypal"], "stripe"), S("providerRef", 128), LT("items"),
                    F("total", True, min=0), S("currency", 8), E("status", ["open", "completed", "expired"], "open"), S("email", 255),
                    S("discountCode", 32), S("discountId", 36), F("discountAmount", min=0), B("acceptsMarketing", default=False), D("recoveryEmailedAt")],
        "indexes": [("by_ref", TablesDBIndexType.KEY, ["providerRef"]), ("by_site", TablesDBIndexType.KEY, ["siteId"])],
    },
    "collections": {
        "public_read": True,  # storefronts read these with Yancey.collection()
        "columns": [S("siteId", 36, True), S("title", 255, True), S("handle", 128, True), LT("description"), SA("productIds")],
        "indexes": [("by_site", TablesDBIndexType.KEY, ["siteId"]), ("by_handle", TablesDBIndexType.UNIQUE, ["siteId", "handle"])],
    },
    "discounts": {
        "public_read": False,  # validated server-side by the checkout function
        "columns": [S("siteId", 36, True), S("code", 32, True), E("type", ["percent", "fixed"], "percent"), F("value", True, min=0),
                    F("minSubtotal", min=0), I("usageLimit", min=1), I("usedCount", min=0, default=0), D("startsAt"), D("endsAt"), B("active", default=True)],
        "indexes": [("by_code", TablesDBIndexType.UNIQUE, ["siteId", "code"])],
    },
    "segments": {
        "public_read": False,
        "columns": [S("siteId", 36, True), S("name", 128, True), LT("rules")],
        "indexes": [("by_site", TablesDBIndexType.KEY, ["siteId"])],
    },
    "themes": {
        "public_read": True,  # storefronts load the live (role "main") theme with the public Web SDK
        "columns": [S("siteId", 36, True), S("name", 128, True), E("role", ["main", "unpublished"], "unpublished"), S("style", 32),
                    LT("data"), D("savedAt"), D("publishedAt")],
        "indexes": [("by_site", TablesDBIndexType.KEY, ["siteId"])],
    },
    "templates": {
        "public_read": False,
        "columns": [S("siteId", 36, True), S("name", 128, True), S("subject", 255), LT("html"), LT("design")],
        "indexes": [("by_site", TablesDBIndexType.KEY, ["siteId"])],
    },
    "automations": {
        "public_read": False,
        "columns": [S("siteId", 36, True), E("type", ["abandoned_cart", "welcome", "winback"], "abandoned_cart"), B("enabled", default=False),
                    I("delayHours", min=0), S("templateId", 36), S("subject", 255), D("lastRunAt"), I("sentCount", min=0, default=0)],
        "indexes": [("by_site_type", TablesDBIndexType.UNIQUE, ["siteId", "type"])],
    },
    # OAuth tokens for each store's connected accounts. No client permissions at all: only the
    # site-ops function's server key can read it, so tokens never reach a browser.
    "connections": {
        "server_only": True,
        "columns": [S("siteId", 36, True), E("provider", ["google"], "google"), S("accountEmail", 255),
                    ("varchar", "refreshToken", True, {"size": 1024, "encrypt": True})],
        "indexes": [("by_site", TablesDBIndexType.KEY, ["siteId"])],
    },
    "campaigns": {
        "public_read": False,
        "columns": [S("siteId", 36, True), S("name", 128, True), S("subject", 255), S("templateId", 36), S("segmentId", 64),
                    E("status", ["draft", "sending", "sent", "failed"], "draft"), I("sentCount", min=0, default=0), D("sentAt"), S("error", 1024)],
        "indexes": [("by_site", TablesDBIndexType.KEY, ["siteId"])],
    },
}


def attr(obj, key):
    return obj.get(key) if isinstance(obj, dict) else getattr(obj, key, None)


def ensure(label, fn, exists=None):
    """Run a create call; treat 'already exists' (409) as success so the script can be re-run.
    `exists` checks first, because Appwrite enforces plan limits before it notices a duplicate."""
    if exists:
        try:
            exists()
            print(f"  = {label} (exists)")
            return
        except AppwriteException as e:
            if e.code != 404:
                raise
    try:
        fn()
        print(f"  + {label}")
    except AppwriteException as e:
        if e.code == 409:
            print(f"  = {label} (exists)")
        else:
            raise


def main():
    missing = [k for k in ("APPWRITE_PROJECT_ID", "APPWRITE_API_KEY") if not os.environ.get(k)]
    if missing:
        sys.exit(f"Set {', '.join(missing)} first (see the docstring at the top of this file).")
    client = (Client().set_endpoint(os.environ.get("APPWRITE_ENDPOINT", "https://cloud.appwrite.io/v1"))
              .set_project(os.environ["APPWRITE_PROJECT_ID"]).set_key(os.environ["APPWRITE_API_KEY"]))
    db, teams, users = TablesDB(client), Teams(client), Users(client)

    print("Team")
    ensure(f"team '{TEAM_ID}'", lambda: teams.create(TEAM_ID, "Yancey admins"), lambda: teams.get(TEAM_ID))
    admin = Role.team(TEAM_ID)

    print("Database")
    ensure(f"database '{DB_ID}'", lambda: db.create(DB_ID, "Yancey"), lambda: db.get(DB_ID))

    for table, spec in SCHEMA.items():
        print(f"Table {table}")
        perms = [] if spec.get("server_only") else [Permission.read(admin), Permission.create(admin), Permission.update(admin), Permission.delete(admin)]
        if spec.get("public_read"):
            perms.append(Permission.read(Role.any()))
        ensure(table, lambda: db.create_table(DB_ID, table, table.capitalize(), permissions=perms, row_security=False),
               lambda: db.get_table(DB_ID, table))
        for kind, key, req, kw in spec["columns"]:
            fn = getattr(db, f"create_{kind}_column")
            if req:
                kw = {k: v for k, v in kw.items() if k != "default"}  # Appwrite forbids defaults on required columns
            if kind == "varchar" and kw.get("encrypt"):
                try:  # encrypted columns are a paid-plan feature; fall back to plain (the table is server-only anyway)
                    ensure(f"column {key} (encrypted)", lambda: fn(DB_ID, table, key, kw["size"], req, encrypt=True))
                    continue
                except AppwriteException as e:
                    print(f"  ! encryption unavailable ({e.message[:60]}); creating {key} unencrypted")
            ensure(f"column {key}", lambda: fn(DB_ID, table, key, required=req, **kw) if kind != "varchar"
                   else fn(DB_ID, table, key, kw["size"], req, array=kw.get("array")))
        wait_for_columns(db, table, [c[1] for c in spec["columns"]])
        for key, kind, cols in spec["indexes"]:
            ensure(f"index {key}", lambda: db.create_index(DB_ID, table, key, kind, cols))

    print("Migrations")
    for table, key, fn in MIGRATIONS:
        try:
            fn(db)
            print(f"  ~ {table}.{key}")
        except AppwriteException as e:
            if e.code == 404:
                print(f"  - {table}.{key} (not found, skipped)")
            else:
                raise
    wait_for_columns(db, "customers", ["email"]); wait_for_columns(db, "orders", ["discountCode", "financialStatus", "fulfillmentStatus", "paymentProvider"])
    wait_for_columns(db, "products", ["status"])

    print("Storage")
    ensure(f"bucket '{BUCKET_ID}' (public read, for product and email images)", lambda: Storage(client).create_bucket(
        BUCKET_ID, "Files", permissions=[Permission.read(Role.any()), Permission.create(admin), Permission.update(admin), Permission.delete(admin)],
        file_security=False, maximum_file_size=10_000_000,
        allowed_file_extensions=["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "pdf", "mp4", "csv", "txt"]),
        lambda: Storage(client).get_bucket(BUCKET_ID))

    email, password = os.environ.get("ADMIN_EMAIL"), os.environ.get("ADMIN_PASSWORD")
    if email:
        print("Admin user")
        found = users.list(queries=[Query.equal("email", email)])
        existing = attr(found, "users") or []
        user_id = attr(existing[0], "id") or attr(existing[0], "$id") if existing else None
        if not user_id:
            if not password:
                sys.exit("ADMIN_PASSWORD is required to create a new admin user.")
            user_id = attr(users.create(ID.unique(), email=email, password=password, name="Owner"), "id")
            print(f"  + user {email}")
        ensure(f"{email} on team '{TEAM_ID}'", lambda: teams.create_membership(TEAM_ID, ["owner"], user_id=user_id))

    store_domain = os.environ.get("STORE_DOMAIN", "").strip().lower().removeprefix("https://").removeprefix("http://").removeprefix("www.").rstrip("/")
    if store_domain or os.environ.get("STORE_NAME"):
        print("First store")
        name = os.environ.get("STORE_NAME") or store_domain.split(".")[0]
        row = {"name": name, "currency": os.environ.get("STORE_CURRENCY", "USD"), "feedProductPath": "/?product={id}", "emailStatus": "none"}
        if store_domain:
            row.update(domain=store_domain, gscProperty=f"sc-domain:{store_domain}")
        ensure(f"store '{name}' ({store_domain or 'no URL yet'})", lambda: db.create_row(DB_ID, "sites", ID.unique(), row))

    print("\nDone. Put these in your .env and on the Yancey site in Appwrite (Sites → yancey → Settings → Environment variables):")
    print(f"  VITE_APPWRITE_ENDPOINT={os.environ.get('APPWRITE_ENDPOINT', 'https://cloud.appwrite.io/v1')}")
    print(f"  VITE_APPWRITE_PROJECT_ID={os.environ['APPWRITE_PROJECT_ID']}")
    print(f"  VITE_APPWRITE_DATABASE_ID={DB_ID}")
    print(f"And set ADMIN_TEAM_ID={TEAM_ID} on the site-ops function.")


def wait_for_columns(db, table, keys, timeout=60):
    """Columns are created asynchronously; indexes can only be built once they're 'available'."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        # Newer SDKs return status as an enum (ColumnStatus.AVAILABLE); compare its value.
        statuses = [getattr(st, "value", st) for st in (attr(db.get_column(DB_ID, table, k), "status") for k in keys)]
        if all(s == "available" for s in statuses):
            return
        if any(s == "failed" for s in statuses):
            sys.exit(f"A column in {table} failed to create; check the Appwrite console.")
        time.sleep(1)
    print(f"  ! columns in {table} still processing; re-run this script if index creation fails")


if __name__ == "__main__":
    main()
