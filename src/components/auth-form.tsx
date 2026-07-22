"use client";

import { FormEvent, useState } from "react";
import { KeyRound, Loader2, LockKeyhole, Mail } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

interface AuthFormProps {
  allowedDomain: string;
}

type AuthMode = "sign-in" | "create";

export function AuthForm({ allowedDomain }: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();
  const hasAllowedDomain = normalizedEmail.endsWith(`@${allowedDomain}`);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!hasAllowedDomain) {
      setMessage(`Use your @${allowedDomain} email address.`);
      return;
    }

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();
    const authCall =
      mode === "sign-in"
        ? supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          })
        : supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/confirm`,
            },
          });

    const { error } = await authCall;
    setIsSubmitting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (mode === "create") {
      setMessage("Account created. Check your email if confirmation is required.");
      return;
    }

    window.location.reload();
  }

  async function handleMagicLink() {
    setMessage("");
    if (!hasAllowedDomain) {
      setMessage(`Use your @${allowedDomain} email address.`);
      return;
    }
    setIsSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        shouldCreateUser: false,
      },
    });
    setIsSubmitting(false);
    setMessage(error ? error.message : "Sign-in link sent. Check your Herzen Co. inbox.");
  }

  return (
    <main className="min-h-screen bg-[var(--color-paper)] px-5 py-8 text-[var(--color-ink)]">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_440px]">
        <div className="max-w-2xl">
          <div className="editorial-eyebrow inline-flex items-center gap-2 border border-[var(--color-clay)]/30 bg-[var(--color-clay)]/8 px-3 py-2 text-[var(--color-clay)]">
            <span className="h-1.5 w-1.5 rotate-45 bg-current" aria-hidden="true" />
            Herzen Co. · Content engine
          </div>
          <h1 className="editorial-title mt-6 text-5xl leading-[1.02] md:text-7xl">
            Private operator access
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--color-text-secondary)]">
            Sign in with a Herzen Co. email and password or a secure email link to manage content,
            properties, review workflows, model routing, and performance.
          </p>
        </div>

        <form
          className="border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-[var(--shadow-card)]"
          onSubmit={handleSubmit}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="editorial-eyebrow">
                {mode === "sign-in" ? "Sign in" : "Create account"}
              </p>
              <h2 className="editorial-title mt-2 text-3xl">
                {mode === "sign-in" ? "Welcome back" : "Join the workspace"}
              </h2>
            </div>
            <div className="flex h-10 w-10 items-center justify-center border border-[var(--color-clay)]/35 bg-[var(--color-clay)]/8 text-[var(--color-clay)]">
              <KeyRound size={18} />
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="editorial-eyebrow">Email</span>
              <span className="mt-2 flex items-center gap-2 border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-3 focus-within:border-[var(--color-clay)] focus-within:ring-2 focus-within:ring-[var(--color-clay)]/15">
                <Mail size={16} className="text-[var(--color-text-muted)]" />
                <input
                  autoComplete="email"
                  className="w-full bg-transparent text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-text-muted)]"
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={`name@${allowedDomain}`}
                  type="email"
                  value={email}
                />
              </span>
            </label>

            <label className="block">
              <span className="editorial-eyebrow">Password</span>
              <span className="mt-2 flex items-center gap-2 border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-3 focus-within:border-[var(--color-clay)] focus-within:ring-2 focus-within:ring-[var(--color-clay)]/15">
                <LockKeyhole size={16} className="text-[var(--color-text-muted)]" />
                <input
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                  className="w-full bg-transparent text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-text-muted)]"
                  minLength={6}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  type="password"
                  value={password}
                />
              </span>
            </label>
          </div>

          {message && (
            <p className="mt-4 border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
              {message}
            </p>
          )}

          <button
            className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-[var(--color-ink)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-paper)] transition-colors hover:bg-[var(--color-clay)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </button>

          {mode === "sign-in" && (
            <button
              className="mt-3 inline-flex w-full items-center justify-center gap-2 border border-[var(--color-border)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)] transition-colors hover:border-[var(--color-clay)] hover:text-[var(--color-clay)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              onClick={handleMagicLink}
              type="button"
            >
              <Mail size={16} />
              Email me a sign-in link
            </button>
          )}

          <button
            className="mt-4 w-full text-center text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-clay)]"
            onClick={() => {
              setMode(mode === "sign-in" ? "create" : "sign-in");
              setMessage("");
            }}
            type="button"
          >
            {mode === "sign-in"
              ? "Need an account? Create one"
              : "Already have an account? Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
