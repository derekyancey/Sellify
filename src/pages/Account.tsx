import { CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "../context/Auth";
import { ops, resetDemo } from "../lib/data";
import { isDemo } from "../lib/appwrite";
import { useAsync } from "../lib/useAsync";
import { Button, Card, ErrorBox, Loading, PageHeader } from "../components/ui";

export default function Account() {
  const { user, logout } = useAuth();
  return (
    <>
      <PageHeader title="Account" subtitle="Settings shared by all of your stores." />
      <div className="space-y-4">
        <Card title="You">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div><div className="font-medium">{user?.name}</div><div className="text-zinc-500">{user?.email}</div></div>
            {!isDemo && <Button className="ml-auto" onClick={logout}>Sign out</Button>}
          </div>
        </Card>
        <IntegrationStatus />
        {isDemo && (
          <Card title="Demo mode">
            <p className="mb-3 text-sm text-zinc-600">You're seeing sample data saved in this browser. Add your Appwrite project ID to <code>.env</code> to switch to your real backend (see README).</p>
            <Button onClick={() => { resetDemo(); location.href = "/stores"; }}>Reset demo data</Button>
          </Card>
        )}
      </div>
    </>
  );
}

export function IntegrationStatus() {
  const { data, error, loading } = useAsync(() => ops("/health"), []);
  const items = [
    ["cloudflare", "Cloudflare", "CLOUDFLARE_API_TOKEN"],
    ["hosting", "Hosting (Appwrite Sites) custom domains", "APPWRITE_SITES_CNAME_TARGET"],
    ["googleOAuth", "Google sign-in for stores (Analytics + Search Console)", "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET on site-ops"],
    ["stripe", "Stripe (cards, Apple Pay, Google Pay)", "STRIPE_SECRET_KEY on both functions, and STRIPE_WEBHOOK_SECRET on checkout"],
    ["paypal", "PayPal", "PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV on both functions"],
    ["email", "Email (Resend)", "RESEND_API_KEY on both functions"],
  ] as const;
  return (
    <Card title="Integration status">
      {loading ? <Loading /> : error ? <ErrorBox error={`Couldn't reach the site-ops function: ${error}`} hint="Deploy appwrite/functions/site-ops (see README)." /> : (
        <ul className="space-y-2 text-sm">
          {items.map(([k, label, env]) => (
            <li key={k} className="flex items-start gap-2">
              {data.integrations[k] ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 text-red-500" />}
              <div><div className="font-medium">{label}</div>{!data.integrations[k] && <div className="text-zinc-500">Set <code>{env}</code>{["stripe", "paypal", "email", "googleOAuth"].includes(k) ? "" : " on the site-ops function"}.</div>}</div>
            </li>
          ))}
          {data.serviceAccountEmail && <li className="rounded-lg bg-zinc-50 p-2 text-zinc-600">Add <code className="font-semibold text-zinc-900">{data.serviceAccountEmail}</code> as a user in each GA4 property (Viewer) and Search Console property (Full).</li>}
        </ul>
      )}
    </Card>
  );
}

