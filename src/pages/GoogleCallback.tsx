import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ops } from "../lib/data";
import { ErrorBox, Loading } from "../components/ui";

/** Google sends the browser back here after "Connect Google account"; finish the sign-in on the server. */
export default function GoogleCallback() {
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const q = new URLSearchParams(location.search);
    if (q.get("error")) { setErr(q.get("error") === "access_denied" ? "Google access wasn't granted." : `Google returned: ${q.get("error")}`); return; }
    const code = q.get("code"), state = q.get("state");
    if (!code || !state) { setErr("This link is missing Google's sign-in details."); return; }
    ops<{ siteId: string; email?: string }>("/google/oauth/finish", { code, state, redirectUri: `${location.origin}/oauth/google` })
      .then(r => navigate(`/stores/${r.siteId}/settings#connections`, { replace: true }))
      .catch(e => setErr(e.message));
  }, [navigate]);
  return (
    <div className="mx-auto max-w-md p-8">
      {err ? <><ErrorBox error={err} /><Link className="mt-4 inline-block text-sm underline" to="/stores">Back to your stores</Link></> : <Loading label="Connecting your Google account…" />}
    </div>
  );
}
