import { ID, Query } from "appwrite";
import { config, isDemo, storage } from "./appwrite";
import { ops } from "./data";

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

export async function deleteFile(id: string) {
  if (isDemo) { localStorage.setItem(DEMO_KEY, JSON.stringify(demoFiles().filter(f => f.id !== id))); return; }
  await storage.deleteFile({ bucketId: config.bucketId, fileId: id });
}

/**
 * Digital products: upload to the PRIVATE R2 deliverables bucket. site-ops (admins only) signs a short-lived PUT URL,
 * the browser sends the file straight to R2, and only the file ID is kept. Customers reach the file only through the
 * checkout function's signed, expiring download links.
 */
export interface Deliverable { id: string; name: string; size: number }
export async function uploadDeliverable(siteId: string, file: File): Promise<Deliverable> {
  if (isDemo) return { id: "demo" + ID.unique(), name: file.name.replace(/[^\w.\- ]+/g, "_"), size: file.size }; // demo keeps only the reference
  const { fileId, name, uploadUrl } = await ops<{ fileId: string; name: string; uploadUrl: string }>("/deliverables/upload-url", { siteId, name: file.name, size: file.size });
  let res: Response;
  try { res = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } }); }
  catch { throw new Error("Could not reach file storage. Check the R2 bucket's CORS policy allows PUT from this dashboard."); }
  if (!res.ok) throw new Error(`File storage rejected the upload (${res.status}).`);
  return { id: fileId, name, size: file.size };
}
