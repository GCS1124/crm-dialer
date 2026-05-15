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

function isRingCentralForwardingNumber(value: RingCentralPhoneNumber) {
  const features = value.features ?? [];
  return (
    value.usageType === "ForwardedNumber" ||
    features.includes("CallForwarding")
  );
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
      phoneNumber: normalizePhoneNumber(input.to),
    },
    playPrompt: input.playPrompt ?? false,
  };

  const normalizedCallerId = input.callerId ? normalizePhoneNumber(input.callerId) : "";
  if (normalizedCallerId) {
    payload.from = {
      phoneNumber: normalizedCallerId,
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
