import { env } from "../config/env.js";
import type { StoredSipProfile, VoiceProviderConfig } from "../types/index.js";

export type VoiceProviderName = "embedded-sip";

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

function buildSipUri() {
  return `sip:${env.SIP_USERNAME.trim()}@${env.SIP_DOMAIN.trim()}`;
}

function buildSipUriFromProfile(profile: Pick<StoredSipProfile, "sipUsername" | "sipDomain">) {
  return `sip:${profile.sipUsername.trim()}@${profile.sipDomain.trim()}`;
}

function buildUnavailableMessage() {
  return "The CRM softphone is not configured yet. Add the SIP WebSocket URL, SIP domain, SIP username, SIP password, and outbound caller ID on the backend.";
}

function isSipProfileConfigured(profile: Pick<
  StoredSipProfile,
  "providerUrl" | "sipDomain" | "sipUsername" | "sipPassword" | "callerId"
>) {
  return (
    isWebsocketUrl(profile.providerUrl) &&
    isSipDomain(profile.sipDomain) &&
    isSipUsername(profile.sipUsername) &&
    isSipPassword(profile.sipPassword) &&
    isCallerId(profile.callerId)
  );
}

export function getVoiceFieldStatus() {
  return {
    websocketUrl: isWebsocketUrl(env.SIP_WEBSOCKET_URL),
    sipDomain: isSipDomain(env.SIP_DOMAIN),
    sipUsername: isSipUsername(env.SIP_USERNAME),
    sipPassword: isSipPassword(env.SIP_PASSWORD),
    callerId: isCallerId(env.SIP_OUTBOUND_CALLER_ID),
  };
}

export function isVoiceProviderConfigured() {
  const fields = getVoiceFieldStatus();
  return Object.values(fields).every(Boolean);
}

export function getVoiceProviderConfig() {
  return {
    provider: env.VOICE_PROVIDER as VoiceProviderName,
    available: isVoiceProviderConfigured(),
    source: isVoiceProviderConfigured() ? ("environment" as const) : ("unconfigured" as const),
    callerId: env.SIP_OUTBOUND_CALLER_ID.trim() || null,
    websocketUrl: env.SIP_WEBSOCKET_URL.trim() || null,
    sipDomain: env.SIP_DOMAIN.trim() || null,
    username: env.SIP_USERNAME.trim() || null,
    profileId: null,
    profileLabel: null,
  };
}

export function getVoiceProviderConfigFromSipProfile(
  profile: Pick<
    StoredSipProfile,
    "id" | "label" | "providerUrl" | "sipDomain" | "sipUsername" | "sipPassword" | "callerId"
  >,
): VoiceProviderConfig {
  const available = isSipProfileConfigured(profile);

  return {
    provider: env.VOICE_PROVIDER as VoiceProviderName,
    available,
    source: available ? "profile" : "unconfigured",
    callerId: profile.callerId.trim() || null,
    websocketUrl: profile.providerUrl.trim() || null,
    sipDomain: profile.sipDomain.trim() || null,
    username: profile.sipUsername.trim() || null,
    profileId: profile.id,
    profileLabel: profile.label,
  };
}

export function createVoiceSessionPayload(displayName: string) {
  const config = getVoiceProviderConfig();

  if (!config.available) {
    return {
      ...config,
      message: buildUnavailableMessage(),
    };
  }

  return {
    ...config,
    sipUri: buildSipUri(),
    authorizationUsername: env.SIP_USERNAME.trim(),
    authorizationPassword: env.SIP_PASSWORD.trim(),
    dialPrefix: env.SIP_DIAL_PREFIX.trim(),
    displayName,
  };
}

export function createVoiceSessionPayloadFromSipProfile(
  profile: Pick<
    StoredSipProfile,
    "id" | "label" | "providerUrl" | "sipDomain" | "sipUsername" | "sipPassword" | "callerId"
  >,
  displayName: string,
) {
  const config = getVoiceProviderConfigFromSipProfile(profile);

  if (!config.available) {
    return {
      ...config,
      message: buildUnavailableMessage(),
    };
  }

  return {
    ...config,
    sipUri: buildSipUriFromProfile(profile),
    authorizationUsername: profile.sipUsername.trim(),
    authorizationPassword: profile.sipPassword.trim(),
    dialPrefix: env.SIP_DIAL_PREFIX.trim(),
    displayName,
  };
}
