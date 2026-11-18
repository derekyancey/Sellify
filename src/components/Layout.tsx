import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BarChart3, Box, ExternalLink, Globe, Home, LogOut, Menu, Rocket, Search, Settings, ShoppingCart, Users, X } from "lucide-react";
import { useAuth } from "../context/Auth";
import { useSite } from "../context/Site";
import { isDemo } from "../lib/appwrite";
import { cx } from "./ui";

const nav = [
  { group: "Store", items: [
    { to: "/", label: "Home", icon: Home, end: true },
    { to: "/orders", label: "Orders", icon: ShoppingCart },
    { to: "/products", label: "Products", icon: Box },
    { to: "/customers", label: "Customers", icon: Users },
  ] },
  { group: "Growth", items: [
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/seo", label: "SEO", icon: Search },
  ] },
  { group: "Infrastructure", items: [
    { to: "/domains", label: "Domain & DNS", icon: Globe },
    { to: "/deploys", label: "Deploys", icon: Rocket },
  ] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { sites, site, select } = useSite();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const sidebar = (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto p-3">
      <div className="flex items-center gap-2 px-2 pt-1 text-lg font-bold text-white">
        <span className="grid size-7 place-items-center rounded-lg bg-brand-500 text-sm">S</span> Sellify
      </div>
      {nav.map(g => (
        <div key={g.group}>
          <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{g.group}</div>
          {g.items.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
              className={({ isActive }) => cx("flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm",
                isActive ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white")}>
              <Icon className="size-4" />{label}
            </NavLink>
          ))}
        </div>
      ))}
      <div className="mt-auto">
        <NavLink to="/settings" onClick={() => setOpen(false)}
          className={({ isActive }) => cx("flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm",
            isActive ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-800/60 hover:text-white")}>
          <Settings className="size-4" />Sites &amp; settings
        </NavLink>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 bg-zinc-900 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="absolute inset-y-0 left-0 w-64 bg-zinc-900" onClick={e => e.stopPropagation()}>
            <button className="absolute right-2 top-3 p-1 text-zinc-400" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-zinc-200 bg-white/90 px-4 py-2.5 backdrop-blur">
        <button className="rounded p-1 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
        <select value={site?.$id ?? ""} aria-label="Current site"
          onChange={e => e.target.value === "__new" ? navigate("/settings?new=1") : select(e.target.value)}
          className="min-w-0 max-w-[60vw] rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-medium">
          {sites.map(s => <option key={s.$id} value={s.$id}>{s.name} — {s.domain}</option>)}
          <option value="__new">+ Add a site…</option>
        </select>
        {site && (
          <a href={`https://${site.domain}`} target="_blank" rel="noreferrer" className="hidden items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 sm:flex">
            View site <ExternalLink className="size-3.5" />
          </a>
        )}
        <div className="ml-auto flex items-center gap-3">
          {isDemo && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Demo data</span>}
          <span className="hidden text-sm text-zinc-600 sm:inline">{user?.name || user?.email}</span>
          {!isDemo && <button onClick={logout} className="rounded p-1 text-zinc-500 hover:bg-zinc-100" title="Sign out" aria-label="Sign out"><LogOut className="size-4" /></button>}
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6"><Outlet /></main>
    </div>
  );
}
