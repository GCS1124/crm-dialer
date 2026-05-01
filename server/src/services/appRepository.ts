import type { PostgrestError } from "@supabase/supabase-js";

import { env } from "../config/env.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { buildWorkspaceAnalytics } from "./analyticsService.js";
import { buildAiAssist } from "./aiAssistService.js";
import {
  buildFailedAttemptCallLog,
  buildFailedAttemptDescription,
  formatFailedAttemptSummary,
  parseFailedAttemptDescription,
} from "./callAttemptDiagnostics.js";
import { buildLeadDialNumbers } from "./phoneNumberService.js";
import { getQueueKey, toQueueProgressRecord } from "./queueService.js";
import {
  assignSipProfileToUser as assignStoredSipProfileToUser,
  createSipProfile as createStoredSipProfile,
  deleteSipProfile as deleteStoredSipProfile,
  getActiveSipProfile as getStoredActiveSipProfile,
  getSipProfileWorkspaceState,
  getUserSipAssignmentMap,
  setActiveSipProfile as activateStoredSipProfile,
  updateSipProfile as updateStoredSipProfile,
} from "./sipProfileService.js";
import { getVoiceFieldStatus, getVoiceProviderConfig } from "./voiceProviderService.js";
import { buildSipWorkspaceExposure, canManageWorkspaceAdmin } from "./workspaceAccessService.js";
import type {
  ApiCallActivityType,
  ApiCallDisposition,
  ApiCallLog,
  ApiCallLogStatus,
  ApiCallType,
  ApiLead,
  ApiLeadImportRecord,
  ApiLeadPriority,
  ApiLeadStatus,
  ApiSipProfile,
  ApiUser,
  ApiUserRole,
  QueueFilter,
  QueueProgressRecord,
  QueueSort,
  CreateCallLogInput,
  CreateSipProfileInput,
  CreateUserInput,
  SaveDispositionInput,
  SaveFailedCallAttemptInput,
  SignupInput,
  StoredSipProfile,
  UpdateSipProfileInput,
  UploadResult,
  WorkspacePayload,
} from "../types/index.js";

interface DbUserRow {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  role: ApiUserRole;
  team_name: string;
  title: string | null;
  timezone: string;
  status: "online" | "away" | "offline";
}

interface DbLeadRow {
  id: string;
  external_id: string | null;
  full_name: string;
  phone: string;
  alt_phone: string | null;
  email: string | null;
  company: string | null;
  job_title: string | null;
  location: string | null;
  source: string | null;
  interest: string | null;
  status: ApiLeadStatus;
  notes: string | null;
  last_contacted: string | null;
  assigned_agent: string | null;
  callback_time: string | null;
  priority: ApiLeadPriority;
  lead_score: number;
  created_at: string;
  updated_at: string;
}

interface DbLeadTagRow {
  id: string;
  lead_id: string;
  label: string;
}

interface DbLeadNoteRow {
  id: string;
  lead_id: string;
  author_id: string | null;
  note_body: string;
  created_at: string;
}

interface DbCallLogRow {
  id: string;
  lead_id: string;
  agent_id: string | null;
  direction: string;
  disposition: ApiCallDisposition;
  duration_seconds: number;
  call_status: string;
  recording_enabled: boolean;
  outcome_summary: string | null;
  notes: string | null;
  created_at: string;
}

interface DbActivityRow {
  id: string;
  lead_id: string;
  actor_id: string | null;
  activity_type: string;
  title: string;
  description: string | null;
  created_at: string;
}

interface DbCallbackRow {
  id: string;
  lead_id: string;
  owner_id: string | null;
  scheduled_for: string;
  priority: ApiLeadPriority;
  status: "scheduled" | "completed" | "overdue" | "cancelled";
  created_at: string;
}

interface DbQueueProgressRow {
  user_id: string;
  queue_key: string;
  queue_scope: string;
  queue_sort: QueueSort;
  queue_filter: QueueFilter;
  current_lead_id: string | null;
  current_phone_index: number;
  created_at: string;
  updated_at: string;
}

function handleError(error: PostgrestError | Error | null, message: string): never {
  throw new Error(error ? `${message}: ${error.message}` : message);
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function sanitizeIdentity(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function mapUser(row: DbUserRow): ApiUser {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    role: row.role,
    team: row.team_name,
    timezone: row.timezone,
    avatar: getInitials(row.full_name),
    title: row.title ?? "Outbound Agent",
    status: row.status,
  };
}

function mapActivityType(value: string): ApiCallActivityType {
  if (
    value === "call" ||
    value === "note" ||
    value === "callback" ||
    value === "status" ||
    value === "appointment" ||
    value === "sale"
  ) {
    return value;
  }

  return "status";
}

function dispositionToStatus(disposition: ApiCallDisposition): ApiLeadStatus {
  const map: Record<ApiCallDisposition, ApiLeadStatus> = {
    "No Answer": "contacted",
    Busy: "contacted",
    Voicemail: "contacted",
    "Wrong Number": "invalid",
    "Not Interested": "closed_lost",
    Interested: "qualified",
    "Call Back Later": "callback_due",
    "Follow-Up Required": "follow_up",
    "Appointment Booked": "appointment_booked",
    "Sale Closed": "closed_won",
    "Failed Attempt": "contacted",
  };

  return map[disposition];
}

function callStatusFromDisposition(disposition: ApiCallDisposition): ApiCallLogStatus {
  if (disposition === "Failed Attempt") {
    return "failed";
  }

  return ["No Answer", "Busy", "Voicemail", "Wrong Number"].includes(disposition)
    ? "missed"
    : disposition === "Call Back Later" || disposition === "Follow-Up Required"
      ? "follow_up"
      : "connected";
}

function mapStoredCallStatus(value: string, disposition: ApiCallDisposition): ApiCallLogStatus {
  if (value === "connected" || value === "missed" || value === "follow_up" || value === "failed") {
    return value;
  }

  if (value === "completed") {
    return callStatusFromDisposition(disposition) === "missed" ? "missed" : "connected";
  }

  return callStatusFromDisposition(disposition);
}

function mapStoredCallType(value: string): ApiCallType {
  return value === "incoming" ? "incoming" : "outgoing";
}

function activityTypeFromDisposition(disposition: ApiCallDisposition): ApiCallActivityType {
  if (disposition === "Appointment Booked") {
    return "appointment";
  }
  if (disposition === "Sale Closed") {
    return "sale";
  }
  if (disposition === "Call Back Later" || disposition === "Follow-Up Required") {
    return "callback";
  }

  return "call";
}

function dispositionFromCallStatus(status: ApiCallLogStatus): ApiCallDisposition {
  if (status === "failed") {
    return "Failed Attempt";
  }
  if (status === "missed") {
    return "No Answer";
  }
  if (status === "follow_up") {
    return "Follow-Up Required";
  }

  return "Interested";
}

function leadStatusFromCallStatus(status: ApiCallLogStatus): ApiLeadStatus {
  if (status === "failed") {
    return "contacted";
  }
  if (status === "missed") {
    return "contacted";
  }
  if (status === "follow_up") {
    return "follow_up";
  }

  return "qualified";
}

function buildTemporaryPassword() {
  return `Dialer${Math.random().toString(36).slice(2, 8)}!2026`;
}

function isConfiguredSupabaseUrl() {
  const normalized = env.SUPABASE_URL.trim().toLowerCase();
  return (
    Boolean(normalized) &&
    normalized.startsWith("https://") &&
    !normalized.includes("your-project.supabase.co")
  );
}

function isConfiguredSupabaseKey(value: string, placeholders: string[]) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length > 20 &&
    !placeholders.includes(normalized) &&
    !normalized.startsWith("replace-with-")
  );
}

