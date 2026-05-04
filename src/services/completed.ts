import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import { downloadCsv } from "@/utils/export";

export async function getCompletedCallers(listId?: string) {
  assertSupabaseConfigured();
  let query = supabase
    .from("callers")
    .select("*")
    .eq("status", "completed")
    .order("updated_at", { ascending: false });

  if (listId) {
    query = query.eq("caller_list_id", listId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export function exportCompletedRows(rows: Array<Record<string, unknown>>) {
  downloadCsv("completed-callers.csv", rows);
}
