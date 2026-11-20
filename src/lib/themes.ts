import { config, isDemo } from "./appwrite";
import type { Site } from "./types";

/**
 * Storefront themes. Each theme is a folder under public/themes/<id>/ (theme.json, templates/*.json,
 * index.html) drawn by the shared engine in public/themes/engine/. The dashboard serves them, so a
 * theme can be previewed with any store's live products before it is published.
 */
export interface ThemeInfo { id: string; name: string; description?: string; version?: string; logo?: string;
  productTemplates: { suffix: string; label: string }[] }

/** Installed themes (folders under public/themes). */
export const THEME_IDS = ["moonbear"];

export async function loadTheme(id: string): Promise<ThemeInfo> {
  const res = await fetch(`/themes/${id}/theme.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Theme "${id}" is missing (public/themes/${id}/theme.json)`);
  const t = await res.json();
  return { id, name: t.name, description: t.description, version: t.version, logo: t.logo, productTemplates: t.productTemplates ?? [{ suffix: "", label: "Default product" }] };
}

/** URL of a theme page rendered with a store's products, e.g. page "/" or "/products/<handle>". */
export function previewUrl(themeId: string, site: Site, page = "/", template?: string) {
  const q = new URLSearchParams({ page, preview: "1" });
  if (!isDemo) { q.set("site", site.$id); q.set("project", config.projectId); q.set("endpoint", config.endpoint); }
  if (template !== undefined) q.set("template", template);
  return `/themes/${themeId}/index.html?${q}`;
}
