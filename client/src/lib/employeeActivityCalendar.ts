import type {
  BreakType,
  CallDisposition,
  CallLogStatus,
  EmployeeAttendanceSnapshot,
  Lead,
  User,
} from "../types";
import {
  formatEmployeeAttendanceClock,
  formatEmployeeAttendanceWorkingHours,
} from "./timeTracking.ts";
import { formatDuration } from "./utils.ts";

export interface EmployeeActivityCalendarRecord {
  time: string;
  customerName: string;
  phone: string;
  callStatus: CallLogStatus;
  status: CallDisposition;
  disposition: CallDisposition;
  durationSeconds: number;
  duration: string;
  notes: string;
}

export interface EmployeeActivityCalendarAttendance {
  date: string;
  timezone: string;
  statusKey: "on_time" | "late" | "on_break" | "absent" | "weekend" | "upcoming";
  statusLabel: string;
  statusTone: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  breakStartedAt: string | null;
  breakType: EmployeeAttendanceSnapshot["breakType"];
  activeSessionSeconds: number;
  activeBreakSeconds: number;
  hasCheckedIn: boolean;
  breakUsageCounts: Record<BreakType, number>;
  breakDurationsSeconds: Record<BreakType, number>;
  lastUpdatedAt: string;
  checkInLabel: string;
  checkOutLabel: string;
  workingHoursLabel: string;
  breaksLabel: string;
  totalBreakSeconds: number;
  breakCount: number;
  isWeekend: boolean;
  isUpcoming: boolean;
  isLate: boolean;
  isAbsent: boolean;
  isOnTime: boolean;
}

export interface EmployeeActivityCalendarDay {
  date: string;
  totalCalls: number;
  connectedCalls: number;
  interested: number;
  notInterested: number;
  disposedCompleted: number;
  failed: number;
  totalTalkTimeSeconds: number;
  averageDurationSeconds: number;
  averageDuration: string;
  records: EmployeeActivityCalendarRecord[];
  attendance: EmployeeActivityCalendarAttendance;
}

export interface EmployeeActivityCalendarResponse {
  employeeId: string;
  employeeName: string;
  month: string;
  timezone: string;
  days: EmployeeActivityCalendarDay[];
}

interface EmployeeActivityCalendarInput {
  users: User[];
  leads: Lead[];
  employeeId: string;
  month: string;
  attendanceDays?: EmployeeAttendanceSnapshot[];
}

const completedDispositions = new Set(["Appointment Booked", "Sale Closed"]);
const failedDispositions = new Set(["No Answer", "Busy", "Voicemail", "Wrong Number", "Failed Attempt"]);
const ATTENDANCE_DAY_START_HOUR = 10;

function parseMonthKey(month: string) {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    const today = new Date();
    return {
      year: today.getFullYear(),
      monthIndex: today.getMonth(),
    };
  }

  return { year, monthIndex };
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function getMonthDateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function getDateKeyInTimeZone(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function getWeekdayInTimeZone(dateKey: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  }).format(new Date(`${dateKey}T12:00:00.000Z`));
}

function isLateCheckIn(checkedInAt: string | null, timeZone: string) {
  if (!checkedInAt) {
    return false;
  }

  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
  const parts = timeFormatter.formatToParts(new Date(checkedInAt));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return hour > ATTENDANCE_DAY_START_HOUR || (hour === ATTENDANCE_DAY_START_HOUR && minute > 0);
}

function getAttendanceStatusTone(statusKey: EmployeeActivityCalendarAttendance["statusKey"]) {
  switch (statusKey) {
    case "on_time":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
    case "late":
      return "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300";
    case "on_break":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
    case "weekend":
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
    case "upcoming":
      return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
    case "absent":
    default:
      return "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300";
  }
}

