const DEFAULT_RINGCENTRAL_SERVER_URL = "https://platform.ringcentral.com";
const RINGCENTRAL_AUTHORIZE_PATH = "/restapi/oauth/authorize";
export const RINGCENTRAL_TELEPHONY_SESSION_FILTER = "/restapi/v1.0/account/~/telephony/sessions";

export interface RingCentralPhoneNumber {
  phoneNumber: string;
  features?: string[];
  usageType?: string | null;
  label?: string | null;
}

export interface RingOutRequestPayload {
  from?: {
    phoneNumber: string;
  };
  to: {
    phoneNumber: string;
  };
  playPrompt: boolean;
}

export interface RingCentralRequestError extends Error {
  status?: number;
  errorCode?: string | null;
}

function normalizePhoneNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

function formatE164PhoneNumber(value: string) {
  const digits = normalizePhoneNumber(value);
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  return value.trim();
}

function isRingCentralForwardingNumber(value: RingCentralPhoneNumber) {
  const features = value.features ?? [];
  return (
    value.usageType === "ForwardedNumber" ||
    features.includes("CallForwarding")
  );
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readRingCentralErrorCode(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  for (const value of [record.errorCode, record.error_code]) {
    const text = readText(value);
    if (text) {
      return text;
    }
  }

  const errors = record.errors;
  if (!Array.isArray(errors)) {
    return "";
  }

  for (const error of errors) {
    if (!error || typeof error !== "object") {
      continue;
    }

    const errorRecord = error as Record<string, unknown>;
    for (const value of [errorRecord.errorCode, errorRecord.error_code]) {
      const text = readText(value);
      if (text) {
        return text;
      }
    }
  }

  return "";
}

function readRingCentralErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  for (const value of [record.message, record.error_description]) {
    const text = readText(value);
    if (text) {
      return text;
    }
  }

  const errors = record.errors;
  if (!Array.isArray(errors)) {
    return "";
  }

  for (const error of errors) {
    if (!error || typeof error !== "object") {
      continue;
    }

    const errorRecord = error as Record<string, unknown>;
    for (const value of [errorRecord.message, errorRecord.description]) {
      const text = readText(value);
      if (text) {
        return text;
      }
    }
  }

  return "";
}

export function createRingCentralRequestError(
  status: number,
  payload: unknown,
  fallbackMessage: string,
) {
  const errorCode = readRingCentralErrorCode(payload);
  const message = readRingCentralErrorMessage(payload) || fallbackMessage;
  const error = new Error(errorCode ? `${message} (${errorCode})` : message) as RingCentralRequestError;
  error.status = status;
  error.errorCode = errorCode || null;
  return error;
}

export function isRingCentralAuthorizationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return Number((error as { status?: unknown }).status) === 401;
}

export async function retryRingCentralRequestAfterRefresh<T>(input: {
  accessToken: string;
  refreshAccessToken: () => Promise<string>;
  request: (accessToken: string) => Promise<T>;
}) {
  try {
    return await input.request(input.accessToken);
  } catch (error) {
    if (!isRingCentralAuthorizationError(error)) {
      throw error;
    }

    const refreshedAccessToken = await input.refreshAccessToken();
    return await input.request(refreshedAccessToken);
  }
}

export function formatRingCentralPhoneNumber(value: string) {
  const digits = normalizePhoneNumber(value);
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return digits;
}

export function isRingCentralOutboundNumber(value: RingCentralPhoneNumber) {
  const features = value.features ?? [];
  return features.includes("CallerId") || isRingCentralForwardingNumber(value);
}

export function buildRingCentralAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  serverUrl?: string;
}) {
  const url = new URL(RINGCENTRAL_AUTHORIZE_PATH, input.serverUrl ?? DEFAULT_RINGCENTRAL_SERVER_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function buildRingOutRequestPayload(input: {
  to: string;
  callerId?: string | null;
  playPrompt?: boolean;
}): RingOutRequestPayload {
  const payload: RingOutRequestPayload = {
    to: {
      phoneNumber: formatE164PhoneNumber(input.to),
    },
    playPrompt: input.playPrompt ?? false,
  };

  const normalizedCallerId = input.callerId ? normalizePhoneNumber(input.callerId) : "";
  if (normalizedCallerId) {
    payload.from = {
      phoneNumber: formatE164PhoneNumber(normalizedCallerId),
    };
  }

  return payload;
}

export function selectRingCentralCallerId(
  numbers: RingCentralPhoneNumber[],
  preferredCallerId: string | null,
) {
  const normalizedPreferred = preferredCallerId ? normalizePhoneNumber(preferredCallerId) : "";
  if (normalizedPreferred) {
    const preferredMatch = numbers.find(
      (number) =>
        normalizePhoneNumber(number.phoneNumber) === normalizedPreferred &&
        isRingCentralOutboundNumber(number),
    );
    if (preferredMatch) {
      return normalizePhoneNumber(preferredMatch.phoneNumber);
    }
  }

  const firstForwardingNumber = numbers.find(isRingCentralForwardingNumber);
  if (firstForwardingNumber) {
    return normalizePhoneNumber(firstForwardingNumber.phoneNumber);
  }

  const firstCallableNumber = numbers.find((number) => number.features?.includes("CallerId") ?? false);
  if (firstCallableNumber) {
    return normalizePhoneNumber(firstCallableNumber.phoneNumber);
  }

  const firstNumber = numbers[0];
  return firstNumber ? normalizePhoneNumber(firstNumber.phoneNumber) : "";
}
