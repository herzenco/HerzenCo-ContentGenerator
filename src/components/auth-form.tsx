"use client";

import { FormEvent, useState } from "react";
import { KeyRound, Loader2, LockKeyhole, Mail, Sparkles } from "lucide-react";
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

  return (
    <main className="min-h-screen bg-[#0d0f12] px-5 py-8 text-[#eef1f0]">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_440px]">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">
            <Sparkles size={16} />
            Herzen Content Engine
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-normal text-white md:text-5xl">
            Private operator access
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/60">
            Sign in with a Herzen Co. email and password to manage content,
            properties, review workflows, model routing, and performance.
          </p>
        </div>

        <form
          className="border border-white/10 bg-[#15191e] p-5 shadow-2xl shadow-black/20"
          onSubmit={handleSubmit}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase text-white/40">
                {mode === "sign-in" ? "Sign in" : "Create account"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {mode === "sign-in" ? "Welcome back" : "Join the workspace"}
              </h2>
            </div>
            <div className="flex h-10 w-10 items-center justify-center border border-emerald-300/35 bg-emerald-300/10 text-emerald-100">
              <KeyRound size={18} />
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="font-mono text-xs uppercase text-white/45">Email</span>
              <span className="mt-2 flex items-center gap-2 border border-white/10 bg-[#0d0f12] px-3 py-3">
                <Mail size={16} className="text-white/45" />
                <input
                  autoComplete="email"
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={`name@${allowedDomain}`}
                  type="email"
                  value={email}
                />
              </span>
            </label>

            <label className="block">
              <span className="font-mono text-xs uppercase text-white/45">Password</span>
              <span className="mt-2 flex items-center gap-2 border border-white/10 bg-[#0d0f12] px-3 py-3">
                <LockKeyhole size={16} className="text-white/45" />
                <input
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
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
            <p className="mt-4 border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/65">
              {message}
            </p>
          )}

          <button
            className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-emerald-300 px-4 py-3 text-sm font-semibold text-[#08110e] hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </button>

          <button
            className="mt-4 w-full text-center text-sm text-white/55 hover:text-white"
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
