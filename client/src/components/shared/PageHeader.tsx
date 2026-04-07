import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200/80 bg-white/92 px-5 py-4 shadow-soft dark:border-slate-800 dark:bg-slate-900/82 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-1">
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-surface-700 dark:text-cyan-300">
            {eyebrow}
          </p>
        ) : null}
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-[12px] text-slate-500 dark:text-slate-400">
            {description}
          </p>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
