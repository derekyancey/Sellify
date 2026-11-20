"""Signed download links: acceptance tests against the real checkout function code, with an in-memory database.

    python appwrite/sync_shared.py && python appwrite/tests/test_downloads.py

No network, no real keys: every secret below is a throwaway test value.
"""
import os, sys, json, datetime as dt
from urllib.parse import urlparse, parse_qs
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "functions", "checkout", "src")
sys.path[:0] = [HERE, SRC]
os.environ.update(APPWRITE_FUNCTION_API_ENDPOINT="http://x", APPWRITE_FUNCTION_PROJECT_ID="p", APPWRITE_API_KEY="k",
                  DOWNLOAD_LINK_SECRET="test-secret-0123456789", CHECKOUT_PUBLIC_URL="https://checkout.example.com",
                  R2_ACCOUNT_ID="acct", R2_ACCESS_KEY_ID="AKID", R2_SECRET_ACCESS_KEY="sek", R2_BUCKET="sellify-deliverables", STRIPE_WEBHOOK_SECRET="whsec_test")
from fakedb import FakeDB, ctx
import main, store as store_mod, downloads as dl
db = FakeDB()
class TestStore(store_mod.Store):
    def __init__(self, key): self.db = db
main.Store = TestStore
S = TestStore("k")
ok = lambda cond, msg: (print(("PASS " if cond else "FAIL ") + msg), cond or sys.exit(1))

db.create_row("y", "sites", "site1", {"name": "MoonBear", "domain": "moonbear.shop", "currency": "USD"})
FILE = "a" * 32
db.create_row("y", "products", "zip5", {"siteId": "site1", "title": "Brush Pack", "price": 5.0, "status": "active", "inventory": 0,
              "tracksInventory": False, "deliverableFileId": FILE, "deliverableName": "brushes.zip", "variants": "[]"})
db.create_row("y", "products", "nofile", {"siteId": "site1", "title": "Coming Pack", "price": 7.0, "status": "active", "inventory": 0,
              "tracksInventory": False, "variants": "[]"})
db.create_row("y", "products", "mug", {"siteId": "site1", "title": "Mug", "price": 12.0, "status": "active", "inventory": 10,
              "tracksInventory": True, "variants": "[]"})

def checkout(items):
    cart = S.price_cart("site1", items)
    return S.create_checkout("site1", "stripe", cart, "USD", "buyer@example.com"), cart["total"]

def get(token): return main.main(ctx("GET", "/download", {"token": token}))
def post(token): return main.main(ctx("POST", "/download", body="token=" + token))

# --- paid order creates records (digital only); unpaid / expired creates none
cid, total = checkout([{"productId": "zip5"}, {"productId": "nofile"}, {"productId": "mug"}])
res = S.finalize(cid, "stripe", "pi_1", "buyer@example.com", "Buyer", total)
recs = db.list_rows("y", "downloads", [json.dumps({"method": "equal", "attribute": "orderId", "values": [cid]})]).rows
ok(len(recs) == 2 and {r["productId"] for r in recs} == {"zip5", "nofile"}, "paid order -> 1 record per digital line item (physical mug gets none)")
ok(all(r["maxDownloads"] == 5 and r["downloadCount"] == 0 for r in recs), "records start at 0 of 5 downloads")
exp = dl.epoch(recs[0]["expiresAt"]) - dl.epoch(dt.datetime.now(dt.timezone.utc))
ok(abs(exp - 7 * 86400) < 5, "links expire in 7 days")
links = {d["download"]["productId"]: d["token"] for d in res["_order"]["downloads"]}
S.finalize(cid, "stripe", "pi_1", "buyer@example.com", "Buyer", total)  # webhook retry
ok(len(db.list_rows("y", "downloads", []).rows) == 2, "a retried webhook creates no duplicate records")
cid2, _ = checkout([{"productId": "zip5"}])
main.main(ctx("POST", "/stripe/webhook"))  # (no signature -> rejected; just make sure nothing is created)
S.expire_checkout(cid2)
ok(len(db.list_rows("y", "downloads", []).rows) == 2, "an unpaid / expired checkout creates no records")

