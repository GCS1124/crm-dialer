import { assertSupabaseConfigured, supabase } from "@/lib/supabase";

export async function listAgents() {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name", { ascending: true });

  if (error) throw error;
  return data;
}
