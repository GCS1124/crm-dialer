import { startOfDay } from "date-fns";
import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import type { DashboardSummary } from "@/types/app";

async function countCallersByStatus(
  status: "pending" | "in_progress" | "completed" | "callback",
) {
  const { count, error } = await supabase
    .from("callers")
    .select("*", { count: "exact", head: true })
    .eq("status", status);

  if (error) throw error;
  return count ?? 0;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  assertSupabaseConfigured();

  const dayStart = startOfDay(new Date()).toISOString();

  const [
    importsCount,
    pendingCount,
    inProgressCount,
    completedCount,
    callbacksDueCount,
    recentImports,
    recentLogs,
    todaysCalls,
  ] = await Promise.all([
    supabase.from("imports").select("*", { count: "exact", head: true }),
    countCallersByStatus("pending"),
    countCallersByStatus("in_progress"),
    countCallersByStatus("completed"),
    supabase
      .from("callers")
      .select("*", { count: "exact", head: true })
      .lte("next_follow_up_at", new Date().toISOString())
      .neq("status", "completed"),
    supabase.from("imports").select("*").order("created_at", { ascending: false }).limit(5),
    supabase
      .from("call_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("call_logs").select("*").gte("created_at", dayStart),
  ]);

  if (importsCount.error) throw importsCount.error;
  if (callbacksDueCount.error) throw callbacksDueCount.error;
  if (recentImports.error) throw recentImports.error;
  if (recentLogs.error) throw recentLogs.error;
  if (todaysCalls.error) throw todaysCalls.error;

  const invalidRowsRecent = (recentImports.data ?? []).reduce(
    (total, item) => total + item.invalid_rows,
    0,
  );

  const recentActivity = [
    ...(recentImports.data ?? []).map((item) => ({
      id: item.id,
      title: `Imported ${item.file_name}`,
      detail: `${item.valid_rows} valid, ${item.invalid_rows} invalid`,
      timestamp: item.created_at,
      type: "import" as const,
    })),
    ...(recentLogs.data ?? []).map((item) => ({
      id: item.id,
      title: `Call logged for ${item.phone_number}`,
      detail: item.disposition ?? item.status ?? "Call activity recorded",
      timestamp: item.created_at,
      type: "call" as const,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 6);

  const todayLogs = todaysCalls.data ?? [];
  const interested = todayLogs.filter((item) =>
    ["interested", "converted"].includes(item.disposition ?? ""),
  ).length;
  const connected = todayLogs.filter(
    (item) => !["no_answer", "voicemail", "busy"].includes(item.disposition ?? ""),
  ).length;

  return {
    totalImports: importsCount.count ?? 0,
    pendingCallers: pendingCount,
    inProgressCallers: inProgressCount,
    completedCallers: completedCount,
    callbacksDue: callbacksDueCount.count ?? 0,
    invalidRowsRecent,
    recentActivity,
    performance: {
      callsToday: todayLogs.length,
      connected,
      interested,
      completionRate: todayLogs.length ? Math.round((connected / todayLogs.length) * 100) : 0,
    },
  };
}
