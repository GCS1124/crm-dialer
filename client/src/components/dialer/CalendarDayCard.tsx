import { CalendarClock, CircleDot, Clock3, Star, XCircle } from "lucide-react";

import type { EmployeeActivityCalendarDay } from "../../lib/employeeActivityCalendar.ts";
import { cn } from "../../lib/utils";

interface CalendarDayCardProps {
  day: EmployeeActivityCalendarDay;
  isToday: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  onClick: () => void;
}

function AttendanceIcon({ statusKey }: { statusKey: EmployeeActivityCalendarDay["attendance"]["statusKey"] }) {
  if (statusKey === "late") {
    return <Clock3 size={15} />;
  }

  if (statusKey === "absent") {
    return <XCircle size={15} />;
  }

  if (statusKey === "on_break") {
    return <CalendarClock size={15} />;
  }

  return <Star size={15} />;
}

function ActivityPill({
  label,
  tone,
  value,
}: {
  label: string;
  tone: string;
  value: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold leading-none",
        tone,
      )}
    >
      <CircleDot size={9} />
      <span>{value}</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

export function CalendarDayCard({
  day,
  isToday,
  isSelected,
  isDimmed,
  onClick,
}: CalendarDayCardProps) {
  const dayNumber = Number(day.date.slice(-2));
  const hasActivity = day.totalCalls > 0 || day.attendance.hasCheckedIn;
  const attendance = day.attendance;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${day.date}: ${attendance.statusLabel}${hasActivity ? `, ${day.totalCalls} calls` : ""}`}
      aria-pressed={isSelected}
      className={cn(
        "group flex min-h-[122px] flex-col rounded-[22px] border p-3 text-left transition-all",
        attendance.statusKey === "on_time"
          ? "bg-emerald-50/70 hover:shadow-[0_12px_30px_rgba(16,185,129,0.12)] dark:bg-emerald-950/20"
          : attendance.statusKey === "late"
            ? "bg-orange-50/70 hover:shadow-[0_12px_30px_rgba(249,115,22,0.12)] dark:bg-orange-950/20"
            : attendance.statusKey === "on_break"
              ? "bg-amber-50/70 hover:shadow-[0_12px_30px_rgba(245,158,11,0.12)] dark:bg-amber-950/20"
              : attendance.statusKey === "absent"
                ? "bg-rose-50/70 hover:shadow-[0_12px_30px_rgba(244,63,94,0.12)] dark:bg-rose-950/20"
                : attendance.statusKey === "weekend"
                  ? "bg-slate-50/70 hover:shadow-[0_12px_30px_rgba(148,163,184,0.08)] dark:bg-slate-900/40"
                  : "bg-slate-50/70 hover:shadow-[0_12px_30px_rgba(148,163,184,0.08)] dark:bg-slate-900/40",
        isDimmed ? "opacity-45" : "opacity-100",
        isSelected
          ? "border-sky-300 shadow-[0_14px_34px_rgba(14,165,233,0.16)] ring-2 ring-sky-200 dark:border-sky-400/40 dark:ring-sky-500/20"
          : "border-slate-200 dark:border-slate-800",
        isToday ? "ring-2 ring-offset-1 ring-offset-transparent ring-sky-200" : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Day
          </p>
          <p className="mt-1 text-[18px] font-semibold text-slate-900 dark:text-white">
            {dayNumber}
          </p>
        </div>

        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border bg-white/85 shadow-sm dark:bg-slate-950/85",
            attendance.statusTone,
            "border-current/20",
          )}
        >
          <AttendanceIcon statusKey={attendance.statusKey} />
        </div>
      </div>

      <div className="mt-3 flex flex-1 flex-col justify-between gap-3">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/85 dark:text-slate-200">
            <span className="h-2 w-2 rounded-full bg-current" />
            {attendance.statusLabel}
          </div>
          <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            {hasActivity ? `${day.totalCalls} call${day.totalCalls === 1 ? "" : "s"}` : "No activity"}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {day.interested ? (
            <ActivityPill
              label="Interested"
              tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
              value={day.interested}
            />
          ) : null}
          {day.notInterested ? (
            <ActivityPill
              label="Not interested"
              tone="bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
              value={day.notInterested}
            />
          ) : null}
          {day.disposedCompleted ? (
            <ActivityPill
              label="Completed"
              tone="bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
              value={day.disposedCompleted}
            />
          ) : null}
          {day.failed ? (
            <ActivityPill
              label="Failed"
              tone="bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
              value={day.failed}
            />
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span>{attendance.workingHoursLabel}</span>
          <span>Avg {day.averageDuration}</span>
        </div>
      </div>
    </button>
  );
}
