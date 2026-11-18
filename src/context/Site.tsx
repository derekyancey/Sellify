import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { list } from "../lib/data";
import type { Site } from "../lib/types";

interface SiteCtx { sites: Site[]; site: Site | null; select(id: string): void; reload(): Promise<void>; loading: boolean }
const Ctx = createContext<SiteCtx>(null!);
const KEY = "sellify-current-site";

export function SiteProvider({ children }: { children: ReactNode }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const rows = (await list("sites")).sort((a, b) => a.name.localeCompare(b.name));
    setSites(rows);
    setLoading(false);
  }, []);
  useEffect(() => { reload().catch(() => setLoading(false)); }, [reload]);

  const select = (id: string) => { setCurrentId(id); try { localStorage.setItem(KEY, id); } catch { /* ignore */ } };
  const site = sites.find(s => s.$id === currentId) ?? sites[0] ?? null;
  return <Ctx.Provider value={{ sites, site, select, reload, loading }}>{children}</Ctx.Provider>;
}
export const useSite = () => useContext(Ctx);
