import { createContext, useContext } from "react";
import type { Collection, Product } from "../../../lib/types";
import type { ThemeDoc } from "../../../theme/types";

export interface EditorEnv {
  siteId: string;
  theme: ThemeDoc;
  products: Product[];
  collections: Collection[];
  pickImage(current: string, onPick: (url: string) => void): void;
  openMenus(handle?: string): void;
  openColors(): void;
}
export const EnvCtx = createContext<EditorEnv>(null!);
export const useEnv = () => useContext(EnvCtx);