# --- valid link: page, then download redirects to the right private object
tok = links["zip5"]
r = get(tok); ok(r[1] == 200 and "Download</button>" in r[2] and "5 downloads left" in r[2], "GET shows a confirmation page and uses no download")
r = post(tok); u = urlparse(r[2])
ok(r[0] == "redirect" and r[1] == 303 and u.hostname == "acct.r2.cloudflarestorage.com" and u.path == f"/sellify-deliverables/site1/{FILE}",
   "POST redirects to the correct zip in private R2")
q = parse_qs(u.query)
ok(int(q["X-Amz-Expires"][0]) <= 300 and "brushes.zip" in q["response-content-disposition"][0], "storage URL is short-lived and names the file")
ok(db.get_row("y", "downloads", recs[0]["$id"] if recs[0]["productId"] == "zip5" else recs[1]["$id"])["downloadCount"] == 1, "downloadCount incremented")

# --- tampered links
payload, sig = tok.split(".")
ok(post(payload + "." + sig[:-2] + ("AA" if sig[-2:] != "AA" else "BB"))[1] == 403, "tampered signature -> 403")
forged = dl._b64(json.dumps({"d": json.loads(dl._unb64(payload))["d"], "o": cid, "p": "zip5", "e": 9999999999}).encode()) + "." + sig
ok(post(forged)[1] == 403, "edited expiry/payload -> 403")
ok(post("garbage")[1] == 403 and get("")[1] == 403, "malformed / missing token -> 403")

# --- after 5 downloads -> 410
for _ in range(4): last = post(tok)
ok(last[0] == "redirect", "downloads 2-5 succeed")
ok(post(tok)[1] == 410 and get(tok)[1] == 410, "6th download -> 410, not the file")

# --- expired link -> 410
cid3, t3 = checkout([{"productId": "zip5"}])
past = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=8)
r3 = S.finalize(cid3, "stripe", "pi_3", "buyer@example.com", "Buyer", t3)
d3 = r3["_order"]["downloads"][0]
db.update_row("y", "downloads", d3["download"]["$id"], {"expiresAt": dl.new_expiry(past).isoformat()})
old = dl.make_token(d3["download"]["$id"], cid3, "zip5", dl.new_expiry(past))
ok(post(old)[1] == 410, "expired link -> 410")

# --- product without a file -> coming soon, no download used
r = post(links["nofile"]); ok(r[1] == 404 and "coming soon" in r[2].lower(), "no file yet -> 'Download coming soon', not a broken link")

# --- unpaid order -> 403; refund (Stripe charge.refunded) -> 410 + revoked
cid4, t4 = checkout([{"productId": "zip5"}])
r4 = S.finalize(cid4, "stripe", "pi_4", "buyer@example.com", "Buyer", t4); tok4 = r4["_order"]["downloads"][0]["token"]
db.update_row("y", "orders", cid4, {"financialStatus": "pending"}); ok(post(tok4)[1] == 403, "unpaid order -> 403")
db.update_row("y", "orders", cid4, {"financialStatus": "paid"}); ok(post(tok4)[0] == "redirect", "paid again -> works")
import payments; payments.verify_stripe_signature = lambda *a, **k: None
ev = {"type": "charge.refunded", "data": {"object": {"payment_intent": "pi_4", "refunded": True, "amount": 500, "amount_refunded": 500}}}
main.main(ctx("POST", "/stripe/webhook", body=json.dumps(ev)))
ok(db.get_row("y", "orders", cid4)["financialStatus"] == "refunded", "charge.refunded marks the order refunded")
ok(all(r.get("revokedAt") for r in db.list_rows("y", "downloads", [json.dumps({"method": "equal", "attribute": "orderId", "values": [cid4]})]).rows), "...and revokes its download records")
ok(post(tok4)[1] == 410, "refunded order's link -> 410")

# --- reissue semantics: moving expiresAt kills the old token
d = db.list_rows("y", "downloads", [json.dumps({"method": "equal", "attribute": "orderId", "values": [cid3]})]).rows[0]
newexp = dl.new_expiry(); db.update_row("y", "downloads", d["$id"], {"expiresAt": newexp.isoformat(), "downloadCount": 0})
ok(post(dl.make_token(d["$id"], cid3, "zip5", newexp))[0] == "redirect" and post(old)[1] == 410, "a reissued link works and the previous one -> 410")

# --- no secrets in output / logs
c = ctx("POST", "/download", body="token=" + tok); out = main.main(c)
ok(not any(tok in str(l) or "X-Amz" in str(l) for l in c.logs), "token and storage URL never logged")
print("ALL PASS")
