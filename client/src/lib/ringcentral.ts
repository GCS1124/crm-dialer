const DEFAULT_RINGCENTRAL_SERVER_URL = "https://platform.ringcentral.com";
const RINGCENTRAL_AUTHORIZE_PATH = "/restapi/oauth/authorize";

export interface RingCentralPhoneNumber {
  phoneNumber: string;
  features?: string[];
  usageType?: string | null;
  type?: string | null;
  label?: string | null;
  enabled?: boolean;
}

export interface RingOutRequestPayload {
  from?: {
    phoneNumber: string;
  };
  callerId?: {
    phoneNumber: string;
  };
  to: {
    phoneNumber: string;
  };
  playPrompt: boolean;
}

export interface RingOutStatusSnapshot {
  callStatus?: string | null;
  callerStatus?: string | null;
  calleeStatus?: string | null;
}

export interface RingOutProgressState {
  state: "ringing" | "connected" | "finished" | "failed";
  message: string | null;
  advanceQueue: boolean;
  failureType: "caller" | "callee" | "call" | "finished" | null;
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

function formatRingOutFromPhoneNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed.includes("*")) {
    return formatE164PhoneNumber(trimmed);
  }

  const [base, ...rest] = trimmed.split("*");
  const extensionSuffix = rest.join("*").trim();
  if (!extensionSuffix) {
    return formatE164PhoneNumber(base);
  }

  return `${formatE164PhoneNumber(base)}*${extensionSuffix}`;
}

const RINGCENTRAL_CALLER_ID_USAGE_TYPES = new Set([
  "MainCompanyNumber",
  "AdditionalCompanyNumber",
  "CompanyNumber",
  "DirectNumber",
]);

const RINGCENTRAL_RINGOUT_FROM_TYPES = new Set([
  "PhoneLine",
  "Mobile",
  "Work",
  "Other",
  "VoiceFax",
]);

const RINGCENTRAL_RINGOUT_FROM_USAGE_TYPES = new Set([
  "ForwardedNumber",
  "DirectNumber",
  "MainCompanyNumber",
  "AdditionalCompanyNumber",
  "CompanyNumber",
]);

export function isRingCentralOutboundNumber(value: RingCentralPhoneNumber) {
  return isRingCentralCallerIdNumber(value);
}

export function isRingCentralCallerIdNumber(value: RingCentralPhoneNumber) {
  if (!value.phoneNumber) {
    return false;
  }

  if (value.enabled === false) {
    return false;
  }

  const features = value.features ?? [];
  if (features.includes("CallerId")) {
    return true;
  }

  return RINGCENTRAL_CALLER_ID_USAGE_TYPES.has(value.usageType ?? "");
}

export function isRingCentralRingOutFromNumber(value: RingCentralPhoneNumber) {
  if (!value.phoneNumber) {
    return false;
  }

  if (value.enabled === false) {
    return false;
  }

  const features = value.features ?? [];
  if (features.includes("CallForwarding") || features.includes("CallFlip")) {
    return true;
  }

  return (
    RINGCENTRAL_RINGOUT_FROM_TYPES.has(value.type ?? "") ||
    RINGCENTRAL_RINGOUT_FROM_USAGE_TYPES.has(value.usageType ?? "")
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
  fromNumber?: string | null;
  callerIdNumber?: string | null;
  playPrompt?: boolean;
}): RingOutRequestPayload {
  const payload: RingOutRequestPayload = {
    to: {
      phoneNumber: formatE164PhoneNumber(input.to),
    },
    playPrompt: input.playPrompt ?? false,
  };

  const normalizedFromNumber = input.fromNumber ? normalizePhoneNumber(input.fromNumber) : "";
  if (normalizedFromNumber || (input.fromNumber?.includes("*") ?? false)) {
    payload.from = {
      phoneNumber: formatRingOutFromPhoneNumber(input.fromNumber ?? ""),
    };
  }

  const normalizedCallerIdNumber = input.callerIdNumber ? normalizePhoneNumber(input.callerIdNumber) : "";
  if (normalizedCallerIdNumber) {
    payload.callerId = {
      phoneNumber: formatE164PhoneNumber(normalizedCallerIdNumber),
    };
  }

  return payload;
}

export function selectRingCentralRingOutFromNumber(
  numbers: RingCentralPhoneNumber[],
  preferredFromNumber: string | null,
) {
  const normalizedPreferred = preferredFromNumber ? normalizePhoneNumber(preferredFromNumber) : "";
  if (normalizedPreferred) {
    const preferredMatch = numbers.find(
      (number) =>
        normalizePhoneNumber(number.phoneNumber) === normalizedPreferred &&
        isRingCentralRingOutFromNumber(number),
    );
    if (preferredMatch) {
      return normalizePhoneNumber(preferredMatch.phoneNumber);
    }
  }

  const firstFromNumber = numbers.find(isRingCentralRingOutFromNumber);
  if (firstFromNumber) {
    return normalizePhoneNumber(firstFromNumber.phoneNumber);
  }

  return "";
}

