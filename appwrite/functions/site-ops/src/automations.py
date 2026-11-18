"""
Automations: run by the site-ops function's 30-minute schedule (and from the dashboard), sending automatic emails per site.

  abandoned_cart  unpaid checkout with an email, older than delayHours (≤ 7 days) -> cart-recovery email (once)
  welcome         new subscriber (opted in within 14 days, after delayHours)       -> chosen template (once)
  winback         subscriber whose last order is older than delayHours            -> chosen template (once per order gap)

Nothing is sent for a site until its email setup is verified, and only automations switched on in the dashboard run.
Marketing emails (welcome, win-back) only go to opted-in customers and carry a signed unsubscribe link.

Entry points (in site-ops main.py): the schedule trigger -> run;  /automations/run -> send;  /automations/preview -> dry run.
Env: RESEND_API_KEY, UNSUBSCRIBE_SECRET, CHECKOUT_PUBLIC_URL, AUTOMATION_MAX_PER_RUN (default 50; Resend free = 100/day)
"""
import datetime as dt
import json
import os

import emails

DB = os.environ.get("APPWRITE_DATABASE_ID", "yancey")
TYPES = ("abandoned_cart", "welcome", "winback")


def _now():
    return dt.datetime.now(dt.timezone.utc)


def _iso(d):
    return d.isoformat()


def _when(v):
    return dt.datetime.fromisoformat(str(v).replace("Z", "+00:00")) if v else None


def g(row, key):
    return emails.get(row, key) if key != "$id" else (row.get("$id") if isinstance(row, dict) else getattr(row, "id", None))


