import { getSupabaseClient } from "../lib/supabase";
import {
  buildRingCentralAuthorizationUrl,
  buildRingOutRequestPayload,
  createRingCentralPkcePair,
  selectRingCentralCallerId,
  type RingCentralPhoneNumber,
} from "../lib/ringcentral";

export interface RingCentralIntegrationStatus {
  connected: boolean;
  accountId: string | null;
  extensionId: string | null;
  selectedCallerId: string | null;
  availableCallerIds: RingCentralPhoneNumber[];
  connectedAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  message: string | null;
}

export interface RingCentralRingOutResult {
  id: string | null;
  status: string | null;
  callStatus: string | null;
  to: string | null;
  from: string | null;
}

const RINGCENTRAL_STATE_PREFIX = "preview-dialer-ringcentral-pkce:";

function requireWindow() {
  if (typeof window === "undefined") {
    throw new Error("RingCentral connection is only available in the browser.");
  }

  return window;
}

function generateState() {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.randomUUID) {
    return cryptoObject.randomUUID();
  }

  return `ringcentral-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function saveVerifier(state: string, verifier: string) {
  requireWindow().localStorage.setItem(`${RINGCENTRAL_STATE_PREFIX}${state}`, verifier);
}

function loadVerifier(state: string) {
  return requireWindow().localStorage.getItem(`${RINGCENTRAL_STATE_PREFIX}${state}`);
}

function clearVerifier(state: string) {
  requireWindow().localStorage.removeItem(`${RINGCENTRAL_STATE_PREFIX}${state}`);
}

async function invokeRingCentralFunction<T>(body: Record<string, unknown>) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke("ringcentral", {
    body,
  });

  if (error) {
    throw new Error(await getRingCentralFunctionErrorMessage(error));
  }

  return data as T;
}

function readErrorPayloadMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const values = payload as Record<string, unknown>;
  if (typeof values.message === "string" && values.message.trim()) {
    return values.message.trim();
  }

  if (typeof values.error === "string" && values.error.trim()) {
    return values.error.trim();
  }

  if (typeof values.code === "string" && values.code.trim()) {
    return values.code.trim();
  }

  return "";
}

async function getRingCentralFunctionErrorMessage(error: unknown) {
  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: unknown }).context
    : null;

  if (context instanceof Response) {
    const status = context.status;
    const fallback = `RingCentral function failed${status ? ` (${status})` : ""}.`;
    const text = await context
      .clone()
      .text()
      .catch(() => "");

    if (!text) {
      return fallback;
    }

    try {
      const message = readErrorPayloadMessage(JSON.parse(text));
      if (message) {
        return message;
      }
    } catch {
      return text.length > 300 ? `${text.slice(0, 300)}...` : text;
    }

    return fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to reach RingCentral settings.";
}

function getDefaultRedirectUri() {
  return requireWindow().location.origin.replace(/\/+$/, "");
}

function normalizeRingCentralNumbers(numbers: RingCentralPhoneNumber[]) {
  return numbers.map((number) => ({
    ...number,
    phoneNumber: number.phoneNumber.replace(/[^\d]/g, ""),
  }));
}

export async function beginRingCentralConnection() {
  const { verifier, challenge } = await createRingCentralPkcePair();
  const state = generateState();
  saveVerifier(state, verifier);

  const { authorizationUrl } = await invokeRingCentralFunction<{ authorizationUrl: string }>({
    action: "auth-url",
    codeChallenge: challenge,
    redirectUri: getDefaultRedirectUri(),
    state,
  });

  requireWindow().location.assign(authorizationUrl);
}

export async function completeRingCentralConnection(input: {
  code: string;
  state: string;
}) {
  const verifier = loadVerifier(input.state);
  if (!verifier) {
    throw new Error("RingCentral login expired. Try connecting again.");
  }

  try {
    const response = await invokeRingCentralFunction<{ status: RingCentralIntegrationStatus }>({
      action: "exchange",
      code: input.code,
      codeVerifier: verifier,
      redirectUri: getDefaultRedirectUri(),
      state: input.state,
    });

    return response.status;
  } finally {
    clearVerifier(input.state);
  }
}

export async function loadRingCentralStatus() {
  const response = await invokeRingCentralFunction<{ status: RingCentralIntegrationStatus }>({
    action: "status",
  });

  return {
    ...response.status,
    availableCallerIds: normalizeRingCentralNumbers(response.status.availableCallerIds ?? []),
  };
}

export async function saveRingCentralCallerId(callerId: string | null) {
  const response = await invokeRingCentralFunction<{ status: RingCentralIntegrationStatus }>({
    action: "update-caller-id",
    callerId,
  });

  return {
    ...response.status,
    availableCallerIds: normalizeRingCentralNumbers(response.status.availableCallerIds ?? []),
  };
}

export async function disconnectRingCentral() {
  await invokeRingCentralFunction<{ success: boolean }>({
    action: "disconnect",
  });
}

export async function placeRingOutCall(input: {
  to: string;
  callerId?: string | null;
  playPrompt?: boolean;
}) {
  const response = await invokeRingCentralFunction<{ call: RingCentralRingOutResult }>({
    action: "ring-out",
    ...buildRingOutRequestPayload(input),
  });

  return response.call;
}

export function chooseRingCentralCallerId(
  numbers: RingCentralPhoneNumber[],
  preferredCallerId: string | null,
) {
  return selectRingCentralCallerId(numbers, preferredCallerId);
}

export function buildRingCentralAuthRedirect() {
  return getDefaultRedirectUri();
}

export function buildRingCentralAuthorizationRedirectUrl(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  serverUrl?: string;
}) {
  return buildRingCentralAuthorizationUrl(input);
}
