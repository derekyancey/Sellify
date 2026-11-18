"""
site-ops: one Python Appwrite Function that powers every integration in the dashboard.

Routes (all POST with a JSON body, called via functions.createExecution from the dashboard):
  /health
  /cloudflare/zone | /cloudflare/zones/find | /cloudflare/zones/create
  /cloudflare/dns/list | /cloudflare/dns/create | /cloudflare/dns/update | /cloudflare/dns/delete
  /cloudflare/purge | /cloudflare/connect-hosting
  /hosting/sites | /hosting/site | /hosting/deployments | /hosting/redeploy      (Appwrite Sites)
  /google/ga4 | /google/gsc | /google/gsc/sitemaps | /google/gsc/submit-sitemap
  /seo/crawl
  /payments/refund
  /email/setup | /email/status | /email/test | /email/order | /email/recovery | /email/campaign
  /automations/preview | /automations/run   (also runs on this function's 30-minute schedule)

Secrets are function environment variables, never sent to the browser:
  CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (only for "add zone"),
  APPWRITE_SITES_CNAME_TARGET (the CNAME target Appwrite shows when you add a domain), GOOGLE_SERVICE_ACCOUNT_JSON, ADMIN_TEAM_ID,
  STRIPE_SECRET_KEY, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV (for refunds),
  RESEND_API_KEY (email), UNSUBSCRIBE_SECRET + CHECKOUT_PUBLIC_URL (campaign unsubscribe links),
  AUTOMATION_MAX_PER_RUN (default 50)
"""
import json
import os
from urllib.parse import quote

import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # works however the runtime loads this file
import automations  # noqa: E402
import crawler  # noqa: E402
import emails  # noqa: E402
import google_apis  # noqa: E402
from errors import HttpError  # noqa: E402

CF = "https://api.cloudflare.com/client/v4"
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

    from appwrite.query import Query
    from appwrite.services.teams import Teams

    _REQUEST["key"] = headers.get("x-appwrite-key") or os.environ.get("APPWRITE_API_KEY", "")
    client = appwrite_client()
    res = Teams(client).list_memberships(team_id, queries=[Query.equal("userId", user_id)])
    members = res.memberships if hasattr(res, "memberships") else res["memberships"]
    if not any(_get(m, "confirm") for m in members):
        raise HttpError("Your account isn't on the admin team", 403)


_REQUEST = {"key": None}


def appwrite_client():
    """Server client for this project, using the function's per-execution API key (scopes in appwrite.json)."""
    from appwrite.client import Client
    return (Client().set_endpoint(os.environ["APPWRITE_FUNCTION_API_ENDPOINT"])
            .set_project(os.environ["APPWRITE_FUNCTION_PROJECT_ID"]).set_key(_REQUEST["key"] or ""))


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
            "hosting": bool(os.environ.get("APPWRITE_SITES_CNAME_TARGET")),
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


def _aw_err(e):
    return HttpError(f"Appwrite: {getattr(e, 'message', None) or e}", 502)


def _rules_for(site_id):
    from appwrite.query import Query
    from appwrite.services.proxy import Proxy
    rules = Proxy(appwrite_client()).list_rules(queries=[Query.equal("deploymentResourceId", site_id), Query.limit(50)]).rules
    return [{"id": _get(r, "id"), "domain": _get(r, "domain"), "status": _get(r, "status"), "certificate": _get(r, "certificatestatus"),
             "logs": _get(r, "logs")} for r in rules]


def cf_connect_hosting(b):
    """Serve the store's domain (and www) from an Appwrite Site: add the domains to the site, then point Cloudflare DNS at Appwrite."""
    from appwrite.exception import AppwriteException
    from appwrite.services.proxy import Proxy
    zone_id, domain, site_id = need(b, "zoneId", "domain", "siteId")
    target = env("APPWRITE_SITES_CNAME_TARGET").strip().rstrip(".")
    proxy = Proxy(appwrite_client())
    hosts = [domain, f"www.{domain}"]
    added = []
    for host in hosts:
        try:
            proxy.create_site_rule(host, site_id)
            added.append(host)
        except AppwriteException as e:
            if e.code != 409:  # 409 = this domain is already on the project
                raise _aw_err(e)
    # DNS-only CNAMEs (apex works on Cloudflare through CNAME flattening) so Appwrite can issue the certificate.
    for r in cf("GET", f"/zones/{zone_id}/dns_records", params={"per_page": 500}):
        if r["name"] in hosts and r["type"] in ("A", "AAAA", "CNAME"):
            cf("DELETE", f"/zones/{zone_id}/dns_records/{r['id']}")
    created = []
    for host in hosts:
        cf("POST", f"/zones/{zone_id}/dns_records", json={"type": "CNAME", "name": host, "content": target, "proxied": False, "ttl": 1})
        created.append(f"CNAME {host} -> {target}")
    for rule in _rules_for(site_id):  # ask Appwrite to verify now; it also retries on its own
        if rule["domain"] in hosts and rule["status"] != "verified":
            try:
                proxy.update_rule_status(rule["id"])
            except AppwriteException:
                pass
    return {"created": created, "domainsAdded": added}


def hosting_sites(_):
    from appwrite.services.sites import Sites
    try:
        sites = Sites(appwrite_client()).list().sites
    except Exception as e:  # noqa: BLE001
        raise _aw_err(e)
    return {"sites": [{"id": _get(x, "id"), "name": _get(x, "name"), "framework": _get(x, "framework"),
                       "status": _get(x, "latestdeploymentstatus")} for x in sites]}


