import { ChevronRight } from "lucide-react";

import type { BreakType, TimeTrackingStatus } from "../../types";
import { cn, toSentenceCase } from "../../lib/utils";
import { Button } from "../shared/Button";

interface BreakMenuProps {
  open: boolean;
  status: TimeTrackingStatus;
  breakType: BreakType | null;
  onStartBreak: (breakType: BreakType) => void;
  onEndBreak: () => void;
  onClose: () => void;
  disabled?: boolean;
}

const breakOptions: Array<{ value: BreakType; label: string }> = [
  { value: "freshen_up", label: "Freshen up" },
  { value: "lunch", label: "Lunch" },
  { value: "tea", label: "Tea" },
  { value: "meeting_training", label: "Meeting / Training" },
];

export function BreakMenu({
  open,
  status,
  breakType,
  onStartBreak,
  onEndBreak,
  onClose,
  disabled = false,
}: BreakMenuProps) {
  if (!open) {
    return null;
  }

  const onBreak = status === "on_break";

  return (
    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[18rem]">
      <div className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              Time Tracking
            </p>
            <p className="mt-1 text-[14px] font-semibold text-slate-900 dark:text-white">
              Breaks
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose} aria-label="Close breaks">
            <ChevronRight size={14} className="rotate-180" />
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {onBreak ? (
            <Button
              variant="danger"
              className="w-full justify-between"
              onClick={() => {
                onEndBreak();
                onClose();
              }}
              disabled={disabled}
            >
              <span>End break</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/80">
                {breakType ? toSentenceCase(breakType) : "Break"}
              </span>
            </Button>
          ) : null}

          {breakOptions.map((option) => (
            <Button
              key={option.value}
              variant="secondary"
              className={cn("w-full justify-between", onBreak && "opacity-60")}
              onClick={() => {
                onStartBreak(option.value);
                onClose();
              }}
              disabled={disabled || onBreak}
            >
              <span>{option.label}</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                Start
              </span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
