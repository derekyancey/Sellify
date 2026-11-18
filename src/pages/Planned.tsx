import { Hammer } from "lucide-react";
import type { Planned as P } from "../lib/nav";
import { Card, PageHeader } from "../components/ui";

export default function Planned({ label, planned }: { label: string; planned: P }) {
  return (
    <>
      <PageHeader title={label} subtitle="Planned. Not built yet." />
      <Card>
        <div className="flex gap-3">
          <Hammer className="mt-0.5 size-5 shrink-0 text-zinc-400" />
          <div className="space-y-3 text-sm">
            <div><div className="font-medium">What it will do</div><p className="text-zinc-600">{planned.what}</p></div>
            <div><div className="font-medium">How (free / open source)</div><p className="text-zinc-600">{planned.approach}</p></div>
            {planned.links && <div className="flex flex-wrap gap-3">{planned.links.map(l => <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="underline">{l.label} ↗</a>)}</div>}
          </div>
        </div>
      </Card>
    </>
  );
}
