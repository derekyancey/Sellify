"""
site-ops: one Python Appwrite Function that powers every integration in the dashboard.

Routes (all POST with a JSON body, called via functions.createExecution from the dashboard):
  /health
  /cloudflare/zone | /cloudflare/zones/find | /cloudflare/zones/create
  /cloudflare/dns/list | /cloudflare/dns/create | /cloudflare/dns/update | /cloudflare/dns/delete
  /cloudflare/purge | /cloudflare/connect-netlify
  /netlify/sites | /netlify/site | /netlify/deploys | /netlify/build
  /google/ga4 | /google/gsc | /google/gsc/sitemaps | /google/gsc/submit-sitemap
  /seo/crawl
  /payments/refund
  /email/setup | /email/status | /email/test | /email/order

Secrets are function environment variables, never sent to the browser:
  CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (only for "add zone"),
  NETLIFY_AUTH_TOKEN, GOOGLE_SERVICE_ACCOUNT_JSON, ADMIN_TEAM_ID,
  STRIPE_SECRET_KEY, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV (for refunds),
  RESEND_API_KEY (email)
"""
import json
import os

import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # works however the runtime loads this file
import crawler  # noqa: E402
import emails  # noqa: E402
import google_apis  # noqa: E402
from errors import HttpError  # noqa: E402

CF = "https://api.cloudflare.com/client/v4"
NETLIFY = "https://api.netlify.com/api/v1"
TIMEOUT = 20


# --------------------------------------------------------------------------- auth
def require_admin(context):
    """Only signed-in members of the ADMIN_TEAM_ID team may call this function."""
    headers = {k.lower(): v for k, v in (context.req.headers or {}).items()}
    user_id = headers.get("x-appwrite-user-id")
    if not user_id:
        raise HttpError("Sign in required", 401)
    team_id = os.environ.get("ADMIN_TEAM_ID")
    if not team_id:
        raise HttpError("ADMIN_TEAM_ID is not set on the site-ops function", 500)

    from appwrite.client import Client
    from appwrite.query import Query
    from appwrite.services.teams import Teams

    client = (
        Client()
        .set_endpoint(os.environ["APPWRITE_FUNCTION_API_ENDPOINT"])
        .set_project(os.environ["APPWRITE_FUNCTION_PROJECT_ID"])
        .set_key(headers.get("x-appwrite-key") or os.environ.get("APPWRITE_API_KEY", ""))
    )
    res = Teams(client).list_memberships(team_id, queries=[Query.equal("userId", user_id)])
    members = res.memberships if hasattr(res, "memberships") else res["memberships"]
    if not any(_get(m, "confirm") for m in members):
        raise HttpError("Your account isn't on the admin team", 403)


def _get(obj, key):
    return obj.get(key) if isinstance(obj, dict) else getattr(obj, key, None)


# --------------------------------------------------------------------------- helpers
def env(name):
    value = os.environ.get(name)
    if not value:
        raise HttpError(f"{name} is not set on the site-ops function", 500)
    return value


def cf(method, path, **kw):
    r = requests.request(method, CF + path, headers={"Authorization": f"Bearer {env('CLOUDFLARE_API_TOKEN')}"}, timeout=TIMEOUT, **kw)
    data = r.json() if r.content else {}
    if not data.get("success", r.ok):
        msg = "; ".join(e.get("message", "") for e in data.get("errors", [])) or r.text[:200]
        raise HttpError(f"Cloudflare: {msg}", 502)
    return data.get("result")


def nf(method, path, **kw):
    r = requests.request(method, NETLIFY + path, headers={"Authorization": f"Bearer {env('NETLIFY_AUTH_TOKEN')}"}, timeout=TIMEOUT, **kw)
    if not r.ok:
        raise HttpError(f"Netlify: {r.status_code} {r.text[:200]}", 502)
    return r.json() if r.content else {}


def need(body, *keys):
    missing = [k for k in keys if not body.get(k)]
    if missing:
        raise HttpError(f"Missing: {', '.join(missing)}")
    return [body[k] for k in keys]


def dns_payload(rec, domain=None):
    name = rec.get("name") or "@"
    if name == "@" and domain:
        name = domain
    out = {"type": rec["type"], "name": name, "content": rec["content"], "ttl": int(rec.get("ttl") or 1)}
    if rec["type"] in ("A", "AAAA", "CNAME"):
        out["proxied"] = bool(rec.get("proxied"))
    if rec["type"] == "MX":
        out["priority"] = int(rec.get("priority") or 10)
    return out


DNS_FIELDS = ("id", "type", "name", "content", "proxied", "ttl", "priority")


