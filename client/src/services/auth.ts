import type { Session, User as SupabaseUser } from "@supabase/supabase-js";

import { createSupabaseTokenClient, getSupabaseClient } from "../lib/supabase";
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
  must_reset_password: boolean;
}

export interface AuthSessionResult {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function isJwtExpired(token: string) {
  const segments = token.split(".");
  if (segments.length < 2) {
    return false;
  }

  const payloadSegment = segments[1];
  const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

  try {
    const payload = JSON.parse(globalThis.atob(padded)) as { exp?: number };
    if (typeof payload.exp !== "number") {
      return false;
    }

    return payload.exp * 1000 <= Date.now() + 60_000;
  } catch {
    return false;
  }
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
    mustResetPassword: row.must_reset_password,
  };
}

async function loadAppUser(authUser: SupabaseUser, accessToken?: string | null): Promise<User> {
  const client = accessToken ? createSupabaseTokenClient(accessToken) : getSupabaseClient();

  const { data, error } = await client
    .from("app_users")
    .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status, must_reset_password")
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
      must_reset_password: false,
    };

    const { data: created, error: createError } = await client
      .from("app_users")
      .insert(profilePayload)
      .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status, must_reset_password")
      .single();

    if (createError) {
      throw createError;
    }

    return mapUser(created as AppUserRow);
  }

  return mapUser(data as AppUserRow);
}

async function loadUserFromAccessToken(accessToken: string) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return loadAppUser(data.user, accessToken);
}

export async function getSessionUser(accessToken?: string | null) {
  if (accessToken) {
    if (isJwtExpired(accessToken)) {
      return null;
    }

    return loadUserFromAccessToken(accessToken);
  }

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
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }

  const session = data.session ?? null;
  const authUser = data.user ?? session?.user ?? null;
  if (session?.access_token && session.refresh_token) {
    const { error: sessionError } = await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (sessionError) {
      throw sessionError;
    }
  }

  return {
    user: authUser && session?.access_token ? await loadAppUser(authUser, session.access_token) : null,
    token: session?.access_token ?? null,
    refreshToken: session?.refresh_token ?? null,
  } satisfies AuthSessionResult;
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
  if (data.session?.access_token && data.session.refresh_token) {
    const { error: sessionError } = await client.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (sessionError) {
      throw sessionError;
    }
  }
  return {
    user:
      sessionUser && data.session?.access_token ? await loadAppUser(sessionUser, data.session.access_token) : null,
    token: data.session?.access_token ?? null,
    refreshToken: data.session?.refresh_token ?? null,
  } satisfies AuthSessionResult;
}

export async function updatePassword(newPassword: string) {
  const client = getSupabaseClient();

  const { error } = await client.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw error;
  }

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    throw userError ?? new Error("Unable to load the current authenticated user.");
  }

  const { error: resetError } = await client
    .from("app_users")
    .update({
      must_reset_password: false,
      updated_at: new Date().toISOString(),
    })
    .eq("auth_user_id", userData.user.id);

  if (resetError) {
    throw resetError;
  }

  return {
    user: await loadAppUser(userData.user),
  };
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

  return loadAppUser(session.user, session.access_token);
}
