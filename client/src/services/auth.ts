import type { Session, User as SupabaseUser } from "@supabase/supabase-js";

import { getSupabaseClient } from "../lib/supabase";
import type { User } from "../types";

interface AppUserRow {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  role: User["role"];
  team_name: string;
  title: string | null;
  timezone: string;
  status: User["status"];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function mapUser(row: AppUserRow): User {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    role: row.role,
    team: row.team_name,
    timezone: row.timezone,
    avatar: getInitials(row.full_name),
    title: row.title ?? "Outbound Agent",
    status: row.status,
  };
}

async function loadAppUser(authUser: SupabaseUser): Promise<User> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("app_users")
    .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const profilePayload = {
      auth_user_id: authUser.id,
      full_name:
        (authUser.user_metadata.full_name as string | undefined) ??
        (authUser.user_metadata.name as string | undefined) ??
        authUser.email?.split("@")[0] ??
        "Agent",
      email: authUser.email ?? "",
      role: "agent" as const,
      team_name: "General",
      title: null,
      timezone: "UTC",
      status: "offline" as const,
    };

    const { data: created, error: createError } = await client
      .from("app_users")
      .insert(profilePayload)
      .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
      .single();

    if (createError) {
      throw createError;
    }

    return mapUser(created as AppUserRow);
  }

  return mapUser(data as AppUserRow);
}

export async function getSessionUser() {
  const client = getSupabaseClient();

  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session?.user) {
    return null;
  }

  return loadAppUser(session.user);
}

export async function getSessionAccessToken() {
  const client = getSupabaseClient();

  const {
    data: { session },
  } = await client.auth.getSession();

  return session?.access_token ?? null;
}

export async function signInWithPassword(email: string, password: string) {
  const client = getSupabaseClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }

  return getSessionUser();
}

export async function signUpWithPassword(input: {
  name: string;
  email: string;
  password: string;
  team: string;
  timezone: string;
  title: string;
}) {
  const client = getSupabaseClient();

  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.name,
        team: input.team,
        timezone: input.timezone,
        title: input.title,
      },
    },
  });

  if (error) {
    throw error;
  }

  const sessionUser = data.session?.user ?? data.user ?? null;
  if (!sessionUser) {
    return null;
  }

  return loadAppUser(sessionUser);
}

export async function signInWithGoogle() {
  const client = getSupabaseClient();
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/login`,
    },
  });
  if (error) {
    throw error;
  }
}

export async function signOut() {
  const client = getSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) {
    throw error;
  }
}

export async function ensureAppUserSession(session: Session | null) {
  if (!session?.user) {
    return null;
  }

  return loadAppUser(session.user);
}