# --------------------------------------------------------------------------- routes
def health(_):
    sa = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    email = None
    if sa:
        try:
            email = json.loads(sa).get("client_email")
        except ValueError:
            pass
    return {
        "ok": True,
        "integrations": {
            "cloudflare": bool(os.environ.get("CLOUDFLARE_API_TOKEN")),
            "netlify": bool(os.environ.get("NETLIFY_AUTH_TOKEN")),
            "google": bool(email),
            "stripe": bool(os.environ.get("STRIPE_SECRET_KEY")),
            "paypal": bool(os.environ.get("PAYPAL_CLIENT_ID") and os.environ.get("PAYPAL_CLIENT_SECRET")),
            "email": bool(os.environ.get("RESEND_API_KEY")),
        },
        "serviceAccountEmail": email,
    }


def cf_zone(b):
    (zone_id,) = need(b, "zoneId")
    z = cf("GET", f"/zones/{zone_id}")
    return {k: z.get(k) for k in ("id", "name", "status", "name_servers", "original_name_servers", "plan")}


def cf_zones_find(b):
    (domain,) = need(b, "domain")
    zones = cf("GET", "/zones", params={"name": domain})
    return {"zones": [{k: z.get(k) for k in ("id", "name", "status", "name_servers")} for z in zones]}


def cf_zones_create(b):
    (domain,) = need(b, "domain")
    z = cf("POST", "/zones", json={"name": domain, "account": {"id": env("CLOUDFLARE_ACCOUNT_ID")}, "type": "full"})
    return {"zone": {k: z.get(k) for k in ("id", "name", "status", "name_servers")}}


def cf_dns_list(b):
    (zone_id,) = need(b, "zoneId")
    records = cf("GET", f"/zones/{zone_id}/dns_records", params={"per_page": 500})
    return {"records": [{k: r.get(k) for k in DNS_FIELDS} for r in records]}


def cf_dns_create(b):
    zone_id, rec = need(b, "zoneId", "record")
    r = cf("POST", f"/zones/{zone_id}/dns_records", json=dns_payload(rec, b.get("domain")))
    return {"record": {k: r.get(k) for k in DNS_FIELDS}}


def cf_dns_update(b):
    zone_id, record_id, rec = need(b, "zoneId", "recordId", "record")
    r = cf("PUT", f"/zones/{zone_id}/dns_records/{record_id}", json=dns_payload(rec, b.get("domain")))
    return {"record": {k: r.get(k) for k in DNS_FIELDS}}


def cf_dns_delete(b):
    zone_id, record_id = need(b, "zoneId", "recordId")
    cf("DELETE", f"/zones/{zone_id}/dns_records/{record_id}")
    return {"ok": True}


def cf_purge(b):
    (zone_id,) = need(b, "zoneId")
    cf("POST", f"/zones/{zone_id}/purge_cache", json={"purge_everything": True})
    return {"ok": True}


def cf_connect_netlify(b):
    """Point apex + www at a Netlify site (DNS-only, so Netlify can issue SSL) and register the domain on Netlify."""
    zone_id, domain, site_id = need(b, "zoneId", "domain", "netlifySiteId")
    site = nf("GET", f"/sites/{site_id}")
    target = f"{site['name']}.netlify.app"
    hosts = {domain, f"www.{domain}"}
    for r in cf("GET", f"/zones/{zone_id}/dns_records", params={"per_page": 500}):
        if r["name"] in hosts and r["type"] in ("A", "AAAA", "CNAME"):
            cf("DELETE", f"/zones/{zone_id}/dns_records/{r['id']}")
    created = []
    for host in sorted(hosts):  # apex CNAME works on Cloudflare via CNAME flattening
        cf("POST", f"/zones/{zone_id}/dns_records", json={"type": "CNAME", "name": host, "content": target, "proxied": False, "ttl": 1})
        created.append(f"CNAME {host} -> {target}")
    nf("PATCH", f"/sites/{site_id}", json={"custom_domain": domain, "domain_aliases": sorted(set(site.get("domain_aliases") or []) | {f"www.{domain}"})})
    try:
        nf("POST", f"/sites/{site_id}/ssl")  # ask Netlify to (re)provision Let's Encrypt
    except HttpError:
        pass  # DNS may not have propagated yet; Netlify retries automatically
    return {"created": created, "netlify": f"custom domain set to {domain}"}


def nf_sites(_):
    sites = nf("GET", "/sites", params={"per_page": 100, "filter": "all"})
    return {"sites": [{"id": s["id"], "name": s["name"], "url": s.get("ssl_url") or s.get("url")} for s in sites]}


