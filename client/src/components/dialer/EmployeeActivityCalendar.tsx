import {
  ChevronLeft,
  ChevronRight,
  Search,
  Users2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  EmployeeActivityCalendarDay,
  EmployeeActivityCalendarResponse,
} from "../../lib/employeeActivityCalendar.ts";
import { cn, formatDuration, formatPhone, getCallStatusTone, getDispositionTone } from "../../lib/utils";
import { AlertBanner } from "../shared/AlertBanner";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { Card } from "../shared/Card";
import { EmptyState } from "../shared/EmptyState";
import { CalendarDayCard } from "./CalendarDayCard";
import { StatusLegend } from "./StatusLegend";
import type { User } from "../../types";

type AttendanceFilter = "all" | "on_time" | "late" | "break_issues" | "absent";

const filterOptions: Array<{ value: AttendanceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "on_time", label: "On time" },
  { value: "late", label: "Late days" },
  { value: "break_issues", label: "Break issues" },
  { value: "absent", label: "Absent" },
];

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function monthKeyForDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function monthLabelForDate(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(date);
}

function monthName(monthIndex: number) {
  return new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2026, monthIndex, 1));
}

function localDateKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getMonthGridStart(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = start.getDay();
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - offset);
  return gridStart;
}

function employeeSearchText(user: User) {
  return [user.name, user.team, user.title, user.email].join(" ").toLowerCase();
}

function matchesFilter(day: EmployeeActivityCalendarDay, filter: AttendanceFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "on_time") {
    return day.attendance.statusKey === "on_time";
  }

  if (filter === "late") {
    return day.attendance.statusKey === "late";
  }

  if (filter === "break_issues") {
    return day.attendance.statusKey === "on_break" || day.attendance.breakCount > 0;
  }

  return day.attendance.statusKey === "absent";
}

function hasMonthActivity(day: EmployeeActivityCalendarDay) {
  return day.totalCalls > 0 || day.attendance.hasCheckedIn;
}

function LoadingGrid() {
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-7">
      {Array.from({ length: 14 }, (_, index) => (
        <div
          key={index}
          className="min-h-[132px] animate-pulse rounded-[18px] border border-slate-200 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/40"
        />
      ))}
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className={cn("rounded-[18px] border px-4 py-3", tone)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-1 text-[14px] font-semibold">{value}</p>
    </div>
  );
}

