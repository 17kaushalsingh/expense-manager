"use client";
import { T } from "@/components/i18n/Language";
import { authDestination, pendingInvitation } from "@/lib/invitations";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { supabase } from "@/lib/supabase";
import { ErrorMessage } from "@/components/ui/Controls";
export function AuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const email = String(fields.get("email")),
        password = String(fields.get("password"));
      const result = register
        ? await supabase().auth.signUp({
            email,
            password,
            options: {
              data: { name: fields.get("name") },
              emailRedirectTo: `${location.origin}${pendingInvitation() ? "/join" : "/login"}`,
            },
          })
        : await supabase().auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (!result.data.session)
        setMessage("Check your email to confirm your account, then sign in.");
      else router.push(authDestination());
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Authentication failed",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <section className="panel w-full max-w-md space-y-6">
        <h1 className="text-2xl font-bold">LedgerSync</h1>
        <h2>{register ? "Create your account" : "Welcome back"}</h2>
        <ErrorMessage error={error} />
        {message && <p role="status">{message}</p>}
        <form onSubmit={submit} className="space-y-4">
          {register && (
            <label className="label">
              <T text="Name" />
              <input
                className="field"
                name="name"
                required
                autoComplete="name"
              />
            </label>
          )}
          <label className="label">
            Email
            <input
              className="field"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>
          <label className="label">
            <T text="Password" />
            <input
              className="field"
              name="password"
              type="password"
              minLength={register ? 8 : 1}
              autoComplete={register ? "new-password" : "current-password"}
              required
            />
          </label>
          <button className="btn w-full" disabled={busy}>
            {busy ? "Please wait…" : register ? "Sign up" : "Sign in"}
          </button>
        </form>
        {!register && (
          <Link className="subtle-link block" href="/forgot-password">
            Forgot password?
          </Link>
        )}
        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
          <GoogleOAuthProvider
            clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}
          >
            <GoogleLogin
              onSuccess={async (response) => {
                setBusy(true);
                setError("");
                try {
                  if (!response.credential)
                    throw new Error("Missing Google credential");
                  const { error } = await supabase().auth.signInWithIdToken({
                    provider: "google",
                    token: response.credential,
                  });
                  if (error) throw error;
                  router.push(authDestination());
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Google sign-in failed",
                  );
                } finally {
                  setBusy(false);
                }
              }}
              onError={() => setError("Google sign-in failed")}
            />
          </GoogleOAuthProvider>
        )}
        <Link
          className="text-brand-primary"
          href={register ? "/login" : "/register"}
        >
          {register ? "Already registered? Sign in" : "Create an account"}
        </Link>
      </section>
    </main>
  );
}
