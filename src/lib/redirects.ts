import { create, list, remove, update } from "./data";
import type { Redirect } from "./types";
import { normalizePath, normalizeTarget } from "./urls";

/**
 * Add (or change) the redirect from → to, the way Shopify does when you edit a handle with
 * "Create a URL redirect" ticked:
 *   - one redirect per "from" path (an existing one is updated),
 *   - redirects that pointed at the old URL now point straight at the new one (no chains),
 *   - a redirect *from* the new URL is removed, since that URL is live again (no loops).
 */
export async function addRedirect(siteId: string, from: string, to: string, source: Redirect["source"] = "manual", existing?: Redirect[]) {
  const path = normalizePath(from), target = normalizeTarget(to);
  if (!path || path === normalizePath(target)) return null;
  const all = existing ?? await list("redirects", siteId);
  for (const r of all) {
    if (normalizePath(r.target) === path) await update("redirects", r.$id, { target });     // A→old becomes A→new
    if (r.path === normalizePath(target)) await remove("redirects", r.$id);                 // new is live again
  }
  const same = all.find(r => r.path === path);
  return same ? update("redirects", same.$id, { target, source }) : create("redirects", { siteId, path, target, source });
}

/** After a handle change: redirect the old URL to the new one. No-op when nothing changed. */
export async function redirectMoved(siteId: string, oldPath: string | null | undefined, newPath: string) {
  if (!oldPath || normalizePath(oldPath) === normalizePath(newPath)) return;
  await addRedirect(siteId, oldPath, newPath, "auto");
}
