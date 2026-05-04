import { jsonResponse, optionsResponse } from "../_shared/http.ts";
import { createAnonClient, createServiceClient, getAuthenticatedUser } from "../_shared/supabase.ts";

type VoiceProviderName = "embedded-sip";
type VoiceSource = "profile" | "environment" | "unconfigured";

interface VoiceSessionPayload {
  provider: VoiceProviderName;
  available: boolean;
  source: VoiceSource;
  callerId: string | null;
  websocketUrl: string | null;
  sipDomain: string | null;
  username: string | null;
  profileId: string | null;
  profileLabel: string | null;
  sipUri?: string;
  authorizationUsername?: string;
  authorizationPassword?: string;
  dialPrefix?: string;
  displayName?: string;
  message?: string;
}

interface AppUserRow {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  role: "admin" | "team_leader" | "agent";
  team_name: string;
  title: string | null;
  timezone: string;
  status: "online" | "away" | "offline";
}

interface SipProfileRow {
  id: string;
  label: string;
  provider_url: string;
  sip_domain: string;
  sip_username: string;
  sip_password: string;
  caller_id: string;
  owner_user_id: string | null;
  is_shared: boolean;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function isPlaceholder(value: string, placeholders: string[]) {
  const normalized = normalize(value);
  return !normalized || placeholders.includes(normalized) || normalized.startsWith("replace-with-");
}

function isWebsocketUrl(value: string) {
  const trimmed = value.trim();
  return /^(wss?:)\/\//i.test(trimmed) && !isPlaceholder(trimmed, ["wss://sip.example.com"]);
}

function isSipDomain(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) && !isPlaceholder(trimmed, ["sip.example.com"]) && !trimmed.includes(" ");
}

function isSipUsername(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) && !isPlaceholder(trimmed, ["agent1001", "your-sip-username"]);
}

function isSipPassword(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= 6 && !isPlaceholder(trimmed, ["replace-with-sip-password"]);
}

function isCallerId(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed !== "+10000000000";
}

function isConfiguredProfile(profile: SipProfileRow) {
  return (
    isWebsocketUrl(profile.provider_url) &&
    isSipDomain(profile.sip_domain) &&
    isSipUsername(profile.sip_username) &&
    isSipPassword(profile.sip_password) &&
    isCallerId(profile.caller_id)
  );
}

function isConfiguredEnvironment(env: {
  websocketUrl: string;
  sipDomain: string;
  sipUsername: string;
  sipPassword: string;
  callerId: string;
}) {
  return (
    isWebsocketUrl(env.websocketUrl) &&
    isSipDomain(env.sipDomain) &&
    isSipUsername(env.sipUsername) &&
    isSipPassword(env.sipPassword) &&
    isCallerId(env.callerId)
  );
}

function buildSipUri(username: string, domain: string) {
  return `sip:${username.trim()}@${domain.trim()}`;
}

function buildUnavailableMessage() {
  return "The CRM softphone is not configured yet. Add an active SIP profile or set the SIP environment secrets in Supabase.";
}

function buildTemporaryPassword() {
  return `Dialer${Math.random().toString(36).slice(2, 8)}!2026`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function mapUser(row: AppUserRow) {
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
    activeSipProfileId: null,
    activeSipProfileLabel: null,
  };
}

function envConfig() {
  const websocketUrl = Deno.env.get("SIP_WEBSOCKET_URL")?.trim() ?? "";
  const sipDomain = Deno.env.get("SIP_DOMAIN")?.trim() ?? "";
  const sipUsername = Deno.env.get("SIP_USERNAME")?.trim() ?? "";
  const sipPassword = Deno.env.get("SIP_PASSWORD")?.trim() ?? "";
  const callerId = Deno.env.get("SIP_OUTBOUND_CALLER_ID")?.trim() ?? "";
  const dialPrefix = Deno.env.get("SIP_DIAL_PREFIX")?.trim() ?? "";

  const available = isConfiguredEnvironment({
    websocketUrl,
    sipDomain,
    sipUsername,
    sipPassword,
    callerId,
  });

  return {
    available,
    source: (available ? "environment" : "unconfigured") as VoiceSource,
    provider: "embedded-sip" as const,
    callerId: callerId || null,
    websocketUrl: websocketUrl || null,
    sipDomain: sipDomain || null,
    username: sipUsername || null,
    profileId: null,
    profileLabel: null,
    authorizationUsername: available ? sipUsername : undefined,
    authorizationPassword: available ? sipPassword : undefined,
    dialPrefix: available ? dialPrefix : undefined,
    sipUri: available ? buildSipUri(sipUsername, sipDomain) : undefined,
    displayName: undefined,
    message: available ? undefined : buildUnavailableMessage(),
  } satisfies VoiceSessionPayload;
}

