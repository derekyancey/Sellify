"""In-memory stand-in for appwrite TablesDB (just the calls the functions use) + an Appwrite function context."""
import builtins, copy, json, datetime as dt
from types import SimpleNamespace
from appwrite.exception import AppwriteException

class FakeDB:
    def __init__(self): self.t = {}
    def _tab(self, table): return self.t.setdefault(table, {})
    def get_row(self, db, table, rid):
        r = self._tab(table).get(rid)
        if r is None: raise AppwriteException("not found", 404)
        return copy.deepcopy(r)
    def create_row(self, db, table, rid, data, permissions=None):
        if rid == "unique()": rid = f"r{len(self._tab(table))+1}"
        if rid in self._tab(table): raise AppwriteException("exists", 409)
        row = {**copy.deepcopy(data), "$id": rid, "$createdAt": dt.datetime.now(dt.timezone.utc).isoformat()}
        self._tab(table)[rid] = row; return copy.deepcopy(row)
    def update_row(self, db, table, rid, data=None, permissions=None):
        r = self._tab(table).get(rid)
        if r is None: raise AppwriteException("not found", 404)
        r.update(copy.deepcopy(data or {})); return copy.deepcopy(r)
    def increment_row_column(self, db, table, rid, col, value=1, max=None):
        r = self._tab(table)[rid]
        if max is not None and (r.get(col) or 0) + value > max: raise AppwriteException("max", 400)
        r[col] = (r.get(col) or 0) + value; return copy.deepcopy(r)
    def decrement_row_column(self, db, table, rid, col, value=1, min=None):
        r = self._tab(table)[rid]; r[col] = r.get(col, 0) - value
        if min is not None: r[col] = builtins.max(min, r[col])
        return copy.deepcopy(r)
    def list_rows(self, db, table, queries=None, total=None):
        rows = list(self._tab(table).values()); limit = 25
        for q in queries or []:
            q = json.loads(q); m = q["method"]
            if m == "equal": rows = [r for r in rows if r.get(q["attribute"]) in q["values"]]
            elif m == "limit": limit = q["values"][0]
            elif m == "orderDesc": rows.sort(key=lambda r: r.get(q["attribute"]) or 0, reverse=True)
            elif m == "greaterThan": rows = [r for r in rows if (r.get(q["attribute"]) or "") > q["values"][0]]
        return SimpleNamespace(rows=copy.deepcopy(rows[:limit]), total=len(rows))

class Res:
    def json(self, data, status=200, headers=None): return ("json", status, data, headers or {})
    def text(self, body, status=200, headers=None): return ("text", status, body, headers or {})
    def redirect(self, url, status=302, headers=None): return ("redirect", status, url, headers or {})

def ctx(method, path, query=None, body="", headers=None):
    req = SimpleNamespace(method=method, path=path, query=query or {}, headers=headers or {}, body_text=body, body=body)
    logs = []
    return SimpleNamespace(req=req, res=Res(), error=logs.append, log=logs.append, logs=logs)
