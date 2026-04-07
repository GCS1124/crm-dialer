import { Link } from "react-router-dom";

import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600 dark:text-cyan-300">
          404
        </p>
        <h1 className="mt-4 font-display text-4xl font-bold text-slate-900 dark:text-white">
          This page doesn’t exist in the dialer workspace.
        </h1>
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Head back to the main dashboard to keep working through leads, callbacks, and reporting.
        </p>
        <div className="mt-8 flex justify-center">
          <Link to="/dashboard">
            <Button size="lg">Return to dashboard</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