def hosting_site(b):
    from appwrite.services.sites import Sites
    (site_id,) = need(b, "siteId")
    try:
        x = Sites(appwrite_client()).get(site_id)
        domains = _rules_for(site_id)
    except Exception as e:  # noqa: BLE001
        raise _aw_err(e)
    return {"id": _get(x, "id"), "name": _get(x, "name"), "framework": _get(x, "framework"), "live": _get(x, "live"),
            "deploymentId": _get(x, "deploymentid"), "deployedAt": _get(x, "deploymentcreatedat"),
            "repository": bool(_get(x, "providerrepositoryid")), "branch": _get(x, "providerbranch"), "domains": domains}


def hosting_deployments(b):
    from appwrite.query import Query
    from appwrite.services.sites import Sites
    (site_id,) = need(b, "siteId")
    try:
        sites = Sites(appwrite_client())
        active = _get(sites.get(site_id), "deploymentid")
        deps = sites.list_deployments(site_id, queries=[Query.order_desc("$createdAt"), Query.limit(15)]).deployments
    except Exception as e:  # noqa: BLE001
        raise _aw_err(e)
    return {"deployments": [{"id": _get(d, "id"), "status": _get(d, "status"), "active": _get(d, "id") == active,
                             "message": _get(d, "providercommitmessage"), "branch": _get(d, "providerbranch"),
                             "commit": _get(d, "providercommithash"), "createdAt": _get(d, "createdat"),
                             "buildSeconds": _get(d, "buildduration"), "type": _get(d, "type")} for d in deps]}


def hosting_redeploy(b):
    """Rebuild from the connected Git branch, or re-run the latest deployment if the site isn't connected to Git."""
    from appwrite.enums.vcs_reference_type import VCSReferenceType
    from appwrite.query import Query
    from appwrite.services.sites import Sites
    (site_id,) = need(b, "siteId")
    sites = Sites(appwrite_client())
    try:
        site = sites.get(site_id)
        if _get(site, "providerrepositoryid"):
            d = sites.create_vcs_deployment(site_id, VCSReferenceType.BRANCH, _get(site, "providerbranch") or "main", activate=True)
        else:
            latest = sites.list_deployments(site_id, queries=[Query.order_desc("$createdAt"), Query.limit(1)]).deployments
            if not latest:
                raise HttpError("This site has no deployments yet. Connect it to Git or upload one in Appwrite.", 409)
            d = sites.create_duplicate_deployment(site_id, _get(latest[0], "id"))
    except HttpError:
        raise
    except Exception as e:  # noqa: BLE001
        raise _aw_err(e)
    return {"ok": True, "deploymentId": _get(d, "id")}


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


def email_recovery(b):
    site, checkout = need(b, "site", "checkout")
    if not emails.can_send(site):
        raise HttpError("Finish email setup for this site first (Settings → Email)", 409)
    if not checkout.get("email"):
        raise HttpError("This checkout has no email address")
    subject, body_html, text = emails.abandoned_cart(site, checkout)
    res = emails.send(site, checkout["email"], subject, body_html, text, idempotency_key=f"recovery-{checkout.get('$id')}")
    return {"ok": True, "id": res.get("id")}


def email_campaign(b):
    """Send a campaign through Resend's batch API (100 per request). Each email gets its own unsubscribe link."""
    site, subject, body, recipients = need(b, "site", "subject", "html", "recipients")
    test = bool(b.get("test"))
    if not emails.can_send(site):
        raise HttpError("Finish email setup for this site first (Settings → Email)", 409)
    if not test and "{{unsubscribe_url}}" not in body:
        raise HttpError("Campaign emails must include an {{unsubscribe_url}} link")
    if len(recipients) > 5000:
        raise HttpError("Send at most 5,000 recipients per campaign")
    base = (os.environ.get("CHECKOUT_PUBLIC_URL") or "").rstrip("/")
    if not test and not base:
        raise HttpError("CHECKOUT_PUBLIC_URL is not set on site-ops (the checkout function's public domain)", 500)
    one = lambda r: emails.marketing_message(site, subject, body, r, base, test)

    sent, failed, last_error = 0, 0, None
    batch_key = b.get("campaignId") or "test"
    for i in range(0, len(recipients), 100):
        chunk = [r for r in recipients[i:i + 100] if r.get("email")]
        try:
            emails.resend("POST", "/emails/batch", [one(r) for r in chunk], idempotency_key=f"campaign-{batch_key}-{i}")
            sent += len(chunk)
        except HttpError as e:  # keep going; report partial failures
            failed += len(chunk)
            last_error = str(e)
    return {"ok": failed == 0, "sent": sent, "failed": failed, "error": last_error}


def automations_preview(b):
    return automations.run(appwrite_client(), dry_run=True, site_id=b.get("siteId"))


def automations_run(b):
    return automations.run(appwrite_client(), site_id=b.get("siteId"))


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
    "/cloudflare/connect-hosting": cf_connect_hosting,
    "/hosting/sites": hosting_sites,
    "/hosting/site": hosting_site,
    "/hosting/deployments": hosting_deployments,
    "/hosting/redeploy": hosting_redeploy,
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
    "/email/recovery": email_recovery,
    "/email/campaign": email_campaign,
    "/automations/preview": automations_preview,
    "/automations/run": automations_run,
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
    headers = {k.lower(): v for k, v in (context.req.headers or {}).items()}
    if headers.get("x-appwrite-trigger") == "schedule":  # Appwrite's timer, not a person: send due automation emails
        _REQUEST["key"] = headers.get("x-appwrite-key") or os.environ.get("APPWRITE_API_KEY", "")
        try:
            return context.res.json(automations.run(appwrite_client(), log=context.error))
        except Exception as e:  # noqa: BLE001
            context.error(f"automations: {e!r}")
            return context.res.json({"error": str(e)}, 500)
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
