import { jsonResponse, optionsResponse } from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUser } from "../_shared/supabase.ts";
import {
  buildRingOutRequestPayload,
  createRingCentralRequestError,
  formatRingCentralPhoneNumber,
  isRingCentralOutboundNumber,
  retryRingCentralRequestAfterRefresh,
  RINGCENTRAL_TELEPHONY_SESSION_FILTER,
  type RingCentralPhoneNumber,
  type RingOutRequestPayload,
} from "../_shared/ringcentral.ts";

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

interface RingCentralIntegrationRow {
  app_user_id: string;
  account_id: string | null;
  extension_id: string | null;
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string | null;
  access_token_expires_at: string;
  refresh_token_expires_at: string | null;
  selected_caller_id: string | null;
  subscription_id: string | null;
  subscription_expires_at: string | null;
  webhook_validation_token: string | null;
  last_inbound_event_at: string | null;
  active_telephony_session_id: string | null;
  active_telephony_party_id: string | null;
  active_telephony_direction: string | null;
  active_telephony_status_code: string | null;
  active_telephony_updated_at: string | null;
  connected_at: string;
  updated_at: string;
}

interface RingCentralTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_token_expires_in?: number;
  scope?: string;
  owner_id?: string;
}

interface RingCentralAccountResponse {
  id?: string | number;
  mainNumber?: string | null;
  operator?: {
    id?: string | number;
    extensionNumber?: string | null;
  };
}

interface RingCentralExtensionResponse {
  id?: string | number;
  extensionNumber?: string | null;
}

interface RingCentralSubscriptionResponse {
  id?: string;
  subscriptionId?: string;
  expirationTime?: string;
  expiryTime?: string;
}

interface RingCentralStatus {
  connected: boolean;
  accountId: string | null;
  extensionId: string | null;
  selectedRingOutNumber: string | null;
  availableRingOutNumbers: RingCentralPhoneNumber[];
  connectedAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  message: string | null;
  activeTelephonySessionId: string | null;
  activeTelephonyPartyId: string | null;
  activeTelephonyDirection: string | null;
  activeTelephonyStatusCode: string | null;
  activeTelephonyUpdatedAt: string | null;
}

interface RingCentralSipProvisionProxyRecord {
  proxy?: string;
  proxyTLS?: string;
}

interface RingCentralSipProvisionInfoRecord {
  domain?: string;
  sipDomain?: string;
  outboundProxy?: string;
  outboundProxyBackup?: string;
  outboundProxies?: RingCentralSipProvisionProxyRecord[];
  username?: string;
  userName?: string;
  password?: string;
  authorizationId?: string;
}

interface RingCentralSipProvisionResponse {
  sipInfo?: RingCentralSipProvisionInfoRecord[];
  device?: {
    id?: string | number | null;
  } | null;
}

interface RingCentralBrowserVoiceSession {
  provider: "ringcentral";
  available: boolean;
  source: "profile" | "environment" | "ringcentral" | "unconfigured";
  callerId: string | null;
  websocketUrl: string | null;
  sipDomain: string | null;
  username: string | null;
  profileId: string | null;
  profileLabel: string | null;
  authorizationId: string | null;
  sipUri: string | null;
  authorizationUsername: string | null;
  authorizationPassword: string | null;
  dialPrefix: string | null;
  displayName: string | null;
  message: string | null;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
const ringCentralServerUrl = Deno.env.get("RINGCENTRAL_SERVER_URL")?.trim() || "https://platform.ringcentral.com";
const ringCentralClientId = Deno.env.get("RINGCENTRAL_CLIENT_ID")?.trim() || "";
const ringCentralClientSecret = Deno.env.get("RINGCENTRAL_CLIENT_SECRET")?.trim() || "";
const ringCentralUserJwt = Deno.env.get("RINGCENTRAL_USER_JWT")?.trim() || "";

function normalizeNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

function readDestinationNumber(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { phoneNumber?: unknown }).phoneNumber === "string"
  ) {
    return (value as { phoneNumber: string }).phoneNumber.trim();
  }

  return "";
}

function normalizeIdentifier(value: string | number | null | undefined) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function requireRingCentralClientId() {
  if (!ringCentralClientId) {
    throw new Error("Missing RingCentral client id.");
  }

  return ringCentralClientId;
}

function requireRingCentralUserJwt() {
  if (!ringCentralUserJwt) {
    throw new Error("Missing RingCentral JWT credential.");
  }

  return ringCentralUserJwt;
}

function requireSupabaseUrl() {
  if (!supabaseUrl) {
    throw new Error("Missing Supabase URL.");
  }

  return supabaseUrl;
}

function buildRingCentralWebhookUrl() {
  return new URL("/functions/v1/ringcentral-webhook", requireSupabaseUrl()).toString();
}

function buildRingCentralWebhookValidationToken() {
  return crypto.randomUUID();
}

function buildEmptyStatus(message = null): RingCentralStatus {
  return {
    connected: false,
    accountId: null,
    extensionId: null,
    selectedRingOutNumber: null,
    availableRingOutNumbers: [],
    connectedAt: null,
    updatedAt: null,
    expiresAt: null,
    message,
    activeTelephonySessionId: null,
    activeTelephonyPartyId: null,
    activeTelephonyDirection: null,
    activeTelephonyStatusCode: null,
    activeTelephonyUpdatedAt: null,
  };
}

function buildUnavailableBrowserVoiceSession(
  message: string,
  source: RingCentralBrowserVoiceSession["source"] = "unconfigured",
): RingCentralBrowserVoiceSession {
  return {
    provider: "ringcentral",
    available: false,
    source,
    callerId: null,
    websocketUrl: null,
    sipDomain: null,
    username: null,
    profileId: null,
    profileLabel: null,
    authorizationId: null,
    sipUri: null,
    authorizationUsername: null,
    authorizationPassword: null,
    dialPrefix: null,
    displayName: null,
    message,
  };
}

function getRingCentralApiUrl(path: string) {
  return new URL(path, ringCentralServerUrl).toString();
}

function normalizeWssUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/^wss?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `wss://${trimmed}`;
}

function readOutboundProxy(record: RingCentralSipProvisionInfoRecord) {
  const direct = readText(record.outboundProxy);
  if (direct) {
    return direct;
  }

  for (const proxy of record.outboundProxies ?? []) {
    const proxyTls = readText(proxy.proxyTLS);
    if (proxyTls) {
      return proxyTls;
    }

    const proxyPlain = readText(proxy.proxy);
    if (proxyPlain) {
      return proxyPlain;
    }
  }

  return "";
}

