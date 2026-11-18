import { useState } from "react";
import { Mail } from "lucide-react";
import { useSite } from "../../context/Site";
import { list, ops, update } from "../../lib/data";
import { useAsync } from "../../lib/useAsync";
import { dateTime, money } from "../../lib/format";
import type { Checkout } from "../../lib/types";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, Table, Td } from "../../components/ui";

const HOUR = 36e5;

/** Checkouts that went to Stripe/PayPal but were never paid (open for >1h, or expired). */
export default function Abandoned() {
  const { site } = useSite(); const s = site!;
  const { data, loading, error, reload } = useAsync(() => list("checkouts", s.$id), [s.$id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const rows = (data ?? []).filter(c => c.status === "expired" || (c.status === "open" && Date.now() - +new Date(c.$createdAt) > HOUR));
  const recoverable = rows.filter(c => c.email);
  const lost = rows.reduce((t, c) => t + c.total, 0);
  const canEmail = s.emailStatus === "verified";

  const recover = async (c: Checkout) => {
    setBusy(c.$id); setMsg(null);
    try {
      await ops("/email/recovery", { site: s, checkout: c });
      await update("checkouts", c.$id, { recoveryEmailedAt: new Date().toISOString() });
      setMsg(`Reminder sent to ${c.email}.`); reload();
    } catch (e: any) { setMsg(`Error: ${e.message}`); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader title="Abandoned checkouts" subtitle={`${rows.length} unpaid carts worth ${money(lost, s.currency)} · ${recoverable.length} with an email address`} />
      {!canEmail && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Finish <a className="underline" href="/settings#email">email setup</a> to send cart reminders.</div>}
      {msg && <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.startsWith("Error") ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{msg}</div>}
      <Card>
        {error && <ErrorBox error={error} />}
        {loading ? <Loading /> : (
          <Table head={["Started", "Email", "Cart", "Via", "Total", ""]} empty={!rows.length}>
            {rows.map(c => (
              <tr key={c.$id}>
                <Td>{dateTime(c.$createdAt)}</Td>
                <Td>{c.email || <span className="text-zinc-400">unknown</span>}</Td>
                <Td className="max-w-xs truncate">{c.items.map(i => `${i.quantity}× ${i.title}`).join(", ")}</Td>
                <Td><Badge>{c.provider === "paypal" ? "PayPal" : "Stripe"}</Badge></Td>
                <Td className="tabular-nums">{money(c.total, s.currency)}</Td>
                <Td className="text-right">
                  {c.recoveryEmailedAt ? <span className="text-xs text-zinc-500">Reminded {dateTime(c.recoveryEmailedAt)}</span>
                    : c.email && <Button disabled={!canEmail} loading={busy === c.$id} onClick={() => recover(c)}><Mail className="size-4" />Send reminder</Button>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-3 text-xs text-zinc-500">The reminder links back to your store with the cart restored (sellify.js reads it from the link).</p>
      </Card>
    </>
  );
}
