import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Card } from "./Card";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-full bg-slate-200 p-4 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <Icon size={26} />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
        <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </Card>
  );
}