def nf_site(b):
    (site_id,) = need(b, "siteId")
    s = nf("GET", f"/sites/{site_id}")
    keys = ("id", "name", "url", "ssl_url", "admin_url", "custom_domain", "domain_aliases", "ssl")
    out = {k: s.get(k) for k in keys}
    out["published_deploy"] = {k: (s.get("published_deploy") or {}).get(k) for k in ("id", "published_at")}
    return out


def nf_deploys(b):
    (site_id,) = need(b, "siteId")
    deploys = nf("GET", f"/sites/{site_id}/deploys", params={"per_page": 15})
    keys = ("id", "state", "branch", "title", "commit_ref", "created_at", "deploy_time", "error_message", "deploy_ssl_url")
    return {"deploys": [{k: d.get(k) for k in keys} for d in deploys]}


def nf_build(b):
    (site_id,) = need(b, "siteId")
    nf("POST", f"/sites/{site_id}/builds", json={"clear_cache": bool(b.get("clearCache"))})
    return {"ok": True}


def ga4(b):
    (prop,) = need(b, "propertyId")
    return google_apis.ga4_report(str(prop), int(b.get("days") or 28))


def gsc(b):
    (prop,) = need(b, "property")
    return google_apis.gsc_report(prop, int(b.get("days") or 28))


def gsc_sitemaps(b):
    (prop,) = need(b, "property")
    return google_apis.gsc_sitemaps(prop)


def gsc_submit(b):
    prop, sitemap = need(b, "property", "sitemap")
    google_apis.gsc_submit_sitemap(prop, sitemap)
    return {"ok": True}


def seo_crawl(b):
    (url,) = need(b, "url")
    return crawler.crawl(url, max_pages=min(int(b.get("maxPages") or 50), 200))


def payments_refund(b):
    """Refund a Stripe PaymentIntent or PayPal capture. Omit amount for a full refund."""
    provider, ref = need(b, "provider", "paymentRef")
    amount = b.get("amount")
    if provider == "stripe":
        data = {"payment_intent": ref, "reason": "requested_by_customer"}
        if amount:
            data["amount"] = int(round(float(amount) * 100))
        r = requests.post("https://api.stripe.com/v1/refunds", auth=(env("STRIPE_SECRET_KEY"), ""), data=data,
                          headers={"Idempotency-Key": f"refund-{ref}-{amount or 'full'}"}, timeout=TIMEOUT)
        body = r.json()
        if not r.ok:
            raise HttpError(f"Stripe: {body.get('error', {}).get('message', r.text[:200])}", 502)
        return {"ok": True, "refundId": body["id"], "status": body["status"]}
    if provider == "paypal":
        base = "https://api-m.paypal.com" if os.environ.get("PAYPAL_ENV", "sandbox") == "live" else "https://api-m.sandbox.paypal.com"
        tok = requests.post(f"{base}/v1/oauth2/token", auth=(env("PAYPAL_CLIENT_ID"), env("PAYPAL_CLIENT_SECRET")),
                            data={"grant_type": "client_credentials"}, timeout=TIMEOUT)
        if not tok.ok:
            raise HttpError("PayPal: could not authenticate", 502)
        payload = {"amount": {"value": f"{float(amount):.2f}", "currency_code": b.get("currency", "USD")}} if amount else {}
        r = requests.post(f"{base}/v2/payments/captures/{ref}/refund", json=payload, timeout=TIMEOUT,
                          headers={"Authorization": f"Bearer {tok.json()['access_token']}", "PayPal-Request-Id": f"refund-{ref}-{amount or 'full'}"})
        body = r.json() if r.content else {}
        if not r.ok:
            raise HttpError(f"PayPal: {(body.get('details') or [{}])[0].get('description') or body.get('message') or r.text[:200]}", 502)
        return {"ok": True, "refundId": body.get("id"), "status": body.get("status")}
    raise HttpError(f"Can't refund provider '{provider}' automatically")


# --------------------------------------------------------------------------- email (Resend)
def _email_records(domain, d):
    out = []
    for r in d.get("records", []):
        name = r.get("name") or ""
        full = domain if name in ("", "@") else (name if name.endswith(domain) else f"{name}.{domain}")
        out.append({"type": r.get("type"), "name": full, "value": r.get("value"), "priority": r.get("priority"),
                    "status": r.get("status"), "purpose": r.get("record")})
    return out


def _status(d):
    s = d.get("status") or "pending"
    return "verified" if s == "verified" else "failed" if s == "failed" else "pending"


