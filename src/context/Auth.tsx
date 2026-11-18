import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Models } from "appwrite";
import { account, isDemo } from "../lib/appwrite";

type User = Pick<Models.User<Models.Preferences>, "$id" | "name" | "email">;
interface AuthCtx { user: User | null; loading: boolean; login(email: string, password: string): Promise<void>; logout(): Promise<void> }
const Ctx = createContext<AuthCtx>(null!);
const DEMO_USER: User = { $id: "demo", name: "Demo Owner", email: "owner@example.com" };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemo) { setUser(DEMO_USER); setLoading(false); return; }
    account.get().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    await account.createEmailPasswordSession({ email, password });
    setUser(await account.get());
  };
  const logout = async () => {
    if (!isDemo) await account.deleteSession({ sessionId: "current" });
    setUser(isDemo ? DEMO_USER : null);
  };
  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
