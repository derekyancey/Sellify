import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/Auth";
import { Button, ErrorBox, Field, Input } from "../components/ui";

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await login(email, password); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-zinc-900 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-2 text-lg font-bold">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-500 text-white">S</span> Sellify
        </div>
        <p className="text-sm text-zinc-500">Sign in with your Appwrite account. Accounts are created by the owner in the Appwrite console.</p>
        {error && <ErrorBox error={error} />}
        <Field label="Email"><Input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label="Password"><Input type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></Field>
        <Button variant="primary" className="w-full" loading={busy}>Sign in</Button>
      </form>
    </div>
  );
}
