import { getSupabaseClient, hasSupabaseBrowserConfig } from "./supabase";
import { getSessionAccessToken, getSessionUser, signInWithPassword, signUpWithPassword } from "../services/auth";
import {
  activateSipProfile,
  assignLead,
  assignSipProfileToUser,
  bulkUpdateLeadStatus,
  computeNextQueueCursor,
  createCallLog,
  createSipProfile,
  deleteCallLog,
  deleteLeads,
  deleteSipProfile,
  deleteWorkspaceUser,
  inviteWorkspaceUser,
  loadQueueCursor,
  loadVoiceSession,
  loadWorkspace,
  markCallbackCompleted,
  markLeadInvalid,
  reopenLead,
  rescheduleCallback,
  saveDisposition,
  saveFailedCallAttempt,
  saveQueueCursor,
  updateCallLog,
  updateSipProfile,
  updateWorkspaceUserStatus,
  uploadLeads,
} from "../services/workspace";
import type {
  CallLogFormInput,
  CreateSipProfileInput,
  LeadPriority,
  LeadStatus,
  QueueFilter,
  QueueSort,
  QueueState,
  SipProfile,
  UpdateSipProfileInput,
  UploadResult,
  User,
  WorkspacePayload,
} from "../types";

const DEFAULT_TIMEOUT_MS = 15_000;

function parseRoute(path: string) {
  return new URL(path, "https://crm.local");
}

function readJsonBody(body: RequestInit["body"]) {
  if (typeof body !== "string") {
    return {};
  }

  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

interface RequestOptions extends RequestInit {
  token?: string | null;
  timeoutMs?: number;
}

interface ApiErrorOptions {
  status?: number | null;
  code?: string;
  details?: unknown;
  isNetworkError?: boolean;
}

export class ApiError extends Error {
  status: number | null;
  code?: string;
  details?: unknown;
  isNetworkError: boolean;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? null;
    this.code = options.code;
    this.details = options.details;
    this.isNetworkError = options.isNetworkError ?? false;
  }
}

export function buildApiUrl(path: string) {
  if (typeof window !== "undefined") {
    return `${window.location.origin.replace(/\/+$/, "")}${path}`;
  }

  return path;
}

async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new ApiError("Missing session context", { status: 401 });
  }

  return user;
}

function toQueueSort(value: string | null): QueueSort {
  return value === "newest" || value === "callback_due" ? value : "priority";
}

function toQueueFilter(value: string | null): QueueFilter {
  if (
    value === "new" ||
    value === "contacted" ||
    value === "callback_due" ||
    value === "follow_up" ||
    value === "qualified" ||
    value === "appointment_booked" ||
    value === "closed_won" ||
    value === "closed_lost" ||
    value === "invalid"
  ) {
    return value;
  }

  return "all";
}

