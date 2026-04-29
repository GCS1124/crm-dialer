import type { PostgrestError } from "@supabase/supabase-js";

import { env } from "../config/env.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { getVoiceProviderConfig } from "./voiceProviderService.js";
import type {
  ApiSipProfile,
  ApiUser,
  CreateSipProfileInput,
  StoredSipProfile,
} from "../types/index.js";

interface DbSipProfileRow {
  id: string;
  label: string;
  provider_url: string;
  sip_domain: string;
  sip_username: string;
  sip_password: string;
  caller_id: string;
  owner_user_id: string | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

interface DbUserSipPreferenceRow {
  user_id: string;
  active_sip_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

function handleError(error: PostgrestError | Error | null, message: string): never {
  throw new Error(error ? `${message}: ${error.message}` : message);
}

function maskSecret(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length <= 4) {
    return "*".repeat(trimmed.length);
  }

  return `${"*".repeat(Math.max(0, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

function normalizeSipDomain(value: string) {
  return value
    .trim()
    .replace(/^(wss?|https?):\/\//i, "")
    .replace(/\/+$/, "")
    .replace(/\/.*$/, "");
}

function normalizeSipProviderUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^wss?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http/i, "ws");
  }

  return `wss://${normalizeSipDomain(trimmed)}/`;
}

function canManageSharedProfiles(user: ApiUser) {
  return user.role === "admin" || user.role === "team_leader";
}

function canAccessProfile(row: DbSipProfileRow, currentUser: ApiUser) {
  return currentUser.role === "admin" || row.is_shared || row.owner_user_id === currentUser.id;
}

function mapApiSipProfile(
  row: DbSipProfileRow,
  activeProfileId: string | null,
  usersById: Map<string, ApiUser>,
): ApiSipProfile {
  return {
    id: row.id,
    label: row.label,
    providerUrl: row.provider_url,
    sipDomain: row.sip_domain,
    sipUsername: row.sip_username,
    callerId: row.caller_id,
    ownerUserId: row.owner_user_id,
    ownerUserName: row.owner_user_id ? (usersById.get(row.owner_user_id)?.name ?? null) : null,
    isShared: row.is_shared,
    isActive: row.id === activeProfileId,
    passwordPreview: maskSecret(row.sip_password),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStoredSipProfile(
  row: DbSipProfileRow,
  activeProfileId: string | null,
  usersById: Map<string, ApiUser>,
): StoredSipProfile {
  const apiProfile = mapApiSipProfile(row, activeProfileId, usersById);

  return {
    ...apiProfile,
    sipPassword: row.sip_password,
  };
}

async function fetchUserPreference(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_sip_preferences")
    .select("user_id, active_sip_profile_id, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    handleError(error, "Unable to load the active SIP profile");
  }

  return (data as DbUserSipPreferenceRow | null) ?? null;
}

async function fetchVisibleSipProfileRows(currentUser: ApiUser) {
  await ensureDefaultSipProfileSeed();

  let query = supabaseAdmin
    .from("sip_profiles")
    .select(
      "id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared, created_at, updated_at",
    )
    .order("is_shared", { ascending: false })
    .order("label", { ascending: true });

  if (currentUser.role !== "admin") {
    query = query.or(`is_shared.eq.true,owner_user_id.eq.${currentUser.id}`);
  }

  const { data, error } = await query;

  if (error) {
    handleError(error, "Unable to load SIP profiles");
  }

  return (data ?? []) as DbSipProfileRow[];
}

async function fetchSipProfileRowById(profileId: string) {
  const { data, error } = await supabaseAdmin
    .from("sip_profiles")
    .select(
      "id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared, created_at, updated_at",
    )
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    handleError(error, "Unable to load SIP profile");
  }

  return (data as DbSipProfileRow | null) ?? null;
}

export async function ensureDefaultSipProfileSeed() {
  const voice = getVoiceProviderConfig();
  const sipPassword = env.SIP_PASSWORD.trim();

  if (
    !voice.available ||
    !voice.websocketUrl ||
    !voice.sipDomain ||
    !voice.username ||
    !voice.callerId ||
    !sipPassword
  ) {
    return null;
  }

  const normalizedUrl = normalizeSipProviderUrl(voice.websocketUrl);
  const normalizedDomain = normalizeSipDomain(voice.sipDomain);
  const label = "Unified Voice Shared";

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("sip_profiles")
    .select(
      "id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared, created_at, updated_at",
    )
    .eq("is_shared", true)
    .eq("sip_domain", normalizedDomain)
    .eq("sip_username", voice.username)
    .maybeSingle();

  if (existingError) {
    handleError(existingError, "Unable to check the default SIP profile");
  }

  if (existing) {
    const needsUpdate =
      existing.provider_url !== normalizedUrl ||
      existing.sip_password !== sipPassword ||
      existing.caller_id !== voice.callerId ||
      existing.label !== label ||
      existing.owner_user_id !== null ||
      existing.is_shared !== true;

    if (!needsUpdate) {
      return existing as DbSipProfileRow;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("sip_profiles")
      .update({
        label,
        provider_url: normalizedUrl,
        sip_password: sipPassword,
        caller_id: voice.callerId,
        owner_user_id: null,
        is_shared: true,
      })
      .eq("id", existing.id)
      .select(
        "id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared, created_at, updated_at",
      )
      .single();

    if (updateError) {
      handleError(updateError, "Unable to refresh the default SIP profile");
    }

    return updated as DbSipProfileRow;
  }

  const { data, error } = await supabaseAdmin
    .from("sip_profiles")
    .insert({
      label,
      provider_url: normalizedUrl,
      sip_domain: normalizedDomain,
      sip_username: voice.username,
      sip_password: sipPassword,
      caller_id: voice.callerId,
      owner_user_id: null,
      is_shared: true,
    })
    .select(
      "id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared, created_at, updated_at",
    )
    .single();

  if (error) {
    handleError(error, "Unable to seed the default SIP profile");
  }

  return data as DbSipProfileRow;
}

export async function getSipProfileWorkspaceState(
  currentUser: ApiUser,
  users: ApiUser[] = [],
) {
  const usersById = new Map(users.map((user) => [user.id, user]));
  const [profileRows, preference] = await Promise.all([
    fetchVisibleSipProfileRows(currentUser),
    fetchUserPreference(currentUser.id),
  ]);

  const activeRow =
    profileRows.find((row) => row.id === preference?.active_sip_profile_id) ?? null;
  const activeId = activeRow?.id ?? null;

  return {
    profiles: profileRows.map((row) => mapApiSipProfile(row, activeId, usersById)),
    activeProfile: activeRow ? mapApiSipProfile(activeRow, activeId, usersById) : null,
    activeStoredProfile: activeRow ? mapStoredSipProfile(activeRow, activeId, usersById) : null,
    selectionRequired: profileRows.length > 0 && !activeRow,
  };
}

export async function listSipProfiles(
  currentUser: ApiUser,
  users: ApiUser[] = [],
) {
  const state = await getSipProfileWorkspaceState(currentUser, users);
  return state.profiles;
}

export async function getActiveSipProfile(currentUser: ApiUser) {
  const state = await getSipProfileWorkspaceState(currentUser);
  return state.activeStoredProfile;
}

export async function createSipProfile(input: CreateSipProfileInput, currentUser: ApiUser) {
  const normalizedLabel = input.label.trim();
  const normalizedUrl = normalizeSipProviderUrl(input.providerUrl);
  const normalizedDomain = normalizeSipDomain(input.sipDomain);
  const normalizedUsername = input.sipUsername.trim();
  const normalizedPassword = input.sipPassword.trim();
  const normalizedCallerId = input.callerId.trim();
  const isShared = canManageSharedProfiles(currentUser) ? input.isShared : false;

  if (
    !normalizedLabel ||
    !normalizedUrl ||
    !normalizedDomain ||
    !normalizedUsername ||
    !normalizedPassword ||
    !normalizedCallerId
  ) {
    throw new Error("Every SIP profile field is required");
  }

  const { data, error } = await supabaseAdmin
    .from("sip_profiles")
    .insert({
      label: normalizedLabel,
      provider_url: normalizedUrl,
      sip_domain: normalizedDomain,
      sip_username: normalizedUsername,
      sip_password: normalizedPassword,
      caller_id: normalizedCallerId,
      owner_user_id: isShared ? null : currentUser.id,
      is_shared: isShared,
    })
    .select(
      "id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared, created_at, updated_at",
    )
    .single();

  if (error) {
    handleError(error, "Unable to create SIP profile");
  }

  const row = data as DbSipProfileRow;
  const usersById = new Map([[currentUser.id, currentUser]]);
  return mapApiSipProfile(row, null, usersById);
}

export async function setActiveSipProfile(profileId: string, currentUser: ApiUser) {
  const row = await fetchSipProfileRowById(profileId);
  if (!row || !canAccessProfile(row, currentUser)) {
    throw new Error("SIP profile not found");
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("user_sip_preferences").upsert(
    {
      user_id: currentUser.id,
      active_sip_profile_id: profileId,
      updated_at: now,
    },
    {
      onConflict: "user_id",
    },
  );

  if (error) {
    handleError(error, "Unable to activate SIP profile");
  }
}