class Runner:
    def __init__(self, db, dry_run=False, budget=50, now=None, log=print):
        self.db, self.dry, self.budget, self.now, self.log = db, dry_run, budget, now or _now(), log

    def rows(self, table, queries):
        from appwrite.query import Query
        out, cursor = [], None
        while True:
            q = list(queries) + [Query.limit(100)] + ([Query.cursor_after(cursor)] if cursor else [])
            page = self.db.list_rows(DB, table, queries=q).rows
            out += page
            if len(page) < 100:
                return out
            cursor = g(page[-1], "$id")

    def mark(self, table, row_id, data):
        if not self.dry:
            self.db.update_row(DB, table, row_id, data)

    def send(self, msg, key):
        if self.dry:
            return
        emails.resend("POST", "/emails", msg, idempotency_key=key)

    # ------------------------------------------------------------------ automations
    def abandoned_cart(self, site, cfg):
        from appwrite.query import Query
        delay = dt.timedelta(hours=int(g(cfg, "delayHours") or 4))
        rows = self.rows("checkouts", [Query.equal("siteId", g(site, "$id")), Query.is_null("recoveryEmailedAt"),
                                       Query.less_than("$createdAt", _iso(self.now - delay)),
                                       Query.greater_than("$createdAt", _iso(self.now - dt.timedelta(days=7)))])
        targets = [c for c in rows if g(c, "status") in ("open", "expired") and g(c, "email")]
        done = 0
        for c in targets:
            if self.budget <= 0:
                break
            # skip if they came back and bought anyway
            later = self.rows("orders", [Query.equal("siteId", g(site, "$id")), Query.equal("customerEmail", g(c, "email")),
                                         Query.greater_than("$createdAt", g(c, "$createdAt"))])
            if later:
                self.mark("checkouts", g(c, "$id"), {"recoveryEmailedAt": _iso(self.now)})
                continue
            items = g(c, "items")
            co = {"$id": g(c, "$id"), "email": g(c, "email"), "items": json.loads(items) if isinstance(items, str) else items, "total": float(g(c, "total"))}
            subject, html, text = emails.abandoned_cart(site, co)
            msg = {"from": emails.sender(site), "to": [co["email"]], "subject": subject, "html": html, "text": text, "reply_to": g(site, "ownerEmail")}
            self.send(msg, f"recovery-{co['$id']}")
            self.mark("checkouts", co["$id"], {"recoveryEmailedAt": _iso(self.now)})
            done += 1; self.budget -= 1
        return len(targets), done

    def _template(self, cfg):
        tid = g(cfg, "templateId")
        if not tid:
            return None
        try:
            return self.db.get_row(DB, "templates", tid)
        except Exception:  # noqa: BLE001 - template deleted
            return None

    def _marketing(self, site, cfg, customers, mark_field):
        tpl = self._template(cfg)
        if not tpl:
            return len(customers), 0, "choose a template"
        base = os.environ.get("CHECKOUT_PUBLIC_URL", "")
        if not base:
            return len(customers), 0, "CHECKOUT_PUBLIC_URL not set"
        subject = g(cfg, "subject") or g(tpl, "subject") or g(site, "name")
        done = 0
        for c in customers:
            if self.budget <= 0:
                break
            r = {"email": g(c, "email"), "name": g(c, "name"), "customerId": g(c, "$id")}
            self.send(emails.marketing_message(site, subject, g(tpl, "html"), r, base), f"{mark_field}-{r['customerId']}-{(g(c, 'lastOrderAt') or '')[:10]}")
            self.mark("customers", r["customerId"], {mark_field: _iso(self.now)})
            done += 1; self.budget -= 1
        return len(customers), done, None

    def welcome(self, site, cfg):
        from appwrite.query import Query
        delay = dt.timedelta(hours=int(g(cfg, "delayHours") or 0))
        rows = self.rows("customers", [Query.equal("siteId", g(site, "$id")), Query.equal("acceptsMarketing", True), Query.is_null("welcomedAt"),
                                       Query.less_than("$createdAt", _iso(self.now - delay)),
                                       Query.greater_than("$createdAt", _iso(self.now - dt.timedelta(days=14)))])
        return self._marketing(site, cfg, [c for c in rows if g(c, "email")], "welcomedAt")

    def winback(self, site, cfg):
        from appwrite.query import Query
        cutoff = self.now - dt.timedelta(hours=int(g(cfg, "delayHours") or 24 * 60))
        rows = self.rows("customers", [Query.equal("siteId", g(site, "$id")), Query.equal("acceptsMarketing", True),
                                       Query.less_than("lastOrderAt", _iso(cutoff))])
        due = [c for c in rows if g(c, "email") and (not g(c, "winbackAt") or _when(g(c, "winbackAt")) < _when(g(c, "lastOrderAt")))]
        return self._marketing(site, cfg, due, "winbackAt")

    # ------------------------------------------------------------------ driver
    def run(self, site_id=None):
        from appwrite.query import Query
        sites = self.rows("sites", [Query.equal("$id", site_id)] if site_id else [])
        configs = self.rows("automations", [Query.equal("enabled", True)])
        report = []
        for site in sites:
            mine = {g(c, "type"): c for c in configs if g(c, "siteId") == g(site, "$id")}
            if not mine:
                continue
            if not emails.can_send(site):
                report.append({"siteId": g(site, "$id"), "skipped": "email setup not verified"})
                continue
            for t in TYPES:
                if t not in mine:
                    continue
                try:
                    res = getattr(self, t)(site, mine[t])
                    entry = {"siteId": g(site, "$id"), "type": t, "eligible": res[0], "sent": 0 if self.dry else res[1]}
                    if len(res) > 2 and res[2]:
                        entry["note"] = res[2]
                    if not self.dry and res[1]:
                        self.db.update_row(DB, "automations", g(mine[t], "$id"), {
                            "lastRunAt": _iso(self.now), "sentCount": int(g(mine[t], "sentCount") or 0) + res[1]})
                except Exception as e:  # noqa: BLE001 - one failing automation must not stop the rest
                    self.log(f"{g(site, '$id')}/{t}: {e!r}")
                    entry = {"siteId": g(site, "$id"), "type": t, "error": str(e)}
                report.append(entry)
        return {"dryRun": self.dry, "results": report, "budgetLeft": self.budget}


def run(client, dry_run=False, site_id=None, log=print):
    from appwrite.services.tables_db import TablesDB
    runner = Runner(TablesDB(client), dry_run=dry_run, budget=int(os.environ.get("AUTOMATION_MAX_PER_RUN", "50")), log=log)
    return runner.run(site_id)
