import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { list } from "../lib/data";
import type { Site } from "../lib/types";

interface StoresCtx { sites: Site[]; reload(): Promise<void>; loading: boolean }
const Ctx = createContext<StoresCtx>(null!);

/** All of the user's stores. The *current* store comes from the URL (/stores/:storeId/...). */
export function SiteProvider({ children }: { children: ReactNode }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const rows = (await list("sites")).sort((a, b) => a.name.localeCompare(b.name));
    setSites(rows);
    setLoading(false);
  }, []);
  useEffect(() => { reload().catch(() => setLoading(false)); }, [reload]);
  return <Ctx.Provider value={{ sites, reload, loading }}>{children}</Ctx.Provider>;
}

export const useStores = () => useContext(Ctx);

/** The store this page belongs to (null outside /stores/:storeId). */
export function useSite() {
  const { storeId } = useParams();
  const { sites, reload, loading } = useContext(Ctx);
  const navigate = useNavigate();
  const site = sites.find(s => s.$id === storeId) ?? null;
  const select = (id: string) => navigate(`/stores/${id}`);
  return { sites, site, reload, loading, select };
}

/** Build a link inside the current store: sp("/orders") -> "/stores/<id>/orders". */
export function useStorePath() {
  const { storeId } = useParams();
  return (path: string) => `/stores/${storeId}${path === "/" ? "" : path}`;
}

/** A label for file names etc. that works even before a store has a URL. */
export const storeSlug = (s: Site) => s.domain || s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
