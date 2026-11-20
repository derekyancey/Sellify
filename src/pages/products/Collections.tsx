import { useEffect, useState } from "react";
import { EyeOff, ImageOff, Plus, RefreshCw, Sparkles, Zap } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useSite, useStorePath } from "../../context/Site";
import { create, list } from "../../lib/data";
import { useAsync } from "../../lib/useAsync";
import { FIELDS, OPS, SORTS, collectionProducts, isSmart, needsValue, salesByProduct, slug, sortOf, suggestions, syncCollections } from "../../lib/collections";
import type { Collection, CollectionRules } from "../../lib/types";
import { Badge, Button, Card, ErrorBox, Loading, Modal, PageHeader, Table, Td } from "../../components/ui";

export const rulesSummary = (r?: CollectionRules | null) => {
  const cs = r?.conditions ?? [];
  if (!cs.length) return "No conditions";
  return cs.map(c => `${FIELDS[c.field].label} ${OPS[c.op]}${needsValue(c.op) ? " " + c.values.filter(Boolean).join(", ") : ""}`).join(r!.match === "any" ? " or " : " and ");
};

export default function Collections() {
  const { site } = useSite(); const s = site!;
  const sp = useStorePath(); const nav = useNavigate();
  const { data, loading, error, reload } = useAsync(async () => {
    const [cols, products] = await Promise.all([list("collections", s.$id), list("products", s.$id)]);
    return { cols, products };
  }, [s.$id]);
  const [suggest, setSuggest] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncErr, setSyncErr] = useState<string | null>(null);

  // Keep stored product lists current (products may have been imported or edited since the last save).
  useEffect(() => {
    if (!data?.cols.length) return;
    let off = false;
    syncCollections(s.$id, { products: data.products, collections: data.cols }).then(n => { if (n && !off) reload(); }).catch(e => !off && setSyncErr(e.message));
    return () => { off = true; };
  }, [data, s.$id, reload]);

  const resync = async () => { setSyncing(true); setSyncErr(null); try { await syncCollections(s.$id); await reload(); } catch (e: any) { setSyncErr(e.message); } setSyncing(false); };

  return (
    <>
      <PageHeader title="Collections" subtitle={<>Group products for your storefront. <code className="text-xs">Yancey.collection('handle')</code> returns them.</>}
        actions={<>
          <Button onClick={resync} loading={syncing} title="Recalculate which products are in each smart collection"><RefreshCw className="size-4" />Refresh</Button>
          <Button onClick={() => setSuggest(true)} disabled={!data?.products.length}><Sparkles className="size-4" />Create from products</Button>
          <Button variant="primary" onClick={() => nav(sp("/products/collections/new"))}><Plus className="size-4" />Create collection</Button>
        </>} />
      <Card>
        {(error || syncErr) && <ErrorBox error={(error || syncErr)!} hint={syncErr && /attribute|column/i.test(syncErr) ? "The collections table is missing the new columns. Re-run appwrite/setup.py." : undefined} />}
        {loading && !data ? <Loading /> : (
          <Table head={["", "Collection", "Products", "Conditions", "Sort"]} empty={!data!.cols.length}>
            {data!.cols.map(c => (
              <tr key={c.$id} className="cursor-pointer hover:bg-zinc-50" onClick={() => nav(sp(`/products/collections/${c.$id}`))}>
                <Td className="w-12">{c.imageUrl ? <img src={c.imageUrl} alt="" className="size-9 rounded-md object-cover" /> :
                  <div className="grid size-9 place-items-center rounded-md bg-zinc-100 text-zinc-400"><ImageOff className="size-4" /></div>}</Td>
                <Td>
                  <div className="flex items-center gap-1.5 font-medium">{c.title}{c.published === false && <EyeOff className="size-3.5 text-zinc-400" aria-label="Hidden" />}</div>
                  <div className="font-mono text-xs text-zinc-500">{c.handle}</div>
                </Td>
                <Td className="tabular-nums">{(c.productIds ?? []).length}</Td>
                <Td className="max-w-sm text-zinc-600">{isSmart(c) ? <span className="flex items-start gap-1"><Zap className="mt-0.5 size-3.5 shrink-0 text-amber-500" /><span className="line-clamp-2">{rulesSummary(c.rules)}</span></span> : <Badge>Manual</Badge>}</Td>
                <Td className="whitespace-nowrap text-zinc-500">{SORTS[sortOf(c)]}</Td>
              </tr>
            ))}
          </Table>
        )}
        {data && !data.cols.length && data.products.length > 0 && (
          <div className="mt-2 text-center"><Button onClick={() => setSuggest(true)}><Sparkles className="size-4" />Create collections from your {data.products.length} products</Button></div>
        )}
      </Card>
      {suggest && data && <Suggest cols={data.cols} products={data.products} onClose={() => setSuggest(false)} onDone={() => { setSuggest(false); reload(); }} />}
    </>
  );
}

