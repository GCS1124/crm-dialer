import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";

import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { useAppState } from "../hooks/useAppState";

export function LoginPage() {
  const { currentUser, login } = useAppState();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (currentUser) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const result = await login(email, password);

    setIsSubmitting(false);
    if (!result.success) {
      setError(result.message ?? "Unable to sign in.");
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[1120px] items-center px-4 py-8">
      <div className="grid w-full gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[8px] border border-slate-300 bg-[#0a6896] p-8 text-white shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
            Preview Dialer
          </p>
          <h1 className="mt-4 text-[30px] font-semibold tracking-tight">
            Sign in
          </h1>
          <p className="mt-3 max-w-sm text-[13px] text-white/78">
            Access your lead queue, callbacks, and call history.
          </p>
        </section>

        <Card className="rounded-[8px] p-8">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Login</p>
            <h2 className="mt-2 text-[22px] font-semibold text-slate-900 dark:text-white">
              Access account
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-md border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
              />
            </label>
            {error ? (
              <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                {error}
              </p>
            ) : null}
            <Button className="w-full" size="lg" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
              <ArrowRight size={16} />
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between gap-3 rounded-[6px] border border-slate-200 bg-slate-50 px-4 py-4 text-[12px] dark:border-slate-800 dark:bg-slate-900">
            <span className="text-slate-600 dark:text-slate-300">Need a new agent account?</span>
            <Link
              to="/signup"
              className="font-medium text-cyan-700 hover:text-cyan-800 dark:text-cyan-300 dark:hover:text-cyan-200"
            >
              Create account
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