function buildSettingsStatus() {
  const voice = getVoiceProviderConfig();
  const publishableKeyConfigured = isConfiguredSupabaseKey(env.SUPABASE_PUBLISHABLE_KEY, [
    "publishable-key",
    "anon-key",
    "your-supabase-publishable-key",
    "your-supabase-anon-key",
  ]);
  const serviceRoleConfigured = isConfiguredSupabaseKey(env.SUPABASE_SERVICE_ROLE_KEY, [
    "service-role-key",
    "your-service-role-key",
  ]);
  const connected =
    isConfiguredSupabaseUrl() && publishableKeyConfigured && serviceRoleConfigured;

  return {
    authMode: "supabase" as const,
    signupEnabled: false,
    importFormats: ["csv", "xlsx", "xls"],
    voice: {
      provider: voice.provider,
      available: voice.available,
      callerId: voice.available ? voice.callerId : null,
      configuredFields: getVoiceFieldStatus(),
    },
    supabase: {
      connected,
      publishableKeyConfigured,
      serviceRoleConfigured,
      reason: connected ? "Supabase credentials are configured." : "One or more Supabase credentials are missing.",
      realtimeAvailable: publishableKeyConfigured,
    },
  };
}

async function fetchUsers(): Promise<ApiUser[]> {
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
    .order("full_name", { ascending: true });

  if (error) {
    handleError(error, "Unable to load users");
  }

  return (data as DbUserRow[]).map(mapUser);
}

async function fetchLeadRows(currentUser?: ApiUser) {
  let query = supabaseAdmin
    .from("leads")
    .select(
      "*",
    )
    .order("created_at", { ascending: false });

  if (currentUser?.role === "agent") {
    query = query.eq("assigned_agent", currentUser.id);
  }

  const { data, error } = await query;
  if (error) {
    handleError(error, "Unable to load leads");
  }

  return data as DbLeadRow[];
}

async function fetchLeadRelations(leadIds: string[]) {
  if (!leadIds.length) {
    return {
      tags: [] as DbLeadTagRow[],
      notes: [] as DbLeadNoteRow[],
      calls: [] as DbCallLogRow[],
      activities: [] as DbActivityRow[],
      callbacks: [] as DbCallbackRow[],
    };
  }

  const [tagsResult, notesResult, callsResult, activitiesResult, callbacksResult] =
    await Promise.all([
      supabaseAdmin.from("lead_tags").select("id, lead_id, label").in("lead_id", leadIds),
      supabaseAdmin
        .from("lead_notes")
        .select("id, lead_id, author_id, note_body, created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("call_logs")
        .select(
          "id, lead_id, agent_id, direction, disposition, duration_seconds, call_status, recording_enabled, outcome_summary, notes, created_at",
        )
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("activity_logs")
        .select("id, lead_id, actor_id, activity_type, title, description, created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("callbacks")
        .select("id, lead_id, owner_id, scheduled_for, priority, status, created_at")
        .in("lead_id", leadIds)
        .order("scheduled_for", { ascending: true }),
    ]);

  if (tagsResult.error) {
    handleError(tagsResult.error, "Unable to load lead tags");
  }
  if (notesResult.error) {
    handleError(notesResult.error, "Unable to load lead notes");
  }
  if (callsResult.error) {
    handleError(callsResult.error, "Unable to load call logs");
  }
  if (activitiesResult.error) {
    handleError(activitiesResult.error, "Unable to load activity logs");
  }
  if (callbacksResult.error) {
    handleError(callbacksResult.error, "Unable to load callbacks");
  }

  return {
    tags: (tagsResult.data ?? []) as DbLeadTagRow[],
    notes: (notesResult.data ?? []) as DbLeadNoteRow[],
    calls: (callsResult.data ?? []) as DbCallLogRow[],
    activities: (activitiesResult.data ?? []) as DbActivityRow[],
    callbacks: (callbacksResult.data ?? []) as DbCallbackRow[],
  };
}

async function getAppUserRowByEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) {
    handleError(error, "Unable to load workspace user");
  }

  return (data as DbUserRow | null) ?? null;
}

async function getAppUserRowById(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    handleError(error, "Unable to load workspace user");
  }

  return (data as DbUserRow | null) ?? null;
}

async function getLeadRowById(leadId: string) {
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select(
      "*",
    )
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    handleError(error, "Unable to load lead");
  }

  return (data as DbLeadRow | null) ?? null;
}

async function getCallLogRowById(callId: string) {
  const { data, error } = await supabaseAdmin
    .from("call_logs")
    .select(
      "id, lead_id, agent_id, direction, disposition, duration_seconds, call_status, recording_enabled, outcome_summary, notes, created_at",
    )
    .eq("id", callId)
    .maybeSingle();

  if (error) {
    handleError(error, "Unable to load call log");
  }

  return (data as DbCallLogRow | null) ?? null;
}

async function ensureLeadAccess(leadId: string, currentUser: ApiUser) {
  const lead = await getLeadRowById(leadId);
  if (!lead) {
    throw new Error("Lead not found");
  }

  if (currentUser.role === "agent" && lead.assigned_agent !== currentUser.id) {
    throw new Error("You do not have access to this lead");
  }

  return lead;
}

async function ensureCallLogAccess(callId: string, currentUser: ApiUser) {
  const callLog = await getCallLogRowById(callId);
  if (!callLog) {
    throw new Error("Call log not found");
  }

  const lead = await ensureLeadAccess(callLog.lead_id, currentUser);
  if (currentUser.role === "agent" && callLog.agent_id && callLog.agent_id !== currentUser.id) {
    throw new Error("You do not have access to this call log");
  }

  return { callLog, lead };
}

async function insertAuditLog(
  actorId: string,
  entityType: string,
  entityId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    metadata,
  });

  if (error) {
    handleError(error, "Unable to write audit log");
  }
}

function groupByLeadId<T extends { lead_id: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();

  items.forEach((item) => {
    const bucket = grouped.get(item.lead_id) ?? [];
    bucket.push(item);
    grouped.set(item.lead_id, bucket);
  });

  return grouped;
}

