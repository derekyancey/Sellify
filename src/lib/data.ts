import { ID, Query } from "appwrite";
import { config, functions, isDemo, tables } from "./appwrite";
import { buildDemo, demoOps } from "./demo";
import type { Order, RowOf, TableName } from "./types";

/* ------------------------------------------------------------------ */
/* Rows: Appwrite TablesDB in production, localStorage in demo mode    */
/* ------------------------------------------------------------------ */
const DEMO_KEY = "yancey-demo-v8";
type DemoDB = { [K in TableName]: RowOf<K>[] };

function demoDb(): DemoDB {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) return { ...emptyDb(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  const db = { ...emptyDb(), ...buildDemo() } as DemoDB;
  saveDemo(db);
  return db;
}
const emptyDb = () => ({ collections: [], discounts: [], segments: [], templates: [], campaigns: [], checkouts: [], automations: [], downloads: [] });
function saveDemo(db: DemoDB) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch { /* ignore */ } }
export function resetDemo() { try { localStorage.removeItem(DEMO_KEY); } catch { /* ignore */ } }

// Some columns hold JSON in Appwrite (longtext); (de)serialize them here.
const JSON_COLS: Partial<Record<TableName, string[]>> = {
  orders: ["items", "billingAddress", "shippingAddress", "tags"], checkouts: ["items"], segments: ["rules"],
  products: ["images", "variants", "tags", "digitalFiles"], customers: ["address", "tags"],
};
const toRow = (t: TableName, data: any) => {
  const out = { ...data };
  for (const c of JSON_COLS[t] ?? []) if (out[c] !== undefined && typeof out[c] !== "string") out[c] = JSON.stringify(out[c]);
  return out;
};
const fromRow = (t: TableName, row: any) => {
  for (const c of JSON_COLS[t] ?? []) if (typeof row[c] === "string") { try { row[c] = JSON.parse(row[c]); } catch { row[c] = null; } }
  return row;
};
const strip = (data: any) => {
  const out: any = {};
  for (const [k, v] of Object.entries(data)) if (!k.startsWith("$") && v !== undefined) out[k] = v === "" ? null : v;
  return out;
};

export async function list<T extends TableName>(table: T, siteId?: string): Promise<RowOf<T>[]> {
  if (isDemo) {
    const rows = demoDb()[table] as RowOf<T>[];
    return (siteId ? rows.filter((r: any) => r.siteId === siteId) : rows)
      .slice().sort((a: any, b: any) => (b.placedAt || b.$createdAt).localeCompare(a.placedAt || a.$createdAt));
  }
  // Page through everything (stores can have tens of thousands of customers).
  const out: any[] = [];
  let cursor: string | undefined;
  for (;;) {
    const queries = [Query.orderDesc("$createdAt"), Query.limit(1000)];
    if (siteId) queries.push(Query.equal("siteId", siteId));
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await tables.listRows({ databaseId: config.databaseId, tableId: table, queries });
    out.push(...res.rows.map(r => fromRow(table, r)));
    if (res.rows.length < 1000) break;
    cursor = res.rows[res.rows.length - 1].$id;
  }
  if (table === "orders") out.sort((a, b) => (b.placedAt || b.$createdAt).localeCompare(a.placedAt || a.$createdAt));
  return out as unknown as RowOf<T>[];
}

export async function create<T extends TableName>(table: T, data: Omit<RowOf<T>, "$id" | "$createdAt">): Promise<RowOf<T>> {
  if (isDemo) {
    const db = demoDb();
    const row = { ...data, $id: ID.unique(), $createdAt: new Date().toISOString() } as RowOf<T>;
    (db[table] as RowOf<T>[]).push(row);
    saveDemo(db);
    return row;
  }
  const row = await tables.createRow({ databaseId: config.databaseId, tableId: table, rowId: ID.unique(), data: toRow(table, strip(data)) });
  return fromRow(table, row) as unknown as RowOf<T>;
}