function DayDetailsPanel({
  employeeName,
  day,
  monthLabel,
  filterLabel,
}: {
  employeeName: string;
  day: EmployeeActivityCalendarDay | null;
  monthLabel: string;
  filterLabel: string;
}) {
  if (!day) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950">
        <EmptyState
          icon={Users2}
          title={employeeName ? "Select a date to inspect activity" : "Select an employee to view calendar activity"}
          description={
            employeeName
              ? `Pick a day in ${monthLabel} to see attendance details and call records.`
              : "Use the employee selector on the left to load a monthly attendance calendar."
          }
        />
      </div>
    );
  }

  const attendance = day.attendance;
  const totalBreaks = attendance.breakCount;

  return (
    <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Day details
          </p>
          <h3 className="mt-2 truncate text-[22px] font-semibold text-slate-900 dark:text-white">
            {new Intl.DateTimeFormat("en", {
              month: "long",
              day: "numeric",
              year: "numeric",
            }).format(new Date(`${day.date}T12:00:00.000Z`))}
          </h3>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
            {employeeName} · {filterLabel}
          </p>
        </div>

        <Badge className={cn("px-3 py-1.5 text-[11px] font-semibold", attendance.statusTone)}>
          {attendance.statusLabel}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryMetric label="Check-in / Check-out" value={`${attendance.checkInLabel} · ${attendance.checkOutLabel}`} tone="bg-slate-50 text-slate-900 border-slate-200 dark:bg-slate-900/40 dark:text-white dark:border-slate-800" />
        <SummaryMetric label="Working hours" value={attendance.workingHoursLabel} tone="bg-slate-50 text-slate-900 border-slate-200 dark:bg-slate-900/40 dark:text-white dark:border-slate-800" />
        <SummaryMetric label="Breaks" value={`${attendance.breaksLabel}`} tone="bg-slate-50 text-slate-900 border-slate-200 dark:bg-slate-900/40 dark:text-white dark:border-slate-800" />
        <SummaryMetric label="Status" value={attendance.statusLabel} tone="bg-slate-50 text-slate-900 border-slate-200 dark:bg-slate-900/40 dark:text-white dark:border-slate-800" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryMetric
          label="Total calls"
          value={`${day.totalCalls}`}
          tone="bg-slate-50 text-slate-900 border-slate-200 dark:bg-slate-900/40 dark:text-white dark:border-slate-800"
        />
        <SummaryMetric
          label="Connected"
          value={`${day.connectedCalls}`}
          tone="bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50"
        />
        <SummaryMetric
          label="Failed / Missed"
          value={`${day.failed}`}
          tone="bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/50"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
          {day.interested} interested
        </Badge>
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
          {day.notInterested} not interested
        </Badge>
        <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
          {day.disposedCompleted} completed
        </Badge>
        <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
          {day.failed} failed
        </Badge>
        <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {day.averageDuration} avg
        </Badge>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Call records
          </h4>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            {day.records.length} record{day.records.length === 1 ? "" : "s"}
          </p>
        </div>

        {day.records.length ? (
          <div className="space-y-3">
            {day.records.map((record) => (
              <div
                key={`${day.date}-${record.time}-${record.customerName}-${record.phone}`}
                className="rounded-[18px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
                      {record.customerName}
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                      {formatPhone(record.phone)}
                    </p>
                    <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                      {record.time}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={cn("px-2.5 py-1 text-[10px] font-medium", getCallStatusTone(record.callStatus))}>
                      {record.callStatus.replace(/_/g, " ")}
                    </Badge>
                    <Badge
                      className={cn(
                        "px-2.5 py-1 text-[10px] font-medium",
                        getDispositionTone(record.disposition),
                      )}
                    >
                      {record.disposition}
                    </Badge>
                    <Badge className="bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {formatDuration(record.durationSeconds)}
                    </Badge>
                  </div>
                </div>

                {record.notes ? (
                  <p className="mt-3 rounded-[14px] bg-white px-3 py-2 text-[12px] leading-6 text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                    {record.notes}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center dark:border-slate-800 dark:bg-slate-900/40">
            <p className="text-[14px] font-medium text-slate-700 dark:text-slate-200">
              No records for this date.
            </p>
            <p className="mt-2 text-[12px] leading-6 text-slate-500 dark:text-slate-400">
              This day has no call records matching the current view.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface EmployeeActivityCalendarProps {
  employees: User[];
  loadCalendar: (employeeId: string, month: string) => Promise<EmployeeActivityCalendarResponse>;
}

export function EmployeeActivityCalendar({ employees, loadCalendar }: EmployeeActivityCalendarProps) {
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [summaryFilter, setSummaryFilter] = useState<AttendanceFilter>("all");
  const [calendar, setCalendar] = useState<EmployeeActivityCalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [reloadCounter, setReloadCounter] = useState(0);

  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...employees]
      .filter((employee) => employee.role !== "admin")
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((employee) => (query ? employeeSearchText(employee).includes(query) : true));
  }, [employees, search]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  );
  const monthKey = useMemo(() => monthKeyForDate(monthCursor), [monthCursor]);
  const monthLabel = useMemo(() => monthLabelForDate(monthCursor), [monthCursor]);
  const selectedFilterLabel = filterOptions.find((option) => option.value === summaryFilter)?.label ?? "All";

  useEffect(() => {
    if (!selectedEmployeeId) {
      setCalendar(null);
      setLoading(false);
      setError("");
      setSelectedDate("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    setSelectedDate("");

    void loadCalendar(selectedEmployeeId, monthKey)
      .then((response) => {
        if (!cancelled) {
          setCalendar(response);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setCalendar(null);
          setError(fetchError instanceof Error ? fetchError.message : "Unable to load calendar activity.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadCalendar, monthKey, reloadCounter, selectedEmployeeId]);

  const currentCalendarTimezone =
    calendar?.timezone ||
    selectedEmployee?.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";

  useEffect(() => {
    if (!calendar || selectedDate) {
      return;
    }

    const todayKey = localDateKey(new Date(), currentCalendarTimezone);
    const preferredDay =
      calendar.days.find((day) => day.date === todayKey) ??
      calendar.days.find((day) => hasMonthActivity(day)) ??
      calendar.days[0] ??
      null;

    if (preferredDay) {
      setSelectedDate(preferredDay.date);
    }
  }, [calendar, currentCalendarTimezone, selectedDate]);

  const selectedDay = useMemo(
    () => calendar?.days.find((day) => day.date === selectedDate) ?? null,
    [calendar, selectedDate],
  );
  const hasMonthActivityValue = calendar?.days.some((day) => hasMonthActivity(day)) ?? false;
  const filteredActivityCount = calendar?.days.filter((day) => matchesFilter(day, summaryFilter)).length ?? 0;
  const leadingBlankCount = getMonthGridStart(monthCursor).getDay();
  const totalCalendarDays = calendar?.days.length ?? new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  const monthGridCells = leadingBlankCount + totalCalendarDays;
  const trailingBlankCount = (7 - (monthGridCells % 7)) % 7;

  const retryLoad = () => {
    setReloadCounter((value) => value + 1);
  };

  const selectEmployee = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setSearch("");
    setSelectedDate("");
  };

  const monthOptions = Array.from({ length: 12 }, (_, index) => ({
    value: index,
    label: monthName(index),
  }));
  const yearBase = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, index) => yearBase - 1 + index);

  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="crm-section-label">Employee Calendar</p>
        {selectedEmployee ? (
          <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
            {selectedEmployee.name}
          </span>
        ) : null}
        <span className="ml-auto text-[12px] text-slate-500 dark:text-slate-400">
          {selectedEmployee ? monthLabel : "Select an employee to begin"}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.85fr)]">
        <div className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
                  }
                  aria-label="Previous month"
                >
                  <ChevronLeft size={16} />
                </Button>

                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
                  <select
                    value={monthCursor.getMonth()}
                    onChange={(event) =>
                      setMonthCursor((current) => new Date(current.getFullYear(), Number(event.target.value), 1))
                    }
                    className="bg-transparent text-[13px] font-medium text-slate-900 outline-none dark:text-white"
                    aria-label="Month"
                  >
                    {monthOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={monthCursor.getFullYear()}
                    onChange={(event) =>
                      setMonthCursor((current) => new Date(Number(event.target.value), current.getMonth(), 1))
                    }
                    className="bg-transparent text-[13px] font-medium text-slate-900 outline-none dark:text-white"
                    aria-label="Year"
                  >
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
                  }
                  aria-label="Next month"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {filterOptions.map((option) => {
                  const active = summaryFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSummaryFilter(option.value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[11px] font-medium transition",
                        active
                          ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-3">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search employee by name, team, or title"
                    className="crm-input py-3 pl-10"
                  />
                </div>

                <div className="max-h-64 overflow-y-auto rounded-[22px] border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-900/30">
                  {visibleEmployees.length ? (
                    visibleEmployees.map((employee) => {
                      const isSelected = employee.id === selectedEmployeeId;
                      return (
                        <button
                          key={employee.id}
                          type="button"
                          onClick={() => selectEmployee(employee.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-[16px] border px-3 py-3 text-left transition",
                            isSelected
                              ? "border-sky-300 bg-sky-50 dark:border-sky-400/40 dark:bg-sky-950/20"
                              : "border-transparent hover:border-slate-200 hover:bg-white dark:hover:border-slate-800 dark:hover:bg-slate-900/60",
                          )}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">
                              {employee.name}
                            </p>
                            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {employee.team} · {employee.title}
                            </p>
                          </div>

                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {employee.role.replace("_", " ")}
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-[14px] border border-dashed border-slate-200 px-4 py-8 text-center text-[12px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      No employees match your search.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Month
                    </p>
                    <p className="mt-1 text-[18px] font-semibold text-slate-900 dark:text-white">
                      {monthLabel}
                    </p>
                  </div>
                  {selectedEmployee ? (
                    <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                      {selectedEmployee.role.replace("_", " ")}
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3">
                  <SummaryMetric
                    label="Visible days"
                    value={`${calendar?.days.length ?? 0}`}
                    tone="bg-white text-slate-900 border-slate-200 dark:bg-slate-950 dark:text-white dark:border-slate-800"
                  />
                  <SummaryMetric
                    label="Highlighted"
                    value={`${filteredActivityCount}`}
                    tone="bg-white text-slate-900 border-slate-200 dark:bg-slate-950 dark:text-white dark:border-slate-800"
                  />
                </div>
              </div>
            </div>
          </div>

          <StatusLegend />

          {error ? (
            <AlertBanner
              title="Unable to load employee activity"
              description={error}
              tone="error"
              action={
                <Button size="sm" variant="secondary" onClick={retryLoad}>
                  Retry
                </Button>
              }
            />
          ) : null}

          {!selectedEmployee ? (
            <EmptyState
              icon={Users2}
              title="Please select an employee to view calendar activity."
              description="Use the employee search above to load the monthly attendance calendar."
            />
          ) : loading ? (
            <Card className="space-y-4 p-5">
              <div>
                <p className="crm-section-label">Loading</p>
                <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
                  Loading {selectedEmployee.name}'s {monthLabel} activity
                </h3>
              </div>
              <LoadingGrid />
            </Card>
          ) : calendar && !hasMonthActivityValue ? (
            <EmptyState
              icon={Users2}
              title="No call activity found for this month."
              description={`${selectedEmployee.name} has no call records or attendance entries in ${monthLabel}.`}
            />
          ) : calendar ? (
            <div className="space-y-4">
              <div className="grid grid-cols-7 gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
                  <div key={weekday} className="px-2 py-1">
                    {weekday}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: leadingBlankCount }, (_, index) => (
                  <div
                    key={`leading-${index}`}
                    className="min-h-[140px] rounded-[18px] border border-dashed border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40"
                  />
                ))}
                {calendar.days.map((day) => (
                  <CalendarDayCard
                    key={day.date}
                    day={day}
                    isToday={day.date === localDateKey(new Date(), currentCalendarTimezone)}
                    isSelected={day.date === selectedDate}
                    isDimmed={summaryFilter !== "all" && !matchesFilter(day, summaryFilter)}
                    onClick={() => setSelectedDate(day.date)}
                  />
                ))}
                {Array.from({ length: trailingBlankCount }, (_, index) => (
                  <div
                    key={`trailing-${index}`}
                    className="min-h-[140px] rounded-[18px] border border-dashed border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40"
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-[12px] text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <p>
                  Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedFilterLabel}</span> for{" "}
                  {selectedEmployee.name}.
                </p>
                <p>Click a day to review attendance and call records.</p>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <DayDetailsPanel
            employeeName={selectedEmployee?.name ?? ""}
            day={selectedDay}
            monthLabel={monthLabel}
            filterLabel={selectedFilterLabel}
          />
        </aside>
      </div>
    </Card>
  );
}