function mapQueueProgressRow(row: DbQueueProgressRow): QueueProgressRecord {
  return {
    userId: row.user_id,
    queueKey: row.queue_key,
    queueScope: row.queue_scope,
    queueSort: row.queue_sort,
    queueFilter: row.queue_filter,
    currentLeadId: row.current_lead_id,
    currentPhoneIndex: row.current_phone_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function buildLeadPayload(currentUser?: ApiUser) {
  const users = await fetchUsers();
  const usersById = new Map(users.map((user) => [user.id, user]));
  const leadRows = await fetchLeadRows(currentUser);
  const relations = await fetchLeadRelations(leadRows.map((lead) => lead.id));
  const tagsByLead = groupByLeadId(relations.tags);
  const notesByLead = groupByLeadId(relations.notes);
  const callsByLead = groupByLeadId(relations.calls);
  const activitiesByLead = groupByLeadId(relations.activities);
  const callbacksByLead = groupByLeadId(
    relations.callbacks.filter((callback) => callback.status === "scheduled"),
  );

  const leads: ApiLead[] = leadRows.map((lead) => {
    const assignedAgent = lead.assigned_agent
      ? usersById.get(lead.assigned_agent) ?? null
      : null;
    const activeCallback = (callbacksByLead.get(lead.id) ?? [])[0];
    const phoneNumbers = buildLeadDialNumbers({
      phone: lead.phone ?? "",
      altPhone: lead.alt_phone ?? "",
    });
    const primaryPhone = phoneNumbers[0] ?? lead.phone ?? "";
    const secondaryPhone = phoneNumbers[1] ?? lead.alt_phone ?? "";
    const activitiesForLead = activitiesByLead.get(lead.id) ?? [];
    const callHistory: ApiCallLog[] = (callsByLead.get(lead.id) ?? []).map((call) => {
      const status = mapStoredCallStatus(call.call_status, call.disposition);
      const aiAssist = buildAiAssist({
        notes: call.notes ?? "",
        outcomeSummary: call.outcome_summary ?? "",
        status,
        disposition: call.disposition,
        callbackAt: activeCallback?.scheduled_for ?? lead.callback_time ?? null,
      });

      return {
        id: call.id,
        leadId: lead.id,
        leadName: lead.full_name ?? "Untitled Lead",
        phone: primaryPhone,
        createdAt: call.created_at,
        agentId: call.agent_id ?? "",
        agentName: call.agent_id
          ? usersById.get(call.agent_id)?.name ?? "Unknown Agent"
          : "Unknown Agent",
        callType: mapStoredCallType(call.direction),
        durationSeconds: call.duration_seconds,
        disposition: call.disposition,
        status,
        source: "call_log",
        notes: call.notes ?? "",
        recordingEnabled: call.recording_enabled,
        outcomeSummary: call.outcome_summary ?? "",
        aiSummary: aiAssist.aiSummary,
        sentiment: aiAssist.sentiment,
        suggestedNextAction: aiAssist.suggestedNextAction,
        followUpAt: activeCallback?.scheduled_for ?? lead.callback_time ?? null,
      };
    });

    activitiesForLead.forEach((activity) => {
      const diagnostic = parseFailedAttemptDescription(activity.description);
      if (!diagnostic) {
        return;
      }

      callHistory.push(
        buildFailedAttemptCallLog({
          id: activity.id,
          leadId: lead.id,
          leadName: lead.full_name ?? "Untitled Lead",
          primaryPhone,
          createdAt: activity.created_at,
          actor: activity.actor_id ? usersById.get(activity.actor_id) ?? null : null,
          diagnostic,
        }),
      );
    });

    callHistory.sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );

    return {
      id: lead.id,
      fullName: lead.full_name ?? "Untitled Lead",
      phone: primaryPhone,
      altPhone: secondaryPhone,
      phoneNumbers,
      email: lead.email ?? "",
      company: lead.company ?? "",
      jobTitle: lead.job_title ?? "",
      location: lead.location ?? "",
      source: lead.source ?? "",
      interest: lead.interest ?? "",
      status: lead.status ?? "new",
      notes: lead.notes ?? "",
      lastContacted: lead.last_contacted ?? null,
      assignedAgentId: assignedAgent?.id ?? "",
      assignedAgentName: assignedAgent?.name ?? "Unassigned",
      callbackTime: activeCallback?.scheduled_for ?? lead.callback_time ?? null,
      priority: lead.priority ?? "Medium",
      createdAt: lead.created_at ?? new Date().toISOString(),
      updatedAt: lead.updated_at ?? lead.created_at ?? new Date().toISOString(),
      tags: (tagsByLead.get(lead.id) ?? []).map((tag) => tag.label),
      callHistory,
      notesHistory: (notesByLead.get(lead.id) ?? []).map((note) => ({
        id: note.id,
        body: note.note_body,
        createdAt: note.created_at,
        authorId: note.author_id ?? "",
        authorName: note.author_id
          ? usersById.get(note.author_id)?.name ?? "System"
          : "System",
      })),
      activities: activitiesForLead.map((activity) => {
        const diagnostic = parseFailedAttemptDescription(activity.description);

        return {
          id: activity.id,
          type: mapActivityType(activity.activity_type),
          title: activity.title,
          description: diagnostic
            ? formatFailedAttemptSummary(diagnostic)
            : activity.description ?? "",
          createdAt: activity.created_at,
          actorName: activity.actor_id
            ? usersById.get(activity.actor_id)?.name ?? "System"
            : "System",
        };
      }),
      leadScore: lead.lead_score ?? 0,
      timezone: assignedAgent?.timezone ?? "UTC",
    };
  });

  return { users, leads };
}

async function attachSipAssignments(users: ApiUser[]) {
  const assignmentMap = await getUserSipAssignmentMap(users);
  return users.map((user) => {
    const assignment = assignmentMap.get(user.id);

    return {
      ...user,
      activeSipProfileId: assignment?.profileId ?? null,
      activeSipProfileLabel: assignment?.profileLabel ?? null,
    };
  });
}

async function createAuthAndWorkspaceUser(input: {
  name: string;
  email: string;
  password: string;
  role: ApiUserRole;
  team: string;
  timezone: string;
  title: string;
}) {
  const existing = await getAppUserRowByEmail(input.email);
  if (existing) {
    throw new Error("A workspace user with this email already exists");
  }

  const authResult = await supabaseAdmin.auth.admin.createUser({
    email: input.email.toLowerCase(),
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.name,
      role: input.role,
      team: input.team,
      title: input.title,
    },
  });

  if (authResult.error || !authResult.data.user) {
    handleError(authResult.error, "Unable to create auth user");
  }

  const { data, error } = await supabaseAdmin
    .from("app_users")
    .insert({
      auth_user_id: authResult.data.user.id,
      full_name: input.name.trim(),
      email: input.email.toLowerCase(),
      role: input.role,
      team_name: input.team.trim(),
      title: input.title.trim(),
      timezone: input.timezone.trim(),
      status: "offline",
    })
    .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
    .single();

  if (error) {
    handleError(error, "Unable to create workspace user");
  }

  return mapUser(data as DbUserRow);
}

