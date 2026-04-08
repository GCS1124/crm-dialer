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
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-2 text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white">
            {value}
          </p>
          <p className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
        <div className="rounded-md bg-slate-100 p-2.5 text-slate-700 dark:bg-slate-800 dark:text-slate-100">
          <Icon size={18} />
        </div>
      </div>
    </Card>
  );
}
