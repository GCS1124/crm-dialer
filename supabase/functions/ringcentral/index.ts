import { jsonResponse, optionsResponse } from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUser } from "../_shared/supabase.ts";
import {
  buildRingCentralAuthorizationUrl,
  buildRingOutRequestPayload,
  createRingCentralRequestError,
  formatRingCentralPhoneNumber,
  isRingCentralOutboundNumber,
  selectRingCentralCallerId,
  selectRingCentralRingOutFromNumber,
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
  operator?: {
    id?: string | number;
    extensionNumber?: string | null;
  };
}

interface RingCentralCallerNumberRecord {
  phoneNumber?: string;
  usageType?: string | null;
  features?: string[] | null;
  label?: string | null;
}

interface RingCentralCallerNumberResponse {
  records?: RingCentralCallerNumberRecord[];
  targets?: unknown[];
}

interface RingCentralForwardingTargetRecord {
  type?: string | null;
  name?: string | null;
  enabled?: boolean;
  destination?: {
    phoneNumber?: string | null;
  } | null;
  device?: {
    phoneNumber?: string | null;
  } | null;
  integration?: {
    phoneNumber?: string | null;
  } | null;
  targets?: unknown[];
}

interface RingCentralForwardingTargetResponse {
  records?: RingCentralForwardingTargetRecord[];
  targets?: RingCentralForwardingTargetRecord[];
  dispatching?: {
    actions?: unknown[];
  };
}

interface RingCentralFetchResult {
  data?: unknown;
  error?: RingCentralRequestError;
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
  selectedCallerId: string | null;
  availableCallerIds: RingCentralPhoneNumber[];
  connectedAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
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
    selectedCallerId: null,
    availableCallerIds: [],
    connectedAt: null,
    updatedAt: null,
    expiresAt: null,
    message,
  };
}

