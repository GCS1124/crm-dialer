import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseBrowserKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const hasSupabaseBrowserConfig = Boolean(supabaseUrl && supabaseBrowserKey);

export const supabase: SupabaseClient | null = hasSupabaseBrowserConfig
  ? createClient(supabaseUrl!, supabaseBrowserKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function assertSupabaseConfigured() {
  if (!supabase) {
    throw new Error(
      "Supabase browser client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }
}

export function getSupabaseClient() {
  assertSupabaseConfigured();
  return supabase as SupabaseClient;
}
