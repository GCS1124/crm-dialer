const DEFAULT_RINGCENTRAL_SERVER_URL = "https://platform.ringcentral.com";
const RINGCENTRAL_AUTHORIZE_PATH = "/restapi/oauth/authorize";

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

const RINGCENTRAL_OUTBOUND_USAGE_TYPES = new Set([
  "MainCompanyNumber",
  "AdditionalCompanyNumber",
  "CompanyNumber",
  "DirectNumber",
  "ForwardedNumber",
]);

export function isRingCentralOutboundNumber(value: RingCentralPhoneNumber) {
  if (!value.phoneNumber) {
    return false;
  }

  const features = value.features ?? [];
  if (features.includes("CallerId") || features.includes("CallForwarding")) {
    return true;
  }

  return RINGCENTRAL_OUTBOUND_USAGE_TYPES.has(value.usageType ?? "");
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

export async function createRingCentralPkcePair() {
  const cryptoObject = globalThis.crypto;
  if (!cryptoObject?.subtle) {
    throw new Error("Browser crypto is not available.");
  }

  const verifierBytes = new Uint8Array(64);
  cryptoObject.getRandomValues(verifierBytes);
  const verifier = Array.from(verifierBytes, (value) => value.toString(16).padStart(2, "0"))
    .join("")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const digest = await cryptoObject.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return { verifier, challenge };
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
        normalizePhoneNumber(number.phoneNumber) === normalizedPreferred && isRingCentralOutboundNumber(number),
    );
    if (preferredMatch) {
      return normalizePhoneNumber(preferredMatch.phoneNumber);
    }
  }

  const firstOutboundNumber = numbers.find(isRingCentralOutboundNumber);
  if (firstOutboundNumber) {
    return normalizePhoneNumber(firstOutboundNumber.phoneNumber);
  }

  const firstCallerIdNumber = numbers.find((number) => number.features?.includes("CallerId") ?? false);
  if (firstCallerIdNumber) {
    return normalizePhoneNumber(firstCallerIdNumber.phoneNumber);
  }

  const firstNumber = numbers[0];
  return firstNumber ? normalizePhoneNumber(firstNumber.phoneNumber) : "";
}

export function isRingCentralRateLimitError(message: string) {
  return /CMN-30[1-4]|Request rate exceeded/i.test(message);
}
