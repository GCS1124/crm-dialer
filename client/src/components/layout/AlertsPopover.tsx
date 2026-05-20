import { X } from "lucide-react";

import { formatDateTime, formatPhone, getCallStatusTone, getDispositionTone } from "../../lib/utils";
import type { IncomingAlertItem } from "../../lib/incomingAlerts.ts";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { cn } from "../../lib/utils";

interface AlertsPopoverProps {
  open: boolean;
  items: IncomingAlertItem[];
  onClose: () => void;
}

export function AlertsPopover({ open, items, onClose }: AlertsPopoverProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(92vw,24rem)]">
      <div className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              Alerts
            </p>
            <p className="mt-1 text-[14px] font-semibold text-slate-900 dark:text-white">
              Incoming calls
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose} aria-label="Close alerts">
            <X size={14} />
          </Button>
        </div>

        <div className="mt-3 max-h-[22rem] space-y-2 overflow-y-auto pr-1">
          {!items.length ? (
            <div className="rounded-[14px] border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-[12px] text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
              No incoming call history yet.
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">
                      {item.leadName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {formatPhone(item.phone)}
                    </p>
                  </div>
                  <p className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                    {formatDateTime(item.createdAt)}
                  </p>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge className={cn("px-2 py-1 text-[10px] font-semibold", getCallStatusTone(item.status))}>
                    {item.status.replace("_", " ")}
                  </Badge>
                  {item.disposition ? (
                    <Badge
                      className={cn(
                        "px-2 py-1 text-[10px] font-semibold",
                        getDispositionTone(item.disposition),
                      )}
                    >
                      {item.disposition}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