function readOutboundProxyBackup(record: RingCentralSipProvisionInfoRecord, primaryProxy: string) {
  const direct = readText(record.outboundProxyBackup);
  if (direct) {
    return direct;
  }

  const proxies = record.outboundProxies ?? [];
  let primaryMatched = false;
  for (const proxy of proxies) {
    const candidate = readText(proxy.proxyTLS) || readText(proxy.proxy);
    if (!candidate) {
      continue;
    }

    if (!primaryMatched && candidate === primaryProxy) {
      primaryMatched = true;
      continue;
    }

    if (candidate !== primaryProxy) {
      return candidate;
    }
  }

  return primaryProxy;
}

function buildBrowserVoiceSession(
  data: RingCentralSipProvisionResponse,
  workspaceUser: AppUserRow,
  selectedCallerId: string | null,
): RingCentralBrowserVoiceSession {
  const sipInfo = data.sipInfo?.[0] ?? null;
  if (!sipInfo) {
    return buildUnavailableBrowserVoiceSession("RingCentral browser calling is not ready.", "ringcentral");
  }

  const domain = readText(sipInfo.domain) || readText(sipInfo.sipDomain);
  const username = readText(sipInfo.username) || readText(sipInfo.userName);
  const password = readText(sipInfo.password);
  const authorizationId = readText(sipInfo.authorizationId) || username || readText(data.device?.id);
  const outboundProxy = readOutboundProxy(sipInfo);
  const outboundProxyBackup = readOutboundProxyBackup(sipInfo, outboundProxy);
  const websocketUrl = normalizeWssUrl(outboundProxy || outboundProxyBackup);
  const displayName = workspaceUser.full_name.trim();
  const callerId = normalizeNumber(selectedCallerId ?? "");
  const available = Boolean(
    websocketUrl &&
    domain &&
    username &&
    password &&
    authorizationId &&
    displayName,
  );

  if (!available) {
    return {
      ...buildUnavailableBrowserVoiceSession(
        "RingCentral browser calling is not ready.",
        "ringcentral",
      ),
      callerId: callerId || null,
      displayName,
      authorizationId: authorizationId || null,
      username: username || null,
      sipDomain: domain || null,
      websocketUrl: websocketUrl || null,
      authorizationUsername: username || null,
      authorizationPassword: password || null,
      sipUri: username && domain ? `sip:${username}@${domain}` : null,
    };
  }

  return {
    provider: "ringcentral",
    available: true,
    source: "ringcentral",
    callerId: callerId || null,
    websocketUrl,
    sipDomain: domain,
    username,
    profileId: null,
    profileLabel: null,
    authorizationId,
    sipUri: `sip:${username}@${domain}`,
    authorizationUsername: username,
    authorizationPassword: password,
    dialPrefix: null,
    displayName,
    message: null,
  };
}

async function requireWorkspaceUser(request: Request) {
  const currentUser = await getAuthenticatedUser(request);
  if (!currentUser) {
    throw Object.assign(new Error("Missing authentication."), { status: 401 });
  }

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("app_users")
    .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
    .eq("auth_user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  if (!data) {
    throw Object.assign(new Error("Workspace profile not found."), { status: 404 });
  }

  return {
    currentUser,
    workspaceUser: data as AppUserRow,
    serviceClient,
  };
}

async function fetchRingCentralToken(body: Record<string, string>) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (ringCentralClientSecret) {
    headers.Authorization = `Basic ${btoa(`${requireRingCentralClientId()}:${ringCentralClientSecret}`)}`;
  }

  const response = await fetch(getRingCentralApiUrl("/restapi/oauth/token"), {
    method: "POST",
    headers,
    body: new URLSearchParams({
      client_id: requireRingCentralClientId(),
      ...body,
    }).toString(),
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as Partial<RingCentralTokenResponse> & { error_description?: string }) : {};

  if (!response.ok) {
    throw Object.assign(
      new Error(data.error_description || `RingCentral token request failed (${response.status}).`),
      { status: response.status },
    );
  }

  if (!data.access_token || !data.refresh_token || !data.expires_in || !data.token_type) {
    throw new Error("RingCentral token response was incomplete.");
  }

  return data as RingCentralTokenResponse;
}

async function fetchRingCentralAccountInfo(accessToken: string) {
  const [accountResponse, extensionResponse] = await Promise.all([
    fetch(getRingCentralApiUrl("/restapi/v1.0/account/~"), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    }),
    fetch(getRingCentralApiUrl("/restapi/v1.0/account/~/extension/~"), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    }),
  ]);

  const accountText = await accountResponse.text();
  const accountData = accountText
    ? (JSON.parse(accountText) as RingCentralAccountResponse & {
      message?: string;
      error_description?: string;
      errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
    })
    : {};

  if (!accountResponse.ok) {
    throw createRingCentralRequestError(
      accountResponse.status,
      accountData,
      `RingCentral account lookup failed (${accountResponse.status}).`,
    );
  }

  const extensionText = await extensionResponse.text();
  const extensionData = extensionText
    ? (JSON.parse(extensionText) as RingCentralExtensionResponse & {
      message?: string;
      error_description?: string;
      errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
    })
    : {};

  if (!extensionResponse.ok) {
    throw createRingCentralRequestError(
      extensionResponse.status,
      extensionData,
      `RingCentral extension lookup failed (${extensionResponse.status}).`,
    );
  }

  return {
    accountId: normalizeIdentifier(accountData.id),
    mainNumber: typeof accountData.mainNumber === "string" ? accountData.mainNumber.trim() : null,
    extensionId: normalizeIdentifier(extensionData.id) ?? normalizeIdentifier(accountData.operator?.id) ?? null,
    extensionNumber: typeof extensionData.extensionNumber === "string" && extensionData.extensionNumber.trim()
      ? extensionData.extensionNumber.trim()
      : typeof accountData.operator?.extensionNumber === "string" && accountData.operator.extensionNumber.trim()
        ? accountData.operator.extensionNumber.trim()
    : null,
  };
}

