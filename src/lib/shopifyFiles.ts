import Papa from "papaparse";
import { unzipSync, strFromU8 } from "fflate";

export type ImportKind = "products" | "customers" | "orders";
export type Row = Record<string, string>;
export interface ParsedFile { id: string; name: string; kind: ImportKind | null; rows: Row[]; columns: string[]; error?: string }

/** Recognise a Shopify export by its columns. */
export function detectKind(cols: string[]): ImportKind | null {
  const has = (c: string) => cols.includes(c);
  if (has("Handle") && has("Variant Price")) return "products";
  if (has("Name") && has("Lineitem name")) return "orders";
  if ((has("Customer ID") || has("Email")) && (has("Accepts Email Marketing") || has("Accepts Marketing")) && !has("Lineitem name")) return "customers";
  return null;
}

function parseCsv(name: string, text: string): ParsedFile {
  const res = Papa.parse<Row>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy" });
  const columns = (res.meta.fields ?? []).map(c => c.trim());
  const rows = res.data.map(r => {
    const o: Row = {};
    // drop empty cells: smaller uploads, same meaning
    for (const [k, v] of Object.entries(r)) if (v != null && String(v).trim() !== "") o[k.trim()] = String(v);
    return o;
  }).filter(r => Object.keys(r).length);
  const kind = detectKind(columns);
  return {
    id: `${name}-${Math.random().toString(36).slice(2, 8)}`, name, kind, rows, columns,
    error: res.errors.length > 5 ? `Couldn't read ${res.errors.length} lines (first: ${res.errors[0].message})`
      : !kind ? "This doesn't look like a Shopify products, customers or orders export." : undefined,
  };
}

/** Read .csv files and .zip files (Shopify emails large exports as zips) into parsed tables. */
export async function readFiles(files: File[]): Promise<ParsedFile[]> {
  const out: ParsedFile[] = [];
  for (const f of files) {
    try {
      if (/\.zip$/i.test(f.name)) {
        const entries = unzipSync(new Uint8Array(await f.arrayBuffer()));
        const csvs = Object.entries(entries).filter(([n]) => /\.csv$/i.test(n) && !n.startsWith("__MACOSX"));
        if (!csvs.length) out.push({ id: f.name, name: f.name, kind: null, rows: [], columns: [], error: "No CSV file inside this zip." });
        for (const [n, bytes] of csvs) out.push(parseCsv(`${f.name} → ${n.split("/").pop()}`, strFromU8(bytes)));
      } else {
        out.push(parseCsv(f.name, await f.text()));
      }
    } catch (e: any) {
      out.push({ id: f.name, name: f.name, kind: null, rows: [], columns: [], error: `Couldn't open this file: ${e.message}` });
    }
  }
  return out;
}

const n = (x: number) => x.toLocaleString();
const yes = (v?: string) => /^(yes|true|1|subscribed)$/i.test((v ?? "").trim());

/** What a file contains, for the preview. */
export function summarize(f: ParsedFile) {
  if (f.kind === "products") {
    const handles = new Set(f.rows.map(r => r.Handle).filter(Boolean));
    return { main: handles.size, label: "products", details: [`${n(f.rows.filter(r => r["Variant Price"]).length)} variants`, `${n(f.rows.filter(r => r["Image Src"]).length)} images`] };
  }
  if (f.kind === "orders") {
    const heads = f.rows.filter(r => r["Financial Status"] || r.Total);
    const total = heads.reduce((t, r) => t + (parseFloat(r.Total) || 0), 0);
    return { main: new Set(f.rows.map(r => r.Name)).size, label: "orders", details: [`${n(f.rows.filter(r => r["Lineitem name"]).length)} line items`, `$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total`] };
  }
  if (f.kind === "customers") {
    const subs = f.rows.filter(r => yes(r["Accepts Email Marketing"] ?? r["Accepts Marketing"])).length;
    return { main: f.rows.length, label: "customers", details: [`${n(subs)} email subscribers`, `${n(f.rows.filter(r => !r.Email).length)} without email`] };
  }
  return { main: 0, label: "rows", details: [] as string[] };
}

/** Split rows into request-sized chunks without splitting a product (Handle) or order (Name) across chunks. */
export function chunk(kind: ImportKind, rows: Row[], max = kind === "customers" ? 1000 : 800): Row[][] {
  const key = kind === "products" ? "Handle" : kind === "orders" ? "Name" : null;
  if (!key) {
    const out: Row[][] = [];
    for (let i = 0; i < rows.length; i += max) out.push(rows.slice(i, i + max));
    return out;
  }
  const groups = new Map<string, Row[]>();
  for (const r of rows) { const k = r[key] ?? ""; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
  const out: Row[][] = [];
  let cur: Row[] = [];
  for (const grp of groups.values()) {
    if (cur.length && cur.length + grp.length > max) { out.push(cur); cur = []; }
    cur.push(...grp);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Import order: orders link to products and customers, so those go first. */
export const ORDER: ImportKind[] = ["products", "customers", "orders"];
