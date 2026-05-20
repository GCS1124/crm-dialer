import { jsonResponse, optionsResponse } from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUser } from "../_shared/supabase.ts";
import {
  createRingCentralRequestError,
  retryRingCentralRequestAfterRefresh,
} from "../_shared/ringcentral.ts";

interface AppUserRow {
  id: string;
  auth_user_id: string | null;
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
}

interface RingCentralActiveCallRecord {
  telephonySessionId?: string;
  sessionId?: string;
  partyId?: string;
  direction?: string;
  result?: string;
  startTime?: string;
}

interface RingCentralTelephonySessionParty {
  id?: string;
  extensionId?: string;
  direction?: string;
  owner?: {
    extensionId?: string;
  };
  from?: {
    extensionId?: string;
    phoneNumber?: string;
  };
  to?: {
    extensionId?: string;
    phoneNumber?: string;
  };
  status?: {
    code?: string;
  };
}

interface RingCentralTelephonySessionRecord {
  id?: string;
  sessionId?: string;
  telephonySessionId?: string;
  eventTime?: string;
  creationTime?: string;
  origin?: {
    type?: string;
  };
  parties?: RingCentralTelephonySessionParty[];
}

const ringCentralServerUrl = Deno.env.get("RINGCENTRAL_SERVER_URL")?.trim() || "https://platform.ringcentral.com";
const ringCentralClientId = Deno.env.get("RINGCENTRAL_CLIENT_ID")?.trim() || "";
const ringCentralClientSecret = Deno.env.get("RINGCENTRAL_CLIENT_SECRET")?.trim() || "";
const CONNECTED_TELEPHONY_STATUS_CODES = new Set(["Answered", "Connected"]);
const LIVE_TELEPHONY_STATUS_CODES = new Set(["Setup", "Proceeding", "Answered", "Connected", "Hold", "Parked"]);
const FINAL_TELEPHONY_STATUS_CODES = new Set(["Disconnected", "Gone", "VoiceMail"]);

function normalizeNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

function readRingOutId(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { ringOutId?: unknown }).ringOutId === "string"
  ) {
    return (value as { ringOutId: string }).ringOutId.trim();
  }

  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id.trim();
  }

  return "";
}