export async function getUserByEmail(email: string) {
  const user = await getAppUserRowByEmail(email);
  return user ? mapUser(user) : null;
}

export async function getUserByAuthUserId(authUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    handleError(error, "Unable to load workspace user");
  }

  return data ? mapUser(data as DbUserRow) : null;
}

export async function getUserById(userId: string) {
  const user = await getAppUserRowById(userId);
  return user ? mapUser(user) : null;
}

export async function syncAuthUserLink(email: string, authUserId: string) {
  const workspaceUser = await getAppUserRowByEmail(email);
  if (!workspaceUser || workspaceUser.auth_user_id === authUserId) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("app_users")
    .update({ auth_user_id: authUserId })
    .eq("id", workspaceUser.id);

  if (error) {
    handleError(error, "Unable to link auth user");
  }
}

export async function getWorkspace(currentUser: ApiUser): Promise<WorkspacePayload> {
  const { users: baseUsers, leads } = await buildLeadPayload(currentUser);
  const users = canManageWorkspaceAdmin(currentUser)
    ? await attachSipAssignments(baseUsers)
    : baseUsers;
  const sipProfilesState = await getSipProfileWorkspaceState(currentUser, users);
  const sipExposure = buildSipWorkspaceExposure(currentUser, {
    profiles: sipProfilesState.profiles,
    activeProfile: sipProfilesState.activeProfile,
    selectionRequired: sipProfilesState.selectionRequired,
  });
  const voice = sipProfilesState.activeStoredProfile
    ? {
        provider: "embedded-sip" as const,
        available: true,
        source: "profile" as const,
        callerId: sipProfilesState.activeStoredProfile.callerId,
        websocketUrl: sipProfilesState.activeStoredProfile.providerUrl,
        sipDomain: sipProfilesState.activeStoredProfile.sipDomain,
        username: sipProfilesState.activeStoredProfile.sipUsername,
        profileId: sipProfilesState.activeStoredProfile.id,
        profileLabel: sipProfilesState.activeStoredProfile.label,
      }
    : sipProfilesState.selectionRequired
      ? {
          provider: "embedded-sip" as const,
          available: false,
          source: "unconfigured" as const,
          callerId: null,
          websocketUrl: null,
          sipDomain: null,
          username: null,
          profileId: null,
          profileLabel: null,
        }
      : getVoiceProviderConfig();

  return {
    user: currentUser,
    users,
    leads,
    analytics: buildWorkspaceAnalytics(leads, users, currentUser),
    settings: buildSettingsStatus(),
    voice,
    sipProfiles: sipExposure.profiles,
    activeSipProfile: sipExposure.activeProfile,
    sipProfileSelectionRequired: sipExposure.selectionRequired,
  };
}

export async function listUsers() {
  return attachSipAssignments(await fetchUsers());
}

export async function listLeads(currentUser: ApiUser) {
  const { leads } = await buildLeadPayload(currentUser);
  return leads;
}

async function fetchQueueProgressRows(currentUser: ApiUser, queueKey?: string) {
  let query = supabaseAdmin
    .from("queue_progress")
    .select(
      "user_id, queue_key, queue_scope, queue_sort, queue_filter, current_lead_id, current_phone_index, created_at, updated_at",
    )
    .eq("user_id", currentUser.id)
    .order("updated_at", { ascending: false });

  if (queueKey) {
    query = query.eq("queue_key", queueKey);
  }

  const { data, error } = await query;
  if (error) {
    handleError(error, "Unable to load queue progress");
  }

  return (data ?? []) as DbQueueProgressRow[];
}

export async function getQueueProgress(currentUser: ApiUser, queueKey?: string) {
  const rows = await fetchQueueProgressRows(currentUser, queueKey);
  return rows.map(mapQueueProgressRow);
}

