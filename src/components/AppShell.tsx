import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../context/Auth";
import { isDemo } from "../lib/appwrite";
import { cx } from "./ui";

/** Frame for pages outside a store: the store list and account settings. */
export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const tab = ({ isActive }: { isActive: boolean }) => cx("rounded-lg px-3 py-1.5 text-sm", isActive ? "bg-zinc-800 text-white" : "text-zinc-300 hover:text-white");
  return (
    <div className="min-h-screen">
      <header className="bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:px-6">
          <Link to="/stores" className="mr-3 flex items-center gap-2 text-lg font-bold text-white">
            <span className="grid size-7 place-items-center rounded-lg bg-brand-500 text-sm">Y</span> Yancey
          </Link>
          <NavLink to="/stores" className={tab}>Stores</NavLink>
          <NavLink to="/account" className={tab}>Account</NavLink>
          <div className="ml-auto flex items-center gap-3">
            {isDemo && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Demo data</span>}
            <span className="hidden text-sm text-zinc-400 sm:inline">{user?.name || user?.email}</span>
            {!isDemo && <button onClick={logout} className="rounded p-1 text-zinc-400 hover:text-white" title="Sign out" aria-label="Sign out"><LogOut className="size-4" /></button>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