export async function update<T extends TableName>(table: T, id: string, data: Partial<RowOf<T>>): Promise<RowOf<T>> {
  if (isDemo) {
    const db = demoDb();
    const rows = db[table] as RowOf<T>[];
    const i = rows.findIndex(r => r.$id === id);
    rows[i] = { ...rows[i], ...data };
    saveDemo(db);
    return rows[i];
  }
  const row = await tables.updateRow({ databaseId: config.databaseId, tableId: table, rowId: id, data: toRow(table, strip(data)) });
  return fromRow(table, row) as unknown as RowOf<T>;
}

export async function remove(table: TableName, id: string) {
  if (isDemo) {
    const db = demoDb();
    (db as any)[table] = (db[table] as any[]).filter(r => r.$id !== id);
    saveDemo(db);
    return;
  }
  await tables.deleteRow({ databaseId: config.databaseId, tableId: table, rowId: id });
}

/** Create an order and keep inventory + customer totals in sync. */
export async function createOrder(siteId: string, data: Omit<Order, "$id" | "$createdAt" | "number" | "siteId">) {
  const existing = await list("orders", siteId);
  const number = existing.reduce((m, o) => Math.max(m, o.number), 1000) + 1;
  const order = await create("orders", { ...data, siteId, number });
  const products = await list("products", siteId);
  for (const li of data.items) {
    const p = products.find(p => p.$id === li.productId);
    if (p) await update("products", p.$id, { inventory: Math.max(0, p.inventory - li.quantity) });
  }
  if (data.customerId && data.financialStatus === "paid") {
    const c = (await list("customers", siteId)).find(c => c.$id === data.customerId);
    if (c) await update("customers", c.$id, { ordersCount: c.ordersCount + 1, totalSpent: c.totalSpent + data.total, lastOrderAt: new Date().toISOString() });
  }
  return order;
}

/* ------------------------------------------------------------------ */
/* Integrations: the Python Appwrite Function "site-ops"               */
/* ------------------------------------------------------------------ */
export async function ops<T = any>(path: string, body: Record<string, unknown> = {}, functionId = config.functionId): Promise<T> {
  if (isDemo) {
    await new Promise(r => setTimeout(r, 250));
    return demoOps(path, body) as T;
  }
  const exec = await functions.createExecution({
    functionId, xpath: path, method: "POST" as any,
    body: JSON.stringify(body), headers: { "content-type": "application/json" },
  });
  let payload: any = {};
  try { payload = JSON.parse(exec.responseBody || "{}"); } catch { payload = { error: exec.responseBody }; }
  if (exec.status === "failed" || exec.responseStatusCode >= 400 || payload.error) {
    throw new Error(payload.error || exec.errors || `site-ops ${path} failed (${exec.responseStatusCode})`);
  }
  return payload as T;
}

/** PageSpeed Insights is free and CORS-enabled, so the browser calls it directly. */
export async function pagespeed(url: string, strategy: "mobile" | "desktop") {
  const q = new URLSearchParams({ url, strategy });
  ["performance", "accessibility", "best-practices", "seo"].forEach(c => q.append("category", c));
  if (config.pagespeedKey) q.set("key", config.pagespeedKey);
  const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "PageSpeed request failed");
  const lh = json.lighthouseResult;
  const score = (k: string) => Math.round((lh.categories[k]?.score ?? 0) * 100);
  const audit = (k: string) => lh.audits[k]?.displayValue ?? "–";
  return {
    scores: { performance: score("performance"), accessibility: score("accessibility"), bestPractices: score("best-practices"), seo: score("seo") },
    metrics: { LCP: audit("largest-contentful-paint"), CLS: audit("cumulative-layout-shift"), TBT: audit("total-blocking-time"), FCP: audit("first-contentful-paint"), "Speed Index": audit("speed-index") },
    opportunities: Object.values<any>(lh.audits)
      .filter(a => a.details?.type === "opportunity" && a.score !== null && a.score < 0.9)
      .map(a => ({ title: a.title, savings: a.displayValue || "" })).slice(0, 8),
  };
}

/** Download links for one order (admins can read the downloads table; buyers never can). */
export async function orderDownloads(orderId: string, siteId: string) {
  return (await list("downloads", siteId)).filter(d => d.orderId === orderId);
}

/** Automations (run by site-ops every hour): preview (dry run) or run now. */
export const automations = (mode: "preview" | "run", siteId: string) => ops(`/automations/${mode}`, { siteId });
