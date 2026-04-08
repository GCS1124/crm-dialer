import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";

import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { useAppState } from "../hooks/useAppState";

export function SignupPage() {
  const { currentUser, signup } = useAppState();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    team: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    title: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (currentUser) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const result = await signup(form);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.message ?? "Unable to create account.");
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1120px] items-center px-4 py-8">
      <div className="grid w-full gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-[8px] border border-slate-300 bg-[#0a6896] p-8 text-white shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
            Signup
          </p>
          <h1 className="mt-4 text-[30px] font-semibold tracking-tight">
            Create account
          </h1>
          <p className="mt-3 max-w-sm text-[13px] text-white/78">
            Create an agent account and start using the dialer.
          </p>
        </section>

        <Card className="rounded-[8px] p-8">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Signup</p>
            <h2 className="mt-2 text-[22px] font-semibold text-slate-900 dark:text-white">
              Create account
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Full name"
                className="rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
              />
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Job title"
                className="rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="Email"
              className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
            />
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Password"
              className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                value={form.team}
                onChange={(event) => setForm((current) => ({ ...current, team: event.target.value }))}
                placeholder="Team name"
                className="rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
              />
              <input
                value={form.timezone}
                onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                placeholder="Timezone"
                className="rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            {error ? (
              <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                {error}
              </p>
            ) : null}
            <Button className="w-full" size="lg" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create account"}
              <ArrowRight size={16} />
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between gap-3 rounded-[6px] border border-slate-200 bg-slate-50 px-4 py-4 text-[12px] dark:border-slate-800 dark:bg-slate-900">
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
