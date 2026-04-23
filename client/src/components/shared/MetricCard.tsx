import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { Card } from "./Card";

interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  valueClassName?: string;
  className?: string;
}

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  action,
  valueClassName,
  className,
}: MetricCardProps) {
  return (
    <Card className={cn("h-full p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p
            className={cn(
              "mt-5 text-[32px] font-semibold tracking-tight text-slate-950 dark:text-white",
              valueClassName,
            )}
          >
            {value}
          </p>
          {hint ? (
            <p className="mt-3 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
              {hint}
            </p>
          ) : null}
        </div>
        {action ? action : null}
        {!action && Icon ? (
          <div className="rounded-[14px] bg-slate-100 p-3 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            <Icon size={18} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
