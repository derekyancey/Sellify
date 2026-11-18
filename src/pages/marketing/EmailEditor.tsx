import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import grapesjs, { type Editor } from "grapesjs";
import newsletter from "grapesjs-preset-newsletter";
import "grapesjs/dist/css/grapes.min.css";
import { ArrowLeft, Send } from "lucide-react";
import { useSite, useStorePath } from "../../context/Site";
import { list, ops, remove, update } from "../../lib/data";
import { listFiles, uploadFile } from "../../lib/files";
import { MERGE_TAGS } from "../../lib/emailStarter";
import type { EmailTemplate } from "../../lib/types";
import { Button, ErrorBox, Input, Loading } from "../../components/ui";

export default function EmailEditor({ id }: { id: string }) {
  const { site } = useSite(); const s = site!;
  const navigate = useNavigate();
  const sp = useStorePath();
  const holder = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | null>(null);
  const [tpl, setTpl] = useState<EmailTemplate | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    list("templates", s.$id).then(rows => {
      const t = rows.find(r => r.$id === id);
      if (!t) { setMissing(true); return; }
      setTpl(t); setName(t.name); setSubject(t.subject);
    });
  }, [id, s.$id]);

  useEffect(() => {
    if (!tpl || !holder.current) return;
    const e = grapesjs.init({
      container: holder.current, height: "100%", width: "auto", storageManager: false, fromElement: false,
      plugins: [newsletter], pluginsOpts: { [newsletter as any]: { inlineCss: true } },
      ...(tpl.design ? { projectData: JSON.parse(tpl.design) } : { components: tpl.html }),
      assetManager: {
        upload: false,
        uploadFile: async (ev: any) => {
          const files: FileList = ev.dataTransfer ? ev.dataTransfer.files : ev.target.files;
          for (const f of Array.from(files)) {
            try { const up = await uploadFile(s.$id, f); e.AssetManager.add({ src: up.url, name: up.name }); }
            catch (err: any) { setMsg(`Upload failed: ${err.message}`); }
          }
        },
      },
    });
    listFiles(s.$id).then(fs => e.AssetManager.add(fs.filter(f => f.mime.startsWith("image/")).map(f => ({ src: f.url, name: f.name })))).catch(() => {});
    editor.current = e;
    return () => { e.destroy(); editor.current = null; };
  }, [tpl, s.$id]);

  const currentHtml = () => {
    const e = editor.current!;
    const inlined = e.runCommand("gjs-get-inlined-html") as string;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0">${inlined}</body></html>`;
  };

  const save = async () => {
    if (!editor.current || !tpl) return;
    setBusy("save"); setMsg(null);
    try {
      const html = currentHtml();
      await update("templates", tpl.$id, { name: name.trim() || "Untitled email", subject, html, design: JSON.stringify(editor.current.getProjectData()) });
      setMsg(html.includes("{{unsubscribe_url}}") ? "Saved." : "Saved. Add an {{unsubscribe_url}} link before using this in a campaign (required by anti-spam law).");
    } catch (e: any) { setMsg(`Error: ${e.message}`); } finally { setBusy(null); }
  };

  const sendTest = async () => {
    if (!editor.current) return;
    if (s.emailStatus !== "verified" || !s.ownerEmail) { setMsg("Finish email setup (Settings → Email) to send tests."); return; }
    setBusy("test"); setMsg(null);
    try {
      await ops("/email/campaign", { site: s, subject: `[Test] ${subject}`, html: currentHtml(), test: true,
        recipients: [{ email: s.ownerEmail, name: "You", customerId: "test" }] });
      setMsg(`Test sent to ${s.ownerEmail}.`);
    } catch (e: any) { setMsg(`Error: ${e.message}`); } finally { setBusy(null); }
  };

  if (missing) return <ErrorBox error="Template not found for this site." />;
  if (!tpl) return <Loading />;
  return (
    <div className="-m-4 flex h-[calc(100vh-57px)] flex-col sm:-m-6">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2">
        <Button variant="ghost" onClick={() => navigate(sp("/marketing/designer"))} aria-label="Back"><ArrowLeft className="size-4" /></Button>
        <Input value={name} onChange={e => setName(e.target.value)} className="w-44" aria-label="Template name" />
        <Input value={subject} onChange={e => setSubject(e.target.value)} className="min-w-0 flex-1" placeholder="Subject line" aria-label="Subject" />
        <select className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm" value="" aria-label="Copy a merge tag"
          onChange={e => { if (e.target.value) { navigator.clipboard?.writeText(e.target.value); setMsg(`Copied ${e.target.value}. Paste it into any text block.`); } }}>
          <option value="">Merge tags…</option>{MERGE_TAGS.map(t => <option key={t.tag} value={t.tag}>{t.label}: {t.tag}</option>)}
        </select>
        <Button loading={busy === "test"} onClick={sendTest}><Send className="size-4" />Send test</Button>
        <Button variant="primary" loading={busy === "save"} onClick={save}>Save</Button>
        <Button variant="ghost" className="text-red-600" onClick={async () => { if (confirm("Delete this template?")) { await remove("templates", tpl.$id); navigate(sp("/marketing/designer")); } }}>Delete</Button>
      </div>
      {msg && <div className={`px-3 py-1.5 text-sm ${msg.startsWith("Error") ? "bg-red-50 text-red-800" : "bg-sky-50 text-sky-900"}`}>{msg}</div>}
      <div className="min-h-0 flex-1"><div ref={holder} className="h-full" /></div>
    </div>
  );
}
