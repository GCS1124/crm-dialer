import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { z } from "zod";

import { AlertBanner } from "../components/shared/AlertBanner";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { useAppState } from "../hooks/useAppState";
import { hasSupabaseBrowserConfig } from "../lib/supabase";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type LoginField = keyof z.infer<typeof loginSchema>;

function getFieldErrors(error: z.ZodError<z.infer<typeof loginSchema>>) {
  const flattened = error.flatten().fieldErrors;
  return {
    email: flattened.email?.[0],
    password: flattened.password?.[0],
  } satisfies Partial<Record<LoginField, string>>;
}

export function LoginPage() {
  const { currentUser, continueWithGoogle, login } = useAppState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LoginField, string>>>({});
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (currentUser) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const parsed = loginSchema.safeParse({ email, password });

    if (!parsed.success) {
      setFieldErrors(getFieldErrors(parsed.error));
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    const result = await login(parsed.data.email, parsed.data.password);

    setIsSubmitting(false);
    if (!result.success) {
      setError(result.message ?? "Unable to sign in.");
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setIsSubmitting(true);
    const result = await continueWithGoogle();
    if (!result.success) {
      setIsSubmitting(false);
      setError(result.message ?? "Unable to start Google sign-in.");
    }
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[520px] items-center">
        <Card className="w-full rounded-[28px] p-8 shadow-[0_28px_80px_rgba(15,23,42,0.1)] xl:p-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="crm-section-label text-sky-700">Login</p>
              <h2 className="mt-3 text-[32px] font-semibold tracking-tight text-slate-950">
                Sign in
              </h2>
              <p className="mt-2 text-[13px] text-slate-500">
                Access calls, follow-ups, lead management, and reporting from one workspace.
              </p>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
              {hasSupabaseBrowserConfig ? "Live Supabase" : "Supabase not configured"}
            </div>
          </div>
          {!hasSupabaseBrowserConfig ? (
            <AlertBanner
              title="Supabase is not configured"
              description="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before signing in."
              tone="warning"
              className="mt-5"
            />
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">Email</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFieldErrors((current) => ({ ...current, email: undefined }));
                }}
                placeholder="you@company.com"
                className="crm-input"
              />
              {fieldErrors.email ? (
                <p className="text-[12px] text-rose-700">{fieldErrors.email}</p>
              ) : null}
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFieldErrors((current) => ({ ...current, password: undefined }));
                }}
                placeholder="Enter your password"
                className="crm-input"
              />
              {fieldErrors.password ? (
                <p className="text-[12px] text-rose-700">{fieldErrors.password}</p>
              ) : null}
            </label>

            {error ? (
              <AlertBanner title="Sign-in failed" description={error} tone="error" className="mt-1" />
            ) : null}

            <Button className="w-full" size="lg" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
              <ArrowRight size={16} />
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
