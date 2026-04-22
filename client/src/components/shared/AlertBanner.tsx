import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

type AlertTone = "error" | "warning" | "success" | "info";

interface AlertBannerProps {
  title?: string;
  description: string;
  tone?: AlertTone;
  action?: ReactNode;
  className?: string;
}

const toneClasses: Record<AlertTone, string> = {
  error:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-950/20 dark:text-rose-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-200",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-200",
  info:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/20 dark:bg-sky-950/20 dark:text-sky-200",
};

export function AlertBanner({
  title,
  description,
  tone = "info",
  action,
  className,
}: AlertBannerProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[8px] border px-4 py-3 text-sm md:flex-row md:items-start md:justify-between",
        toneClasses[tone],
        className,
      )}
    >
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <p className={title ? "mt-1" : ""}>{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