export async function saveQueueProgress(
  input: {
    queueScope: string;
    queueSort: QueueSort;
    queueFilter: QueueFilter;
    currentLeadId: string | null;
    currentPhoneIndex: number;
  },
  currentUser: ApiUser,
) {
  const now = new Date().toISOString();
  const queueKey = getQueueKey(input.queueScope, input.queueSort, input.queueFilter);
  const payload = {
    user_id: currentUser.id,
    queue_key: queueKey,
    queue_scope: input.queueScope,
    queue_sort: input.queueSort,
    queue_filter: input.queueFilter,
    current_lead_id: input.currentLeadId,
    current_phone_index: Math.max(0, input.currentPhoneIndex),
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from("queue_progress")
    .upsert(payload, { onConflict: "user_id,queue_key" })
    .select(
      "user_id, queue_key, queue_scope, queue_sort, queue_filter, current_lead_id, current_phone_index, created_at, updated_at",
    )
    .single();

  if (error) {
    handleError(error, "Unable to save queue progress");
  }

  return mapQueueProgressRow(data as DbQueueProgressRow);
}

export async function resetQueueProgress(
  currentUser: ApiUser,
  queueScope: string,
  queueSort: QueueSort,
  queueFilter: QueueFilter,
) {
  const queueKey = getQueueKey(queueScope, queueSort, queueFilter);
  const { error } = await supabaseAdmin
    .from("queue_progress")
    .delete()
    .eq("user_id", currentUser.id)
    .eq("queue_key", queueKey);

  if (error) {
    handleError(error, "Unable to reset queue progress");
  }
}

export async function listCallLogs(currentUser: ApiUser) {
  const { leads } = await buildLeadPayload(currentUser);
  return leads
    .flatMap((lead) => lead.callHistory)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export async function createManualCallLog(input: CreateCallLogInput, currentUser: ApiUser) {
  const lead = await ensureLeadAccess(input.leadId, currentUser);
  const now = new Date().toISOString();
  const disposition = dispositionFromCallStatus(input.status);
  const aiAssist = buildAiAssist({
    notes: input.notes,
    status: input.status,
    disposition,
    callbackAt: input.callbackAt || null,
  });

  const [callInsert, leadUpdate] = await Promise.all([
    supabaseAdmin.from("call_logs").insert({
      lead_id: input.leadId,
      agent_id: currentUser.id,
      direction: input.callType,
      disposition,
      duration_seconds: input.durationSeconds,
      call_status: input.status,
      recording_enabled: false,
      outcome_summary: aiAssist.aiSummary,
      notes: input.notes.trim() || null,
    }),
    supabaseAdmin
      .from("leads")
      .update({
        last_contacted: now,
        callback_time: input.callbackAt || null,
        priority: input.priority,
        status: leadStatusFromCallStatus(input.status),
        notes: input.notes.trim() || lead.notes,
        updated_at: now,
      })
      .eq("id", input.leadId),
  ]);

  if (callInsert.error) {
    handleError(callInsert.error, "Unable to create call log");
  }
  if (leadUpdate.error) {
    handleError(leadUpdate.error, "Unable to update lead after logging call");
  }

  const operations: Array<PromiseLike<{ error: PostgrestError | null }>> = [
    supabaseAdmin.from("activity_logs").insert({
      lead_id: input.leadId,
      actor_id: currentUser.id,
      activity_type: input.status === "follow_up" ? "callback" : "call",
      title: `${input.callType === "incoming" ? "Incoming" : "Outgoing"} call logged`,
      description: aiAssist.aiSummary,
    }),
  ];

  if (input.notes.trim()) {
    operations.push(
      supabaseAdmin.from("lead_notes").insert({
        lead_id: input.leadId,
        author_id: currentUser.id,
        note_body: input.notes.trim(),
      }),
    );
  }

  operations.push(
    supabaseAdmin
      .from("callbacks")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("lead_id", input.leadId)
      .eq("status", "scheduled"),
  );

  if (input.callbackAt) {
    operations.push(
      supabaseAdmin.from("callbacks").insert({
        lead_id: input.leadId,
        owner_id: currentUser.id,
        scheduled_for: input.callbackAt,
        priority: input.priority,
        status: "scheduled",
      }),
    );
  }

  const results = await Promise.all(operations);
  const failure = results.find((result) => result.error);
  if (failure?.error) {
    handleError(failure.error, "Unable to finalize call log workflow");
  }

  await insertAuditLog(currentUser.id, "call_log", input.leadId, "create", {
    leadId: input.leadId,
    callType: input.callType,
    status: input.status,
  });
}

export async function updateManualCallLog(
  callId: string,
  input: CreateCallLogInput,
  currentUser: ApiUser,
) {
  await ensureLeadAccess(input.leadId, currentUser);
  const { lead } = await ensureCallLogAccess(callId, currentUser);
  const now = new Date().toISOString();
  const disposition = dispositionFromCallStatus(input.status);
  const aiAssist = buildAiAssist({
    notes: input.notes,
    status: input.status,
    disposition,
    callbackAt: input.callbackAt || null,
  });

  const [callUpdate, leadUpdate] = await Promise.all([
    supabaseAdmin
      .from("call_logs")
      .update({
        lead_id: input.leadId,
        direction: input.callType,
        disposition,
        duration_seconds: input.durationSeconds,
        call_status: input.status,
        outcome_summary: aiAssist.aiSummary,
        notes: input.notes.trim() || null,
      })
      .eq("id", callId),
    supabaseAdmin
      .from("leads")
      .update({
        callback_time: input.callbackAt || null,
        priority: input.priority,
        status: leadStatusFromCallStatus(input.status),
        notes: input.notes.trim() || lead.notes,
        updated_at: now,
      })
      .eq("id", input.leadId),
  ]);

  if (callUpdate.error) {
    handleError(callUpdate.error, "Unable to update call log");
  }
  if (leadUpdate.error) {
    handleError(leadUpdate.error, "Unable to update lead after editing call");
  }

  const operations: Array<PromiseLike<{ error: PostgrestError | null }>> = [
    supabaseAdmin.from("activity_logs").insert({
      lead_id: input.leadId,
      actor_id: currentUser.id,
      activity_type: input.status === "follow_up" ? "callback" : "call",
      title: "Call log updated",
      description: aiAssist.aiSummary,
    }),
    supabaseAdmin
      .from("callbacks")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("lead_id", input.leadId)
      .eq("status", "scheduled"),
  ];

  if (input.callbackAt) {
    operations.push(
      supabaseAdmin.from("callbacks").insert({
        lead_id: input.leadId,
        owner_id: currentUser.id,
        scheduled_for: input.callbackAt,
        priority: input.priority,
        status: "scheduled",
      }),
    );
  }

  const results = await Promise.all(operations);
  const failure = results.find((result) => result.error);
  if (failure?.error) {
    handleError(failure.error, "Unable to update follow-up state");
  }

  await insertAuditLog(currentUser.id, "call_log", callId, "update", {
    leadId: input.leadId,
    status: input.status,
  });
}

export async function deleteManualCallLog(callId: string, currentUser: ApiUser) {
  const { callLog } = await ensureCallLogAccess(callId, currentUser);

  const { error } = await supabaseAdmin.from("call_logs").delete().eq("id", callId);
  if (error) {
    handleError(error, "Unable to delete call log");
  }

  await insertAuditLog(currentUser.id, "call_log", callId, "delete", {
    leadId: callLog.lead_id,
  });
}

export async function importLeads(
  records: ApiLeadImportRecord[],
  currentUser: ApiUser,
  assignToUserId?: string,
) {
  let duplicates = 0;
  let invalidRows = 0;
  const normalizedPhones = records.map((record) => record.phone.trim()).filter(Boolean);
  const normalizedEmails = records
    .map((record) => record.email.trim().toLowerCase())
    .filter(Boolean);

  const [existingByPhoneResult, existingByEmailResult] = await Promise.all([
    normalizedPhones.length
      ? supabaseAdmin.from("leads").select("phone").in("phone", normalizedPhones)
      : Promise.resolve({ data: [], error: null }),
    normalizedEmails.length
      ? supabaseAdmin.from("leads").select("email").in("email", normalizedEmails)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (existingByPhoneResult.error) {
    handleError(existingByPhoneResult.error, "Unable to check duplicate phone numbers");
  }
  if (existingByEmailResult.error) {
    handleError(existingByEmailResult.error, "Unable to check duplicate email addresses");
  }

  const existingPhones = new Set(
    ((existingByPhoneResult.data ?? []) as Array<{ phone: string | null }>)
      .map((row) => row.phone ?? "")
      .filter(Boolean),
  );
  const existingEmails = new Set(
    ((existingByEmailResult.data ?? []) as Array<{ email: string | null }>)
      .map((row) => row.email?.toLowerCase() ?? "")
      .filter(Boolean),
  );

  const rows = records.flatMap((record) => {
    if (!record.fullName.trim() || !record.phone.trim()) {
      invalidRows += 1;
      return [];
    }

    const normalizedPhone = record.phone.trim();
    const normalizedEmail = record.email.trim().toLowerCase();
    if (
      existingPhones.has(normalizedPhone) ||
      (normalizedEmail && existingEmails.has(normalizedEmail))
    ) {
      duplicates += 1;
      return [];
    }

    existingPhones.add(normalizedPhone);
    if (normalizedEmail) {
      existingEmails.add(normalizedEmail);
    }

    return [
      {
        full_name: record.fullName.trim(),
        phone: normalizedPhone,
        alt_phone: record.altPhone.trim() || null,
        email: normalizedEmail || null,
        company: record.company.trim() || null,
        job_title: record.jobTitle.trim() || null,
        location: record.location.trim() || null,
        source: record.source.trim() || "Bulk Import",
        interest: record.interest.trim() || null,
        status: record.status,
        notes: record.notes.trim() || null,
        last_contacted: record.lastContacted || null,
        assigned_agent:
          currentUser.role === "agent" ? currentUser.id : assignToUserId ?? null,
        callback_time: record.callbackTime || null,
        priority: record.priority,
        lead_score: 60,
      },
    ];
  });

  if (rows.length) {
    const { data, error } = await supabaseAdmin.from("leads").insert(rows).select("id");
    if (error) {
      handleError(error, "Unable to import leads");
    }

    const insertedIds = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (insertedIds.length) {
      const [tagInsert, activityInsert] = await Promise.all([
        supabaseAdmin.from("lead_tags").insert(
          insertedIds.map((leadId) => ({
            lead_id: leadId,
            label: "bulk-import",
          })),
        ),
        supabaseAdmin.from("activity_logs").insert(
          insertedIds.map((leadId) => ({
            lead_id: leadId,
            actor_id: currentUser.id,
            activity_type: "status",
            title: "Lead imported",
            description: "Imported from spreadsheet and added to the calling queue.",
          })),
        ),
      ]);

      if (tagInsert.error) {
        handleError(tagInsert.error, "Unable to save lead tags");
      }
      if (activityInsert.error) {
        handleError(activityInsert.error, "Unable to save import activities");
      }
    }
  }

  await insertAuditLog(currentUser.id, "lead_import", currentUser.id, "bulk_import", {
    added: rows.length,
    duplicates,
    invalidRows,
  });

  return {
    added: rows.length,
    duplicates,
    invalidRows,
  } satisfies UploadResult;
}

export async function assignLeadToUser(
  leadId: string,
  userId: string,
  currentUser: ApiUser,
) {
  await ensureLeadAccess(leadId, currentUser);

  const assignee = await getAppUserRowById(userId);
  if (!assignee) {
    throw new Error("Assignee not found");
  }

  const { error } = await supabaseAdmin
    .from("leads")
    .update({ assigned_agent: userId, updated_at: new Date().toISOString() })
    .eq("id", leadId);

  if (error) {
    handleError(error, "Unable to assign lead");
  }

  const { error: activityError } = await supabaseAdmin.from("activity_logs").insert({
    lead_id: leadId,
    actor_id: currentUser.id,
    activity_type: "status",
    title: "Lead reassigned",
    description: `Lead assigned to ${assignee.full_name}.`,
  });

  if (activityError) {
    handleError(activityError, "Unable to save assignment activity");
  }

  await insertAuditLog(currentUser.id, "lead", leadId, "assign", {
    assignedTo: userId,
  });
}

export async function updateLeadStatuses(
  leadIds: string[],
  status: ApiLeadStatus,
  currentUser: ApiUser,
) {
  if (!leadIds.length) {
    return 0;
  }

  const scopedIds =
    currentUser.role === "agent"
      ? (
          await Promise.all(
            leadIds.map(async (leadId) => {
              try {
                await ensureLeadAccess(leadId, currentUser);
                return leadId;
              } catch {
                return null;
              }
            }),
          )
        ).filter(Boolean)
      : leadIds;

  if (!scopedIds.length) {
    return 0;
  }

  const { error } = await supabaseAdmin
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", scopedIds as string[]);

  if (error) {
    handleError(error, "Unable to update lead status");
  }

  const { error: activityError } = await supabaseAdmin.from("activity_logs").insert(
    (scopedIds as string[]).map((leadId) => ({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "status",
      title: "Bulk status update",
      description: `Lead moved to ${status.replace("_", " ")}.`,
    })),
  );

  if (activityError) {
    handleError(activityError, "Unable to save bulk update activity");
  }

  await insertAuditLog(currentUser.id, "lead", currentUser.id, "bulk_status_update", {
    leadIds: scopedIds,
    status,
  });

  return (scopedIds as string[]).length;
}

export async function deleteLeadRecords(leadIds: string[], currentUser: ApiUser) {
  if (!leadIds.length) {
    return 0;
  }

  const scopedIds =
    currentUser.role === "agent"
      ? (
          await Promise.all(
            leadIds.map(async (leadId) => {
              try {
                await ensureLeadAccess(leadId, currentUser);
                return leadId;
              } catch {
                return null;
              }
            }),
          )
        ).filter(Boolean)
      : leadIds;

  if (!scopedIds.length) {
    return 0;
  }

  const { error } = await supabaseAdmin.from("leads").delete().in("id", scopedIds as string[]);
  if (error) {
    handleError(error, "Unable to delete leads");
  }

  await insertAuditLog(currentUser.id, "lead", currentUser.id, "bulk_delete", {
    leadIds: scopedIds,
  });

  return (scopedIds as string[]).length;
}

export async function markLeadInvalid(leadId: string, currentUser: ApiUser) {
  await ensureLeadAccess(leadId, currentUser);

  const [leadUpdate, callbackUpdate, activityInsert] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .update({
        status: "invalid",
        notes: "Marked invalid from preview dialer queue.",
        updated_at: new Date().toISOString(),
        callback_time: null,
      })
      .eq("id", leadId),
    supabaseAdmin
      .from("callbacks")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("lead_id", leadId)
      .eq("status", "scheduled"),
    supabaseAdmin.from("activity_logs").insert({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "status",
      title: "Lead marked invalid",
      description: "Removed from active dialer queue after validation.",
    }),
  ]);

  if (leadUpdate.error) {
    handleError(leadUpdate.error, "Unable to mark lead invalid");
  }
  if (callbackUpdate.error) {
    handleError(callbackUpdate.error, "Unable to cancel callbacks");
  }
  if (activityInsert.error) {
    handleError(activityInsert.error, "Unable to save invalid lead activity");
  }

  await insertAuditLog(currentUser.id, "lead", leadId, "mark_invalid", {});
}

export async function saveDisposition(input: SaveDispositionInput, currentUser: ApiUser) {
  const lead = await ensureLeadAccess(input.leadId, currentUser);
  const now = new Date().toISOString();
  const nextStatus = dispositionToStatus(input.disposition);
  const trimmedNotes = input.notes.trim();
  const trimmedSummary = input.outcomeSummary.trim();
  const callbackAt = input.callbackAt || null;

  const [leadUpdate, callInsert] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .update({
        status: nextStatus,
        notes: trimmedNotes || lead.notes,
        last_contacted: now,
        callback_time: callbackAt,
        priority: input.followUpPriority,
        updated_at: now,
      })
      .eq("id", input.leadId),
    supabaseAdmin.from("call_logs").insert({
      lead_id: input.leadId,
      agent_id: currentUser.id,
      direction: "outbound",
      disposition: input.disposition,
      duration_seconds: input.durationSeconds,
      call_status: callStatusFromDisposition(input.disposition),
      recording_enabled: input.recordingEnabled,
      outcome_summary: trimmedSummary,
      notes: trimmedNotes,
    }),
  ]);

  if (leadUpdate.error) {
    handleError(leadUpdate.error, "Unable to update lead after call");
  }
  if (callInsert.error) {
    handleError(callInsert.error, "Unable to save call log");
  }

  const operations: Array<PromiseLike<{ error: PostgrestError | null }>> = [];

  if (trimmedNotes) {
    operations.push(
      supabaseAdmin.from("lead_notes").insert({
        lead_id: input.leadId,
        author_id: currentUser.id,
        note_body: trimmedNotes,
      }),
    );
  }

  operations.push(
    supabaseAdmin.from("activity_logs").insert({
      lead_id: input.leadId,
      actor_id: currentUser.id,
      activity_type: activityTypeFromDisposition(input.disposition),
      title: `${input.disposition} saved`,
      description:
        trimmedSummary || `Disposition ${input.disposition} saved after call completion.`,
    }),
  );

  if (callbackAt) {
    operations.push(
      supabaseAdmin
        .from("callbacks")
        .update({
          status: "cancelled",
          updated_at: now,
        })
        .eq("lead_id", input.leadId)
        .eq("status", "scheduled"),
    );
    operations.push(
      supabaseAdmin.from("callbacks").insert({
        lead_id: input.leadId,
        owner_id: currentUser.id,
        scheduled_for: callbackAt,
        priority: input.followUpPriority,
        status: "scheduled",
      }),
    );
    operations.push(
      supabaseAdmin.from("activity_logs").insert({
        lead_id: input.leadId,
        actor_id: currentUser.id,
        activity_type: "callback",
        title: "Callback scheduled",
        description: `Callback scheduled for ${callbackAt}.`,
      }),
    );
  } else {
    operations.push(
      supabaseAdmin
        .from("callbacks")
        .update({
          status: "cancelled",
          updated_at: now,
        })
        .eq("lead_id", input.leadId)
        .eq("status", "scheduled"),
    );
  }

  if (input.disposition === "Appointment Booked" && callbackAt) {
    operations.push(
      supabaseAdmin.from("appointments").insert({
        lead_id: input.leadId,
        owner_id: currentUser.id,
        scheduled_for: callbackAt,
        status: "scheduled",
        notes: trimmedSummary || trimmedNotes || null,
      }),
    );
  }

  const results = await Promise.all(operations);
  const failingResult = results.find((result) => result.error);
  if (failingResult?.error) {
    handleError(failingResult.error, "Unable to finalize post-call workflow");
  }

  await insertAuditLog(currentUser.id, "lead", input.leadId, "save_disposition", {
    disposition: input.disposition,
    callbackAt,
    durationSeconds: input.durationSeconds,
  });
}

