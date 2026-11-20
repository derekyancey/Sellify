import { useMemo, useState } from "react";
import { Download, ExternalLink, Plus, Search } from "lucide-react";
import { useSite } from "../../context/Site";
import { create, list, ops, remove, update } from "../../lib/data";
import { date } from "../../lib/format";
import { redirectMoved } from "../../lib/redirects";
import { useAsync } from "../../lib/useAsync";
import { articlePath, pagePath, slug, storeUrl, uniqueHandle } from "../../lib/urls";
import type { Article, Page } from "../../lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Textarea } from "../../components/ui";

type Kind = "articles" | "pages";
type Row = Article | Page;
const isArticle = (r: Partial<Row>): r is Article => "blogHandle" in r;
const pathOf = (r: Partial<Row>) => isArticle(r) ? articlePath(r as Article) : pagePath(r as Page);

/** Blog posts (/blogs/{blog}/{handle}) and pages (/pages/{handle}): the same URLs as on Shopify. */
export default function Content({ kind }: { kind: Kind }) {
  const { site } = useSite(); const s = site!;
  const { data, loading, error, reload } = useAsync(() => list(kind, s.$id), [s.$id, kind]);
  const [q, setQ] = useState("");
  const [blog, setBlog] = useState("all");
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const label = kind === "articles" ? "Blog posts" : "Pages";
  const blogs = useMemo(() => [...new Map((data ?? []).filter(isArticle).map(a => [a.blogHandle, a.blogTitle || a.blogHandle])).entries()], [data]);
  const rows = (data ?? []).filter(r => (blog === "all" || (isArticle(r) && r.blogHandle === blog))
    && (!q || r.title.toLowerCase().includes(q.toLowerCase()) || r.handle.includes(q.toLowerCase())))
    .sort((a, b) => (b.publishedAt ?? b.$createdAt).localeCompare(a.publishedAt ?? a.$createdAt));

  const importShopify = async () => {
    if (!s.shopifyDomain) { setErr("Add your Shopify store's domain under Content → URL redirects first."); return; }
    setImporting(true); setErr(null); setMsg(null);
    try {
      const r = await ops<any>("/import/content", { siteId: s.$id, shopifyDomain: s.shopifyDomain, kind });
      setMsg(`Imported ${r.written} of ${r.found} ${label.toLowerCase()} from ${s.shopifyDomain}, keeping their URLs.` +
        (r.problems?.length ? ` ${r.problems.map((p: any) => `${p.key}: ${p.error}`).join(" ")}` : ""));
      await reload();
    } catch (e: any) { setErr(e.message); } finally { setImporting(false); }
  };
  const blankRow = (): Partial<Row> => kind === "articles"
    ? { title: "", handle: "", bodyHtml: "", published: true, blogHandle: blogs[0]?.[0] ?? "news", blogTitle: blogs[0]?.[1] ?? "Blog", tags: [] }
    : { title: "", handle: "", bodyHtml: "", published: true };

  return (
    <>
      <PageHeader title={label} subtitle={kind === "articles"
        ? <>Posts live at <code>/blogs/{"{blog}"}/{"{handle}"}</code>, the same URLs as on Shopify. Storefronts read them with <code>Yancey.blog()</code> and <code>Yancey.article()</code>.</>
        : <>Pages live at <code>/pages/{"{handle}"}</code>, the same URLs as on Shopify. Storefronts read them with <code>Yancey.page()</code>.</>}
        actions={<>
          <Button loading={importing} onClick={importShopify} title={s.shopifyDomain ? `From ${s.shopifyDomain}` : "Set the Shopify domain on URL redirects first"}><Download className="size-4" />Import from Shopify</Button>
          <Button variant="primary" onClick={() => setEditing(blankRow())}><Plus className="size-4" />{kind === "articles" ? "Create post" : "Create page"}</Button>
        </>} />
      {err && <div className="mb-4"><ErrorBox error={err} /></div>}
      {msg && <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">{msg}</p>}
      <Card>
        {error && <ErrorBox error={error} hint="If the table is missing, re-run appwrite/setup.py." />}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Search className="size-4 text-zinc-400" /><Input placeholder="Search by title or handle" value={q} onChange={e => setQ(e.target.value)} className="max-w-xs" />
          {kind === "articles" && blogs.length > 1 && <Select value={blog} onChange={e => setBlog(e.target.value)} className="w-48">
            <option value="all">All blogs</option>{blogs.map(([h, t]) => <option key={h} value={h}>{t} (/blogs/{h})</option>)}</Select>}
        </div>
        {loading ? <Loading /> : (
          <Table head={["Title", "URL", ...(kind === "articles" ? ["Blog"] : []), "Status", "Published"]} empty={!rows.length}>
            {rows.map(r => (
              <tr key={r.$id} className="cursor-pointer hover:bg-zinc-50" onClick={() => setEditing(r)}>
                <Td className="max-w-xs truncate font-medium">{r.title}</Td>
                <Td className="max-w-xs truncate font-mono text-xs text-zinc-600">{pathOf(r)}</Td>
                {isArticle(r) && <Td>{r.blogTitle || r.blogHandle}</Td>}
                <Td><Badge tone={r.published === false ? "gray" : "green"}>{r.published === false ? "Hidden" : "Visible"}</Badge></Td>
                <Td>{r.publishedAt ? date(r.publishedAt) : "–"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {editing && <Editor kind={kind} initial={editing} all={data ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function Editor({ kind, initial, all, onClose, onSaved }: { kind: Kind; initial: Partial<Row>; all: Row[]; onClose(): void; onSaved(): void }) {
  const { site } = useSite(); const s = site!;
  const [r, setR] = useState<Partial<Row>>(initial);
  const [handleTouched, setHandleTouched] = useState(!!initial.handle);
  const [keepOldUrl, setKeepOldUrl] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setR(x => ({ ...x, [k]: v }));
  const art = kind === "articles";
  const a = r as Partial<Article>;
  const siblings = all.filter(x => x.$id !== initial.$id && (!art || (x as Article).blogHandle === a.blogHandle)).map(x => x.handle);
  const handle = slug(r.handle || "") || uniqueHandle(r.title || "", siblings);
  const newPath = art ? `/blogs/${slug(a.blogHandle || "news")}/${handle}` : `/pages/${handle}`;
  const oldPath = initial.$id ? pathOf(initial) : null;
  const moved = !!oldPath && oldPath !== newPath;

  const save = async () => {
    if (!r.title?.trim()) { setErr("Title is required."); return; }
    if (siblings.includes(handle)) { setErr(`${newPath} is already used.`); return; }
    setBusy(true); setErr(null);
    const data: any = { title: r.title.trim(), handle, bodyHtml: r.bodyHtml || undefined, published: r.published !== false,
      publishedAt: r.publishedAt || (r.published !== false ? new Date().toISOString() : undefined),
      seoTitle: r.seoTitle || undefined, seoDescription: r.seoDescription || undefined };
    if (art) Object.assign(data, { blogHandle: slug(a.blogHandle || "news"), blogTitle: a.blogTitle || undefined, author: a.author || undefined,
      summaryHtml: a.summaryHtml || undefined, imageUrl: a.imageUrl || undefined, tags: a.tags ?? [] });
    try {
      if (initial.$id) await update(kind, initial.$id, data); else await create(kind, { ...data, siteId: s.$id });
      if (moved && keepOldUrl) await redirectMoved(s.$id, oldPath, newPath);
      onSaved();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const del = async () => {
    if (!initial.$id || !confirm(`Delete "${initial.title}"? Its URL will stop working unless you add a redirect.`)) return;
    await remove(kind, initial.$id); onSaved();
  };

  return (
    <Modal open wide title={initial.$id ? `Edit ${art ? "post" : "page"}` : `Create ${art ? "post" : "page"}`} onClose={onClose}
      footer={<>{initial.$id && <Button variant="ghost" className="mr-auto text-red-600" onClick={del}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      {err && <ErrorBox error={err} />}
      {initial.source === "shopify" && <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">Imported from Shopify. Importing again overwrites these fields.</p>}
      <Field label="Title"><Input value={r.title ?? ""} onChange={e => setR(x => ({ ...x, title: e.target.value, handle: handleTouched ? x.handle : "" }))} /></Field>
      <Field label="Content" hint="HTML."><Textarea rows={12} className="font-mono text-xs" value={r.bodyHtml ?? ""} onChange={e => set("bodyHtml", e.target.value)} /></Field>
      {art && <>
        <Field label="Excerpt" hint="Shown in blog listings. HTML."><Textarea rows={2} value={a.summaryHtml ?? ""} onChange={e => set("summaryHtml", e.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Blog handle" hint="/blogs/{this}"><Input value={a.blogHandle ?? ""} onChange={e => set("blogHandle", e.target.value)} /></Field>
          <Field label="Blog title"><Input value={a.blogTitle ?? ""} onChange={e => set("blogTitle", e.target.value)} /></Field>
          <Field label="Author"><Input value={a.author ?? ""} onChange={e => set("author", e.target.value)} /></Field>
          <Field label="Tags" hint="Comma separated"><Input value={(a.tags ?? []).join(", ")} onChange={e => set("tags", e.target.value.split(",").map(t => t.trim()).filter(Boolean))} /></Field>
        </div>
        <Field label="Featured image URL"><Input value={a.imageUrl ?? ""} onChange={e => set("imageUrl", e.target.value)} /></Field>
      </>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.published !== false} onChange={e => set("published", e.target.checked)} />Visible on the storefront</label>
      <details className="text-sm" open={moved || undefined}><summary className="cursor-pointer font-medium">Search engine listing</summary>
        <div className="mt-2 space-y-2">
          <Field label="URL handle" hint={<>{storeUrl(s, newPath)}{initial.$id && s.domain ? <> · <a className="inline-flex items-center gap-0.5 underline" href={storeUrl(s, newPath)} target="_blank" rel="noreferrer">open<ExternalLink className="size-3" /></a></> : null}</>}>
            <Input className="font-mono" value={r.handle ?? ""} placeholder={handle} onChange={e => { setHandleTouched(true); set("handle", e.target.value); }} onBlur={() => r.handle && set("handle", slug(r.handle))} /></Field>
          {moved && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={keepOldUrl} onChange={e => setKeepOldUrl(e.target.checked)} />
            Redirect <code>{oldPath}</code> to the new URL</label>}
          <Field label="Page title"><Input value={r.seoTitle ?? ""} placeholder={r.title} onChange={e => set("seoTitle", e.target.value)} /></Field>
          <Field label="Meta description" hint={`${(r.seoDescription ?? "").length}/160 characters`}><Textarea rows={2} value={r.seoDescription ?? ""} onChange={e => set("seoDescription", e.target.value)} /></Field>
        </div>
      </details>
    </Modal>
  );
}