function profileConfig(profile: SipProfileRow, displayName: string) {
  const available = isConfiguredProfile(profile);
  const dialPrefix = Deno.env.get("SIP_DIAL_PREFIX")?.trim() ?? "";

  return {
    available,
    source: (available ? "profile" : "unconfigured") as VoiceSource,
    provider: "embedded-sip" as const,
    callerId: profile.caller_id.trim() || null,
    websocketUrl: profile.provider_url.trim() || null,
    sipDomain: profile.sip_domain.trim() || null,
    username: profile.sip_username.trim() || null,
    profileId: profile.id,
    profileLabel: profile.label,
    authorizationUsername: available ? profile.sip_username.trim() : undefined,
    authorizationPassword: available ? profile.sip_password.trim() : undefined,
    dialPrefix: available ? dialPrefix : undefined,
    sipUri: available ? buildSipUri(profile.sip_username, profile.sip_domain) : undefined,
    displayName,
    message: available ? undefined : buildUnavailableMessage(),
  } satisfies VoiceSessionPayload;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const currentUser = await getAuthenticatedUser(request);
    if (!currentUser) {
      return jsonResponse({ message: "Missing authentication." }, { status: 401 });
    }

    const serviceClient = createServiceClient();
    const { data: appUser, error: userError } = await serviceClient
      .from("app_users")
      .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
      .eq("auth_user_id", currentUser.id)
      .maybeSingle();

    if (userError) {
      return jsonResponse({ message: userError.message }, { status: 500 });
    }

    let workspaceUser = appUser as AppUserRow | null;
    if (!workspaceUser) {
      const profileName =
        currentUser.user_metadata.full_name ??
        currentUser.user_metadata.name ??
        currentUser.email?.split("@")[0] ??
        "Agent";
      const { data: created, error: createError } = await serviceClient
        .from("app_users")
        .insert({
          auth_user_id: currentUser.id,
          full_name: profileName,
          email: currentUser.email ?? "",
          role: "agent",
          team_name: "General",
          title: null,
          timezone: "UTC",
          status: "offline",
        })
        .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
        .single();

      if (createError || !created) {
        return jsonResponse({ message: createError?.message ?? "Unable to create workspace user." }, { status: 500 });
      }

      workspaceUser = created as AppUserRow;
    }

    const displayName = workspaceUser.full_name.trim();
    const { data: preference, error: preferenceError } = await serviceClient
      .from("user_sip_preferences")
      .select("active_sip_profile_id")
      .eq("user_id", workspaceUser.id)
      .maybeSingle();

    if (preferenceError) {
      return jsonResponse({ message: preferenceError.message }, { status: 500 });
    }

    const activeProfileId = preference?.active_sip_profile_id ?? null;

    if (activeProfileId) {
      const { data: profile, error: profileError } = await serviceClient
        .from("sip_profiles")
        .select("id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared")
        .eq("id", activeProfileId)
        .maybeSingle();

      if (profileError) {
        return jsonResponse({ message: profileError.message }, { status: 500 });
      }

      if (profile) {
        return jsonResponse(profileConfig(profile as SipProfileRow, displayName));
      }
    }

    return jsonResponse({
      ...envConfig(),
      displayName,
    });
  } catch (error) {
    return jsonResponse(
      { message: error instanceof Error ? error.message : "Unable to load voice session." },
      { status: 500 },
    );
  }
});
