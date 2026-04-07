import { ChevronRight, Clock4 } from "lucide-react";

import type { Lead } from "../../types";
import { cn, formatDateTime, getLeadStatusTone, getPriorityTone } from "../../lib/utils";
import { Badge } from "../shared/Badge";
import { Card } from "../shared/Card";

interface QueuePanelProps {
  leads: Lead[];
  currentLeadId: string | null;
  onSelect: (leadId: string) => void;
  className?: string;
}

export function QueuePanel({
  leads,
  currentLeadId,
  onSelect,
  className,
}: QueuePanelProps) {
  return (
    <Card className={cn("overflow-hidden p-0", className)}>
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-surface-700 dark:text-cyan-300">
          Queue Panel
        </p>
        <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
          {leads.length} active records
        </h3>
      </div>

      <div className="max-h-[260px] space-y-2 overflow-y-auto p-2.5">
        {leads.map((lead, index) => {
          const isActive = lead.id === currentLeadId;

          return (
            <button
              key={lead.id}
              type="button"
              onClick={() => onSelect(lead.id)}
              className={cn(
                "w-full rounded-[18px] border px-3 py-2.5 text-left transition",
                isActive
                  ? "border-surface-600 bg-surface-50 shadow-soft dark:border-cyan-500/60 dark:bg-cyan-950/20"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 dark:hover:bg-slate-900",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                    Queue {String(index + 1).padStart(2, "0")}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {lead.fullName}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {lead.company || "No company"}
                  </p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-slate-400" />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge className={cn("px-2 py-1 text-[10px]", getPriorityTone(lead.priority))}>
                  {lead.priority}
                </Badge>
                <Badge className={cn("px-2 py-1 text-[10px]", getLeadStatusTone(lead.status))}>
                  {lead.status.replace("_", " ")}
                </Badge>
              </div>

              {lead.callbackTime ? (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  <Clock4 size={12} />
                  {formatDateTime(lead.callbackTime)}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
