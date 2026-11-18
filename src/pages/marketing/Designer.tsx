import { lazy, Suspense } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useSite, useStorePath } from "../../context/Site";
import { create, list } from "../../lib/data";
import { useAsync } from "../../lib/useAsync";
import { date } from "../../lib/format";
import { starterTemplate } from "../../lib/emailStarter";
import { Button, Card, ErrorBox, Loading, PageHeader } from "../../components/ui";

// GrapesJS is large, so it's only downloaded when you open a template.
const EmailEditor = lazy(() => import("./EmailEditor"));

export default function Designer() {
  const { id } = useParams();
  if (id) return <Suspense fallback={<Loading label="Loading the designer…" />}><EmailEditor id={id} /></Suspense>;
  return <TemplateList />;
}

function TemplateList() {
  const { site } = useSite(); const s = site!;
  const sp = useStorePath();
  const navigate = useNavigate();
  const { data, loading, error } = useAsync(() => list("templates", s.$id), [s.$id]);
  const createNew = async () => {
    const t = await create("templates", { siteId: s.$id, name: "Untitled email", subject: `News from ${s.name}`, html: starterTemplate(s.name, s.domain ? `https://${s.domain}` : "") });
    navigate(sp(`/marketing/designer/${t.$id}`));
  };
  return (
    <>
      <PageHeader title="Email designer" subtitle="Drag-and-drop email templates (built on GrapesJS, open source). Use them in Campaigns."
        actions={<Button variant="primary" onClick={createNew}><Plus className="size-4" />New template</Button>} />
      {error && <ErrorBox error={error} />}
      {loading ? <Loading /> : !data!.length ? <Card><p className="py-6 text-center text-sm text-zinc-500">No templates yet. Start one from the starter design.</p></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data!.map(t => (
            <Link key={t.$id} to={sp(`/marketing/designer/${t.$id}`)} className="group overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm hover:border-zinc-400">
              <div className="pointer-events-none h-48 overflow-hidden bg-zinc-100">
                <iframe title={t.name} srcDoc={t.html} className="h-[600px] w-[200%] origin-top-left scale-50 border-0" tabIndex={-1} sandbox="" />
              </div>
              <div className="border-t border-zinc-100 p-3">
                <div className="font-medium group-hover:underline">{t.name}</div>
                <div className="truncate text-sm text-zinc-500">{t.subject}</div>
                <div className="mt-1 text-xs text-zinc-400">Created {date(t.$createdAt)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
