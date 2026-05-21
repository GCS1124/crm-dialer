import type { VoiceProviderConfig } from "../types";

export interface BrowserSoftphoneSessionConfig {
  sipUri?: string | null;
  authorizationUsername?: string | null;
  authorizationPassword?: string | null;
  dialPrefix?: string | null;
  displayName?: string | null;
}

export interface BrowserSoftphoneConfig {
  available: boolean;
  source: VoiceProviderConfig["source"];
  callerId: string | null;
  websocketUrl: string | null;
  sipDomain: string | null;
  sipUri: string | null;
  authorizationId: string | null;
  authorizationUsername: string | null;
  authorizationPassword: string | null;
  dialPrefix: string | null;
  displayName: string | null;
  profileId: string | null;
  profileLabel: string | null;
  message: string | null;
}

type BrowserSoftphoneVoiceConfig = Pick<
  VoiceProviderConfig,
  | "available"
  | "source"
  | "callerId"
  | "websocketUrl"
  | "sipDomain"
  | "profileId"
  | "profileLabel"
  | "authorizationId"
>;

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function hasText(value: string | null | undefined) {
  return normalizeText(value) !== null;
}

export function buildBrowserSoftphoneConfig(
  voice: BrowserSoftphoneVoiceConfig,
  session: BrowserSoftphoneSessionConfig,
): BrowserSoftphoneConfig {
  const websocketUrl = normalizeText(voice.websocketUrl);
  const sipDomain = normalizeText(voice.sipDomain);
  const authorizationId = normalizeText(voice.authorizationId) ?? normalizeText(session.authorizationUsername);
  const authorizationUsername = normalizeText(session.authorizationUsername);
  const authorizationPassword =
    typeof session.authorizationPassword === "string" && session.authorizationPassword.length > 0
      ? session.authorizationPassword
      : null;
  const displayName = normalizeText(session.displayName);
  const sipUri = normalizeText(session.sipUri);
  const dialPrefix = normalizeText(session.dialPrefix);

  const available =
    Boolean(voice.available) &&
    hasText(websocketUrl) &&
    hasText(sipDomain) &&
    hasText(authorizationId) &&
    hasText(authorizationUsername) &&
    hasText(session.authorizationPassword) &&
    hasText(displayName);

  return {
    available,
    source: voice.source,
    callerId: normalizeText(voice.callerId),
    websocketUrl,
    sipDomain,
    sipUri,
    authorizationId,
    authorizationUsername,
    authorizationPassword,
    dialPrefix,
    displayName,
    profileId: normalizeText(voice.profileId),
    profileLabel: normalizeText(voice.profileLabel),
    message: available ? null : "RingCentral browser calling is not ready.",
  };
}