function buildAttendanceSummary(
  dateKey: string,
  timezone: string,
  snapshot?: EmployeeAttendanceSnapshot | null,
  currentDateKey?: string,
): EmployeeActivityCalendarAttendance {
  const todayKey = currentDateKey ?? getDateKeyInTimeZone(new Date().toISOString(), timezone);
  const weekday = getWeekdayInTimeZone(dateKey, timezone);
  const isWeekend = weekday === "Saturday" || weekday === "Sunday";
  const isUpcoming = dateKey > todayKey;

  if (!snapshot) {
    const statusKey: EmployeeActivityCalendarAttendance["statusKey"] = isUpcoming
      ? "upcoming"
      : isWeekend
        ? "weekend"
        : "absent";

    return {
      date: dateKey,
      timezone,
      statusKey,
      statusLabel:
        statusKey === "upcoming"
          ? "Upcoming"
          : statusKey === "weekend"
            ? "Weekend"
            : "Absent",
      statusTone: getAttendanceStatusTone(statusKey),
      checkedInAt: null,
      checkedOutAt: null,
      breakStartedAt: null,
      breakType: null,
      activeSessionSeconds: 0,
      activeBreakSeconds: 0,
      hasCheckedIn: false,
      breakUsageCounts: {
        freshen_up: 0,
        lunch: 0,
        tea: 0,
        meeting_training: 0,
      },
      breakDurationsSeconds: {
        freshen_up: 0,
        lunch: 0,
        tea: 0,
        meeting_training: 0,
      },
      lastUpdatedAt: "",
      checkInLabel: "--",
      checkOutLabel: "--",
      workingHoursLabel: "0m",
      breaksLabel: "0m • 0 breaks",
      totalBreakSeconds: 0,
      breakCount: 0,
      isWeekend,
      isUpcoming,
      isLate: false,
      isAbsent: statusKey === "absent",
      isOnTime: false,
    };
  }

  const totalBreakSeconds = Object.values(snapshot.breakDurationsSeconds).reduce(
    (sum, value) => sum + value,
    0,
  );
  const breakCount = Object.values(snapshot.breakUsageCounts).reduce(
    (sum, value) => sum + value,
    0,
  );
  const hasShiftStarted = snapshot.hasCheckedIn && Boolean(snapshot.checkedInAt);
  const isOnBreak = snapshot.status === "on_break";
  const isLate = hasShiftStarted && isLateCheckIn(snapshot.checkedInAt, timezone);
  const statusKey: EmployeeActivityCalendarAttendance["statusKey"] = isOnBreak
    ? "on_break"
    : hasShiftStarted
      ? isLate
        ? "late"
        : "on_time"
      : isWeekend
        ? "weekend"
        : isUpcoming
          ? "upcoming"
          : "absent";

  return {
    date: dateKey,
    timezone,
    statusKey,
    statusLabel:
      statusKey === "on_break"
        ? "On break"
        : statusKey === "late"
          ? "Late"
          : statusKey === "on_time"
            ? "On time"
            : statusKey === "weekend"
              ? "Weekend"
              : statusKey === "upcoming"
                ? "Upcoming"
                : "Absent",
    statusTone: getAttendanceStatusTone(statusKey),
    checkedInAt: snapshot.checkedInAt,
    checkedOutAt: snapshot.checkedOutAt,
    breakStartedAt: snapshot.breakStartedAt,
    breakType: snapshot.breakType,
    activeSessionSeconds: snapshot.activeSessionSeconds,
    activeBreakSeconds: snapshot.activeBreakSeconds,
    hasCheckedIn: snapshot.hasCheckedIn,
    breakUsageCounts: snapshot.breakUsageCounts,
    breakDurationsSeconds: snapshot.breakDurationsSeconds,
    lastUpdatedAt: snapshot.lastUpdatedAt,
    checkInLabel: formatEmployeeAttendanceClock(snapshot.checkedInAt, timezone),
    checkOutLabel: formatEmployeeAttendanceClock(snapshot.checkedOutAt, timezone),
    workingHoursLabel: formatEmployeeAttendanceWorkingHours(snapshot.activeSessionSeconds),
    breaksLabel: `${formatEmployeeAttendanceWorkingHours(totalBreakSeconds)} • ${breakCount} break${breakCount === 1 ? "" : "s"}`,
    totalBreakSeconds,
    breakCount,
    isWeekend,
    isUpcoming,
    isLate,
    isAbsent: statusKey === "absent",
    isOnTime: statusKey === "on_time",
  };
}

