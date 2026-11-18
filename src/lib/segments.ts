import type { Customer, Segment, SegmentField, SegmentOp, SegmentRule } from "./types";

export const FIELDS: Record<SegmentField, { label: string; kind: "number" | "bool" | "text" }> = {
  totalSpent: { label: "Amount spent", kind: "number" },
  ordersCount: { label: "Number of orders", kind: "number" },
  daysSinceCreated: { label: "Days since first seen", kind: "number" },
  acceptsMarketing: { label: "Subscribed to email", kind: "bool" },
  email: { label: "Email", kind: "text" },
};
export const OPS: Record<SegmentOp, string> = { gt: "is more than", lt: "is less than", eq: "is", contains: "contains" };
export const opsFor = (f: SegmentField): SegmentOp[] =>
  FIELDS[f].kind === "number" ? ["gt", "lt", "eq"] : FIELDS[f].kind === "bool" ? ["eq"] : ["contains", "eq"];

/** Built-in segments, always available (ids are stable strings, not rows). */
export const BUILT_IN: { id: string; name: string; rules: SegmentRule[] }[] = [
  { id: "all", name: "All customers", rules: [] },
  { id: "subscribers", name: "Email subscribers", rules: [{ field: "acceptsMarketing", op: "eq", value: "true" }] },
  { id: "repeat", name: "Repeat customers (2+ orders)", rules: [{ field: "ordersCount", op: "gt", value: "1" }] },
  { id: "big", name: "Big spenders ($200+)", rules: [{ field: "totalSpent", op: "gt", value: "199.99" }] },
  { id: "never", name: "Signed up, never ordered", rules: [{ field: "ordersCount", op: "eq", value: "0" }] },
];

const valueOf = (c: Customer, f: SegmentField): number | string | boolean =>
  f === "daysSinceCreated" ? (Date.now() - +new Date(c.$createdAt)) / 864e5 : f === "acceptsMarketing" ? !!c.acceptsMarketing : (c as any)[f] ?? "";

export function matches(c: Customer, rules: SegmentRule[]) {
  return rules.every(r => {
    const v = valueOf(c, r.field);
    const kind = FIELDS[r.field].kind;
    if (kind === "bool") return v === (r.value === "true");
    if (kind === "number") { const n = Number(r.value); return r.op === "gt" ? +v > n : r.op === "lt" ? +v < n : Math.round(+v * 100) === Math.round(n * 100); }
    const s = String(v).toLowerCase(), t = r.value.toLowerCase();
    return r.op === "contains" ? s.includes(t) : s === t;
  });
}

export function resolveSegment(id: string, saved: Segment[]) {
  return BUILT_IN.find(b => b.id === id) ?? saved.find(s => s.$id === id) ?? null;
}
