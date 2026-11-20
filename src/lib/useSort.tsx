import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Table, type HeadCell } from "../components/ui";

export type SortValue = string | number | boolean | null | undefined | Date;
export type SortDir = "asc" | "desc";
export interface SortState { key: string; dir: SortDir }

const isDateString = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
const isEmpty = (v: SortValue) => v === null || v === undefined || v === "" || (typeof v === "number" && isNaN(v));
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compare(a: SortValue, b: SortValue) {
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return collator.compare(String(a), String(b)); // "Order 9" before "Order 10", case-insensitive
}

const load = (id?: string): SortState | null => {
  if (!id) return null;
  try { const v = JSON.parse(localStorage.getItem(`yancey-sort-${id}`) || "null"); return v && typeof v.key === "string" ? v : null; } catch { return null; }
};
const save = (id: string | undefined, s: SortState | null) => {
  if (!id) return;
  try { if (s) localStorage.setItem(`yancey-sort-${id}`, JSON.stringify(s)); else localStorage.removeItem(`yancey-sort-${id}`); } catch { /* private mode */ }
};

/**
 * Click-to-sort for a table. `columns` maps a column key to the value to sort by.
 *
 *   const sort = useSort(rows, { title: p => p.title, price: p => p.price }, { id: "products" });
 *   <Table head={["", sort.th("Product", "title"), sort.th("Price", "price")]}>{sort.rows.map(...)}</Table>
 *
 * First click: numbers, dates and yes/no sort highest / newest / yes first; text sorts A to Z.
 * Second click reverses, third click returns to the original order. Empty values always go last.
 * With `id`, the choice is remembered in this browser.
 */
export function useSort<T>(rows: T[], columns: Record<string, (row: T) => SortValue>, opts: { id?: string; initial?: SortState } = {}) {
  const [sort, setSortState] = useState<SortState | null>(() => {
    const saved = load(opts.id);
    return saved && columns[saved.key] ? saved : opts.initial ?? null;
  });
  const setSort = (s: SortState | null) => { setSortState(s); save(opts.id, s); };

  const sorted = useMemo(() => {
    const get = sort && columns[sort.key];
    if (!get) return rows;
    const mult = sort.dir === "asc" ? 1 : -1;
    return rows.map((r, i) => ({ r, i, v: get(r) })).sort((a, b) => {
      const ea = isEmpty(a.v), eb = isEmpty(b.v);
      if (ea || eb) return ea === eb ? a.i - b.i : ea ? 1 : -1;
      return compare(a.v, b.v) * mult || a.i - b.i; // stable
    }).map(x => x.r);
    // columns is usually an inline object; the sort only depends on its keys' getters at sort time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort?.key, sort?.dir]);

  /** The direction a first click uses: biggest / newest / "yes" first, text A to Z. */
  const firstDir = (key: string): SortDir => {
    const sample = rows.map(columns[key]).find(v => !isEmpty(v));
    return typeof sample === "number" || typeof sample === "boolean" || sample instanceof Date || isDateString(sample) ? "desc" : "asc";
  };

  const toggle = (key: string) => {
    const first = firstDir(key);
    if (!sort || sort.key !== key) setSort({ key, dir: first });
    else if (sort.dir === first) setSort({ key, dir: first === "asc" ? "desc" : "asc" });
    else setSort(null);
  };

  /** A sortable header cell for <Table head={…}>. */
  const th = (label: string, key: string, o: { align?: "right" } = {}): HeadCell => {
    const active = sort?.key === key;
    const dir = active ? sort!.dir : null;
    const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
    const textual = firstDir(key) === "asc";
    const next = !active ? firstDir(key) : sort!.dir === firstDir(key) ? (firstDir(key) === "asc" ? "desc" : "asc") : null;
    const hint = next === null ? "clear sorting" : next === "asc" ? (textual ? "A to Z" : "lowest first") : (textual ? "Z to A" : "highest first");
    return {
      ariaSort: dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none",
      align: o.align,
      content: (
        <button type="button" onClick={() => toggle(key)} title={`Sort by ${label.toLowerCase()}: ${hint}`}
          className={`group/sort -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase tracking-wide hover:bg-zinc-100 hover:text-zinc-900 ${active ? "text-zinc-900" : ""} ${o.align === "right" ? "flex-row-reverse" : ""}`}>
          {label}
          <Icon className={`size-3.5 shrink-0 ${active ? "" : "opacity-30 group-hover/sort:opacity-80 group-focus-visible/sort:opacity-80"}`} aria-hidden="true" />
        </button>
      ),
    };
  };

  return { rows: sorted, th, sort, setSort };
}

/** A column for <SortTable>: leave out `get` for a column that can't be sorted (e.g. buttons). */
export interface SortCol<T> { label: string; get?: (row: T) => SortValue; align?: "right" }

/**
 * A <Table> that sorts itself, for tables rendered inline (where a hook can't be called).
 *
 *   <SortTable rows={pages} id="top-pages" cols={[{ label: "Page", get: p => p.path }, { label: "Views", get: p => p.views }]}>
 *     {rows => rows.map(p => <tr key={p.path}>…</tr>)}
 *   </SortTable>
 */
export function SortTable<T>({ rows, cols, id, initial, empty, children }: {
  rows: T[]; cols: SortCol<T>[]; id?: string; initial?: SortState; empty?: boolean; children(rows: T[]): ReactNode;
}) {
  const getters = Object.fromEntries(cols.map((c, i) => [String(i), c.get]).filter(([, g]) => g)) as Record<string, (r: T) => SortValue>;
  const sort = useSort(rows, getters, { id, initial });
  return (
    <Table empty={empty} head={cols.map((c, i) => (c.get ? sort.th(c.label, String(i), { align: c.align }) : c.label))}>
      {children(sort.rows)}
    </Table>
  );
}