export async function saveFailedCallAttempt(
  input: SaveFailedCallAttemptInput,
  currentUser: ApiUser,
) {
  await ensureLeadAccess(input.leadId, currentUser);
  const now = new Date().toISOString();
  const description = buildFailedAttemptDescription({
    ...input,
    endedAt: input.endedAt || now,
  });

  const [leadUpdate, activityInsert] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .update({
        updated_at: now,
      })
      .eq("id", input.leadId),
    supabaseAdmin.from("activity_logs").insert({
      lead_id: input.leadId,
      actor_id: currentUser.id,
      activity_type: "call",
      title: "Call attempt failed",
      description,
    }),
  ]);

  if (leadUpdate.error) {
    handleError(leadUpdate.error, "Unable to update lead after failed call attempt");
  }
  if (activityInsert.error) {
    handleError(activityInsert.error, "Unable to save failed call attempt");
  }

  await insertAuditLog(currentUser.id, "lead", input.leadId, "save_failed_call_attempt", {
    dialedNumber: input.dialedNumber,
    failureStage: input.failureStage,
    sipStatus: input.sipStatus ?? null,
    sipReason: input.sipReason ?? null,
  });
}

export async function rescheduleLeadCallback(
  leadId: string,
  callbackAt: string,
  priority: ApiLeadPriority,
  currentUser: ApiUser,
) {
  await ensureLeadAccess(leadId, currentUser);
  const now = new Date().toISOString();

  const [leadUpdate, callbackUpdate, callbackInsert, activityInsert] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .update({
        callback_time: callbackAt,
        priority,
        status: "callback_due",
        updated_at: now,
      })
      .eq("id", leadId),
    supabaseAdmin
      .from("callbacks")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("lead_id", leadId)
      .eq("status", "scheduled"),
    supabaseAdmin.from("callbacks").insert({
      lead_id: leadId,
      owner_id: currentUser.id,
      scheduled_for: callbackAt,
      priority,
      status: "scheduled",
    }),
    supabaseAdmin.from("activity_logs").insert({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "callback",
      title: "Callback rescheduled",
      description: `Callback moved to ${callbackAt}.`,
    }),
  ]);

  if (leadUpdate.error) {
    handleError(leadUpdate.error, "Unable to update lead callback");
  }
  if (callbackUpdate.error) {
    handleError(callbackUpdate.error, "Unable to clear previous callbacks");
  }
  if (callbackInsert.error) {
    handleError(callbackInsert.error, "Unable to create callback");
  }
  if (activityInsert.error) {
    handleError(activityInsert.error, "Unable to save callback activity");
  }

  await insertAuditLog(currentUser.id, "lead", leadId, "reschedule_callback", {
    callbackAt,
    priority,
  });
}