function readBoolean(value: unknown) {
  return value === true || value === "true";
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRingCentralRequestStatus(error: unknown, status: number) {
  return Boolean(
    error &&
    typeof error === "object" &&
    Number((error as { status?: unknown }).status) === status
  );
}

function isRingOutConnectedStatus(data: unknown) {
  if (!data || typeof data !== "object") {
    return false;
  }

  const record = data as Record<string, unknown>;
  const status = record.status && typeof record.status === "object"
    ? (record.status as Record<string, unknown>)
    : null;
  if (!status) {
    return false;
  }

  return ["callStatus", "callerStatus", "calleeStatus"].some((key) => readText(status[key]) === "Success");
}

function buildRingOutStatusFromTelephonyState(row: RingCentralIntegrationRow, ringOutId: string) {
  const hasActiveParty = Boolean(
    row.active_telephony_session_id?.trim() &&
    row.active_telephony_party_id?.trim()
  );
  const statusCode = row.active_telephony_status_code?.trim() || "";
  const isConnected = CONNECTED_TELEPHONY_STATUS_CODES.has(statusCode);

  if (!hasActiveParty && !statusCode) {
    return {
      id: ringOutId,
      status: "InProgress",
      callStatus: "InProgress",
      callerStatus: "InProgress",
      calleeStatus: "InProgress",
      to: null,
      from: null,
    };
  }

  return {
    id: ringOutId,
    status: isConnected ? "Success" : "InProgress",
    callStatus: isConnected ? "Success" : "InProgress",
    callerStatus: isConnected ? "Success" : "InProgress",
    calleeStatus: isConnected ? "Success" : "InProgress",
    to: null,
    from: null,
  };
}

function buildRingOutFailureFromCallLogResult(ringOutId: string, result: string) {
  const normalizedResult = result.trim().toLowerCase();

  if (normalizedResult === "ip phone offline") {
    return {
      id: ringOutId,
      status: "Error",
      callStatus: "CannotReach",
      callerStatus: "CannotReach",
      calleeStatus: "InProgress",
      to: null,
      from: null,
    };
  }

  if (normalizedResult.includes("busy")) {
    return {
      id: ringOutId,
      status: "Error",
      callStatus: "Finished",
      callerStatus: "Success",
      calleeStatus: "Busy",
      to: null,
      from: null,
    };
  }

  if (normalizedResult.includes("no answer")) {
    return {
      id: ringOutId,
      status: "Error",
      callStatus: "Finished",
      callerStatus: "Success",
      calleeStatus: "NoAnswer",
      to: null,
      from: null,
    };
  }

  if (normalizedResult.includes("reject") || normalizedResult.includes("cancel")) {
    return {
      id: ringOutId,
      status: "Error",
      callStatus: "Finished",
      callerStatus: "Success",
      calleeStatus: "Rejected",
      to: null,
      from: null,
    };
  }

  return {
    id: ringOutId,
    status: "Error",
    callStatus: "GenericError",
    callerStatus: "GenericError",
    calleeStatus: "InProgress",
    to: null,
    from: null,
  };
}

function readPartyId(value: RingCentralTelephonySessionParty | null) {
  return value?.id?.trim() ?? "";
}

function readPartyStatusCode(value: RingCentralTelephonySessionParty | null) {
  return value?.status?.code?.trim() ?? "";
}

function readPartyExtensionId(value: RingCentralTelephonySessionParty | null) {
  return value?.extensionId?.trim() ??
    value?.owner?.extensionId?.trim() ??
    value?.from?.extensionId?.trim() ??
    value?.to?.extensionId?.trim() ??
    "";
}

function readTelephonySessionId(value: RingCentralActiveCallRecord | RingCentralTelephonySessionRecord | null) {
  return value?.telephonySessionId?.trim() ?? value?.sessionId?.trim() ?? value?.id?.trim() ?? "";
}

function readActiveCallPartyId(value: RingCentralActiveCallRecord | null) {
  return value?.partyId?.trim() ?? "";
}

function readTelephonySessionTime(value: RingCentralTelephonySessionRecord) {
  return value.eventTime?.trim() ?? value.creationTime?.trim() ?? "";
}

function isFinalTelephonyStatus(statusCode: string) {
  return FINAL_TELEPHONY_STATUS_CODES.has(statusCode);
}

function isLiveTelephonyStatus(statusCode: string) {
  return LIVE_TELEPHONY_STATUS_CODES.has(statusCode);
}

function getTelephonySessionParties(value: RingCentralTelephonySessionRecord | null) {
  return Array.isArray(value?.parties) ? value.parties : [];
}

function getControllableTelephonyParty(
  session: RingCentralTelephonySessionRecord,
  extensionId: string | null,
) {
  const parties = getTelephonySessionParties(session)
    .map((party) => ({
      party,
      partyId: readPartyId(party),
      statusCode: readPartyStatusCode(party),
      partyExtensionId: readPartyExtensionId(party),
      direction: party.direction?.trim() ?? "",
    }))
    .filter((candidate) => candidate.partyId.length > 0);

  if (!parties.length) {
    return null;
  }

  const normalizedExtensionId = extensionId?.trim() ?? "";
  const scored = parties.map((candidate) => {
    let score = 0;
    if (normalizedExtensionId && candidate.partyExtensionId === normalizedExtensionId) {
      score += 100;
    }
    if (candidate.direction === "Outbound") {
      score += 20;
    }
    if (CONNECTED_TELEPHONY_STATUS_CODES.has(candidate.statusCode)) {
      score += 10;
    } else if (isLiveTelephonyStatus(candidate.statusCode)) {
      score += 5;
    }
    if (isFinalTelephonyStatus(candidate.statusCode)) {
      score -= 1000;
    }

    return { ...candidate, score };
  });

  scored.sort((left, right) => right.score - left.score);
  const winner = scored.find((candidate) => candidate.score > -1000) ?? null;
  if (!winner) {
    return null;
  }

  return {
    partyId: winner.partyId,
    statusCode: winner.statusCode,
    direction: winner.direction || "Outbound",
  };
}

function requireRingCentralClientId() {
  if (!ringCentralClientId) {
    throw new Error("Missing RingCentral client id.");
  }

  return ringCentralClientId;
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
    .select("id, auth_user_id")
    .eq("auth_user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  if (!data) {
    throw Object.assign(new Error("Workspace profile not found."), { status: 404 });
  }

  return {
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

async function loadIntegration(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
) {
  const { data, error } = await serviceClient
    .from("ringcentral_integrations")
    .select(
      "app_user_id, account_id, extension_id, access_token, refresh_token, token_type, scope, access_token_expires_at, refresh_token_expires_at, selected_caller_id, active_telephony_session_id, active_telephony_party_id, active_telephony_direction, active_telephony_status_code, active_telephony_updated_at, connected_at, updated_at",
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
  row: RingCentralIntegrationRow,
) {
  const { error } = await serviceClient.from("ringcentral_integrations").upsert(row);
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

async function clearActiveTelephonyCall(
  serviceClient: ReturnType<typeof createServiceClient>,
  row: RingCentralIntegrationRow,
) {
  await saveIntegration(serviceClient, {
    ...row,
    active_telephony_session_id: null,
    active_telephony_party_id: null,
    active_telephony_direction: null,
    active_telephony_status_code: null,
    active_telephony_updated_at: null,
  });
}

async function deleteActiveTelephonyParty(
  accessToken: string,
  sessionId: string,
  partyId: string,
) {
  const response = await fetch(
    getRingCentralApiUrl(
      `/restapi/v1.0/account/~/telephony/sessions/${encodeURIComponent(sessionId)}/parties/${encodeURIComponent(partyId)}`,
    ),
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok && response.status !== 204 && response.status !== 404) {
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
      `RingCentral active call hangup failed (${response.status}).`,
    );
  }
}

async function fetchActiveCalls(
  accessToken: string,
  extensionId: string | null,
) {
  if (!extensionId?.trim()) {
    return [] as RingCentralActiveCallRecord[];
  }

  const response = await fetch(
    getRingCentralApiUrl(`/restapi/v1.0/account/~/extension/${encodeURIComponent(extensionId)}/active-calls`),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const text = await response.text();
  const data = text
    ? (JSON.parse(text) as Record<string, unknown> & {
      records?: RingCentralActiveCallRecord[];
      message?: string;
      error_description?: string;
      errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
    })
    : {};
  if (!response.ok) {
    throw createRingCentralRequestError(
      response.status,
      data,
      `RingCentral active call lookup failed (${response.status}).`,
    );
  }

  return Array.isArray(data.records) ? data.records : [];
}

async function fetchTelephonySession(
  accessToken: string,
  sessionId: string,
) {
  const response = await fetch(
    getRingCentralApiUrl(`/restapi/v1.0/account/~/telephony/sessions/${encodeURIComponent(sessionId)}`),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const text = await response.text();
  const data = text
    ? (JSON.parse(text) as RingCentralTelephonySessionRecord & {
      message?: string;
      error_description?: string;
      errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
    })
    : {};
  if (!response.ok) {
    throw createRingCentralRequestError(
      response.status,
      data,
      `RingCentral telephony session lookup failed (${response.status}).`,
    );
  }

  return data as RingCentralTelephonySessionRecord;
}

async function fetchTelephonySessions(
  accessToken: string,
) {
  const response = await fetch(
    getRingCentralApiUrl("/restapi/v1.0/account/~/telephony/sessions?view=Detailed&perPage=100"),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const text = await response.text();
  const data = text
    ? (JSON.parse(text) as Record<string, unknown> & {
      records?: RingCentralTelephonySessionRecord[];
      message?: string;
      error_description?: string;
      errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
    })
    : {};
  if (!response.ok) {
    throw createRingCentralRequestError(
      response.status,
      data,
      `RingCentral telephony sessions lookup failed (${response.status}).`,
    );
  }

  return Array.isArray(data.records) ? data.records : [];
}

function buildActiveCallCandidateSessionIds(records: RingCentralActiveCallRecord[]) {
  return [...new Set(
    records
      .filter((record) => {
        const result = readText(record.result).toLowerCase();
        return !result || result === "in progress" || result === "answered" || result === "connected";
      })
      .sort((left, right) => {
        const leftDirection = readText(left.direction);
        const rightDirection = readText(right.direction);
        if (leftDirection !== rightDirection) {
          return leftDirection === "Outbound" ? -1 : 1;
        }

        const leftTime = Date.parse(readText(left.startTime));
        const rightTime = Date.parse(readText(right.startTime));
        return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
      })
      .map((record) => readTelephonySessionId(record))
      .filter((value) => value.length > 0),
  )];
}

function mapActiveCallResultToTelephonyStatus(result: string) {
  const normalizedResult = result.trim().toLowerCase();
  if (!normalizedResult || normalizedResult === "in progress") {
    return "Proceeding";
  }
  if (normalizedResult === "answered" || normalizedResult === "connected") {
    return "Connected";
  }
  if (normalizedResult === "stopped" || normalizedResult === "disconnected") {
    return "Disconnected";
  }
  return result.trim();
}

function selectActiveTelephonyFromActiveCalls(records: RingCentralActiveCallRecord[]) {
  const candidates = records
    .map((record) => {
      const sessionId = readTelephonySessionId(record);
      const partyId = readActiveCallPartyId(record);
      if (!sessionId || !partyId) {
        return null;
      }

      const direction = readText(record.direction) || "Outbound";
      const result = readText(record.result);
      let score = 0;
      if (!result || result.toLowerCase() === "in progress") {
        score += 50;
      } else if (result.toLowerCase() === "answered" || result.toLowerCase() === "connected") {
        score += 40;
      }
      if (direction === "Inbound") {
        score += 20;
      } else if (direction === "Outbound") {
        score += 10;
      }

      const startTime = Date.parse(readText(record.startTime));
      return {
        sessionId,
        partyId,
        direction,
        statusCode: mapActiveCallResultToTelephonyStatus(result),
        score,
        startTime: Number.isFinite(startTime) ? startTime : 0,
      };
    })
    .filter((value): value is {
      sessionId: string;
      partyId: string;
      direction: string;
      statusCode: string;
      score: number;
      startTime: number;
    } => value !== null);

  candidates.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    return right.startTime - left.startTime;
  });

  const winner = candidates[0] ?? null;
  if (!winner) {
    return null;
  }

  return {
    sessionId: winner.sessionId,
    partyId: winner.partyId,
    direction: winner.direction,
    statusCode: winner.statusCode,
  };
}

function selectActiveTelephonySession(
  sessions: RingCentralTelephonySessionRecord[],
  extensionId: string | null,
) {
  const candidates = sessions
    .map((session) => {
      const sessionId = readTelephonySessionId(session);
      const party = getControllableTelephonyParty(session, extensionId);
      if (!sessionId || !party?.partyId) {
        return null;
      }

      let score = 0;
      if (session.origin?.type?.trim() === "RingOut") {
        score += 100;
      }
      if (CONNECTED_TELEPHONY_STATUS_CODES.has(party.statusCode)) {
        score += 20;
      } else if (isLiveTelephonyStatus(party.statusCode)) {
        score += 10;
      }
      if (party.direction === "Outbound") {
        score += 5;
      }

      const eventTime = Date.parse(readTelephonySessionTime(session));
      return {
        sessionId,
        partyId: party.partyId,
        direction: party.direction,
        statusCode: party.statusCode,
        score,
        eventTime: Number.isFinite(eventTime) ? eventTime : 0,
      };
    })
    .filter((value): value is {
      sessionId: string;
      partyId: string;
      direction: string;
      statusCode: string;
      score: number;
      eventTime: number;
    } => value !== null);

  candidates.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    return right.eventTime - left.eventTime;
  });

  const winner = candidates[0] ?? null;
  if (!winner) {
    return null;
  }

  return {
    sessionId: winner.sessionId,
    partyId: winner.partyId,
    direction: winner.direction,
    statusCode: winner.statusCode,
  };
}

async function discoverActiveTelephonyControl(
  accessToken: string,
  extensionId: string | null,
) {
  const activeCalls = await fetchActiveCalls(accessToken, extensionId);
  const directActiveCallMatch = selectActiveTelephonyFromActiveCalls(activeCalls);
  if (directActiveCallMatch) {
    return directActiveCallMatch;
  }

  const activeCallSessionIds = buildActiveCallCandidateSessionIds(activeCalls);
  if (activeCallSessionIds.length) {
    const sessions = await Promise.all(
      activeCallSessionIds.map((sessionId) => fetchTelephonySession(accessToken, sessionId)),
    );
    const match = selectActiveTelephonySession(sessions, extensionId);
    if (match) {
      return match;
    }
  }

  const fallbackSessions = await fetchTelephonySessions(accessToken);
  return selectActiveTelephonySession(fallbackSessions, extensionId);
}

async function fetchRingOutStatusData(accessToken: string, ringOutId: string) {
  const response = await fetch(
    getRingCentralApiUrl(`/restapi/v1.0/account/~/extension/~/ring-out/${encodeURIComponent(ringOutId)}`),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

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
      `RingCentral ring-out status request failed (${response.status}).`,
    );
  }

  return data;
}

async function fetchRecentRingOutCallLogResult(accessToken: string) {
  const response = await fetch(
    getRingCentralApiUrl("/restapi/v1.0/account/~/extension/~/call-log?perPage=10"),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const text = await response.text();
  const data = text
    ? (JSON.parse(text) as Record<string, unknown> & {
      records?: Array<Record<string, unknown>>;
      message?: string;
      error_description?: string;
      errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
    })
    : {};

  if (!response.ok) {
    throw createRingCentralRequestError(
      response.status,
      data,
      `RingCentral call log request failed (${response.status}).`,
    );
  }

  const records = Array.isArray(data.records) ? data.records : [];
  for (const record of records) {
    const action = readText(record.action);
    const direction = readText(record.direction);
    const result = readText(record.result);
    if (!result) {
      continue;
    }

    if (direction.toLowerCase() === "outbound" && action.toLowerCase().includes("ringout")) {
      return result;
    }
  }

  return "";
}

async function handleRingOutStatus(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const ringOutId = readRingOutId(body.ringOutId);
  if (!ringOutId) {
    return jsonResponse({ message: "ringOutId is required." }, { status: 400 });
  }

  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ message: "RingCentral is not connected." }, { status: 409 });
  }

  let refreshed = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);

  let data: Record<string, unknown> & {
    message?: string;
    error_description?: string;
    errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
  };
  try {
    data = await retryRingCentralRequestAfterRefresh({
      accessToken: refreshed.access_token,
      refreshAccessToken: async () => {
        const next = await refreshIntegration(serviceClient, refreshed);
        refreshed = next;
        return next.access_token;
      },
      request: (accessToken) => fetchRingOutStatusData(accessToken, ringOutId),
    });
  } catch (error) {
    if (!isRingCentralRequestStatus(error, 404)) {
      throw error;
    }

    const latestIntegration = await loadIntegration(serviceClient, workspaceUser.id);
    if (
      !(latestIntegration ?? refreshed).active_telephony_session_id &&
      !(latestIntegration ?? refreshed).active_telephony_status_code
    ) {
      try {
        const callLogResult = await retryRingCentralRequestAfterRefresh({
          accessToken: refreshed.access_token,
          refreshAccessToken: async () => {
            const next = await refreshIntegration(serviceClient, refreshed);
            refreshed = next;
            return next.access_token;
          },
          request: (accessToken) => fetchRecentRingOutCallLogResult(accessToken),
        });

        if (callLogResult) {
          return jsonResponse({
            success: true,
            call: buildRingOutFailureFromCallLogResult(ringOutId, callLogResult),
          });
        }
      } catch {
        // Fall back to the telephony state snapshot below when call-log lookup fails.
      }
    }

    return jsonResponse({
      success: true,
      call: buildRingOutStatusFromTelephonyState(latestIntegration ?? refreshed, ringOutId),
    });
  }

  if (
    isRingOutConnectedStatus(data) &&
    !(refreshed.active_telephony_session_id?.trim() && refreshed.active_telephony_party_id?.trim())
  ) {
    try {
      const discovered = await retryRingCentralRequestAfterRefresh({
        accessToken: refreshed.access_token,
        refreshAccessToken: async () => {
          const next = await refreshIntegration(serviceClient, refreshed);
          refreshed = next;
          return next.access_token;
        },
        request: (accessToken) => discoverActiveTelephonyControl(accessToken, refreshed.extension_id),
      });

      if (discovered) {
        refreshed = {
          ...refreshed,
          active_telephony_session_id: discovered.sessionId,
          active_telephony_party_id: discovered.partyId,
          active_telephony_direction: discovered.direction,
          active_telephony_status_code: discovered.statusCode,
          active_telephony_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await saveIntegration(serviceClient, refreshed);
      }
    } catch {
      // Best-effort session discovery. The status call should still return the RingOut state.
    }
  }

  const ringOutStatus = data.status && typeof data.status === "object" ? (data.status as Record<string, unknown>) : {};
  return jsonResponse({
    success: true,
    call: {
      id: typeof data.id === "string" ? data.id : ringOutId,
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
      to: null,
      from: null,
    },
  });
}