function readAuthResponseUser(value: unknown) {
  return value && typeof value === "object" && "id" in value ? (value as User) : null;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  void (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const route = parseRoute(path);
  const body = readJsonBody(options.body);
  const method = (options.method ?? "GET").toUpperCase();
  const pathname = route.pathname.replace(/\/+$/, "") || "/";

  try {
    if (pathname === "/auth/me" && method === "GET") {
      return { user: await requireSessionUser() } as T;
    }

    if (pathname === "/auth/login" && method === "POST") {
      const email = readString(body.email);
      const password = readString(body.password);
      const user = await signInWithPassword(email, password);
      if (!user) {
        throw new ApiError("Unable to establish a Supabase session.", { status: 401 });
      }

      const client = getSupabaseClient();
      const { data } = await client.auth.getSession();
      return {
        token: data.session?.access_token ?? null,
        refreshToken: data.session?.refresh_token ?? null,
        user,
      } as T;
    }

    if (pathname === "/auth/signup" && method === "POST") {
      const user = await signUpWithPassword({
        name: readString(body.name),
        email: readString(body.email),
        password: readString(body.password),
        team: readString(body.team),
        timezone: readString(body.timezone),
        title: readString(body.title),
      });

      const client = getSupabaseClient();
      const { data } = await client.auth.getSession();
      return {
        token: data.session?.access_token ?? null,
        refreshToken: data.session?.refresh_token ?? null,
        user: user ?? readAuthResponseUser(data.session?.user) ?? null,
        message: data.session ? undefined : "Account created, but sign-in is still required.",
      } as T;
    }

    if (pathname === "/workspace" && method === "GET") {
      const user = await requireSessionUser();
      return (await loadWorkspace(user)) as T;
    }

    if (pathname === "/queue" && method === "GET") {
      const user = await requireSessionUser();
      const workspace = await loadWorkspace(user);
      return (await loadQueueCursor(
        user,
        workspace.leads,
        toQueueSort(route.searchParams.get("sort")),
        toQueueFilter(route.searchParams.get("filter")),
        route.searchParams.get("scope") ?? "default",
      )) as T;
    }

    if (pathname === "/queue" && method === "PUT") {
      const user = await requireSessionUser();
      const queueScope = readString(body.queueScope, "default");
      const queueSort = toQueueSort(readString(body.queueSort, "priority"));
      const queueFilter = toQueueFilter(readString(body.queueFilter, "all"));
      await saveQueueCursor(
        user,
        queueScope,
        queueSort,
        queueFilter,
        typeof body.currentLeadId === "string" ? body.currentLeadId : null,
        readNumber(body.currentPhoneIndex, 0),
      );
      const workspace = await loadWorkspace(user);
      return (await loadQueueCursor(user, workspace.leads, queueSort, queueFilter, queueScope)) as T;
    }

    if (pathname === "/queue/advance" && method === "POST") {
      const user = await requireSessionUser();
      const queueScope = readString(body.queueScope, "default");
      const queueSort = toQueueSort(readString(body.queueSort, "priority"));
      const queueFilter = toQueueFilter(readString(body.queueFilter, "all"));
      const currentLeadId = typeof body.currentLeadId === "string" ? body.currentLeadId : null;
      const currentPhoneIndex = readNumber(body.currentPhoneIndex, 0);
      const outcome =
        body.outcome === "completed" ||
        body.outcome === "failed" ||
        body.outcome === "skipped" ||
        body.outcome === "invalid" ||
        body.outcome === "restart"
          ? body.outcome
          : "completed";
      const workspace = await loadWorkspace(user);
      const nextCursor = computeNextQueueCursor(
        workspace.leads,
        user,
        queueSort,
        queueFilter,
        queueScope,
        { currentLeadId, currentPhoneIndex },
        outcome,
      );
      await saveQueueCursor(
        user,
        queueScope,
        queueSort,
        queueFilter,
        nextCursor.currentLeadId,
        nextCursor.currentPhoneIndex,
      );
      return (await loadQueueCursor(user, workspace.leads, queueSort, queueFilter, queueScope)) as T;
    }

    if (pathname === "/queue/restart" && method === "POST") {
      const user = await requireSessionUser();
      const queueScope = readString(body.queueScope ?? route.searchParams.get("scope"), "default");
      const queueSort = toQueueSort(readString(body.queueSort ?? route.searchParams.get("sort"), "priority"));
      const queueFilter = toQueueFilter(readString(body.queueFilter ?? route.searchParams.get("filter"), "all"));
      const workspace = await loadWorkspace(user);
      const nextCursor = computeNextQueueCursor(
        workspace.leads,
        user,
        queueSort,
        queueFilter,
        queueScope,
        null,
        "restart",
      );
      await saveQueueCursor(
        user,
        queueScope,
        queueSort,
        queueFilter,
        nextCursor.currentLeadId,
        nextCursor.currentPhoneIndex,
      );
      return (await loadQueueCursor(user, workspace.leads, queueSort, queueFilter, queueScope)) as T;
    }

    if (pathname === "/dialer/session" && method === "GET") {
      return (await loadVoiceSession(options.token ?? null)) as T;
    }

    if (pathname === "/dialer/attempt" && method === "POST") {
      const user = await requireSessionUser();
      await saveFailedCallAttempt(
        {
          leadId: readString(body.leadId),
          dialedNumber: readString(body.dialedNumber),
          failureStage: readString(body.failureStage) as any,
          sipStatus:
            typeof body.sipStatus === "number" || body.sipStatus === null ? body.sipStatus : null,
          sipReason:
            typeof body.sipReason === "string" || body.sipReason === null ? body.sipReason : null,
          failureMessage:
            typeof body.failureMessage === "string" || body.failureMessage === null
              ? body.failureMessage
              : null,
          startedAt: readString(body.startedAt),
          endedAt: typeof body.endedAt === "string" || body.endedAt === null ? body.endedAt : null,
        },
        user,
      );
      return { success: true } as T;
    }

    if (pathname === "/dialer/disposition" && method === "POST") {
      const user = await requireSessionUser();
      const leadId = readString(body.leadId);
      const queueScope = readString(body.queueScope, "default");
      const queueSort = toQueueSort(readString(body.queueSort, "priority"));
      const queueFilter = toQueueFilter(readString(body.queueFilter, "all"));
      const currentPhoneIndex = readNumber(body.currentPhoneIndex, 0);
      await saveDisposition(
        {
          leadId,
          disposition: readString(body.disposition) as any,
          notes: readString(body.notes),
          callbackAt: readString(body.callbackAt),
          followUpPriority: readString(body.followUpPriority) as LeadPriority,
          outcomeSummary: readString(body.outcomeSummary),
          durationSeconds: readNumber(body.durationSeconds, 0),
          recordingEnabled: readBoolean(body.recordingEnabled, false),
        },
        user,
      );

      const workspace = await loadWorkspace(user);
      const nextCursor = computeNextQueueCursor(
        workspace.leads,
        user,
        queueSort,
        queueFilter,
        queueScope,
        { currentLeadId: leadId, currentPhoneIndex },
        "completed",
      );
      await saveQueueCursor(
        user,
        queueScope,
        queueSort,
        queueFilter,
        nextCursor.currentLeadId,
        nextCursor.currentPhoneIndex,
      );
      const queueState = await loadQueueCursor(user, workspace.leads, queueSort, queueFilter, queueScope);
      return { success: true, queueState } as T;
    }

    if (pathname === "/leads/upload" && method === "POST") {
      const user = await requireSessionUser();
      return (await uploadLeads(readArray(body.records) as never, user, readString(body.assignToUserId) || undefined)) as T;
    }

    if (/^\/leads\/[^/]+\/invalid$/.test(pathname) && method === "PATCH") {
      const user = await requireSessionUser();
      const leadId = pathname.split("/")[2];
      await markLeadInvalid(leadId, user);
      return { success: true } as T;
    }

    if (/^\/leads\/[^/]+\/assign$/.test(pathname) && method === "PATCH") {
      const user = await requireSessionUser();
      const leadId = pathname.split("/")[2];
      await assignLead(leadId, readString(body.userId), user);
      return { success: true } as T;
    }

    if (pathname === "/leads/bulk-status" && method === "POST") {
      const user = await requireSessionUser();
      const leadIds = readArray(body.leadIds).filter((value): value is string => typeof value === "string");
      const status = readString(body.status) as LeadStatus;
      const updated = await bulkUpdateLeadStatus(leadIds, status, user);
      return { updated } as T;
    }

    if (pathname === "/leads/bulk-delete" && method === "POST") {
      const user = await requireSessionUser();
      const leadIds = readArray(body.leadIds).filter((value): value is string => typeof value === "string");
      const deleted = await deleteLeads(leadIds, user);
      return { deleted } as T;
    }

    if (pathname === "/calls" && method === "POST") {
      const user = await requireSessionUser();
      await createCallLog(body as unknown as CallLogFormInput, user);
      return { success: true } as T;
    }

    if (/^\/calls\/[^/]+$/.test(pathname) && method === "PATCH") {
      const user = await requireSessionUser();
      const callId = pathname.split("/")[2];
      await updateCallLog(callId, body as unknown as CallLogFormInput, user);
      return { success: true } as T;
    }

    if (/^\/calls\/[^/]+$/.test(pathname) && method === "DELETE") {
      const user = await requireSessionUser();
      const callId = pathname.split("/")[2];
      await deleteCallLog(callId, user);
      return { success: true } as T;
    }

    if (/^\/callbacks\/[^/]+\/reschedule$/.test(pathname) && method === "PATCH") {
      const user = await requireSessionUser();
      const leadId = pathname.split("/")[2];
      await rescheduleCallback(
        leadId,
        readString(body.callbackTime),
        readString(body.priority) as LeadPriority,
        user,
      );
      return { success: true } as T;
    }

    if (/^\/callbacks\/[^/]+\/complete$/.test(pathname) && method === "PATCH") {
      const user = await requireSessionUser();
      const leadId = pathname.split("/")[2];
      await markCallbackCompleted(leadId, user);
      return { success: true } as T;
    }

    if (/^\/callbacks\/[^/]+\/reopen$/.test(pathname) && method === "PATCH") {
      const user = await requireSessionUser();
      const leadId = pathname.split("/")[2];
      await reopenLead(leadId, user);
      return { success: true } as T;
    }

    if (pathname === "/users" && method === "GET") {
      const user = await requireSessionUser();
      const workspace = await loadWorkspace(user);
      return { items: workspace.users, total: workspace.users.length } as T;
    }

    if (pathname === "/users" && method === "POST") {
      await requireSessionUser();
      return (await inviteWorkspaceUser({
        name: readString(body.name),
        email: readString(body.email),
        role: readString(body.role) as User["role"],
        team: readString(body.team),
        timezone: readString(body.timezone),
        title: readString(body.title),
      })) as T;
    }

    if (/^\/users\/[^/]+\/status$/.test(pathname) && method === "PATCH") {
      const user = await requireSessionUser();
      const userId = pathname.split("/")[2];
      await updateWorkspaceUserStatus(userId, readString(body.status) as User["status"], user);
      return { success: true } as T;
    }

    if (/^\/users\/[^/]+$/.test(pathname) && method === "DELETE") {
      const user = await requireSessionUser();
      const userId = pathname.split("/")[2];
      await deleteWorkspaceUser(userId);
      void user;
      return null as T;
    }

    if (pathname === "/sip-profiles" && method === "GET") {
      const user = await requireSessionUser();
      const workspace = await loadWorkspace(user);
      return { profiles: workspace.sipProfiles } as T;
    }

    if (pathname === "/sip-profiles" && method === "POST") {
      const user = await requireSessionUser();
      const profile = await createSipProfile(
        {
          label: readString(body.label),
          providerUrl: readString(body.providerUrl),
          sipDomain: readString(body.sipDomain),
          sipUsername: readString(body.sipUsername),
          sipPassword: readString(body.sipPassword),
          callerId: readString(body.callerId),
          isShared: readBoolean(body.isShared, false),
        } satisfies CreateSipProfileInput,
        user,
      );
      return { profile } as T;
    }

    if (pathname === "/sip-profiles/active" && method === "PATCH") {
      const user = await requireSessionUser();
      await activateSipProfile(readString(body.profileId), user);
      return { success: true } as T;
    }

    if (pathname === "/sip-profiles/assign" && method === "PATCH") {
      const user = await requireSessionUser();
      await assignSipProfileToUser(
        readString(body.userId),
        typeof body.profileId === "string" || body.profileId === null ? body.profileId : null,
      );
      return { success: true } as T;
    }

    if (/^\/sip-profiles\/[^/]+$/.test(pathname) && method === "PATCH") {
      const user = await requireSessionUser();
      const profileId = pathname.split("/")[2];
      const profile = await updateSipProfile(
        profileId,
        {
          label: readString(body.label),
          providerUrl: readString(body.providerUrl),
          sipDomain: readString(body.sipDomain),
          sipUsername: readString(body.sipUsername),
          sipPassword: readString(body.sipPassword) || undefined,
          callerId: readString(body.callerId),
          isShared: readBoolean(body.isShared, false),
        } satisfies UpdateSipProfileInput,
        user,
      );
      return { profile } as T;
    }

    if (/^\/sip-profiles\/[^/]+$/.test(pathname) && method === "DELETE") {
      const user = await requireSessionUser();
      const profileId = pathname.split("/")[2];
      await deleteSipProfile(profileId, user);
      return null as T;
    }

    if (pathname === "/runtime" && method === "GET") {
      const voice = await loadVoiceSession();
      return {
        backend: "ok" as const,
        dataMode: "supabase" as const,
        signupEnabled: false,
        message: hasSupabaseBrowserConfig
          ? "Live Supabase mode is active."
          : "Supabase browser credentials are not configured.",
        supabase: {
          configured: hasSupabaseBrowserConfig,
          reachable: hasSupabaseBrowserConfig,
          host: null,
          reason: hasSupabaseBrowserConfig ? null : "Supabase browser client is not configured.",
        },
        voice: {
          provider: voice.provider,
          available: voice.available,
        },
      } as T;
    }

    throw new ApiError(`Unsupported route: ${method} ${pathname}`, { status: 404 });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      error instanceof Error ? error.message : "Unable to complete the requested action.",
      {
        details: error,
        status: 500,
      },
    );
  }
}
