import { createSupabaseTokenClient, getSupabaseClient } from "../lib/supabase";
import type { BreakType, EmployeeAttendanceSnapshot, TimeTrackingStatus } from "../types";

interface AttendanceRow {
  employee_id: string;
  activity_date: string;
  timezone: string;
  status: TimeTrackingStatus;
  checked_in_at: string | null;
  checked_out_at: string | null;
  break_started_at: string | null;
  break_type: BreakType | null;
  active_session_seconds: number;
  active_break_seconds: number;
  has_checked_in: boolean;
  break_usage_counts: Record<string, unknown> | null;
  break_durations_seconds: Record<string, unknown> | null;
  last_updated_at: string;
  updated_at?: string | null;
  created_at?: string | null;
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function getAttendanceClient(accessToken?: string | null) {
  if (accessToken) {
    return createSupabaseTokenClient(accessToken);
  }

  return getSupabaseClient();
}

function normalizeBreakMap(record: Record<string, unknown> | null | undefined) {
  return {
    freshen_up: typeof record?.freshen_up === "number" ? Math.max(0, Math.floor(record.freshen_up)) : 0,
    lunch: typeof record?.lunch === "number" ? Math.max(0, Math.floor(record.lunch)) : 0,
    tea: typeof record?.tea === "number" ? Math.max(0, Math.floor(record.tea)) : 0,
    meeting_training:
      typeof record?.meeting_training === "number"
        ? Math.max(0, Math.floor(record.meeting_training))
        : 0,
  } satisfies Record<BreakType, number>;
}

function mapAttendanceRow(row: AttendanceRow): EmployeeAttendanceSnapshot {
  return {
    employeeId: row.employee_id,
    activityDate: row.activity_date,
    timezone: row.timezone,
    status: row.status,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    breakStartedAt: row.break_started_at,
    breakType: row.break_type,
    activeSessionSeconds: row.active_session_seconds,
    activeBreakSeconds: row.active_break_seconds,
    hasCheckedIn: row.has_checked_in,
    breakUsageCounts: normalizeBreakMap(row.break_usage_counts),
    breakDurationsSeconds: normalizeBreakMap(row.break_durations_seconds),
    lastUpdatedAt: row.last_updated_at,
  };
}

function getMonthBounds(month: string) {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return {
      start: `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-01`,
      end: `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-01`,
    };
  }

  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return {
    start: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-01`,
    end: `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-01`,
  };
}

export async function loadEmployeeAttendanceDays(
  employeeId: string,
  month: string,
  accessToken?: string | null,
) {
  const client = getAttendanceClient(accessToken);
  const { start, end } = getMonthBounds(month);
  const { data, error } = await client
    .from("employee_attendance_days")
    .select(
      "employee_id, activity_date, timezone, status, checked_in_at, checked_out_at, break_started_at, break_type, active_session_seconds, active_break_seconds, has_checked_in, break_usage_counts, break_durations_seconds, last_updated_at",
    )
    .eq("employee_id", employeeId)
    .gte("activity_date", start)
    .lt("activity_date", end)
    .order("activity_date", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as AttendanceRow[]).map(mapAttendanceRow);
}

export async function upsertEmployeeAttendanceSnapshot(
  snapshot: EmployeeAttendanceSnapshot,
  accessToken?: string | null,
) {
  const client = getAttendanceClient(accessToken);
  const nowIso = snapshot.lastUpdatedAt ?? new Date().toISOString();
  const { error } = await client.from("employee_attendance_days").upsert(
    {
      employee_id: snapshot.employeeId,
      activity_date: snapshot.activityDate,
      timezone: snapshot.timezone,
      status: snapshot.status,
      checked_in_at: snapshot.checkedInAt,
      checked_out_at: snapshot.checkedOutAt,
      break_started_at: snapshot.breakStartedAt,
      break_type: snapshot.breakType,
      active_session_seconds: snapshot.activeSessionSeconds,
      active_break_seconds: snapshot.activeBreakSeconds,
      has_checked_in: snapshot.hasCheckedIn,
      break_usage_counts: snapshot.breakUsageCounts,
      break_durations_seconds: snapshot.breakDurationsSeconds,
      last_updated_at: nowIso,
      updated_at: nowIso,
    },
    {
      onConflict: "employee_id,activity_date",
    },
  );

  if (error) {
    throw error;
  }
}