export function isRingCentralRateLimitError(message: string) {
  return /CMN-30[1-4]|Request rate exceeded/i.test(message);
}

const NO_USABLE_CALLBACK_NUMBER_ERROR = /no usable callback number configured/i;

export function shouldAdvanceQueueAfterCallFailure(message: string) {
  return !NO_USABLE_CALLBACK_NUMBER_ERROR.test(message) && !isRingCentralRateLimitError(message);
}

const RINGOUT_ACTIVE_STATUSES = new Set([
  "InProgress",
  "Queued",
  "Ringing",
  "Proceeding",
]);

const RINGOUT_FAILURE_STATUSES = new Set([
  "CannotReach",
  "NoAnsweringMachine",
  "Busy",
  "NoAnswer",
  "Rejected",
  "GenericError",
  "InternationalDisabled",
  "Invalid",
  "NoSessionFound",
]);

function describeRingOutStatus(status: RingOutStatusSnapshot) {
  const parts = [
    status.callStatus ? `call=${status.callStatus}` : "",
    status.callerStatus ? `caller=${status.callerStatus}` : "",
    status.calleeStatus ? `callee=${status.calleeStatus}` : "",
  ].filter(Boolean);

  return parts.length ? ` (${parts.join(", ")})` : "";
}

function readRingOutStatusValues(status: RingOutStatusSnapshot) {
  return [status.callStatus, status.callerStatus, status.calleeStatus].map((value) => value ?? "");
}

function isRingOutLegActive(value: string) {
  return RINGOUT_ACTIVE_STATUSES.has(value);
}

function isRingOutLegFailure(value: string) {
  return RINGOUT_FAILURE_STATUSES.has(value);
}

function isRingOutConnected(status: RingOutStatusSnapshot) {
  return (
    status.callStatus === "Success" ||
    (status.callerStatus === "Success" && status.calleeStatus === "Success")
  );
}

function isRingOutStillEstablishing(status: RingOutStatusSnapshot) {
  const values = readRingOutStatusValues(status);
  if (values.some(isRingOutLegActive)) {
    return true;
  }

  return status.callerStatus === "Success" && !isRingOutLegFailure(status.calleeStatus ?? "");
}

function getCalleeFailureMessage(calleeStatus: string, status: RingOutStatusSnapshot) {
  if (calleeStatus === "Busy") {
    return `Destination line is busy.${describeRingOutStatus(status)}`;
  }

  if (calleeStatus === "NoAnswer") {
    return `Destination did not answer.${describeRingOutStatus(status)}`;
  }

  if (calleeStatus === "Rejected") {
    return `Destination rejected or canceled the call.${describeRingOutStatus(status)}`;
  }

  if (calleeStatus === "InternationalDisabled") {
    return `RingCentral blocked this destination because calling is disabled for that number type.${describeRingOutStatus(status)}`;
  }

  return `RingCentral could not reach the destination.${describeRingOutStatus(status)}`;
}

export function getRingOutProgressState(status: RingOutStatusSnapshot): RingOutProgressState {
  if (isRingOutConnected(status)) {
    return {
      state: "connected",
      message: null,
      advanceQueue: false,
      failureType: null,
    };
  }

  const callerStatus = status.callerStatus ?? "";
  const calleeStatus = status.calleeStatus ?? "";
  const callStatus = status.callStatus ?? "";
  if (isRingOutStillEstablishing(status) && !isRingOutLegFailure(callerStatus) && !isRingOutLegFailure(calleeStatus)) {
    return {
      state: "ringing",
      message: null,
      advanceQueue: false,
      failureType: null,
    };
  }

  if (isRingOutLegFailure(callerStatus)) {
    return {
      state: "failed",
      message: `RingCentral could not reach the RingOut device or forwarding target.${describeRingOutStatus(status)}`,
      advanceQueue: false,
      failureType: "caller",
    };
  }

  if (isRingOutLegFailure(calleeStatus)) {
    return {
      state: "failed",
      message: getCalleeFailureMessage(calleeStatus, status),
      advanceQueue: true,
      failureType: "callee",
    };
  }

  if ([callerStatus, calleeStatus, callStatus].some((value) => value === "Finished")) {
    return {
      state: "finished",
      message: `RingCentral ended the call before the callee connected.${describeRingOutStatus(status)}`,
      advanceQueue: false,
      failureType: "finished",
    };
  }

  if (isRingOutLegFailure(callStatus)) {
    return {
      state: "failed",
      message: `RingCentral could not start the RingOut call. Check the RingOut device or forwarding target in RingCentral.${describeRingOutStatus(status)}`,
      advanceQueue: false,
      failureType: "call",
    };
  }

  return {
    state: "ringing",
    message: null,
    advanceQueue: false,
    failureType: null,
  };
}