def email_setup(b):
    """Register the site's domain with Resend and publish its DNS records to Cloudflare."""
    (domain,) = need(b, "domain")
    existing = next((d for d in emails.resend("GET", "/domains").get("data", []) if d.get("name") == domain), None)
    d = emails.resend("GET", f"/domains/{existing['id']}") if existing else emails.resend("POST", "/domains", {"name": domain})
    records = _email_records(domain, d)
    added, skipped = [], []
    if b.get("zoneId"):
        current = cf("GET", f"/zones/{b['zoneId']}/dns_records", params={"per_page": 500})
        have = {(r["type"], r["name"].lower(), r["content"].strip('"')) for r in current}
        for r in records:
            key = (r["type"], r["name"].lower(), (r["value"] or "").strip('"'))
            if key in have:
                skipped.append(r["name"]); continue
            rec = {"type": r["type"], "name": r["name"], "content": r["value"], "ttl": 1}
            if r["type"] == "MX":
                rec["priority"] = int(r.get("priority") or 10)
            cf("POST", f"/zones/{b['zoneId']}/dns_records", json=rec)
            added.append(f"{r['type']} {r['name']}")
    try:
        emails.resend("POST", f"/domains/{d['id']}/verify")
    except HttpError:
        pass  # verification is retried by Resend; status shows the result
    return {"domainId": d["id"], "status": _status(d), "records": records, "addedToCloudflare": added, "alreadyPresent": skipped}


def email_status(b):
    domain_id, domain = need(b, "domainId", "domain")
    d = emails.resend("GET", f"/domains/{domain_id}")
    if _status(d) != "verified":
        try:
            emails.resend("POST", f"/domains/{domain_id}/verify")
        except HttpError:
            pass
    return {"status": _status(d), "records": _email_records(domain, d)}


def email_test(b):
    (site,) = need(b, "site")
    if not site.get("ownerEmail") or not site.get("senderAddress"):
        raise HttpError("Enter your email and sender address first")
    subject, body_html, text = emails.test_email(site)
    res = emails.send(site, site["ownerEmail"], subject, body_html, text)
    return {"ok": True, "id": res.get("id"), "to": site["ownerEmail"]}


def email_order(b):
    """Customer notifications sent from the dashboard (currently: shipped)."""
    site, order = need(b, "site", "order")
    if not emails.can_send(site):
        raise HttpError("Finish email setup for this site first (Settings → Email)", 409)
    if not order.get("customerEmail"):
        raise HttpError("This order has no customer email")
    subject, body_html, text = emails.order_shipped(site, order, b.get("tracking"))
    res = emails.send(site, order["customerEmail"], subject, body_html, text, idempotency_key=f"shipped-{order.get('$id')}")
    return {"ok": True, "id": res.get("id")}


ROUTES = {
    "/health": health,
    "/cloudflare/zone": cf_zone,
    "/cloudflare/zones/find": cf_zones_find,
    "/cloudflare/zones/create": cf_zones_create,
    "/cloudflare/dns/list": cf_dns_list,
    "/cloudflare/dns/create": cf_dns_create,
    "/cloudflare/dns/update": cf_dns_update,
    "/cloudflare/dns/delete": cf_dns_delete,
    "/cloudflare/purge": cf_purge,
    "/cloudflare/connect-netlify": cf_connect_netlify,
    "/netlify/sites": nf_sites,
    "/netlify/site": nf_site,
    "/netlify/deploys": nf_deploys,
    "/netlify/build": nf_build,
    "/google/ga4": ga4,
    "/google/gsc": gsc,
    "/google/gsc/sitemaps": gsc_sitemaps,
    "/google/gsc/submit-sitemap": gsc_submit,
    "/seo/crawl": seo_crawl,
    "/payments/refund": payments_refund,
    "/email/setup": email_setup,
    "/email/status": email_status,
    "/email/test": email_test,
    "/email/order": email_order,
}


def _body(req):
    try:
        data = req.body_json
    except Exception:  # empty or non-JSON body
        raw = getattr(req, "body_text", None) or getattr(req, "body", None) or "{}"
        data = json.loads(raw) if isinstance(raw, str) and raw.strip() else {}
    return data if isinstance(data, dict) else {}


def main(context):
    path = (context.req.path or "/").rstrip("/") or "/"
    handler = ROUTES.get(path)
    if not handler:
        return context.res.json({"error": f"Unknown route {path}"}, 404)
    try:
        require_admin(context)
        return context.res.json(handler(_body(context.req)))
    except HttpError as e:
        return context.res.json({"error": str(e)}, e.status)
    except requests.RequestException as e:
        context.error(f"{path}: {e!r}")
        return context.res.json({"error": f"Upstream request failed: {e}"}, 502)
    except Exception as e:  # noqa: BLE001 - always answer JSON so the UI can show it
        context.error(f"{path}: {e!r}")
        return context.res.json({"error": str(e) or e.__class__.__name__}, 500)