async function handleRingOutCancel(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const ringOutId = readRingOutId(body.ringOutId);
  if (!ringOutId) {
    return jsonResponse({ message: "ringOutId is required." }, { status: 400 });
  }

  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ message: "RingCentral is not connected." }, { status: 409 });
  }

  let refreshed = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);
  const performCancelRequest = async (accessToken: string) => {
    const response = await fetch(
      getRingCentralApiUrl(`/restapi/v1.0/account/~/extension/~/ring-out/${encodeURIComponent(ringOutId)}`),
      {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok && response.status !== 204) {
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
        `RingCentral ring-out cancel request failed (${response.status}).`,
      );
    }

    return null;
  };

  await retryRingCentralRequestAfterRefresh({
    accessToken: refreshed.access_token,
    refreshAccessToken: async () => {
      const next = await refreshIntegration(serviceClient, refreshed);
      return next.access_token;
    },
    request: performCancelRequest,
  });

  await clearActiveTelephonyCall(serviceClient, refreshed);

  return jsonResponse({ success: true });
}

async function handleRingOutEnd(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const ringOutId = readRingOutId(body.ringOutId);
  const connected = readBoolean(body.connected);
  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ message: "RingCentral is not connected." }, { status: 409 });
  }

  let refreshed = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);
  const hasActiveTelephonySession = Boolean(
    refreshed.active_telephony_session_id?.trim() && refreshed.active_telephony_party_id?.trim(),
  );

  if (!ringOutId && !hasActiveTelephonySession) {
    return jsonResponse({ message: "ringOutId is required." }, { status: 400 });
  }

  if (!ringOutId && hasActiveTelephonySession) {
    const sessionId = refreshed.active_telephony_session_id?.trim() || "";
    const partyId = refreshed.active_telephony_party_id?.trim() || "";
    const performHangupRequest = async (accessToken: string) => {
      await deleteActiveTelephonyParty(accessToken, sessionId, partyId);
      return null;
    };

    await retryRingCentralRequestAfterRefresh({
      accessToken: refreshed.access_token,
      refreshAccessToken: async () => {
        const next = await refreshIntegration(serviceClient, refreshed);
        return next.access_token;
      },
      request: performHangupRequest,
    });

    await clearActiveTelephonyCall(serviceClient, refreshed);
    return jsonResponse({ success: true });
  }

  let shouldTreatAsConnected = connected ||
    Boolean(refreshed.active_telephony_session_id?.trim() && refreshed.active_telephony_party_id?.trim());
  if (!shouldTreatAsConnected) {
    try {
      const ringOutData = await retryRingCentralRequestAfterRefresh({
        accessToken: refreshed.access_token,
        refreshAccessToken: async () => {
          const next = await refreshIntegration(serviceClient, refreshed);
          return next.access_token;
        },
        request: (accessToken) => fetchRingOutStatusData(accessToken, ringOutId),
      });
      shouldTreatAsConnected = isRingOutConnectedStatus(ringOutData);
    } catch {
      shouldTreatAsConnected = false;
    }
  }

  if (!shouldTreatAsConnected) {
    const performCancelRequest = async (accessToken: string) => {
      const response = await fetch(
        getRingCentralApiUrl(`/restapi/v1.0/account/~/extension/~/ring-out/${encodeURIComponent(ringOutId)}`),
        {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok && response.status !== 204 && response.status !== 404) {
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
          `RingCentral ring-out cancel request failed (${response.status}).`,
        );
      }

      return null;
    };

    await retryRingCentralRequestAfterRefresh({
      accessToken: refreshed.access_token,
      refreshAccessToken: async () => {
        const next = await refreshIntegration(serviceClient, refreshed);
        return next.access_token;
      },
      request: performCancelRequest,
    });

    await clearActiveTelephonyCall(serviceClient, refreshed);

    return jsonResponse({ success: true });
  }

  let sessionId = refreshed.active_telephony_session_id?.trim() || "";
  let partyId = refreshed.active_telephony_party_id?.trim() || "";
  if (connected && (!sessionId || !partyId)) {
    const retryDelays = [150, 300, 600, 1000];
    for (const delayMs of retryDelays) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const latest = await loadIntegration(serviceClient, workspaceUser.id);
      if (latest) {
        refreshed = latest;
        sessionId = refreshed.active_telephony_session_id?.trim() || "";
        partyId = refreshed.active_telephony_party_id?.trim() || "";
        if (sessionId && partyId) {
          break;
        }
      }
    }
  }

  if (connected && (!sessionId || !partyId)) {
    const discovered = await retryRingCentralRequestAfterRefresh({
      accessToken: refreshed.access_token,
      refreshAccessToken: async () => {
        const next = await refreshIntegration(serviceClient, refreshed);
        refreshed = next;
        return next.access_token;
      },
      request: (accessToken) => discoverActiveTelephonyControl(accessToken, refreshed.extension_id),
    });

    if (discovered) {
      sessionId = discovered.sessionId;
      partyId = discovered.partyId;
      refreshed = {
        ...refreshed,
        active_telephony_session_id: discovered.sessionId,
        active_telephony_party_id: discovered.partyId,
        active_telephony_direction: discovered.direction,
        active_telephony_status_code: discovered.statusCode,
        active_telephony_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await saveIntegration(serviceClient, refreshed);
    }
  }

  if (!sessionId || !partyId) {
    return jsonResponse(
      { message: "No active call control session is available yet. Try ending the call again in a moment." },
      { status: 409 },
    );
  }

  const performHangupRequest = async (accessToken: string) => {
    await deleteActiveTelephonyParty(accessToken, sessionId, partyId);
    return null;
  };

  await retryRingCentralRequestAfterRefresh({
    accessToken: refreshed.access_token,
    refreshAccessToken: async () => {
      const next = await refreshIntegration(serviceClient, refreshed);
      return next.access_token;
    },
    request: performHangupRequest,
  });

  await clearActiveTelephonyCall(serviceClient, refreshed);
  return jsonResponse({ success: true });
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

    if (action === "ring-out-status") {
      return await handleRingOutStatus(body, serviceClient, workspaceUser);
    }

    if (action === "ring-out-cancel") {
      return await handleRingOutCancel(body, serviceClient, workspaceUser);
    }

    if (action === "ring-out-end") {
      return await handleRingOutEnd(body, serviceClient, workspaceUser);
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