export async function completeLeadCallback(leadId: string, currentUser: ApiUser) {
  await ensureLeadAccess(leadId, currentUser);
  const now = new Date().toISOString();

  const [leadUpdate, callbackUpdate, activityInsert] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .update({
        callback_time: null,
        status: "contacted",
        updated_at: now,
      })
      .eq("id", leadId),
    supabaseAdmin
      .from("callbacks")
      .update({
        status: "completed",
        completed_at: now,
        updated_at: now,
      })
      .eq("lead_id", leadId)
      .eq("status", "scheduled"),
    supabaseAdmin.from("activity_logs").insert({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "callback",
      title: "Callback completed",
      description: "Scheduled callback was completed and removed from queue.",
    }),
  ]);

  if (leadUpdate.error) {
    handleError(leadUpdate.error, "Unable to complete callback");
  }
  if (callbackUpdate.error) {
    handleError(callbackUpdate.error, "Unable to update callback record");
  }
  if (activityInsert.error) {
    handleError(activityInsert.error, "Unable to save callback completion activity");
  }

  await insertAuditLog(currentUser.id, "lead", leadId, "complete_callback", {});
}

export async function reopenLead(leadId: string, currentUser: ApiUser) {
  await ensureLeadAccess(leadId, currentUser);
  const now = new Date().toISOString();

  const [leadUpdate, callbackUpdate, activityInsert] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .update({
        status: "follow_up",
        callback_time: null,
        updated_at: now,
      })
      .eq("id", leadId),
    supabaseAdmin
      .from("callbacks")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("lead_id", leadId)
      .eq("status", "scheduled"),
    supabaseAdmin.from("activity_logs").insert({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "status",
      title: "Lead reopened",
      description: "Lead moved back into the follow-up queue.",
    }),
  ]);

  if (leadUpdate.error) {
    handleError(leadUpdate.error, "Unable to reopen lead");
  }
  if (callbackUpdate.error) {
    handleError(callbackUpdate.error, "Unable to clear callback state");
  }
  if (activityInsert.error) {
    handleError(activityInsert.error, "Unable to save reopen activity");
  }

  await insertAuditLog(currentUser.id, "lead", leadId, "reopen_lead", {});
}

