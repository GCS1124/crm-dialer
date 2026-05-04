import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import { downloadCsv } from "@/utils/export";

export async function getCallerLists() {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from("caller_lists")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function refreshCallerListCounts(listId: string) {
  const { data: callers, error } = await supabase
    .from("callers")
    .select("status")
    .eq("caller_list_id", listId);

  if (error) throw error;

  const total = callers.length;
  const pending = callers.filter((row) =>
    ["pending", "in_progress", "failed", "dnc"].includes(row.status),
  ).length;
  const completed = callers.filter((row) => row.status === "completed").length;
  const callback = callers.filter((row) => row.status === "callback").length;

  const { error: updateError } = await supabase
    .from("caller_lists")
    .update({
      total_callers: total,
      pending_count: pending,
      completed_count: completed,
      callback_count: callback,
      status: total > 0 && pending === 0 && callback === 0 ? "completed" : "active",
    })
    .eq("id", listId);

  if (updateError) throw updateError;
}

export async function archiveCallerList(listId: string) {
  assertSupabaseConfigured();
  const { error } = await supabase
    .from("caller_lists")
    .update({ status: "archived" })
    .eq("id", listId);

  if (error) throw error;
}

export async function assignCallerList(listId: string, profileId: string | null) {
  assertSupabaseConfigured();
  const { error } = await supabase
    .from("caller_lists")
    .update({ assigned_to: profileId })
    .eq("id", listId);

  if (error) throw error;
}

export async function exportCompletedCallerList(listId: string) {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from("callers")
    .select("*")
    .eq("caller_list_id", listId)
    .eq("status", "completed");

  if (error) throw error;
  downloadCsv(`caller-list-${listId}-completed.csv`, data);
}