async function fetchRingCentralSipProvision(
  accessToken: string,
  refreshAccessToken?: () => Promise<string>,
) {
  const request = async (token: string) => {
    const response = await fetch(getRingCentralApiUrl("/restapi/v1.0/client-info/sip-provision"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sipInfo: [{ transport: "WSS" }],
      }),
    });

    const text = await response.text();
    const data = text ? (JSON.parse(text) as RingCentralSipProvisionResponse & {
      message?: string;
      error_description?: string;
      errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
    }) : {};

    if (!response.ok) {
      throw createRingCentralRequestError(
        response.status,
        data,
        `RingCentral SIP provisioning failed (${response.status}).`,
      );
    }

    return data as RingCentralSipProvisionResponse;
  };

  if (!refreshAccessToken) {
    return await request(accessToken);
  }

  return await retryRingCentralRequestAfterRefresh({
    accessToken,
    refreshAccessToken,
    request,
  });
}

function buildRingOutExtensionTarget(mainNumber: string | null, extensionNumber: string | null) {
  const normalizedMainNumber = mainNumber ? normalizeNumber(mainNumber) : "";
  const normalizedExtensionNumber = extensionNumber?.trim() ?? "";
  if (!normalizedMainNumber || !normalizedExtensionNumber) {
    return "";
  }

  return `+${normalizedMainNumber}*${normalizedExtensionNumber}`;
}

function buildRingOutCallbackTargets(input: {
  mainNumber: string | null;
  extensionNumbers: string[];
}) {
  const normalizedMainNumber = input.mainNumber ? normalizeNumber(input.mainNumber) : "";
  if (!normalizedMainNumber) {
    return [];
  }

  const targets = new Map<string, string>();
  for (const extensionNumber of input.extensionNumbers) {
    const normalizedExtensionNumber = extensionNumber.trim();
    if (!normalizedExtensionNumber) {
      continue;
    }

    const target = buildRingOutExtensionTarget(normalizedMainNumber, normalizedExtensionNumber);
    if (target) {
      targets.set(target, target);
    }
  }

  return [...targets.values()];
}

function selectPreferredCallerIdNumber(
  numbers: RingCentralPhoneNumber[],
  preferredPhoneNumber: string | null,
) {
  const eligibleNumbers = numbers.filter(isRingCentralOutboundNumber);
  if (!eligibleNumbers.length) {
    return null;
  }

  const normalizedPreferred = preferredPhoneNumber ? normalizeNumber(preferredPhoneNumber) : "";
  if (normalizedPreferred) {
    const preferredMatch = eligibleNumbers.find((number) => normalizeNumber(number.phoneNumber) === normalizedPreferred);
    if (preferredMatch) {
      return normalizeNumber(preferredMatch.phoneNumber);
    }
  }

  const rankedMatches = [
    eligibleNumbers.find((number) => number.usageType === "DirectNumber" && number.type !== "FaxOnly"),
    eligibleNumbers.find((number) => number.usageType === "DirectNumber"),
    eligibleNumbers.find((number) => (number.features ?? []).includes("CallerId") && number.type !== "FaxOnly"),
    eligibleNumbers[0],
  ];

  for (const match of rankedMatches) {
    if (match?.phoneNumber) {
      return normalizeNumber(match.phoneNumber);
    }
  }

  return null;
}

function isRetryableRingOutCallerLegFailure(data: Record<string, unknown>) {
  const ringOutStatus = data.status && typeof data.status === "object"
    ? (data.status as Record<string, unknown>)
    : null;
  if (!ringOutStatus) {
    return false;
  }

  const overallStatus = typeof ringOutStatus.status === "string" ? ringOutStatus.status : "";
  const callStatus = typeof ringOutStatus.callStatus === "string" ? ringOutStatus.callStatus : "";
  const callerStatus = typeof ringOutStatus.callerStatus === "string" ? ringOutStatus.callerStatus : "";
  const calleeStatus = typeof ringOutStatus.calleeStatus === "string" ? ringOutStatus.calleeStatus : "";

  return (
    overallStatus === "Error" &&
    (callStatus === "Error" || callStatus === "CannotReach") &&
    (callerStatus === "GenericError" || callerStatus === "CannotReach" || callerStatus === "Error") &&
    calleeStatus === "InProgress"
  );
}

async function fetchRingCentralCallerIdNumbers(
  accessToken: string,
  refreshAccessToken?: () => Promise<string>,
) {
  const request = async (token: string) => {
    const numbers = await fetchRingCentralOwnedPhoneNumbers(token);
    return numbers.filter(isRingCentralOutboundNumber);
  };

  if (!refreshAccessToken) {
    return await request(accessToken);
  }

  return await retryRingCentralRequestAfterRefresh({
    accessToken,
    refreshAccessToken,
    request,
  });
}