function getRingCentralApiUrl(path: string) {
  return new URL(path, ringCentralServerUrl).toString();
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
  const response = await fetch(getRingCentralApiUrl("/restapi/v1.0/account/~"), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const text = await response.text();
  const data = text
    ? (JSON.parse(text) as RingCentralAccountResponse & {
      message?: string;
      error_description?: string;
      errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
    })
    : {};

  if (!response.ok) {
    throw createRingCentralRequestError(
      response.status,
      data,
      `RingCentral account lookup failed (${response.status}).`,
    );
  }

  return {
    accountId: normalizeIdentifier(data.id),
  };
}

async function fetchRingCentralCallerIds(
  accessToken: string,
  refreshAccessToken?: () => Promise<string>,
) {
  const request = async (token: string) => {
    const [phoneNumbersResponse, accountPhoneNumbersResponse, forwardingTargetsResponse] = await Promise.allSettled([
      fetch(getRingCentralApiUrl("/restapi/v1.0/account/~/extension/~/phone-number?page=1&perPage=100"), {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      }),
      fetch(getRingCentralApiUrl("/restapi/v1.0/account/~/phone-number?page=1&perPage=100"), {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      }),
      fetch(getRingCentralApiUrl("/restapi/v2/accounts/~/extensions/~/comm-handling/voice/forwarding-targets"), {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      }),
    ]);

    const parsedResponses = await Promise.all<RingCentralFetchResult>(
      [phoneNumbersResponse, accountPhoneNumbersResponse, forwardingTargetsResponse].map(async (result, index) => {
        if (result.status === "rejected") {
          throw result.reason;
        }

        const response = result.value;
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
          const fallbackMessage =
            index === 0 || index === 1
              ? `RingCentral phone number lookup failed (${response.status}).`
              : `RingCentral forwarding target lookup failed (${response.status}).`;
          const error = createRingCentralRequestError(response.status, data, fallbackMessage);
          return { error };
        }

        return { data };
      }),
    );

    const firstAuthError = parsedResponses.find((item) => Number(item.error?.status) === 401)?.error;
    if (firstAuthError) {
      throw firstAuthError;
    }

    const numbersByKey = new Map<string, RingCentralPhoneNumber>();
    const addNumber = (candidate: Partial<RingCentralPhoneNumber> & { phoneNumber?: string | null }) => {
      const phoneNumber = typeof candidate.phoneNumber === "string" ? normalizeNumber(candidate.phoneNumber) : "";
      if (!phoneNumber) {
        return;
      }

      const existing = numbersByKey.get(phoneNumber);
      const features = new Set([
        ...(existing?.features ?? []),
        ...(candidate.features ?? []),
      ]);
      const next: RingCentralPhoneNumber = {
        phoneNumber,
        usageType: candidate.usageType ?? existing?.usageType ?? null,
        features: [...features],
        label:
          candidate.label ??
          existing?.label ??
          `${formatRingCentralPhoneNumber(phoneNumber)}${candidate.usageType ? ` - ${candidate.usageType}` : ""}`,
      };

      numbersByKey.set(phoneNumber, next);
    };

    const collectFromValue = (value: unknown) => {
      if (!value) {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(collectFromValue);
        return;
      }

      if (typeof value !== "object") {
        return;
      }

      const record = value as Record<string, unknown>;

      const directPhoneNumber =
        typeof record.phoneNumber === "string" ? record.phoneNumber : "";
      if (directPhoneNumber) {
        addNumber({
          phoneNumber: directPhoneNumber,
          usageType: typeof record.usageType === "string" ? record.usageType : null,
          features: Array.isArray(record.features)
            ? record.features.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            : [],
          label: typeof record.label === "string" ? record.label.trim() : undefined,
        });
      }

      const nestedDestinationPhoneNumber =
        typeof (record.destination as { phoneNumber?: unknown } | undefined)?.phoneNumber === "string"
          ? ((record.destination as { phoneNumber: string }).phoneNumber)
          : "";
      if (nestedDestinationPhoneNumber) {
        addNumber({
          phoneNumber: nestedDestinationPhoneNumber,
          usageType: typeof record.type === "string" ? "ForwardedNumber" : null,
          features: ["CallForwarding"],
          label: typeof record.name === "string" ? record.name.trim() : undefined,
        });
      }

      const nestedDevicePhoneNumber =
        typeof (record.device as { phoneNumber?: unknown } | undefined)?.phoneNumber === "string"
          ? ((record.device as { phoneNumber: string }).phoneNumber)
          : "";
      if (nestedDevicePhoneNumber) {
        addNumber({
          phoneNumber: nestedDevicePhoneNumber,
          usageType: "DirectNumber",
          features: ["CallForwarding"],
          label: typeof record.name === "string" ? record.name.trim() : undefined,
        });
      }

      const nestedIntegrationPhoneNumber =
        typeof (record.integration as { phoneNumber?: unknown } | undefined)?.phoneNumber === "string"
          ? ((record.integration as { phoneNumber: string }).phoneNumber)
          : "";
      if (nestedIntegrationPhoneNumber) {
        addNumber({
          phoneNumber: nestedIntegrationPhoneNumber,
          usageType: "DirectNumber",
          features: ["CallForwarding"],
          label: typeof record.name === "string" ? record.name.trim() : undefined,
        });
      }

      if (Array.isArray(record.records)) {
        record.records.forEach(collectFromValue);
      }

      if (Array.isArray(record.targets)) {
        record.targets.forEach(collectFromValue);
      }

      const actions = (record.dispatching as { actions?: unknown[] } | undefined)?.actions;
      if (Array.isArray(actions)) {
        actions.forEach(collectFromValue);
      }
    };

    parsedResponses.forEach((result) => collectFromValue(result?.data));

    return [...numbersByKey.values()];
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

  const updatedRow: RingCentralIntegrationRow = {
    ...row,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? row.refresh_token,
    token_type: refreshed.token_type ?? row.token_type,
    scope: refreshed.scope ?? row.scope,
    access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    refresh_token_expires_at: refreshed.refresh_token_expires_in
      ? new Date(Date.now() + refreshed.refresh_token_expires_in * 1000).toISOString()
      : row.refresh_token_expires_at,
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

  const [callerIdsResult, accountInfoResult] = await Promise.allSettled([
    fetchRingCentralCallerIds(token.access_token),
    fetchRingCentralAccountInfo(token.access_token),
  ]);

  const callerIds =
    callerIdsResult.status === "fulfilled" ? callerIdsResult.value : ([] as RingCentralPhoneNumber[]);
  const accountInfo = accountInfoResult.status === "fulfilled" ? accountInfoResult.value : null;

  await saveIntegration(serviceClient, {
    app_user_id: workspaceUserId,
    account_id: accountInfo?.accountId ?? null,
    extension_id: token.owner_id ?? null,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type ?? "Bearer",
    scope: token.scope ?? null,
    access_token_expires_at: expiresAt,
    refresh_token_expires_at: refreshTokenExpiresAt,
    selected_caller_id: selectRingCentralCallerId(callerIds, null) || null,
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
  callerIds: RingCentralPhoneNumber[],
  selectedCallerId: string | null,
  message: string | null = null,
): RingCentralStatus {
  if (!row) {
    return buildEmptyStatus(message);
  }

  return {
    connected: true,
    accountId: row.account_id,
    extensionId: row.extension_id,
    selectedCallerId,
    availableCallerIds: callerIds,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
    expiresAt: row.access_token_expires_at,
    message,
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
  let callerIds: RingCentralPhoneNumber[] = [];
  let callerIdsLoaded = false;
  let message: string | null = null;

  try {
    callerIds = await fetchRingCentralCallerIds(activeRow.access_token, async () => {
      const refreshed = await refreshIntegration(serviceClient, activeRow);
      activeRow = refreshed;
      return refreshed.access_token;
    });
    callerIdsLoaded = true;
  } catch (error) {
    message = error instanceof Error ? error.message : "Unable to load RingCentral numbers.";
  }

  const storedSelectedCallerId = activeRow.selected_caller_id ? normalizeNumber(activeRow.selected_caller_id) : null;
  const selectedCallerId = callerIdsLoaded
    ? (storedSelectedCallerId && callerIds.some(
        (number) =>
          normalizeNumber(number.phoneNumber) === storedSelectedCallerId &&
          isRingCentralOutboundNumber(number),
      )
        ? storedSelectedCallerId
        : selectRingCentralCallerId(callerIds, null) || null)
    : storedSelectedCallerId;

  if (callerIdsLoaded && selectedCallerId !== storedSelectedCallerId) {
    await saveIntegration(serviceClient, {
      ...activeRow,
      selected_caller_id: selectedCallerId,
    });
  }

  try {
    await ensureRingCentralWebhookSubscription(serviceClient, workspaceUserId, activeRow.access_token, async () => {
      const refreshed = await refreshIntegration(serviceClient, activeRow);
      activeRow = refreshed;
      return refreshed.access_token;
    });
  } catch (error) {
    const webhookMessage =
      error instanceof Error ? error.message : "Unable to configure RingCentral call alerts.";
    message = message ? `${message} ${webhookMessage}` : webhookMessage;
  }

  return mapRingCentralStatus(activeRow, callerIds, selectedCallerId, message);
}

async function handleAuthUrl(body: Record<string, unknown>) {
  const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri.trim() : "";
  const state = typeof body.state === "string" ? body.state.trim() : "";
  const codeChallenge = typeof body.codeChallenge === "string" ? body.codeChallenge.trim() : "";

  if (!redirectUri || !state || !codeChallenge) {
    return jsonResponse({ message: "redirectUri, state, and codeChallenge are required." }, { status: 400 });
  }

  return jsonResponse({
    authorizationUrl: buildRingCentralAuthorizationUrl({
      clientId: requireRingCentralClientId(),
      redirectUri,
      codeChallenge,
      state,
      serverUrl: ringCentralServerUrl,
    }),
  });
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

async function handleExchange(
  request: Request,
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const codeVerifier = typeof body.codeVerifier === "string" ? body.codeVerifier.trim() : "";
  const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri.trim() : "";
  if (!code || !codeVerifier || !redirectUri) {
    return jsonResponse({ message: "code, codeVerifier, and redirectUri are required." }, { status: 400 });
  }

  const token = await fetchRingCentralToken({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });
  const status = await saveIntegrationFromToken(serviceClient, workspaceUser.id, token);
  return jsonResponse({ status });
}

async function handleStatus(serviceClient: ReturnType<typeof createServiceClient>, workspaceUser: AppUserRow) {
  const status = await buildIntegrationStatus(serviceClient, workspaceUser.id);
  return jsonResponse({ status });
}

async function handleUpdateCallerId(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const callerId = typeof body.callerId === "string" ? normalizeNumber(body.callerId) : "";
  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ message: "RingCentral is not connected." }, { status: 409 });
  }

  const status = await buildIntegrationStatus(serviceClient, workspaceUser.id);
  const allowedCallerIds = new Set(
    status.availableCallerIds
      .filter(isRingCentralOutboundNumber)
      .map((number) => normalizeNumber(number.phoneNumber)),
  );

  if (callerId && !allowedCallerIds.has(callerId)) {
    return jsonResponse({ message: "Choose a caller ID number from your RingCentral account." }, { status: 400 });
  }

  await saveIntegration(serviceClient, {
    ...integration,
    selected_caller_id: callerId || null,
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

function isInvalidRingOutPhoneFieldError(error: unknown, field: "from" | "callerId") {
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
  const allowedCallerIds = new Set(
    status.availableCallerIds
      .filter(isRingCentralOutboundNumber)
      .map((number) => normalizeNumber(number.phoneNumber)),
  );
  let selectedCallerId: string | null = normalizeNumber(status.selectedCallerId ?? "");
  selectedCallerId = selectedCallerId && allowedCallerIds.has(selectedCallerId)
    ? selectedCallerId
    : null;
  const discoveredRingOutFromNumber = selectRingCentralRingOutFromNumber(status.availableCallerIds, null) || null;
  let ringOutFromNumber: string | null = null;
  let payload = buildRingOutRequestPayload({ to, fromNumber: ringOutFromNumber, callerId: selectedCallerId, playPrompt });

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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      data = await performRingOutWithRefresh(payload);
      break;
    } catch (error) {
      if (!payload.from && discoveredRingOutFromNumber && isInvalidRingOutPhoneFieldError(error, "from")) {
        console.warn("Retrying RingCentral RingOut with the discovered forwarding target.", {
          appUserId: workspaceUser.id,
          discoveredFrom: discoveredRingOutFromNumber,
        });
        ringOutFromNumber = discoveredRingOutFromNumber;
        payload = buildRingOutRequestPayload({ to, fromNumber: ringOutFromNumber, callerId: selectedCallerId, playPrompt });
        continue;
      }

      if (payload.from && isInvalidRingOutPhoneFieldError(error, "from")) {
        console.warn("Retrying RingCentral RingOut without a rejected from number.", {
          appUserId: workspaceUser.id,
          rejectedFrom: payload.from.phoneNumber,
        });
        ringOutFromNumber = null;
        payload = buildRingOutRequestPayload({ to, fromNumber: ringOutFromNumber, callerId: selectedCallerId, playPrompt });
        continue;
      }

      if (payload.callerId && isInvalidRingOutPhoneFieldError(error, "callerId")) {
        console.warn("Retrying RingCentral RingOut without a rejected caller ID.", {
          appUserId: workspaceUser.id,
          rejectedCallerId: payload.callerId.phoneNumber,
        });
        selectedCallerId = null;
        await saveIntegration(serviceClient, {
          ...refreshed,
          selected_caller_id: null,
        });
        payload = buildRingOutRequestPayload({ to, fromNumber: ringOutFromNumber, callerId: selectedCallerId, playPrompt });
        continue;
      }

      throw error;
    }
  }

  if (!data) {
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
      to: payload.to.phoneNumber,
      from: payload.from?.phoneNumber ?? null,
      callerId: payload.callerId?.phoneNumber ?? null,
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

    if (action === "auth-url") {
      return await handleAuthUrl(body);
    }

    if (action === "exchange") {
      return await handleExchange(request, body, serviceClient, workspaceUser);
    }

    if (action === "status") {
      return await handleStatus(serviceClient, workspaceUser);
    }

    if (action === "update-caller-id") {
      return await handleUpdateCallerId(body, serviceClient, workspaceUser);
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