function createEmptyDay(date: string, timezone: string, currentDateKey: string): EmployeeActivityCalendarDay {
  return {
    date,
    totalCalls: 0,
    connectedCalls: 0,
    interested: 0,
    notInterested: 0,
    disposedCompleted: 0,
    failed: 0,
    totalTalkTimeSeconds: 0,
    averageDurationSeconds: 0,
    averageDuration: "00:00",
    records: [],
    attendance: buildAttendanceSummary(date, timezone, null, currentDateKey),
  };
}

export function buildEmployeeActivityCalendar({
  users,
  leads,
  employeeId,
  month,
  attendanceDays = [],
}: EmployeeActivityCalendarInput): EmployeeActivityCalendarResponse {
  const employee = users.find((user) => user.id === employeeId && user.role !== "admin") ?? null;
  const attendanceTimezone =
    attendanceDays.find((day) => day.employeeId === employeeId)?.timezone ??
    employee?.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";
  const { year, monthIndex } = parseMonthKey(month);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const currentDateKey = getDateKeyInTimeZone(new Date().toISOString(), attendanceTimezone);

  const dayMap = new Map<string, EmployeeActivityCalendarDay>();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = getMonthDateKey(year, monthIndex, day);
    dayMap.set(date, createEmptyDay(date, attendanceTimezone, currentDateKey));
  }

  const attendanceByDate = new Map<string, EmployeeAttendanceSnapshot>();
  attendanceDays
    .filter((entry) => entry.employeeId === employeeId)
    .forEach((entry) => {
      attendanceByDate.set(entry.activityDate, entry);
    });

  for (const [date, snapshot] of attendanceByDate.entries()) {
    const day = dayMap.get(date);
    if (!day) {
      continue;
    }

    day.attendance = buildAttendanceSummary(date, snapshot.timezone || attendanceTimezone, snapshot, currentDateKey);
  }

  const calls = leads
    .flatMap((lead) =>
      lead.callHistory
        .filter((call) => call.agentId === employeeId)
        .map((call) => ({
          ...call,
          leadName: call.leadName || lead.fullName,
          phone: call.phone || lead.phone,
        })),
    )
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

  calls.forEach((call) => {
    const dateKey = getDateKeyInTimeZone(call.createdAt, attendanceTimezone);
    if (!dayMap.has(dateKey)) {
      return;
    }

    const day = dayMap.get(dateKey);
    if (!day) {
      return;
    }

    day.totalCalls += 1;
    day.totalTalkTimeSeconds += call.durationSeconds;
    day.connectedCalls += call.status === "connected" ? 1 : 0;
    day.interested += call.disposition === "Interested" ? 1 : 0;
    day.notInterested += call.disposition === "Not Interested" ? 1 : 0;
    day.disposedCompleted += completedDispositions.has(call.disposition) ? 1 : 0;
    day.failed += failedDispositions.has(call.disposition) || call.status === "failed" ? 1 : 0;
    day.records.push({
      time: formatEmployeeAttendanceClock(call.createdAt, attendanceTimezone),
      customerName: call.leadName,
      phone: call.phone,
      callStatus: call.status,
      status: call.disposition,
      disposition: call.disposition,
      durationSeconds: call.durationSeconds,
      duration: formatDuration(call.durationSeconds),
      notes: call.notes || "",
    });
  });

  const days = Array.from(dayMap.values()).map((day) => {
    const averageDurationSeconds =
      day.totalCalls > 0 ? Math.round(day.totalTalkTimeSeconds / day.totalCalls) : 0;

    return {
      ...day,
      averageDurationSeconds,
      averageDuration: formatDuration(averageDurationSeconds),
    };
  });

  return {
    employeeId,
    employeeName: employee?.name ?? "Unknown employee",
    month: `${year}-${pad(monthIndex + 1)}`,
    timezone: attendanceTimezone,
    days,
  };
}
