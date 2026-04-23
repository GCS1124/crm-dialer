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
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="crm-section-label text-sky-700 dark:text-cyan-300">
            {eyebrow}
          </p>
        ) : null}
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-950 dark:text-white">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-slate-500 dark:text-slate-400">
            {description}
          </p>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div> : null}
    </div>
  );
}
