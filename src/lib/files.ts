import { ID, Query } from "appwrite";
import { config, isDemo, storage } from "./appwrite";

/** Public files (product photos, email images) in one Appwrite Storage bucket; names are prefixed "<siteId>--". */
export interface StoredFile { id: string; name: string; size: number; mime: string; url: string; createdAt: string }
const DEMO_KEY = "yancey-demo-files";
const demoFiles = (): StoredFile[] => { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]"); } catch { return []; } };
const prefix = (siteId: string) => `${siteId}--`;

export async function listFiles(siteId: string): Promise<StoredFile[]> {
  if (isDemo) return demoFiles().filter(f => f.name.startsWith(prefix(siteId))).map(f => ({ ...f, name: f.name.slice(prefix(siteId).length) }));
  const res = await storage.listFiles({ bucketId: config.bucketId, queries: [Query.orderDesc("$createdAt"), Query.limit(500)] });
  return res.files.filter(f => f.name.startsWith(prefix(siteId))).map(f => ({
    id: f.$id, name: f.name.slice(prefix(siteId).length), size: f.sizeOriginal, mime: f.mimeType, createdAt: f.$createdAt,
    url: storage.getFileView({ bucketId: config.bucketId, fileId: f.$id }),
  }));
}

export async function uploadFile(siteId: string, file: File): Promise<StoredFile> {
  const named = new File([file], prefix(siteId) + file.name.replace(/[^\w.\- ]+/g, "_"), { type: file.type });
  if (isDemo) {
    if (file.size > 400_000) throw new Error("Demo mode keeps files in your browser, so files are limited to 400 KB here.");
    const url = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(file); });
    const f = { id: ID.unique(), name: named.name, size: file.size, mime: file.type, url, createdAt: new Date().toISOString() };
    try { localStorage.setItem(DEMO_KEY, JSON.stringify([f, ...demoFiles()])); } catch { throw new Error("Browser storage is full; delete some demo files."); }
    return { ...f, name: file.name };
  }
  const f = await storage.createFile({ bucketId: config.bucketId, fileId: ID.unique(), file: named });
  return { id: f.$id, name: file.name, size: f.sizeOriginal, mime: f.mimeType, createdAt: f.$createdAt, url: storage.getFileView({ bucketId: config.bucketId, fileId: f.$id }) };
}

/** Digital-product files go in the PRIVATE downloads bucket: only admins can read them; buyers get counted links. */
export async function uploadDownload(siteId: string, file: File): Promise<{ fileId: string; name: string; size: number }> {
  if (isDemo) {
    if (file.size > 50_000_000) throw new Error("Files can be up to 50 MB.");
    return { fileId: "demo-" + ID.unique(), name: file.name, size: file.size };  // demo: nothing is stored
  }
  const named = new File([file], prefix(siteId) + file.name.replace(/[^\w.\- ]+/g, "_"), { type: file.type });
  const f = await storage.createFile({ bucketId: config.downloadsBucketId, fileId: ID.unique(), file: named });
  return { fileId: f.$id, name: file.name, size: f.sizeOriginal };
}

export async function deleteDownload(fileId: string) {
  if (isDemo || fileId.startsWith("demo-")) return;
  await storage.deleteFile({ bucketId: config.downloadsBucketId, fileId });
}

/** Admin preview of a private file (uses the signed-in admin's session). */
export const downloadPreviewUrl = (fileId: string) =>
  isDemo || fileId.startsWith("demo-") ? null : storage.getFileDownload({ bucketId: config.downloadsBucketId, fileId });

export async function deleteFile(id: string) {
  if (isDemo) { localStorage.setItem(DEMO_KEY, JSON.stringify(demoFiles().filter(f => f.id !== id))); return; }
  await storage.deleteFile({ bucketId: config.bucketId, fileId: id });
}
