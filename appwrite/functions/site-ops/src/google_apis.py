"""
Google Search Console + GA4 Data API (both free).

Credentials, per request: the store's own connected Google account (OAuth refresh token, see google_oauth.py)
when it has one, otherwise the shared service account in GOOGLE_SERVICE_ACCOUNT_JSON.
"""
import datetime as dt
import json
import os
from urllib.parse import quote

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import credentials as user_credentials
from google.oauth2 import service_account

from errors import HttpError

SCOPES = [
    "https://www.googleapis.com/auth/webmasters",
    "https://www.googleapis.com/auth/analytics.readonly",
]
_service_session = None
_active = {"session": None}


def use_refresh_token(refresh_token):
    """Make this request's Google calls run as a store's connected account (None = service account)."""
    if not refresh_token:
        _active["session"] = None
        return
    creds = user_credentials.Credentials(
        None, refresh_token=refresh_token, token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ.get("GOOGLE_OAUTH_CLIENT_ID"), client_secret=os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET"), scopes=SCOPES)
    _active["session"] = AuthorizedSession(creds)


def session():
    global _service_session
    if _active["session"] is not None:
        return _active["session"]
    if _service_session is None:
        raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
        if not raw:
            raise HttpError("Connect this store's Google account in Store settings → Connections "
                            "(or set GOOGLE_SERVICE_ACCOUNT_JSON on site-ops)", 409)
        creds = service_account.Credentials.from_service_account_info(json.loads(raw), scopes=SCOPES)
        _service_session = AuthorizedSession(creds)
    return _service_session


def _get(url, params=None):
    r = session().get(url, params=params, timeout=20)
    if not r.ok:
        try:
            msg = r.json()["error"]["message"]
        except Exception:
            msg = r.text[:200]
        raise HttpError(msg, 502)
    return r.json()


def list_properties():
    """GA4 properties and Search Console sites the connected account can see (for pick lists)."""
    ga4 = []
    page = None
    while True:
        d = _get("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {"pageSize": 200, **({"pageToken": page} if page else {})})
        for acc in d.get("accountSummaries", []):
            for p in acc.get("propertySummaries", []):
                ga4.append({"id": p["property"].split("/")[-1], "name": p.get("displayName", ""), "account": acc.get("displayName", "")})
        page = d.get("nextPageToken")
        if not page:
            break
    sites = _get("https://www.googleapis.com/webmasters/v3/sites").get("siteEntry", [])
    gsc = [{"id": x["siteUrl"], "permission": x.get("permissionLevel")} for x in sites if x.get("permissionLevel") != "siteUnverifiedUser"]
    return {"ga4": ga4, "gsc": gsc}


def _post(url, body):
    r = session().post(url, json=body, timeout=25)
    if not r.ok:
        try:
            msg = r.json()["error"]["message"]
        except Exception:
            msg = r.text[:200]
        raise HttpError(msg, 502)
    return r.json()


def _metric(row, i):
    return float(row["metricValues"][i]["value"])


def ga4_report(property_id, days):
    rng = [{"startDate": f"{days}daysAgo", "endDate": "today"}]
    base = {"dateRanges": rng}
    reqs = [
        {**base, "metrics": [{"name": m} for m in ("sessions", "activeUsers", "screenPageViews", "keyEvents", "bounceRate")]},
        {**base, "dimensions": [{"name": "date"}], "metrics": [{"name": "sessions"}, {"name": "activeUsers"}],
         "orderBys": [{"dimension": {"dimensionName": "date"}}]},
        {**base, "dimensions": [{"name": "sessionDefaultChannelGroup"}], "metrics": [{"name": "sessions"}],
         "orderBys": [{"metric": {"metricName": "sessions"}, "desc": True}], "limit": 8},
        {**base, "dimensions": [{"name": "pagePath"}], "metrics": [{"name": "screenPageViews"}],
         "orderBys": [{"metric": {"metricName": "screenPageViews"}, "desc": True}], "limit": 10},
    ]
    res = _post(f"https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:batchRunReports", {"requests": reqs})
    totals_r, daily_r, src_r, pages_r = res["reports"]
    t = (totals_r.get("rows") or [{"metricValues": [{"value": "0"}] * 5}])[0]
    fmt = lambda d: f"{d[:4]}-{d[4:6]}-{d[6:]}"
    return {
        "totals": {k: _metric(t, i) for i, k in enumerate(("sessions", "activeUsers", "screenPageViews", "conversions", "bounceRate"))},
        "daily": [{"date": fmt(r["dimensionValues"][0]["value"]), "sessions": _metric(r, 0), "users": _metric(r, 1)} for r in daily_r.get("rows", [])],
        "sources": [{"name": r["dimensionValues"][0]["value"], "sessions": _metric(r, 0)} for r in src_r.get("rows", [])],
        "pages": [{"path": r["dimensionValues"][0]["value"], "views": _metric(r, 0)} for r in pages_r.get("rows", [])],
    }


def _gsc_url(prop, suffix=""):
    return f"https://www.googleapis.com/webmasters/v3/sites/{quote(prop, safe='')}{suffix}"


def gsc_report(prop, days):
    end = dt.date.today()
    start = end - dt.timedelta(days=days)
    q = lambda dims, limit=10: _post(_gsc_url(prop, "/searchAnalytics/query"), {
        "startDate": start.isoformat(), "endDate": end.isoformat(), "dimensions": dims, "rowLimit": limit})
    row = lambda r: {"key": r["keys"][0], "clicks": r["clicks"], "impressions": r["impressions"], "ctr": r["ctr"], "position": r["position"]}
    totals = (q([], 1).get("rows") or [{"clicks": 0, "impressions": 0, "ctr": 0, "position": 0}])[0]
    return {
        "totals": {k: totals[k] for k in ("clicks", "impressions", "ctr", "position")},
        "daily": [{"date": r["keys"][0], "clicks": r["clicks"], "impressions": r["impressions"]} for r in q(["date"], 500).get("rows", [])],
        "queries": [row(r) for r in q(["query"], 25).get("rows", [])],
        "pages": [row(r) for r in q(["page"], 25).get("rows", [])],
    }


def gsc_sitemaps(prop):
    r = session().get(_gsc_url(prop, "/sitemaps"), timeout=20)
    if not r.ok:
        raise HttpError(r.text[:200], 502)
    return {"sitemaps": [{"path": s["path"], "lastSubmitted": s.get("lastSubmitted"), "isPending": s.get("isPending"),
                          "errors": int(s.get("errors", 0)), "warnings": int(s.get("warnings", 0))} for s in r.json().get("sitemap", [])]}


def gsc_submit_sitemap(prop, sitemap):
    r = session().put(_gsc_url(prop, f"/sitemaps/{quote(sitemap, safe='')}"), timeout=20)
    if not r.ok:
        raise HttpError(r.text[:200], 502)
