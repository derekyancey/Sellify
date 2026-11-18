"""
One-time (and safe to re-run) Appwrite setup for Sellify.

Creates the admin team, the database, the sites / products / orders / customers tables,
their columns and indexes, and (optionally) your first admin login.

    pip install -r appwrite/requirements.txt
    export APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1   # or your region, e.g. https://nyc.cloud.appwrite.io/v1
    export APPWRITE_PROJECT_ID=...                          # Appwrite console → project settings
    export APPWRITE_API_KEY=...                             # key with databases, tables, teams, users scopes
    export ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=...   # optional: creates your login and adds it to the team
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
from appwrite.services.tables_db import TablesDB
from appwrite.services.teams import Teams
from appwrite.services.users import Users

DB_ID = os.environ.get("APPWRITE_DATABASE_ID", "sellify")
TEAM_ID = os.environ.get("ADMIN_TEAM_ID", "admins")

# column helpers: (kind, key, required, extra kwargs)
S = lambda key, size=255, req=False: ("varchar", key, req, {"size": size})
LT = lambda key, req=False: ("longtext", key, req, {})
F = lambda key, req=False, **kw: ("float", key, req, kw)
I = lambda key, req=False, **kw: ("integer", key, req, kw)
E = lambda key, elements, default: ("enum", key, False, {"elements": elements, "default": default})

SCHEMA = {
    "sites": {
        "public_read": False,
        "columns": [S("name", 128, True), S("domain", 255, True), S("currency", 8), S("cloudflareZoneId", 64),
                    S("netlifySiteId", 64), S("gscProperty", 255), S("ga4PropertyId", 32)],
        "indexes": [("domain_unique", TablesDBIndexType.UNIQUE, ["domain"])],
    },
    "products": {
        "public_read": True,  # lets your storefront sites read the catalog with the public Web SDK
        "columns": [S("siteId", 36, True), S("title", 255, True), LT("description"), F("price", True, min=0), F("compareAtPrice", min=0),
                    S("sku", 64), I("inventory", min=0, default=0), E("status", ["active", "draft", "archived"], "draft"), S("imageUrl", 2048)],
        "indexes": [("by_site", TablesDBIndexType.KEY, ["siteId"])],
    },
    "customers": {
        "public_read": False,
        "columns": [S("siteId", 36, True), S("name", 128, True), S("email", 255, True), S("phone", 32),
                    I("ordersCount", min=0, default=0), F("totalSpent", min=0, default=0)],
        "indexes": [("by_site", TablesDBIndexType.KEY, ["siteId"]), ("by_email", TablesDBIndexType.KEY, ["email"])],
    },
    "orders": {
        "public_read": False,
        "columns": [S("siteId", 36, True), I("number", True, min=0), S("customerId", 36), S("customerName", 128), S("customerEmail", 255),
                    LT("items"), F("total", True, min=0), E("financialStatus", ["pending", "paid", "refunded"], "pending"),
                    E("fulfillmentStatus", ["unfulfilled", "fulfilled", "cancelled"], "unfulfilled"),
                    E("paymentProvider", ["manual", "stripe", "paypal"], "manual"), S("paymentRef", 128)],
        "indexes": [("by_site", TablesDBIndexType.KEY, ["siteId"]), ("by_number", TablesDBIndexType.KEY, ["siteId", "number"])],
    },
    # Carts that were sent to Stripe/PayPal. Only the checkout function (server key) touches these.
    "checkouts": {
        "public_read": False,
        "columns": [S("siteId", 36, True), E("provider", ["stripe", "paypal"], "stripe"), S("providerRef", 128), LT("items"),
                    F("total", True, min=0), S("currency", 8), E("status", ["open", "completed", "expired"], "open"), S("email", 255)],
        "indexes": [("by_ref", TablesDBIndexType.KEY, ["providerRef"])],
    },
}


def attr(obj, key):
    return obj.get(key) if isinstance(obj, dict) else getattr(obj, key, None)


def ensure(label, fn):
    """Run a create call; treat 'already exists' (409) as success so the script can be re-run."""
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
    ensure(f"team '{TEAM_ID}'", lambda: teams.create(TEAM_ID, "Sellify admins"))
    admin = Role.team(TEAM_ID)

    print("Database")
    ensure(f"database '{DB_ID}'", lambda: db.create(DB_ID, "Sellify"))

    for table, spec in SCHEMA.items():
        print(f"Table {table}")
        perms = [Permission.read(admin), Permission.create(admin), Permission.update(admin), Permission.delete(admin)]
        if spec["public_read"]:
            perms.append(Permission.read(Role.any()))
        ensure(table, lambda: db.create_table(DB_ID, table, table.capitalize(), permissions=perms, row_security=False))
        for kind, key, req, kw in spec["columns"]:
            fn = getattr(db, f"create_{kind}_column")
            if req:
                kw = {k: v for k, v in kw.items() if k != "default"}  # Appwrite forbids defaults on required columns
            ensure(f"column {key}", lambda: fn(DB_ID, table, key, required=req, **kw) if kind != "varchar"
                   else fn(DB_ID, table, key, kw["size"], req))
        wait_for_columns(db, table, [c[1] for c in spec["columns"]])
        for key, kind, cols in spec["indexes"]:
            ensure(f"index {key}", lambda: db.create_index(DB_ID, table, key, kind, cols))

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

    print("\nDone. Put these in your .env / Netlify environment:")
    print(f"  VITE_APPWRITE_ENDPOINT={os.environ.get('APPWRITE_ENDPOINT', 'https://cloud.appwrite.io/v1')}")
    print(f"  VITE_APPWRITE_PROJECT_ID={os.environ['APPWRITE_PROJECT_ID']}")
    print(f"  VITE_APPWRITE_DATABASE_ID={DB_ID}")
    print(f"And set ADMIN_TEAM_ID={TEAM_ID} on the site-ops function.")


def wait_for_columns(db, table, keys, timeout=60):
    """Columns are created asynchronously; indexes can only be built once they're 'available'."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        statuses = [attr(db.get_column(DB_ID, table, k), "status") for k in keys]
        if all(s == "available" for s in statuses):
            return
        if any(s == "failed" for s in statuses):
            sys.exit(f"A column in {table} failed to create; check the Appwrite console.")
        time.sleep(1)
    print(f"  ! columns in {table} still processing; re-run this script if index creation fails")


if __name__ == "__main__":
    main()
