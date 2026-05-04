import type { User } from "@supabase/supabase-js";
import { assertSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Profile } from "@/types/app";

export async function ensureProfile(user: User): Promise<Profile> {
  assertSupabaseConfigured();

  const { data: existing, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (existing) return existing;

  const profilePayload = {
    id: user.id,
    email: user.email ?? null,
    full_name:
      (user.user_metadata.full_name as string | undefined) ??
      (user.user_metadata.name as string | undefined) ??
      null,
    role: "agent" as const,
    status: "offline" as const,
  };

  const { data, error: upsertError } = await supabase
    .from("profiles")
    .upsert(profilePayload)
    .select("*")
    .single();

  if (upsertError) throw upsertError;
  return data;
}

export async function signInWithPassword(email: string, password: string) {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signInWithMagicLink(email: string) {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/dashboard`,
    },
  });
  if (error) throw error;
}

export async function signUpWithPassword(input: {
  fullName: string;
  email: string;
  password: string;
}) {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${window.location.origin}/dashboard`,
      data: {
        full_name: input.fullName,
      },
    },
  });
  if (error) throw error;
}

export async function signInWithGoogle() {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/dashboard`,
    },
  });
  if (error) throw error;
}

export async function signOut() {
  assertSupabaseConfigured();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function updateProfile(profileId: string, updates: Partial<Profile>) {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", profileId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export function getPostLoginRoute() {
  return "/dashboard";
}