async function fetchRingCentralUserExtensionNumbers(
  accessToken: string,
  selfExtensionNumber: string | null,
  refreshAccessToken?: () => Promise<string>,
) {
  const request = async (token: string) => {
    const response = await fetch(getRingCentralApiUrl("/restapi/v1.0/account/~/extension?page=1&perPage=100"), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const text = await response.text();
    const data = text
      ? (JSON.parse(text) as {
        records?: Array<{
          type?: string | null;
          status?: string | null;
          extensionNumber?: string | null;
        }>;
        message?: string;
        error_description?: string;
        errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
      })
      : {};

    if (!response.ok) {
      throw createRingCentralRequestError(
        response.status,
        data,
        `RingCentral extension lookup failed (${response.status}).`,
      );
    }

    const allUserExtensions = (data.records ?? [])
      .filter((record) => record.type === "User" && record.status === "Enabled")
      .map((record) => record.extensionNumber?.trim() ?? "")
      .filter((extensionNumber) => extensionNumber.length > 0);

    const selfExtension = selfExtensionNumber?.trim() ?? "";
    const alternateExtensions = allUserExtensions
      .filter((extensionNumber) => extensionNumber !== selfExtension)
      .sort((left, right) => Number(right) - Number(left));
    const orderedExtensions = selfExtension
      ? [...alternateExtensions, selfExtension]
      : alternateExtensions;

    return [...new Set(orderedExtensions)];
  };

  if (!refreshAccessToken) {
    return await request(accessToken);
  }

  return await retryRingCentralRequestAfterRefresh({
    accessToken,
    refreshAccessToken,
    request,
  });
}

function mergeRingCentralPhoneNumbers(
  numbersByKey: Map<string, RingCentralPhoneNumber>,
  candidates: RingCentralPhoneNumber[],
) {
  for (const candidate of candidates) {
    const phoneNumber = normalizeNumber(candidate.phoneNumber);
    if (!phoneNumber) {
      continue;
    }

    const existing = numbersByKey.get(phoneNumber);
    const features = new Set([...(existing?.features ?? []), ...(candidate.features ?? [])]);
    numbersByKey.set(phoneNumber, {
      phoneNumber,
      usageType: candidate.usageType ?? existing?.usageType ?? null,
      type: candidate.type ?? existing?.type ?? null,
      features: [...features],
      enabled: candidate.enabled ?? existing?.enabled,
      label:
        candidate.label ??
        existing?.label ??
        `${formatRingCentralPhoneNumber(phoneNumber)}${candidate.usageType ? ` - ${candidate.usageType}` : ""}`,
    });
  }
}

function collectRingCentralPhoneNumbersFromValue(
  value: unknown,
  numbersByKey: Map<string, RingCentralPhoneNumber>,
  parentEnabled = true,
) {
  if (!value) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectRingCentralPhoneNumbersFromValue(item, numbersByKey, parentEnabled));
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  const enabled = parentEnabled && (typeof record.enabled === "boolean" ? record.enabled : true);
  const label =
    typeof record.label === "string" && record.label.trim()
      ? record.label.trim()
      : typeof record.name === "string" && record.name.trim()
        ? record.name.trim()
        : undefined;
  const features = Array.isArray(record.features)
    ? record.features.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const type = typeof record.type === "string" ? record.type : null;
  const usageType = typeof record.usageType === "string" ? record.usageType : null;

  const directPhoneNumber = typeof record.phoneNumber === "string" ? normalizeNumber(record.phoneNumber) : "";
  if (directPhoneNumber) {
    mergeRingCentralPhoneNumbers(numbersByKey, [{
      phoneNumber: directPhoneNumber,
      usageType,
      type,
      features,
      enabled,
      label,
    }]);
  }

  const destination = record.destination && typeof record.destination === "object"
    ? (record.destination as Record<string, unknown>)
    : null;
  const destinationPhoneNumber = destination && typeof destination.phoneNumber === "string"
    ? normalizeNumber(destination.phoneNumber)
    : "";
  if (destinationPhoneNumber) {
    mergeRingCentralPhoneNumbers(numbersByKey, [{
      phoneNumber: destinationPhoneNumber,
      usageType: usageType ?? "ForwardedNumber",
      type: type ?? "Other",
      features: features.length ? features : ["CallForwarding"],
      enabled,
      label,
    }]);
  }

  const device = record.device && typeof record.device === "object"
    ? (record.device as Record<string, unknown>)
    : null;
  const devicePhoneNumber = device && typeof device.phoneNumber === "string"
    ? normalizeNumber(device.phoneNumber)
    : "";
  if (devicePhoneNumber) {
    mergeRingCentralPhoneNumbers(numbersByKey, [{
      phoneNumber: devicePhoneNumber,
      usageType: usageType ?? "ForwardedNumber",
      type: type ?? "PhoneLine",
      features: features.length ? features : ["CallForwarding", "CallFlip"],
      enabled,
      label,
    }]);
  }

  if (Array.isArray(record.records)) {
    record.records.forEach((item) => collectRingCentralPhoneNumbersFromValue(item, numbersByKey, enabled));
  }

  if (Array.isArray(record.items)) {
    record.items.forEach((item) => collectRingCentralPhoneNumbersFromValue(item, numbersByKey, enabled));
  }

  if (Array.isArray(record.targets)) {
    record.targets.forEach((item) => collectRingCentralPhoneNumbersFromValue(item, numbersByKey, enabled));
  }

  if (Array.isArray(record.actions)) {
    record.actions.forEach((item) => collectRingCentralPhoneNumbersFromValue(item, numbersByKey, enabled));
  }

  if (record.dispatching && typeof record.dispatching === "object") {
    collectRingCentralPhoneNumbersFromValue(record.dispatching, numbersByKey, enabled);
  }
}

async function fetchRingCentralOwnedPhoneNumbers(accessToken: string) {
  const requests = [
    "/restapi/v1.0/account/~/extension/~/phone-number?page=1&perPage=100",
    "/restapi/v1.0/account/~/phone-number?page=1&perPage=100",
  ].map(async (path) => {
    const response = await fetch(getRingCentralApiUrl(path), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) as unknown : {};

    if (!response.ok) {
      throw createRingCentralRequestError(
        response.status,
        data,
        `RingCentral phone number lookup failed (${response.status}).`,
      );
    }

    const numbersByKey = new Map<string, RingCentralPhoneNumber>();
    collectRingCentralPhoneNumbersFromValue(data, numbersByKey);
    return [...numbersByKey.values()];
  });

  const results = await Promise.allSettled(requests);
  const numbersByKey = new Map<string, RingCentralPhoneNumber>();

  for (const result of results) {
    if (result.status === "fulfilled") {
      mergeRingCentralPhoneNumbers(numbersByKey, result.value);
    }
  }

  if (results.some((result) => result.status === "fulfilled")) {
    return [...numbersByKey.values()];
  }

  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason)
    .filter((reason): reason is Error => reason instanceof Error);

  if (errors.length > 0) {
    throw errors[0];
  }

  return [];
}

