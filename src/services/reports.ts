import { subDays } from "date-fns";
import { assertSupabaseConfigured, supabase } from "@/lib/supabase";

export async function getReportSummary() {
  assertSupabaseConfigured();
  const since = subDays(new Date(), 30).toISOString();
  const [{ data: logs, error: logsError }, { data: lists, error: listsError }] =
    await Promise.all([
      supabase.from("call_logs").select("*").gte("created_at", since),
      supabase.from("caller_lists").select("*").order("created_at", { ascending: false }),
    ]);

  if (logsError) throw logsError;
  if (listsError) throw listsError;

  const outcomeMap = (logs ?? []).reduce<Record<string, number>>((acc, item) => {
    const key = item.disposition ?? "unclassified";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totalCalls: logs?.length ?? 0,
    outcomeMap,
    activeLists: lists?.filter((list) => list.status === "active").length ?? 0,
    archivedLists: lists?.filter((list) => list.status === "archived").length ?? 0,
  };
}
