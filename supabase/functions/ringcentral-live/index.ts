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

const ringCentralServerUrl = Deno.env.get("RINGCENTRAL_SERVER_URL")?.trim() || "https://platform.ringcentral.com";
const ringCentralClientId = Deno.env.get("RINGCENTRAL_CLIENT_ID")?.trim() || "";
const ringCentralClientSecret = Deno.env.get("RINGCENTRAL_CLIENT_SECRET")?.trim() || "";

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

  const data = await retryRingCentralRequestAfterRefresh({
    accessToken: refreshed.access_token,
    refreshAccessToken: async () => {
      const next = await refreshIntegration(serviceClient, refreshed);
      return next.access_token;
    },
    request: (accessToken) => fetchRingOutStatusData(accessToken, ringOutId),
  });

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
  if (!ringOutId) {
    return jsonResponse({ message: "ringOutId is required." }, { status: 400 });
  }

  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ message: "RingCentral is not connected." }, { status: 409 });
  }

  const refreshed = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);

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