async function fetchRingCentralForwardingNumbers(
  accessToken: string,
  refreshAccessToken?: () => Promise<string>,
) {
  const request = async (token: string) => {
    const fetchLegacyForwardingNumbers = async () => {
      const response = await fetch(
        getRingCentralApiUrl("/restapi/v1.0/account/~/extension/~/forwarding-number?page=1&perPage=100"),
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const text = await response.text();
      let data: unknown = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }

      if (!response.ok) {
        throw createRingCentralRequestError(
          response.status,
          data,
          `RingCentral forwarding number lookup failed (${response.status}).`,
        );
      }

      const numbersByKey = new Map<string, RingCentralPhoneNumber>();
      const addLegacyNumbers = (candidate: Partial<RingCentralPhoneNumber> & { phoneNumber?: string | null }) => {
        const phoneNumber = typeof candidate.phoneNumber === "string" ? normalizeNumber(candidate.phoneNumber) : "";
        if (!phoneNumber) {
          return;
        }

        const existing = numbersByKey.get(phoneNumber);
        const features = new Set([...(existing?.features ?? []), ...(candidate.features ?? [])]);
        numbersByKey.set(phoneNumber, {
          phoneNumber,
          usageType: candidate.usageType ?? existing?.usageType ?? null,
          type: candidate.type ?? existing?.type ?? null,
          features: [...features],
          enabled: candidate.enabled ?? existing?.enabled,
          label:
            candidate.label ??
            existing?.label ??
            `${formatRingCentralPhoneNumber(phoneNumber)}${candidate.usageType ? ` - ${candidate.usageType}` : ""}`,
        });
      };

      const collectLegacyFromValue = (value: unknown) => {
        if (!value) {
          return;
        }

        if (Array.isArray(value)) {
          value.forEach(collectLegacyFromValue);
          return;
        }

        if (typeof value !== "object") {
          return;
        }

        const record = value as Record<string, unknown>;
        const directPhoneNumber = typeof record.phoneNumber === "string" ? record.phoneNumber : "";
        if (directPhoneNumber) {
          addLegacyNumbers({
            phoneNumber: directPhoneNumber,
            usageType: typeof record.usageType === "string" ? record.usageType : null,
            type: typeof record.type === "string" ? record.type : null,
            features: Array.isArray(record.features)
              ? record.features.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
              : [],
            enabled: typeof record.enabled === "boolean" ? record.enabled : undefined,
            label: typeof record.label === "string" ? record.label.trim() : undefined,
          });
        }

        if (Array.isArray(record.records)) {
          record.records.forEach(collectLegacyFromValue);
        }

        if (Array.isArray(record.items)) {
          record.items.forEach(collectLegacyFromValue);
        }
      };

      collectLegacyFromValue(data);
      return [...numbersByKey.values()];
    };

    const fetchForwardingTargets = async () => {
      const response = await fetch(
        getRingCentralApiUrl("/restapi/v2/accounts/~/extensions/~/comm-handling/voice/forwarding-targets"),
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const text = await response.text();
      const data = text
        ? (JSON.parse(text) as unknown)
        : {};

      if (!response.ok) {
        throw createRingCentralRequestError(
          response.status,
          data,
          `RingCentral forwarding target lookup failed (${response.status}).`,
        );
      }

      const numbersByKey = new Map<string, RingCentralPhoneNumber>();
      collectRingCentralPhoneNumbersFromValue(data, numbersByKey);
      return [...numbersByKey.values()];
    };

    const [forwardingTargetsResult, legacyNumbersResult, ownedPhoneNumbersResult] = await Promise.allSettled([
      fetchForwardingTargets(),
      fetchLegacyForwardingNumbers(),
      fetchRingCentralOwnedPhoneNumbers(token),
    ]);

    const numbersByKey = new Map<string, RingCentralPhoneNumber>();
    const mergeResult = (result: PromiseSettledResult<RingCentralPhoneNumber[]>) => {
      if (result.status === "fulfilled") {
        mergeRingCentralPhoneNumbers(numbersByKey, result.value);
      }
    };

    mergeResult(forwardingTargetsResult);
    mergeResult(legacyNumbersResult);
    mergeResult(ownedPhoneNumbersResult);

    if (
      forwardingTargetsResult.status === "fulfilled" ||
      legacyNumbersResult.status === "fulfilled" ||
      ownedPhoneNumbersResult.status === "fulfilled"
    ) {
      return [...numbersByKey.values()];
    }

    const errors = [forwardingTargetsResult, legacyNumbersResult, ownedPhoneNumbersResult]
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason)
      .filter((reason): reason is Error => reason instanceof Error);

    if (errors.length > 0) {
      throw errors[0];
    }

    return [];
  };

  if (!refreshAccessToken) {
    return await request(accessToken);
  }

  return await retryRingCentralRequestAfterRefresh({
    accessToken,
    refreshAccessToken,
    request,
  });
}

async function loadIntegration(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
) {
  const { data, error } = await serviceClient
    .from("ringcentral_integrations")
    .select(
      "app_user_id, account_id, extension_id, access_token, refresh_token, token_type, scope, access_token_expires_at, refresh_token_expires_at, selected_caller_id, subscription_id, subscription_expires_at, webhook_validation_token, last_inbound_event_at, active_telephony_session_id, active_telephony_party_id, active_telephony_direction, active_telephony_status_code, active_telephony_updated_at, connected_at, updated_at",
    )
    .eq("app_user_id", workspaceUserId)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  return (data as RingCentralIntegrationRow | null) ?? null;
}

async function saveIntegration(
  serviceClient: ReturnType<typeof createServiceClient>,
  row: Partial<RingCentralIntegrationRow> & { app_user_id: string },
) {
  const payload = {
    app_user_id: row.app_user_id,
    account_id: row.account_id ?? null,
    extension_id: row.extension_id ?? null,
    access_token: row.access_token ?? "",
    refresh_token: row.refresh_token ?? "",
    token_type: row.token_type ?? "Bearer",
    scope: row.scope ?? null,
    access_token_expires_at: row.access_token_expires_at ?? new Date().toISOString(),
    refresh_token_expires_at: row.refresh_token_expires_at ?? null,
    selected_caller_id: row.selected_caller_id ?? null,
    subscription_id: row.subscription_id ?? null,
    subscription_expires_at: row.subscription_expires_at ?? null,
    webhook_validation_token: row.webhook_validation_token ?? null,
    last_inbound_event_at: row.last_inbound_event_at ?? null,
    active_telephony_session_id: row.active_telephony_session_id ?? null,
    active_telephony_party_id: row.active_telephony_party_id ?? null,
    active_telephony_direction: row.active_telephony_direction ?? null,
    active_telephony_status_code: row.active_telephony_status_code ?? null,
    active_telephony_updated_at: row.active_telephony_updated_at ?? null,
    connected_at: row.connected_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await serviceClient.from("ringcentral_integrations").upsert(payload);
  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }
}

async function refreshIntegration(
  serviceClient: ReturnType<typeof createServiceClient>,
  row: RingCentralIntegrationRow,
) {
  const refreshed = await fetchRingCentralToken({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });

  const latestRow = await loadIntegration(serviceClient, row.app_user_id);
  const baseRow = latestRow ?? row;
  const updatedRow: RingCentralIntegrationRow = {
    ...baseRow,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? baseRow.refresh_token,
    token_type: refreshed.token_type ?? baseRow.token_type,
    scope: refreshed.scope ?? baseRow.scope,
    access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    refresh_token_expires_at: refreshed.refresh_token_expires_in
      ? new Date(Date.now() + refreshed.refresh_token_expires_in * 1000).toISOString()
      : baseRow.refresh_token_expires_at,
    updated_at: new Date().toISOString(),
  };

  await saveIntegration(serviceClient, updatedRow);
  return updatedRow;
}

