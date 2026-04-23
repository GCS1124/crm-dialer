import type { PostgrestError } from "@supabase/supabase-js";

import { env } from "../config/env.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { buildWorkspaceAnalytics } from "./analyticsService.js";
import { buildAiAssist } from "./aiAssistService.js";
import { getVoiceFieldStatus, getVoiceProviderConfig } from "./voiceProviderService.js";
import type {
  ApiCallActivityType,
  ApiCallDisposition,
  ApiCallLogStatus,
  ApiCallType,
  ApiLead,
  ApiLeadImportRecord,
  ApiLeadPriority,
  ApiLeadStatus,
  ApiUser,
  ApiUserRole,
  CreateCallLogInput,
  CreateUserInput,
  SaveDispositionInput,
  SignupInput,
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
  };

  return map[disposition];
}

function callStatusFromDisposition(disposition: ApiCallDisposition): ApiCallLogStatus {
  return ["No Answer", "Busy", "Voicemail", "Wrong Number"].includes(disposition)
    ? "missed"
    : disposition === "Call Back Later" || disposition === "Follow-Up Required"
      ? "follow_up"
      : "connected";
}

function mapStoredCallStatus(value: string, disposition: ApiCallDisposition): ApiCallLogStatus {
  if (value === "connected" || value === "missed" || value === "follow_up") {
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
  if (status === "missed") {
    return "No Answer";
  }
  if (status === "follow_up") {
    return "Follow-Up Required";
  }

  return "Interested";
}

function leadStatusFromCallStatus(status: ApiCallLogStatus): ApiLeadStatus {
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
  const connected = isConfiguredSupabaseUrl() && serviceRoleConfigured;

  return {
    authMode: "supabase" as const,
    signupEnabled: true,
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
      "id, external_id, full_name, phone, alt_phone, email, company, job_title, location, source, interest, status, notes, last_contacted, assigned_agent, callback_time, priority, lead_score, created_at, updated_at",
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
      "id, external_id, full_name, phone, alt_phone, email, company, job_title, location, source, interest, status, notes, last_contacted, assigned_agent, callback_time, priority, lead_score, created_at, updated_at",
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

    return {
      id: lead.id,
      fullName: lead.full_name,
      phone: lead.phone,
      altPhone: lead.alt_phone ?? "",
      email: lead.email ?? "",
      company: lead.company ?? "",
      jobTitle: lead.job_title ?? "",
      location: lead.location ?? "",
      source: lead.source ?? "",
      interest: lead.interest ?? "",
      status: lead.status,
      notes: lead.notes ?? "",
      lastContacted: lead.last_contacted,
      assignedAgentId: assignedAgent?.id ?? "",
      assignedAgentName: assignedAgent?.name ?? "Unassigned",
      callbackTime: activeCallback?.scheduled_for ?? lead.callback_time,
      priority: lead.priority,
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
      tags: (tagsByLead.get(lead.id) ?? []).map((tag) => tag.label),
      callHistory: (callsByLead.get(lead.id) ?? []).map((call) => {
        const status = mapStoredCallStatus(call.call_status, call.disposition);
        const aiAssist = buildAiAssist({
          notes: call.notes ?? "",
          outcomeSummary: call.outcome_summary ?? "",
          status,
          disposition: call.disposition,
          callbackAt: activeCallback?.scheduled_for ?? lead.callback_time,
        });

        return {
          id: call.id,
          leadId: lead.id,
          leadName: lead.full_name,
          phone: lead.phone,
          createdAt: call.created_at,
          agentId: call.agent_id ?? "",
          agentName: call.agent_id
            ? usersById.get(call.agent_id)?.name ?? "Unknown Agent"
            : "Unknown Agent",
          callType: mapStoredCallType(call.direction),
          durationSeconds: call.duration_seconds,
          disposition: call.disposition,
          status,
          notes: call.notes ?? "",
          recordingEnabled: call.recording_enabled,
          outcomeSummary: call.outcome_summary ?? "",
          aiSummary: aiAssist.aiSummary,
          sentiment: aiAssist.sentiment,
          suggestedNextAction: aiAssist.suggestedNextAction,
          followUpAt: activeCallback?.scheduled_for ?? lead.callback_time,
        };
      }),
      notesHistory: (notesByLead.get(lead.id) ?? []).map((note) => ({
        id: note.id,
        body: note.note_body,
        createdAt: note.created_at,
        authorId: note.author_id ?? "",
        authorName: note.author_id
          ? usersById.get(note.author_id)?.name ?? "System"
          : "System",
      })),
      activities: (activitiesByLead.get(lead.id) ?? []).map((activity) => ({
        id: activity.id,
        type: mapActivityType(activity.activity_type),
        title: activity.title,
        description: activity.description ?? "",
        createdAt: activity.created_at,
        actorName: activity.actor_id
          ? usersById.get(activity.actor_id)?.name ?? "System"
          : "System",
      })),
      leadScore: lead.lead_score,
      timezone: assignedAgent?.timezone ?? "UTC",
    };
  });

  return { users, leads };
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
  const { users, leads } = await buildLeadPayload(currentUser);
  const voice = getVoiceProviderConfig();

  return {
    user: currentUser,
    users,
    leads,
    analytics: buildWorkspaceAnalytics(leads, users, currentUser),
    settings: buildSettingsStatus(),
    voice,
  };
}

export async function listUsers() {
  return fetchUsers();
}

export async function listLeads(currentUser: ApiUser) {
  const { leads } = await buildLeadPayload(currentUser);
  return leads;
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
  const createdUser = await createAuthAndWorkspaceUser({
    name: input.name,
    email: input.email,
    password: input.password,
    role: "agent",
    team: input.team,
    timezone: input.timezone,
    title: input.title,
  });

  return createdUser;
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

export function getVoiceIdentity(user: ApiUser) {
  return sanitizeIdentity(`${user.id}_${user.email}`);
}
