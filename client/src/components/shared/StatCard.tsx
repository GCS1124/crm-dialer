import type { LucideIcon } from "lucide-react";

import { Card } from "./Card";

interface StatCardProps {
  title: string;
  value: string;
  hint: string;
  icon: LucideIcon;
}

export function StatCard({ title, value, hint, icon: Icon }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-cyan-400/10 blur-2xl dark:bg-cyan-300/10" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {value}
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
        <div className="rounded-2xl bg-slate-900 p-3 text-white dark:bg-white dark:text-slate-900">
          <Icon size={20} />
        </div>
      </div>
    </Card>
  );
}