async function saveIntegrationFromToken(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
  token: RingCentralTokenResponse,
) {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  const refreshTokenExpiresAt = token.refresh_token_expires_in
    ? new Date(Date.now() + token.refresh_token_expires_in * 1000).toISOString()
    : null;

  const [ringOutNumbersResult, accountInfoResult] = await Promise.allSettled([
    fetchRingCentralCallerIdNumbers(token.access_token),
    fetchRingCentralAccountInfo(token.access_token),
  ]);

  const ringOutNumbers =
    ringOutNumbersResult.status === "fulfilled" ? ringOutNumbersResult.value : ([] as RingCentralPhoneNumber[]);
  const accountInfo = accountInfoResult.status === "fulfilled" ? accountInfoResult.value : null;

  await saveIntegration(serviceClient, {
    app_user_id: workspaceUserId,
    account_id: accountInfo?.accountId ?? null,
    extension_id: accountInfo?.extensionId ?? token.owner_id ?? null,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type ?? "Bearer",
    scope: token.scope ?? null,
    access_token_expires_at: expiresAt,
    refresh_token_expires_at: refreshTokenExpiresAt,
    selected_caller_id: null,
    connected_at: new Date().toISOString(),
    active_telephony_session_id: null,
    active_telephony_party_id: null,
    active_telephony_direction: null,
    active_telephony_status_code: null,
    active_telephony_updated_at: null,
  });

  return buildIntegrationStatus(serviceClient, workspaceUserId);
}

function parseRingCentralSubscriptionResponse(data: Record<string, unknown>) {
  const id =
    typeof data.id === "string" && data.id.trim()
      ? data.id.trim()
      : typeof data.subscriptionId === "string" && data.subscriptionId.trim()
        ? data.subscriptionId.trim()
        : "";
  const expirationTime =
    typeof data.expirationTime === "string" && data.expirationTime.trim()
      ? data.expirationTime.trim()
      : typeof data.expiryTime === "string" && data.expiryTime.trim()
        ? data.expiryTime.trim()
        : "";

  return { id, expirationTime };
}

async function requestRingCentralSubscription(
  accessToken: string,
  subscriptionId: string | null,
  validationToken: string,
  refreshAccessToken?: () => Promise<string>,
) {
  const request = async (token: string) => {
    const body = JSON.stringify({
      eventFilters: [RINGCENTRAL_TELEPHONY_SESSION_FILTER],
      deliveryMode: {
        transportType: "WebHook",
        address: buildRingCentralWebhookUrl(),
        validationToken,
      },
    });

    let response = await fetch(
      subscriptionId
        ? getRingCentralApiUrl(`/restapi/v1.0/subscription/${encodeURIComponent(subscriptionId)}`)
        : getRingCentralApiUrl("/restapi/v1.0/subscription"),
      {
        method: subscriptionId ? "PUT" : "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
      },
    );

    let text = await response.text();
    let data = text
      ? (JSON.parse(text) as Record<string, unknown> & {
        message?: string;
        error_description?: string;
        errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
      })
      : {};

    if (!response.ok && response.status === 404 && subscriptionId) {
      response = await fetch(getRingCentralApiUrl("/restapi/v1.0/subscription"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
      });

      text = await response.text();
      data = text
        ? (JSON.parse(text) as Record<string, unknown> & {
          message?: string;
          error_description?: string;
          errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
        })
        : {};
    }

    if (!response.ok) {
      throw createRingCentralRequestError(
        response.status,
        data,
        `RingCentral subscription request failed (${response.status}).`,
      );
    }

    const parsed = parseRingCentralSubscriptionResponse(data);
    if (!parsed.id || !parsed.expirationTime) {
      throw new Error("RingCentral subscription response was incomplete.");
    }

    return parsed;
  };

  if (!refreshAccessToken) {
    return await request(accessToken);
  }

  return await retryRingCentralRequestAfterRefresh({
    accessToken,
    refreshAccessToken,
    request,
  });
}

async function deleteRingCentralWebhookSubscription(accessToken: string, subscriptionId: string) {
  const response = await fetch(
    getRingCentralApiUrl(`/restapi/v1.0/subscription/${encodeURIComponent(subscriptionId)}`),
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    const data = text
      ? (JSON.parse(text) as Record<string, unknown> & {
        message?: string;
        error_description?: string;
        errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
      })
      : {};
    throw createRingCentralRequestError(
      response.status,
      data,
      `RingCentral subscription delete failed (${response.status}).`,
    );
  }
}

async function ensureRingCentralWebhookSubscription(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
  accessToken: string,
  refreshAccessToken?: () => Promise<string>,
) {
  const integration = await loadIntegration(serviceClient, workspaceUserId);
  if (!integration) {
    throw new Error("RingCentral is not connected.");
  }

  const validationToken = integration.webhook_validation_token || buildRingCentralWebhookValidationToken();
  if (validationToken !== integration.webhook_validation_token) {
    await saveIntegration(serviceClient, {
      ...integration,
      webhook_validation_token: validationToken,
    });
  }

  const subscription = await requestRingCentralSubscription(
    accessToken,
    integration.subscription_id,
    validationToken,
    refreshAccessToken,
  );
  const updatedIntegration: RingCentralIntegrationRow = {
    ...integration,
    subscription_id: subscription.id,
    subscription_expires_at: subscription.expirationTime,
    webhook_validation_token: validationToken,
    updated_at: new Date().toISOString(),
  };

  await saveIntegration(serviceClient, updatedIntegration);
  return updatedIntegration;
}

async function deleteIntegration(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
) {
  const { error } = await serviceClient.from("ringcentral_integrations").delete().eq("app_user_id", workspaceUserId);
  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }
}

function isAccessTokenExpired(row: RingCentralIntegrationRow) {
  const expiry = new Date(row.access_token_expires_at).getTime();
  return Number.isFinite(expiry) ? expiry <= Date.now() + 60_000 : true;
}

function isWebhookSubscriptionValid(row: RingCentralIntegrationRow) {
  if (!row.subscription_id) {
    return false;
  }

  const expiry = new Date(row.subscription_expires_at ?? "").getTime();
  return Number.isFinite(expiry) ? expiry > Date.now() + 5 * 60_000 : false;
}

async function refreshIntegrationIfNeeded(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
  row: RingCentralIntegrationRow,
) {
  if (!isAccessTokenExpired(row)) {
    return row;
  }

  return await refreshIntegration(serviceClient, row);
}