/** One-click smart collections from the product types and common tags in the catalog (e.g. after a Shopify import). */
function Suggest({ cols, products, onClose, onDone }: { cols: Collection[]; products: import("../../lib/types").Product[]; onClose(): void; onDone(): void }) {
  const { site } = useSite(); const s = site!;
  const sg = suggestions(products, cols);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(sg.types.filter(t => !t.exists).map(t => t.key)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (k: string) => setPicked(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const all = [...sg.types, ...sg.tags];

  const go = async () => {
    setBusy(true); setErr(null);
    const handles = new Set(cols.map(c => c.handle));
    let sales: Map<string, number> | undefined;
    try {
      sales = salesByProduct(await list("orders", s.$id));
      for (const x of all.filter(x => picked.has(x.key))) {
        let handle = slug(x.title) || "collection"; for (let i = 2; handles.has(handle); i++) handle = `${slug(x.title)}-${i}`;
        handles.add(handle);
        const draft = { type: "smart" as const, rules: x.rules, sortOrder: "best-selling" as const, productIds: [] as string[] };
        const ids = collectionProducts(draft, products, sales).map(p => p.$id);
        await create("collections", { siteId: s.$id, title: x.title, handle, description: "", ...draft, productIds: ids, published: true });
      }
      onDone();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  const Row = ({ x }: { x: typeof all[number] }) => (
    <label className={"flex items-center gap-2 py-1 " + (x.exists ? "text-zinc-400" : "")}>
      <input type="checkbox" disabled={x.exists} checked={picked.has(x.key)} onChange={() => toggle(x.key)} />
      <span className="flex-1">{x.title}</span>
      <span className="text-xs tabular-nums text-zinc-500">{x.exists ? "already exists" : `${x.count} products`}</span>
    </label>
  );

  return (
    <Modal open title="Create collections from your products" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!picked.size} onClick={go}>Create {picked.size || ""} collection{picked.size === 1 ? "" : "s"}</Button></>}>
      {err && <ErrorBox error={err} />}
      <p className="text-sm text-zinc-600">Each becomes a smart collection that updates itself as products are added, edited or imported. You can change the conditions afterwards.</p>
      {sg.types.length > 0 && <div><div className="mb-1 text-sm font-medium">By product type</div><div className="text-sm">{sg.types.map(x => <Row key={x.key} x={x} />)}</div></div>}
      {sg.tags.length > 0 && <div><div className="mb-1 text-sm font-medium">By tag <span className="font-normal text-zinc-500">(used on 3+ products)</span></div>
        <div className="max-h-60 overflow-y-auto text-sm">{sg.tags.map(x => <Row key={x.key} x={x} />)}</div></div>}
      {!all.length && <p className="text-sm text-zinc-500">No product types or common tags found. <Link className="underline" to="new">Create a collection</Link> by hand instead.</p>}
    </Modal>
  );
}
