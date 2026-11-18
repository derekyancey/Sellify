import { useRef, useState } from "react";
import { Copy, FileText, Trash2, Upload } from "lucide-react";
import { useSite } from "../../context/Site";
import { deleteFile, listFiles, uploadFile } from "../../lib/files";
import { useAsync } from "../../lib/useAsync";
import { Button, Card, ErrorBox, Input, Loading, PageHeader, cx } from "../../components/ui";

const size = (b: number) => b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`;

export default function Files() {
  const { site } = useSite(); const s = site!;
  const { data, loading, error, reload } = useAsync(() => listFiles(s.$id), [s.$id]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setErr(null);
    try { for (const f of Array.from(files)) await uploadFile(s.$id, f); reload(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const copy = async (url: string) => { try { await navigator.clipboard.writeText(url); setCopied(url); setTimeout(() => setCopied(null), 1200); } catch { /* ignore */ } };
  const rows = (data ?? []).filter(f => f.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Files" subtitle="Images and documents for products, emails and your sites. Stored in Appwrite Storage (free tier: 2 GB)."
        actions={<><input ref={input} type="file" multiple hidden onChange={e => upload(e.target.files)} /><Button variant="primary" loading={busy} onClick={() => input.current?.click()}><Upload className="size-4" />Upload files</Button></>} />
      {(err || error) && <div className="mb-4"><ErrorBox error={err || error!} /></div>}
      <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
        className={cx("mb-4 rounded-xl border-2 border-dashed p-6 text-center text-sm text-zinc-500 transition", drag ? "border-brand-500 bg-brand-50" : "border-zinc-300")}>
        Drag files here to upload
      </div>
      <Card>
        <Input placeholder="Search files" value={q} onChange={e => setQ(e.target.value)} className="mb-3 sm:max-w-xs" />
        {loading ? <Loading /> : !rows.length ? <p className="py-8 text-center text-sm text-zinc-500">No files yet.</p> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {rows.map(f => (
              <div key={f.id} className="overflow-hidden rounded-lg border border-zinc-200">
                {f.mime.startsWith("image/") ? <img src={f.url} alt={f.name} className="aspect-square w-full bg-zinc-50 object-cover" />
                  : <div className="grid aspect-square place-items-center bg-zinc-50"><FileText className="size-8 text-zinc-400" /></div>}
                <div className="p-2 text-xs">
                  <div className="truncate font-medium" title={f.name}>{f.name}</div>
                  <div className="text-zinc-500">{size(f.size)}</div>
                  <div className="mt-1 flex gap-1">
                    <Button variant="ghost" className="flex-1 px-1 text-xs" onClick={() => copy(f.url)}><Copy className="size-3.5" />{copied === f.url ? "Copied" : "Copy URL"}</Button>
                    <button className="p-1 text-zinc-400 hover:text-red-600" aria-label="Delete" onClick={async () => { if (confirm(`Delete ${f.name}?`)) { await deleteFile(f.id); reload(); } }}><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