function mapRingCentralStatus(
  row: RingCentralIntegrationRow | null,
  ringOutNumbers: RingCentralPhoneNumber[],
  selectedRingOutNumber: string | null,
  message: string | null = null,
): RingCentralStatus {
  if (!row) {
    return buildEmptyStatus(message);
  }

  return {
    connected: true,
    accountId: row.account_id,
    extensionId: row.extension_id,
    selectedRingOutNumber,
    availableRingOutNumbers: ringOutNumbers,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
    expiresAt: row.access_token_expires_at,
    message,
    activeTelephonySessionId: row.active_telephony_session_id,
    activeTelephonyPartyId: row.active_telephony_party_id,
    activeTelephonyDirection: row.active_telephony_direction,
    activeTelephonyStatusCode: row.active_telephony_status_code,
    activeTelephonyUpdatedAt: row.active_telephony_updated_at,
  };
}

async function buildIntegrationStatus(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
  options: { refresh?: boolean } = {},
) {
  const row = await loadIntegration(serviceClient, workspaceUserId);
  if (!row) {
    return buildEmptyStatus();
  }

  let activeRow = options.refresh === false ? row : await refreshIntegrationIfNeeded(serviceClient, workspaceUserId, row);
  let ringOutNumbers: RingCentralPhoneNumber[] = [];
  let ringOutNumbersLoaded = false;
  let message: string | null = null;

  try {
    ringOutNumbers = await fetchRingCentralCallerIdNumbers(activeRow.access_token, async () => {
      const refreshed = await refreshIntegration(serviceClient, activeRow);
      activeRow = refreshed;
      return refreshed.access_token;
    });
    ringOutNumbersLoaded = true;
  } catch (error) {
    message = error instanceof Error ? error.message : "Unable to load RingCentral numbers.";
  }

  const storedSelectedRingOutNumber = activeRow.selected_caller_id ? normalizeNumber(activeRow.selected_caller_id) : null;
  const selectedRingOutNumber = ringOutNumbersLoaded
    ? selectPreferredCallerIdNumber(ringOutNumbers, storedSelectedRingOutNumber)
    : storedSelectedRingOutNumber;

  if (ringOutNumbersLoaded && selectedRingOutNumber !== storedSelectedRingOutNumber) {
    await saveIntegration(serviceClient, {
      ...activeRow,
      selected_caller_id: selectedRingOutNumber,
    });
  }

  if (!isWebhookSubscriptionValid(activeRow)) {
    try {
      activeRow = await ensureRingCentralWebhookSubscription(serviceClient, workspaceUserId, activeRow.access_token, async () => {
        const refreshed = await refreshIntegration(serviceClient, activeRow);
        activeRow = refreshed;
        return refreshed.access_token;
      });
    } catch (error) {
      const webhookMessage =
        error instanceof Error ? error.message : "Unable to configure RingCentral call alerts.";
      message = message ? `${message} ${webhookMessage}` : webhookMessage;
    }
  }

  return mapRingCentralStatus(activeRow, ringOutNumbers, selectedRingOutNumber, message);
}

async function handleConnect(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const token = await fetchRingCentralToken({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: requireRingCentralUserJwt(),
  });

  const status = await saveIntegrationFromToken(serviceClient, workspaceUser.id, token);
  return jsonResponse({ status });
}

async function handleStatus(serviceClient: ReturnType<typeof createServiceClient>, workspaceUser: AppUserRow) {
  const status = await buildIntegrationStatus(serviceClient, workspaceUser.id);
  return jsonResponse({ status });
}

async function handleBrowserVoiceSession(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({
      voice: buildUnavailableBrowserVoiceSession("RingCentral is not connected.", "unconfigured"),
    });
  }

  let activeRow = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);

  try {
    const sipProvision = await fetchRingCentralSipProvision(activeRow.access_token, async () => {
      const refreshed = await refreshIntegration(serviceClient, activeRow);
      activeRow = refreshed;
      return refreshed.access_token;
    });

    const voice = buildBrowserVoiceSession(sipProvision, workspaceUser, activeRow.selected_caller_id);
    return jsonResponse({ voice });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load RingCentral browser calling.";
    return jsonResponse({
      voice: {
        ...buildUnavailableBrowserVoiceSession(message, "ringcentral"),
        callerId: activeRow.selected_caller_id ? normalizeNumber(activeRow.selected_caller_id) : null,
        displayName: workspaceUser.full_name,
      },
    });
  }
}

async function handleUpdateRingOutNumber(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const ringOutNumber = typeof body.ringOutNumber === "string" ? normalizeNumber(body.ringOutNumber) : "";
  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ message: "RingCentral is not connected." }, { status: 409 });
  }

  const status = await buildIntegrationStatus(serviceClient, workspaceUser.id);
  const allowedRingOutNumbers = new Set(
    status.availableRingOutNumbers
      .filter(isRingCentralOutboundNumber)
      .map((number) => normalizeNumber(number.phoneNumber)),
  );

  if (ringOutNumber && !allowedRingOutNumbers.has(ringOutNumber)) {
    return jsonResponse({ message: "Choose a caller ID number from your RingCentral account." }, { status: 400 });
  }

  await saveIntegration(serviceClient, {
    ...integration,
    selected_caller_id: ringOutNumber || null,
  });

  const nextStatus = await buildIntegrationStatus(serviceClient, workspaceUser.id);
  return jsonResponse({ status: nextStatus });
}

async function handleDisconnect(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (integration?.subscription_id) {
    try {
      const refreshed = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);
      await deleteRingCentralWebhookSubscription(refreshed.access_token, refreshed.subscription_id);
    } catch {
      // Best-effort cleanup. Disconnecting the CRM connection should still succeed.
    }
  }

  await deleteIntegration(serviceClient, workspaceUser.id);
  return jsonResponse({ success: true });
}

function isInvalidRingOutPhoneFieldError(error: unknown, field: "from") {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message = error instanceof Error ? error.message : "";
  const errorCode = typeof (error as { errorCode?: unknown }).errorCode === "string"
    ? (error as { errorCode: string }).errorCode
    : "";
  if (errorCode !== "TEL-108" && !/phoneNumber specified/i.test(message)) {
    return false;
  }

  return new RegExp(`\\b${field}\\b`, "i").test(message);
}

