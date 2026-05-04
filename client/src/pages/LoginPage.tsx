import { ArrowRight } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { z } from "zod";

import { AlertBanner } from "../components/shared/AlertBanner";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { useAppState } from "../hooks/useAppState";
import { buildApiUrl } from "../lib/api";
import { hasSupabaseBrowserConfig } from "../lib/supabase";
import type { RuntimeStatus } from "../types";

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
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [runtimeError, setRuntimeError] = useState("");
  const googleSignInAvailable = hasSupabaseBrowserConfig && runtime?.dataMode === "supabase"&& false;

  useEffect(() => {
    let active = true;

    async function loadRuntime() {
      try {
        const response = await fetch(buildApiUrl("/runtime"));
        if (!response.ok) {
          throw new Error(`Runtime check failed with status ${response.status}`);
        }

        const payload = (await response.json()) as RuntimeStatus;
        if (active) {
          setRuntime(payload);
          setRuntimeError("");
        }
      } catch (loadError) {
        if (active) {
          setRuntimeError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to read backend runtime status.",
          );
        }
      }
    }

    void loadRuntime();
    return () => {
      active = false;
    };
  }, []);

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
              {!runtime
                ? "Checking backend"
                : runtime.dataMode === "supabase"
                  ? "Live Supabase"
                  : "Local mode"}
            </div>
          </div>

          {runtimeError ? (
            <AlertBanner
              title="Runtime status unavailable"
              description={runtimeError}
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

          {googleSignInAvailable ? (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">
                  Or
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <Button
                className="w-full"
                size="lg"
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => void handleGoogleSignIn()}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5c-.24 1.26-.98 2.33-2.08 3.05l3.37 2.61c1.96-1.81 3.09-4.48 3.09-7.65 0-.72-.06-1.42-.18-2.1H12Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 22c2.97 0 5.46-.98 7.28-2.66l-3.37-2.61c-.94.63-2.14 1.01-3.91 1.01-3 0-5.53-2.03-6.44-4.76H2.08v2.99A10.99 10.99 0 0 0 12 22Z"
                  />
                  <path
                    fill="#4A90E2"
                    d="M5.56 12.98A6.62 6.62 0 0 1 5.2 11c0-.69.12-1.36.34-1.98V6.03H2.08A11 11 0 0 0 1 11c0 1.77.42 3.44 1.08 4.97l3.48-2.99Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M12 5.24c1.61 0 3.06.55 4.2 1.64l3.15-3.15C17.45 1.98 14.97 1 12 1A10.99 10.99 0 0 0 2.08 6.03l3.48 2.99C6.47 7.27 9 5.24 12 5.24Z"
                  />
                </svg>
                Continue with Google
              </Button>
            </>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4 text-[13px]">
            <span className="text-slate-600">Need a new account?</span>
            <Link to="/signup" className="font-medium text-cyan-700 hover:text-cyan-800">
              Create account
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
