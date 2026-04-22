import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { z } from "zod";

import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { AlertBanner } from "../components/shared/AlertBanner";
import { useAppState } from "../hooks/useAppState";

const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter the full name."),
  title: z.string().trim().min(2, "Enter the job title."),
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  team: z.string().trim().min(2, "Enter the team name."),
  timezone: z.string().trim().min(2, "Enter a valid timezone."),
});

type SignupForm = z.infer<typeof signupSchema>;
type SignupField = keyof SignupForm;

function getFieldErrors(error: z.ZodError<SignupForm>) {
  const flattened = error.flatten().fieldErrors;
  return {
    name: flattened.name?.[0],
    title: flattened.title?.[0],
    email: flattened.email?.[0],
    password: flattened.password?.[0],
    team: flattened.team?.[0],
    timezone: flattened.timezone?.[0],
  } satisfies Partial<Record<SignupField, string>>;
}

export function SignupPage() {
  const { currentUser, signup } = useAppState();
  const [form, setForm] = useState<SignupForm>({
    name: "",
    email: "",
    password: "",
    team: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    title: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SignupField, string>>>({});
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (currentUser) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(getFieldErrors(parsed.error));
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    const result = await signup(parsed.data);

    setIsSubmitting(false);
    if (!result.success) {
      setError(result.message ?? "Unable to create account.");
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1120px] items-center px-4 py-8">
      <div className="grid w-full gap-6 lg:grid-cols-[0.88fr_1.12fr]">
        <section className="rounded-[24px] border border-slate-300 bg-[#0a6896] p-8 text-white shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
            Signup
          </p>
          <h1 className="mt-4 text-[30px] font-semibold tracking-tight">
            Create workspace account
          </h1>
          <p className="mt-3 max-w-sm text-[13px] text-white/78">
            Create an agent or operator account with the team, title, and timezone needed for CRM routing.
          </p>
        </section>

        <Card className="rounded-[24px] p-8">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Signup
            </p>
            <h2 className="mt-2 text-[24px] font-semibold text-slate-900 dark:text-white">
              Create account
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Full name</span>
                <input
                  value={form.name}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, name: event.target.value }));
                    setFieldErrors((current) => ({ ...current, name: undefined }));
                  }}
                  placeholder="Anushi Mittal"
                  className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                />
                {fieldErrors.name ? (
                  <p className="text-[12px] text-rose-700 dark:text-rose-300">{fieldErrors.name}</p>
                ) : null}
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Job title</span>
                <input
                  value={form.title}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, title: event.target.value }));
                    setFieldErrors((current) => ({ ...current, title: undefined }));
                  }}
                  placeholder="Sales agent"
                  className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                />
                {fieldErrors.title ? (
                  <p className="text-[12px] text-rose-700 dark:text-rose-300">{fieldErrors.title}</p>
                ) : null}
              </label>
            </div>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => {
                  setForm((current) => ({ ...current, email: event.target.value }));
                  setFieldErrors((current) => ({ ...current, email: undefined }));
                }}
                placeholder="you@company.com"
                className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
              />
              {fieldErrors.email ? (
                <p className="text-[12px] text-rose-700 dark:text-rose-300">{fieldErrors.email}</p>
              ) : null}
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Password</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => {
                  setForm((current) => ({ ...current, password: event.target.value }));
                  setFieldErrors((current) => ({ ...current, password: undefined }));
                }}
                placeholder="At least 8 characters"
                className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
              />
              {fieldErrors.password ? (
                <p className="text-[12px] text-rose-700 dark:text-rose-300">
                  {fieldErrors.password}
                </p>
              ) : null}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Team</span>
                <input
                  value={form.team}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, team: event.target.value }));
                    setFieldErrors((current) => ({ ...current, team: undefined }));
                  }}
                  placeholder="International sales"
                  className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                />
                {fieldErrors.team ? (
                  <p className="text-[12px] text-rose-700 dark:text-rose-300">{fieldErrors.team}</p>
                ) : null}
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Timezone</span>
                <input
                  value={form.timezone}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, timezone: event.target.value }));
                    setFieldErrors((current) => ({ ...current, timezone: undefined }));
                  }}
                  placeholder="Asia/Calcutta"
                  className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                />
                {fieldErrors.timezone ? (
                  <p className="text-[12px] text-rose-700 dark:text-rose-300">
                    {fieldErrors.timezone}
                  </p>
                ) : null}
              </label>
            </div>

            {error ? (
              <AlertBanner title="Signup failed" description={error} tone="error" />
            ) : null}

            <Button className="w-full" size="lg" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create account"}
              <ArrowRight size={16} />
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between gap-3 rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-4 text-[12px] dark:border-slate-800 dark:bg-slate-900">
            <span className="text-slate-600 dark:text-slate-300">Already have an account?</span>
            <Link
              to="/login"
              className="font-medium text-cyan-700 hover:text-cyan-800 dark:text-cyan-300 dark:hover:text-cyan-200"
            >
              Sign in
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