async function handleRingOut(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ message: "RingCentral is not connected." }, { status: 409 });
  }

  let refreshed = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);
  const to = readDestinationNumber(body.to);
  const playPrompt = typeof body.playPrompt === "boolean" ? body.playPrompt : false;
  if (!to) {
    return jsonResponse({ message: "A destination phone number is required." }, { status: 400 });
  }

  const status = await buildIntegrationStatus(serviceClient, workspaceUser.id);
  const availableCallerIdNumbers = status.availableRingOutNumbers
    .filter(isRingCentralOutboundNumber)
    .map((number) => normalizeNumber(number.phoneNumber));
  const selectedCallerIdNumber = selectPreferredCallerIdNumber(
    status.availableRingOutNumbers,
    status.selectedRingOutNumber ?? null,
  );

  const accountInfo = await retryRingCentralRequestAfterRefresh({
    accessToken: refreshed.access_token,
    refreshAccessToken: async () => {
      const next = await refreshIntegration(serviceClient, refreshed);
      refreshed = next;
      return next.access_token;
    },
    request: (accessToken) => fetchRingCentralAccountInfo(accessToken),
  });
  const ringOutExtensionNumbers = await retryRingCentralRequestAfterRefresh({
    accessToken: refreshed.access_token,
    refreshAccessToken: async () => {
      const next = await refreshIntegration(serviceClient, refreshed);
      refreshed = next;
      return next.access_token;
    },
    request: (accessToken) => fetchRingCentralUserExtensionNumbers(accessToken, accountInfo.extensionNumber),
  });
  const ringOutCallbackTargets = buildRingOutCallbackTargets({
    mainNumber: accountInfo.mainNumber,
    extensionNumbers: ringOutExtensionNumbers,
  });
  const effectiveCallerIdNumber =
    selectedCallerIdNumber ||
    availableCallerIdNumbers[0] ||
    (accountInfo.mainNumber ? normalizeNumber(accountInfo.mainNumber) : null) ||
    null;
  if (ringOutCallbackTargets.length === 0) {
    return jsonResponse(
      { message: "RingCentral extension callback targets are not configured for RingOut." },
      { status: 409 },
    );
  }

  const performRingOutRequest = async (accessToken: string, ringOutPayload: RingOutRequestPayload) => {
    const response = await fetch(getRingCentralApiUrl("/restapi/v1.0/account/~/extension/~/ring-out"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ringOutPayload),
    });

    const text = await response.text();
    const data = text
      ? (JSON.parse(text) as Record<string, unknown> & {
        message?: string;
        error_description?: string;
        errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
      })
      : {};
    if (!response.ok) {
      throw createRingCentralRequestError(
        response.status,
        data,
        `RingCentral ring-out request failed (${response.status}).`,
      );
    }

    return data;
  };

  const performRingOutWithRefresh = (ringOutPayload: RingOutRequestPayload) =>
    retryRingCentralRequestAfterRefresh({
      accessToken: refreshed.access_token,
      refreshAccessToken: async () => {
        const next = await refreshIntegration(serviceClient, refreshed);
        refreshed = next;
        return next.access_token;
      },
      request: (accessToken) => performRingOutRequest(accessToken, ringOutPayload),
    });

  let data: Record<string, unknown> & {
    message?: string;
    error_description?: string;
    errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
  } | null = null;
  let successfulPayload: RingOutRequestPayload | null = null;
  let lastFromError: unknown = null;
  for (const callbackTarget of ringOutCallbackTargets) {
    const payload = buildRingOutRequestPayload({
      to,
      fromNumber: callbackTarget,
      callerIdNumber: effectiveCallerIdNumber,
      playPrompt,
    });
    try {
      const responseData = await performRingOutWithRefresh(payload);
      if (isRetryableRingOutCallerLegFailure(responseData) && callbackTarget !== ringOutCallbackTargets[ringOutCallbackTargets.length - 1]) {
        console.warn("RingCentral callback target failed after request acceptance, retrying next target.", {
          appUserId: workspaceUser.id,
          rejectedFromNumber: payload.from?.phoneNumber ?? null,
          status: responseData.status ?? null,
        });
        continue;
      }

      data = responseData;
      successfulPayload = payload;
      break;
    } catch (error) {
      if (payload.from && isInvalidRingOutPhoneFieldError(error, "from")) {
        console.warn("RingCentral rejected the callback forwarding target.", {
          appUserId: workspaceUser.id,
          rejectedFromNumber: payload.from.phoneNumber,
        });
        lastFromError = error;
        continue;
      }

      throw error;
    }
  }

  if (!data) {
    if (lastFromError) {
      throw Object.assign(
        new Error("RingCentral rejected every callback target for RingOut. Please verify the extension call device settings."),
        { status: 409 },
      );
    }
    throw Object.assign(new Error("RingCentral ring-out request failed."), { status: 502 });
  }

  const ringOutStatus = data.status && typeof data.status === "object" ? (data.status as Record<string, unknown>) : {};
  return jsonResponse({
    success: true,
    call: {
      id: typeof data.id === "string" ? data.id : null,
      status:
        typeof ringOutStatus.status === "string"
          ? ringOutStatus.status
          : typeof data.status === "string"
            ? data.status
            : null,
      callStatus:
        typeof ringOutStatus.callStatus === "string"
          ? ringOutStatus.callStatus
          : typeof ringOutStatus.state === "string"
            ? ringOutStatus.state
            : null,
      callerStatus:
        typeof ringOutStatus.callerStatus === "string"
          ? ringOutStatus.callerStatus
          : null,
      calleeStatus:
        typeof ringOutStatus.calleeStatus === "string"
          ? ringOutStatus.calleeStatus
          : null,
      to: successfulPayload?.to.phoneNumber ?? null,
      from: successfulPayload?.from?.phoneNumber ?? null,
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const body = request.headers.get("content-type")?.includes("application/json")
      ? await request.json().catch(() => ({}))
      : {};
    const action = typeof body.action === "string" ? body.action : "";
    const { serviceClient, workspaceUser } = await requireWorkspaceUser(request);

    if (action === "connect") {
      return await handleConnect(serviceClient, workspaceUser);
    }

    if (action === "status") {
      return await handleStatus(serviceClient, workspaceUser);
    }

    if (action === "browser-voice-session") {
      return await handleBrowserVoiceSession(serviceClient, workspaceUser);
    }

    if (action === "update-ringout-number") {
      return await handleUpdateRingOutNumber(body, serviceClient, workspaceUser);
    }

    if (action === "disconnect") {
      return await handleDisconnect(serviceClient, workspaceUser);
    }

    if (action === "ring-out") {
      return await handleRingOut(body, serviceClient, workspaceUser);
    }

    return jsonResponse({ message: "Unsupported RingCentral action." }, { status: 400 });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? (error as { status?: number }).status ?? 500
        : 500;
    return jsonResponse(
      { message: error instanceof Error ? error.message : "Unable to process RingCentral request." },
      { status },
    );
  }
});
