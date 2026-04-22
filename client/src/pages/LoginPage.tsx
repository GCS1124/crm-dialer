import {
  AlertTriangle,
  ArrowRight,
  Database,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { z } from "zod";

import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { AlertBanner } from "../components/shared/AlertBanner";
import { useAppState } from "../hooks/useAppState";
import { buildApiUrl } from "../lib/api";
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

function RuntimePill({ runtime }: { runtime: RuntimeStatus | null }) {
  if (!runtime) {
    return (
      <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-white/80">
        Checking backend
      </span>
    );
  }

  const tone =
    runtime.dataMode === "supabase"
      ? "border-emerald-200/30 bg-emerald-500/15 text-emerald-50"
      : "border-amber-200/30 bg-amber-500/15 text-amber-50";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${tone}`}
    >
      {runtime.dataMode === "supabase" ? "Live Supabase" : "Local Mode"}
    </span>
  );
}

export function LoginPage() {
  const { currentUser, login } = useAppState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LoginField, string>>>({});
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [runtimeError, setRuntimeError] = useState("");

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

    const parsed = loginSchema.safeParse({
      email,
      password,
    });

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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.16),_transparent_36%),linear-gradient(180deg,#dbeafe_0%,#eff6ff_44%,#f8fafc_100%)] px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1120px] gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="relative overflow-hidden rounded-[24px] border border-cyan-950/10 bg-[linear-gradient(160deg,#0b4f72_0%,#0f6c96_48%,#0e7490_100%)] p-8 text-white shadow-[0_24px_80px_rgba(14,116,144,0.22)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.16),_transparent_34%)]" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70">
                Preview Dialer
              </p>
              <RuntimePill runtime={runtime} />
            </div>

            <div className="mt-10">
              <h1 className="max-w-md text-[34px] font-semibold tracking-tight">
                Sign in to the calling workspace.
              </h1>
              <p className="mt-4 max-w-xl text-[14px] leading-6 text-white/78">
                Queue control, calls, follow-ups, and reporting stay in one session.
              </p>
            </div>

            <div className="mt-8 grid gap-3">
              {[
                {
                  icon: Database,
                  title: "Runtime-aware storage",
                  text:
                    runtime?.message ??
                    "Checking whether the workspace is attached to live Supabase storage or local development mode.",
                },
                {
                  icon: ShieldCheck,
                  title: "Stronger auth feedback",
                  text:
                    "Input validation and backend errors are shown directly instead of failing with generic fetch messages.",
                },
                {
                  icon: Zap,
                  title: "Operator-first workflow",
                  text:
                    "Calls, callbacks, and lead updates stay available even when live voice is not configured.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[18px] border border-white/14 bg-white/10 p-4 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-[14px] bg-white/12 p-2 text-white">
                      <item.icon size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-1 text-[13px] text-white/72">{item.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Card className="rounded-[24px] border border-white/70 bg-white/92 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur xl:p-10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
                Login
              </p>
              <h2 className="mt-3 text-[28px] font-semibold tracking-tight text-slate-950">
                Access account
              </h2>
            </div>
            <div className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600 md:block">
              {runtime?.dataMode === "supabase" ? "Realtime enabled" : "Realtime paused"}
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
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFieldErrors((current) => ({ ...current, email: undefined }));
                }}
                placeholder="you@company.com"
                className="w-full rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-cyan-500 focus:bg-white"
              />
              {fieldErrors.email ? (
                <p className="text-[12px] text-rose-700">{fieldErrors.email}</p>
              ) : null}
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFieldErrors((current) => ({ ...current, password: undefined }));
                }}
                placeholder="Enter your password"
                className="w-full rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-cyan-500 focus:bg-white"
              />
              {fieldErrors.password ? (
                <p className="text-[12px] text-rose-700">{fieldErrors.password}</p>
              ) : null}
            </label>

            {error ? (
              <AlertBanner
                title="Sign-in failed"
                description={error}
                tone="error"
                className="mt-1"
              />
            ) : null}

            <Button
              className="w-full rounded-[14px]"
              size="lg"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
              <ArrowRight size={16} />
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between gap-3 rounded-[16px] border border-slate-200 bg-white px-4 py-4 text-[13px]">
            <span className="text-slate-600">Need a new account?</span>
            <Link to="/signup" className="font-medium text-cyan-700 hover:text-cyan-800">
              Create account
            </Link>
          </div>

          <div className="mt-5 text-[12px] text-slate-500">
            {runtime?.dataMode === "local"
              ? "Local mode is active. Accounts must exist in the local workspace store."
              : "Use your assigned workspace credentials."}
          </div>
        </Card>
      </div>
    </div>
  );
}