export async function createWorkspaceUser(input: CreateUserInput, currentUser: ApiUser) {
  const temporaryPassword = input.temporaryPassword ?? buildTemporaryPassword();
  const createdUser = await createAuthAndWorkspaceUser({
    name: input.name,
    email: input.email,
    password: temporaryPassword,
    role: input.role,
    team: input.team,
    timezone: input.timezone,
    title: input.title,
  });
  await insertAuditLog(currentUser.id, "user", createdUser.id, "create_user", {
    email: createdUser.email,
    role: createdUser.role,
  });

  return {
    user: createdUser,
    temporaryPassword,
  };
}

export async function createPublicSignup(input: SignupInput) {
  void input;
  throw new Error("Account creation is managed by an administrator.");
}

export async function updateWorkspaceUserStatus(
  userId: string,
  status: "online" | "away" | "offline",
  currentUser: ApiUser,
) {
  const { error } = await supabaseAdmin
    .from("app_users")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    handleError(error, "Unable to update user status");
  }

  await insertAuditLog(currentUser.id, "user", userId, "status_update", { status });
}

export async function listSipProfiles(currentUser: ApiUser): Promise<ApiSipProfile[]> {
  const { users } = await buildLeadPayload(currentUser);
  const state = await getSipProfileWorkspaceState(currentUser, users);
  return buildSipWorkspaceExposure(currentUser, {
    profiles: state.profiles,
    activeProfile: state.activeProfile,
    selectionRequired: state.selectionRequired,
  }).profiles;
}

export async function getActiveSipProfile(currentUser: ApiUser): Promise<StoredSipProfile | null> {
  return getStoredActiveSipProfile(currentUser);
}

export async function createSipProfile(input: CreateSipProfileInput, currentUser: ApiUser) {
  const profile = await createStoredSipProfile(input, currentUser);
  await insertAuditLog(currentUser.id, "sip_profile", profile.id, "create", {
    label: profile.label,
    isShared: profile.isShared,
  });
  return profile;
}

export async function setActiveSipProfile(profileId: string, currentUser: ApiUser) {
  await activateStoredSipProfile(profileId, currentUser);
  await insertAuditLog(currentUser.id, "sip_profile", profileId, "activate", {});
}

export async function updateSipProfile(
  profileId: string,
  input: UpdateSipProfileInput,
  currentUser: ApiUser,
) {
  const profile = await updateStoredSipProfile(profileId, input, currentUser);
  await insertAuditLog(currentUser.id, "sip_profile", profileId, "update", {
    label: profile.label,
    isShared: profile.isShared,
  });
  return profile;
}

export async function deleteSipProfile(profileId: string, currentUser: ApiUser) {
  await deleteStoredSipProfile(profileId, currentUser);
  await insertAuditLog(currentUser.id, "sip_profile", profileId, "delete", {});
}

export async function assignSipProfileToUser(
  userId: string,
  profileId: string | null,
  currentUser: ApiUser,
) {
  const targetUser = await getAppUserRowById(userId);
  if (!targetUser) {
    throw new Error("User not found");
  }

  await assignStoredSipProfileToUser(userId, profileId);
  await insertAuditLog(currentUser.id, "user", userId, "sip_assignment", {
    profileId,
  });
}

export async function deleteWorkspaceUser(userId: string, currentUser: ApiUser) {
  if (userId === currentUser.id) {
    throw new Error("You cannot delete your own admin account.");
  }

  const user = await getAppUserRowById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const now = new Date().toISOString();
  const { data: ownedProfiles, error: ownedProfilesError } = await supabaseAdmin
    .from("sip_profiles")
    .select("id")
    .eq("owner_user_id", userId);

  if (ownedProfilesError) {
    handleError(ownedProfilesError, "Unable to inspect user SIP profiles");
  }

  const ownedProfileIds = ((ownedProfiles ?? []) as Array<{ id: string }>).map((row) => row.id);

  const mutationTasks: Array<PromiseLike<{ error: PostgrestError | null }>> = [
    supabaseAdmin
      .from("leads")
      .update({ assigned_agent: null, updated_at: now })
      .eq("assigned_agent", userId),
    supabaseAdmin.from("call_logs").update({ agent_id: null }).eq("agent_id", userId),
    supabaseAdmin.from("lead_notes").update({ author_id: null }).eq("author_id", userId),
    supabaseAdmin.from("activity_logs").update({ actor_id: null }).eq("actor_id", userId),
    supabaseAdmin.from("callbacks").update({ owner_id: null, updated_at: now }).eq("owner_id", userId),
    supabaseAdmin.from("appointments").update({ owner_id: null }).eq("owner_id", userId),
    supabaseAdmin.from("audit_logs").update({ actor_id: null }).eq("actor_id", userId),
    supabaseAdmin.from("queue_progress").delete().eq("user_id", userId),
    supabaseAdmin.from("user_sip_preferences").delete().eq("user_id", userId),
  ];

  if (ownedProfileIds.length) {
    mutationTasks.push(
      supabaseAdmin
        .from("user_sip_preferences")
        .delete()
        .in("active_sip_profile_id", ownedProfileIds),
    );
    mutationTasks.push(
      supabaseAdmin.from("sip_profiles").delete().in("id", ownedProfileIds),
    );
  }

  const results = await Promise.all(mutationTasks);
  const failedResult = results.find((result) => result.error);
  if (failedResult?.error) {
    handleError(failedResult.error, "Unable to clean up user dependencies");
  }

  const { error: deleteUserError } = await supabaseAdmin.from("app_users").delete().eq("id", userId);
  if (deleteUserError) {
    handleError(deleteUserError, "Unable to delete workspace user");
  }

  if (user.auth_user_id) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.auth_user_id, false);
    if (error) {
      handleError(error, "Workspace user deleted, but auth deletion failed");
    }
  }

  await insertAuditLog(currentUser.id, "user", userId, "delete_user", {
    email: user.email,
  });
}

export function getVoiceIdentity(user: ApiUser) {
  return sanitizeIdentity(`${user.id}_${user.email}`);
}
