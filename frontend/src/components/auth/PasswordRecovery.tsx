"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ErrorMessage } from "@/components/ui/Controls";

export function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const [ready, setReady] = useState(!reset), [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>(), [sent, setSent] = useState(false);
  useEffect(() => {
    if (!reset) return;
    let active = true;
    let subscription: { unsubscribe(): void } | undefined;
    void (async () => {
      try {
        const fragment = new URLSearchParams(location.hash.slice(1));
        const invalidLink = fragment.has("error") || new URLSearchParams(location.search).has("error");
        const client = supabase();
        const { data, error } = await client.auth.getSession();
        if (!active) return;
        if (invalidLink) {
          history.replaceState(null, "", location.pathname);
          throw new Error("This recovery link is invalid or expired. Request a new email.");
        }
        if (error) throw error;
        setValid(!!data.session);
        setReady(true);
        subscription = client.auth.onAuthStateChange((_event, session) => {
          if (active) setValid(!!session);
        }).data.subscription;
      } catch (error) {
        if (active) { setError(error); setReady(true); }
      }
    })();
    return () => { active = false; subscription?.unsubscribe(); };
  }, [reset]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setError(undefined); setBusy(true);
    try {
      if (reset) {
        const password = String(fields.get("password"));
        if (password.length < 8 || password !== fields.get("confirm"))
          throw new Error("Use at least 8 characters and make both passwords match.");
        const { error } = await supabase().auth.updateUser({ password });
        if (error) throw error;
        // Revoke refresh sessions on all devices after recovery. Existing access
        // tokens expire according to the project's JWT lifetime.
        const result = await supabase().auth.signOut({ scope: "global" });
        setMessage(result.error
          ? "Password updated. Sign out of other devices from your account; session revocation could not be confirmed."
          : "Password updated. Sign in with your new password.");
        setSent(true);
      } else {
        const { error } = await supabase().auth.resetPasswordForEmail(String(fields.get("email")).trim(), {
          redirectTo: `${location.origin}/reset-password`,
        });
        if (error) throw new Error("Unable to send recovery email. Try again later.");
        setMessage("If an account exists for this email, you’ll receive a password recovery link. Check your spam folder too.");
        setSent(true);
      }
    } catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen grid place-items-center p-6">
    <section className="panel w-full max-w-md space-y-5">
      <h1 className="text-2xl font-semibold">{reset ? "Choose a new password" : "Forgot your password?"}</h1>
      <p className="text-sm text-text-secondary">{reset ? "Your password is securely managed by Supabase." : "We’ll email you a link to recover your account."}</p>
      <ErrorMessage error={error} />
      {message && <p role="status">{message}</p>}
      {!ready ? <p role="status">Checking recovery link…</p> : !sent && (!reset || valid) ?
        <form onSubmit={submit} className="space-y-4">
          {reset ? <>
            <label className="label">New password<input className="field" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
            <label className="label">Confirm new password<input className="field" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
          </> : <label className="label">Email<input className="field" name="email" type="email" autoComplete="email" required /></label>}
          <button className="btn w-full" disabled={busy}>{busy ? "Please wait…" : reset ? "Update password" : "Send recovery email"}</button>
        </form> : reset && !sent && <p role="status">Open the link in your recovery email to continue. Links expire and can be used once.</p>}
      {reset && !sent && <Link className="subtle-link block" href="/forgot-password">Request a new recovery link</Link>}
      <Link className="subtle-link block" href="/login">Back to sign in</Link>
    </section>
  </main>;
}
