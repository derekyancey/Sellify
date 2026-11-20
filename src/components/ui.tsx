import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { Link, useParams } from "react-router-dom";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-zinc-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; loading?: boolean };
export function Button({ variant = "secondary", loading, className, children, disabled, ...p }: BtnProps) {
  const styles = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-700",
    secondary: "bg-white text-zinc-800 border border-zinc-300 hover:bg-zinc-50",
    danger: "bg-red-600 text-white hover:bg-red-500",
    ghost: "text-zinc-600 hover:bg-zinc-100",
  }[variant];
  return (
    <button {...p} disabled={disabled || loading}
      className={cx("inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50", styles, className)}>
      {loading && <Loader2 className="size-4 animate-spin" />}{children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-zinc-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}
const inputCls = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200";
// Full width unless the caller sets its own width (w-*, flex-1), so size hints aren't overridden.
const field = (className?: string) => cx(inputCls, !/(^|\s)(w-|flex-1)/.test(className ?? "") && "w-full", className);
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={field(p.className)} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={field(p.className)} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={field(p.className)} />;

const tones = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  yellow: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  gray: "bg-zinc-100 text-zinc-700 ring-zinc-500/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone])}>{children}</span>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

/** A header cell with extra attributes, e.g. from useSort().th(). Plain strings / nodes work too. */
export interface HeadCell { content: ReactNode; ariaSort?: "ascending" | "descending" | "none"; align?: "right" }
const isHeadCell = (h: unknown): h is HeadCell => !!h && typeof h === "object" && "content" in (h as object) && !("$$typeof" in (h as object));

export function Table({ head, children, empty }: { head: (ReactNode | HeadCell)[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
          <tr>{head.map((h, i) => isHeadCell(h)
            ? <th key={i} aria-sort={h.ariaSort} className={cx("px-4 py-2 font-medium", h.align === "right" && "text-right")}>{h.content}</th>
            : <th key={i} className="px-4 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">{children}</tbody>
      </table>
      {empty && <div className="px-4 py-10 text-center text-sm text-zinc-500">Nothing here yet.</div>}
    </div>
  );
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cx("px-4 py-2.5", className)}>{children}</td>;

export function Modal({ title, open, onClose, children, footer, wide }: { title: string; open: boolean; onClose(): void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:pt-20" onMouseDown={onClose}>
      <div className={cx("w-full rounded-xl bg-white shadow-xl", wide ? "max-w-4xl" : "max-w-lg")} onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-100" aria-label="Close"><X className="size-4" /></button>
        </div>
        <div className="space-y-3 p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="flex items-center gap-2 py-8 text-sm text-zinc-500"><Loader2 className="size-4 animate-spin" />{label}</div>;
}
export function ErrorBox({ error, hint }: { error: string; hint?: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div><div className="font-medium">{error}</div>{hint && <div className="mt-1 text-red-700">{hint}</div>}</div>
    </div>
  );
}
export function NeedsSetup({ what, children }: { what: string; children?: ReactNode }) {
  const { storeId } = useParams();
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-600">
      <div className="font-medium text-zinc-800">{what} isn't connected for this site yet.</div>
      <div className="mt-1">{children ?? <>Add it under <Link className="underline" to={`/stores/${storeId}/settings#connections`}>store settings</Link>.</>}</div>
    </div>
  );
}
