import { supabase, hasSupabaseBrowserConfig, assertSupabaseConfigured } from "../lib/supabase";
import { buildWorkspaceAnalytics } from "../lib/analytics";
import { getInitials } from "../lib/utils";
import type {
  CallAttemptFailureStage,
  CallDisposition,
  CallLog,
  CallLogFormInput,
  CallLogStatus,
  CallType,
  Lead,
  LeadImportRecord,
  LeadPriority,
  LeadStatus,
  SipProfile,
  User,
  CreateSipProfileInput,
  QueueCursor,
  QueueFilter,
  QueueItem,
  QueueProgressRecord,
  QueueSort,
  QueueState,
  SaveDispositionInput,
  UpdateSipProfileInput,
  UploadResult,
  VoiceProviderConfig,
  WorkspacePayload,
  WorkspaceSettingsStatus,
} from "../types";

interface VoiceSessionResponse extends VoiceProviderConfig {
  sipUri?: string;
  authorizationUsername?: string;
  authorizationPassword?: string;
  dialPrefix?: string;
  displayName?: string;
  message?: string;
}

type ApiCallAttemptFailureStage = CallAttemptFailureStage;
type ApiCallDisposition = CallDisposition;
type ApiCallLog = CallLog;
type ApiCallLogStatus = CallLogStatus;
type ApiCallType = CallType;
type ApiLead = Lead;
type ApiLeadImportRecord = LeadImportRecord;
type ApiLeadPriority = LeadPriority;
type ApiLeadStatus = LeadStatus;
type ApiSipProfile = SipProfile;
type ApiUser = User;
type CreateCallLogInput = CallLogFormInput;
type SignupInput = {
  name: string;
  email: string;
  password: string;
  team: string;
  timezone: string;
  title: string;
};

interface SaveFailedCallAttemptInput {
  leadId: string;
  dialedNumber: string;
  failureStage: ApiCallAttemptFailureStage;
  sipStatus?: number | null;
  sipReason?: string | null;
  failureMessage?: string | null;
  startedAt: string;
  endedAt?: string | null;
}

interface StoredSipProfile extends ApiSipProfile {
  sipPassword: string;
}

interface DbUserRow {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  role: ApiUser["role"];
  team_name: string;
  title: string | null;
  timezone: string;
  status: User["status"];
}

interface DbLeadRow {
  id: string;
  external_id: string | null;
  full_name: string;
  phone: string;
  alt_phone: string | null;
  phone_numbers: string[] | null;
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
  direction: ApiCallType;
  disposition: ApiCallDisposition;
  duration_seconds: number;
  call_status: ApiCallLogStatus;
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
  completed_at: string | null;
  created_at: string;
  updated_at: string;
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

interface DbSipProfileRow {
  id: string;
  label: string;
  provider_url: string;
  sip_domain: string;
  sip_username: string;
  sip_password: string;
  caller_id: string;
  owner_user_id: string | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

interface DbUserSipPreferenceRow {
  user_id: string;
  active_sip_profile_id: string | null;
}

interface FailedAttemptDiagnostic {
  dialedNumber: string;
  failureStage: ApiCallAttemptFailureStage;
  sipStatus: number | null;
  sipReason: string | null;
  failureMessage: string | null;
  startedAt: string;
  endedAt: string;
}

const diagnosticPrefix = "CALL_ATTEMPT_DIAGNOSTIC:";
const missedDispositions = new Set(["No Answer", "Busy", "Voicemail", "Wrong Number"]);
const openStatuses = new Set<ApiLeadStatus>([
  "new",
  "contacted",
  "callback_due",
  "follow_up",
  "qualified",
  "appointment_booked",
]);

function requireSupabaseClient() {
  assertSupabaseConfigured();
  if (!supabase) {
    throw new Error("Supabase browser client is not configured.");
  }

  return supabase;
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanString(value: string | null | undefined, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeIso(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function normalizeStage(value: unknown): ApiCallAttemptFailureStage {
  if (
    value === "session_unavailable" ||
    value === "session_start" ||
    value === "invite" ||
    value === "microphone" ||
    value === "server_disconnect" ||
    value === "sip_reject" ||
    value === "hangup_before_connect" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}

function isFailedAttemptDescription(description: string | null | undefined) {
  return Boolean(description?.startsWith(diagnosticPrefix));
}

function buildFailedAttemptDescription(input: SaveFailedCallAttemptInput) {
  const now = new Date().toISOString();
  const payload: FailedAttemptDiagnostic = {
    dialedNumber: cleanString(input.dialedNumber),
    failureStage: normalizeStage(input.failureStage),
    sipStatus: typeof input.sipStatus === "number" ? input.sipStatus : null,
    sipReason: cleanString(input.sipReason, "") || null,
    failureMessage: cleanString(input.failureMessage, "") || null,
    startedAt: safeIso(input.startedAt, now),
    endedAt: safeIso(input.endedAt, now),
  };

  return `${diagnosticPrefix}${JSON.stringify(payload)}`;
}

function parseFailedAttemptDescription(description: string | null | undefined): FailedAttemptDiagnostic | null {
  if (!description?.startsWith(diagnosticPrefix)) {
    return null;
  }

  try {
    const value = JSON.parse(description.slice(diagnosticPrefix.length)) as Partial<FailedAttemptDiagnostic>;
    const now = new Date().toISOString();

    return {
      dialedNumber: cleanString(value.dialedNumber),
      failureStage: normalizeStage(value.failureStage),
      sipStatus: typeof value.sipStatus === "number" ? value.sipStatus : null,
      sipReason: cleanString(value.sipReason, "") || null,
      failureMessage: cleanString(value.failureMessage, "") || null,
      startedAt: safeIso(value.startedAt, now),
      endedAt: safeIso(value.endedAt, now),
    };
  } catch {
    return null;
  }
}

function formatFailedAttemptSummary(diagnostic: FailedAttemptDiagnostic) {
  const failureStageLabels: Record<ApiCallAttemptFailureStage, string> = {
    session_unavailable: "Session unavailable",
    session_start: "Session start",
    invite: "Invite failed",
    microphone: "Microphone blocked",
    server_disconnect: "SIP server disconnect",
    sip_reject: "SIP rejected",
    hangup_before_connect: "Ended before connect",
    unknown: "Unknown failure",
  };

  const stage = failureStageLabels[diagnostic.failureStage];
  const sipSummary = diagnostic.sipStatus
    ? ` SIP ${diagnostic.sipStatus}${diagnostic.sipReason ? ` ${diagnostic.sipReason}` : ""}.`
    : "";
  const message = diagnostic.failureMessage ? ` ${diagnostic.failureMessage}` : "";

  return `${stage} before connect for ${diagnostic.dialedNumber || "unknown number"}.${sipSummary}${message}`.trim();
}

function buildFailedAttemptCallLog(input: {
  id: string;
  leadId: string;
  leadName: string;
  primaryPhone: string;
  createdAt: string;
  actor: User | null;
  diagnostic: FailedAttemptDiagnostic;
}): ApiCallLog {
  const durationSeconds = Math.max(
    0,
    Math.floor(
      (new Date(input.diagnostic.endedAt).getTime() - new Date(input.diagnostic.startedAt).getTime()) /
        1000,
    ),
  );
  const summary = formatFailedAttemptSummary(input.diagnostic);

  return {
    id: input.id,
    leadId: input.leadId,
    leadName: input.leadName,
    phone: input.diagnostic.dialedNumber || input.primaryPhone,
    createdAt: input.createdAt,
    agentId: input.actor?.id ?? "",
    agentName: input.actor?.name ?? "System",
    callType: "outgoing",
    durationSeconds,
    disposition: "Failed Attempt",
    status: "failed",
    source: "failed_attempt",
    failureStage: input.diagnostic.failureStage,
    sipStatus: input.diagnostic.sipStatus,
    sipReason: input.diagnostic.sipReason,
    failureMessage: input.diagnostic.failureMessage,
    notes: input.diagnostic.failureMessage ?? "",
    recordingEnabled: false,
    outcomeSummary: summary,
    aiSummary: summary,
    sentiment: "neutral",
    suggestedNextAction:
      "Review SIP status and profile settings, then retry or continue with the manual dialer.",
    followUpAt: null,
  };
}

function firstUsefulLine(value: string) {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .find(Boolean) ?? ""
  );
}

function detectSentiment(text: string, status: ApiCallLogStatus) {
  const content = text.toLowerCase();

  if (status === "missed" || status === "failed") {
    return "neutral" as const;
  }

  const positiveSignals = [
    "interested",
    "booked",
    "qualified",
    "proposal",
    "pricing",
    "demo",
    "yes",
    "approved",
    "happy",
    "good",
  ];
  const negativeSignals = [
    "not interested",
    "wrong number",
    "angry",
    "bad",
    "declined",
    "cancel",
    "spam",
    "busy",
    "no answer",
    "voicemail",
    "later",
  ];

  const positiveCount = positiveSignals.filter((signal) => content.includes(signal)).length;
  const negativeCount = negativeSignals.filter((signal) => content.includes(signal)).length;

  if (positiveCount > negativeCount) {
    return "positive" as const;
  }

  if (negativeCount > positiveCount) {
    return "negative" as const;
  }

  return "neutral" as const;
}

function buildSuggestedNextAction(
  status: ApiCallLogStatus,
  sentiment: "positive" | "neutral" | "negative",
  callbackAt?: string | null,
) {
  if (status === "follow_up" && callbackAt) {
    return "Reschedule the next touch and keep the lead in the active follow-up queue.";
  }
  if (status === "missed") {
    return "Retry later and leave a note only if you learned something useful.";
  }
  if (status === "failed") {
    return "Review SIP diagnostics, retry the browser call, or continue in manual mode.";
  }
  if (sentiment === "positive") {
    return "Move the lead forward with a concrete next step or booking.";
  }
  if (sentiment === "negative") {
    return "Review objections, decide whether to nurture later, or close out the lead.";
  }
  return "Capture the context clearly and decide whether a follow-up is needed.";
}

function buildSummary(text: string, status: ApiCallLogStatus, disposition?: ApiCallDisposition) {
  const firstLine = firstUsefulLine(text);
  if (firstLine) {
    return firstLine.slice(0, 160);
  }

  if (disposition) {
    return `${disposition} logged from the call workflow.`;
  }

  if (status === "follow_up") {
    return "Follow-up required after this call.";
  }
  if (status === "missed") {
    return "Call attempt was missed and needs another try.";
  }
  if (status === "failed") {
    return "Browser call failed before connecting.";
  }

  return "Call completed and saved to the CRM.";
}

function buildAiAssist(input: {
  notes: string;
  status: ApiCallLogStatus;
  callbackAt?: string | null;
  disposition?: ApiCallDisposition;
  outcomeSummary?: string;
}) {
  const source = [input.outcomeSummary ?? "", input.notes].filter(Boolean).join(". ").trim();
  const aiSummary = buildSummary(source, input.status, input.disposition);
  const sentiment = detectSentiment(source, input.status);
  const suggestedNextAction = buildSuggestedNextAction(input.status, sentiment, input.callbackAt);

  return {
    aiSummary,
    sentiment,
    suggestedNextAction,
  };
}

function stripExtension(value: string) {
  return value.replace(/\s*(?:ext\.?|extension|x)\s*\d+$/i, "").trim();
}

function dedupePreserveOrder(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function normalizeDialableNumber(rawValue: string): string | null {
  const trimmed = stripExtension(rawValue.trim());
  if (!trimmed) {
    return null;
  }

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  return hasPlus ? `+${digits}` : digits;
}

function extractDialableNumbers(rawValue: string): string[] {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [];
  }

  const segments = trimmed
    .split(/[,\n;|/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const candidates = segments.length > 1 ? segments : [trimmed];
  return dedupePreserveOrder(
    candidates.flatMap((candidate) => {
      const normalized = normalizeDialableNumber(candidate);
      return normalized ? [normalized] : [];
    }),
  );
}

function buildLeadDialNumbers(input: {
  phone: string;
  altPhone: string;
  phoneNumbers?: string[] | null;
}) {
  const sourceNumbers =
    input.phoneNumbers?.length && input.phoneNumbers.length > 0
      ? input.phoneNumbers
      : [input.phone, input.altPhone];

  return dedupePreserveOrder(sourceNumbers.flatMap((value) => extractDialableNumbers(value)));
}

function normalizeLeadImportPhoneFields(input: {
  phone: string;
  altPhone: string;
  phoneNumbers?: string[] | null;
}) {
  const phoneNumbers = buildLeadDialNumbers(input);

  return {
    phone: phoneNumbers[0] ?? input.phone.trim(),
    altPhone: phoneNumbers[1] ?? "",
    phoneNumbers,
  };
}

function getQueueKey(queueScope: string, queueSort: QueueSort, queueFilter: QueueFilter) {
  return `${queueScope}:${queueSort}:${queueFilter}`;
}

function getVisibleLeads(leads: Lead[], role: User["role"], userId: string) {
  if (role === "agent") {
    return leads.filter((lead) => lead.assignedAgentId === userId);
  }

  return leads;
}

function sortQueueLeads(leads: Lead[], sortBy: QueueSort) {
  const priorityOrder: Record<"Urgent" | "High" | "Medium" | "Low", number> = {
    Urgent: 0,
    High: 1,
    Medium: 2,
    Low: 3,
  };

  const queue = [...leads];
  queue.sort((left, right) => {
    if (sortBy === "priority") {
      const priorityGap = priorityOrder[left.priority] - priorityOrder[right.priority];
      if (priorityGap !== 0) {
        return priorityGap;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }

    if (sortBy === "callback_due") {
      const leftValue = left.callbackTime
        ? new Date(left.callbackTime).getTime()
        : Number.MAX_SAFE_INTEGER;
      const rightValue = right.callbackTime
        ? new Date(right.callbackTime).getTime()
        : Number.MAX_SAFE_INTEGER;

      if (leftValue !== rightValue) {
        return leftValue - rightValue;
      }
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  return queue;
}

function resolveQueueIndex(queueItems: QueueItem[], cursor: QueueCursor | null | undefined) {
  if (!queueItems.length) {
    return -1;
  }

  if (!cursor?.currentLeadId) {
    return 0;
  }

  const exactIndex = queueItems.findIndex(
    (item) => item.leadId === cursor.currentLeadId && item.phoneIndex === cursor.currentPhoneIndex,
  );

  if (exactIndex >= 0) {
    return exactIndex;
  }

  const sameLeadItems = queueItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.leadId === cursor.currentLeadId);

  if (!sameLeadItems.length) {
    return 0;
  }

  const nextSameLead = sameLeadItems.find(({ item }) => item.phoneIndex > cursor.currentPhoneIndex);

  if (nextSameLead) {
    return nextSameLead.index;
  }

  return sameLeadItems[sameLeadItems.length - 1].index + 1;
}

function buildQueueItems(
  leads: Lead[],
  currentUser: User,
  queueSort: QueueSort,
  queueFilter: QueueFilter,
  queueScope = "default",
) {
  const scoped = getVisibleLeads(leads, currentUser.role, currentUser.id).filter((lead) =>
    queueFilter === "all" ? openStatuses.has(lead.status) : lead.status === queueFilter,
  );

  return sortQueueLeads(scoped, queueSort).flatMap((lead) => {
    const phoneNumbers = buildLeadDialNumbers({
      phone: lead.phone,
      altPhone: lead.altPhone,
      phoneNumbers: lead.phoneNumbers,
    });

    return phoneNumbers.map((phoneNumber, phoneIndex) => ({
      queueKey: getQueueKey(queueScope, queueSort, queueFilter),
      queueScope,
      queueSort,
      queueFilter,
      leadId: lead.id,
      leadName: lead.fullName,
      phoneIndex,
      phoneNumber,
      numberCount: phoneNumbers.length,
    }));
  });
}

function selectQueueState(
  queueItems: QueueItem[],
  cursor: QueueCursor | QueueProgressRecord | null | undefined,
  queueScope = "default",
  queueSort: QueueSort = "priority",
  queueFilter: QueueFilter = "all",
): QueueState {
  const currentIndex = resolveQueueIndex(queueItems, cursor);
  const currentItem =
    currentIndex >= 0 && currentIndex < queueItems.length ? queueItems[currentIndex] : null;
  const nextItem = currentIndex >= 0 ? queueItems[currentIndex + 1] ?? null : queueItems[0] ?? null;

  return {
    queueKey: getQueueKey(queueScope, queueSort, queueFilter),
    queueScope,
    queueSort,
    queueFilter,
    currentItem,
    nextItem,
    items: queueItems,
    progress:
      cursor && "userId" in cursor
        ? cursor
        : cursor?.currentLeadId != null
          ? {
              userId: "",
              queueKey: getQueueKey(queueScope, queueSort, queueFilter),
              queueScope,
              queueSort,
              queueFilter,
              currentLeadId: cursor.currentLeadId,
              currentPhoneIndex: cursor.currentPhoneIndex,
              createdAt: "",
              updatedAt: "",
            }
          : null,
  };
}

function advanceQueueCursor(
  queueItems: QueueItem[],
  cursor: QueueCursor | null | undefined,
  outcome: "completed" | "failed" | "skipped" | "invalid" | "restart" = "completed",
): QueueCursor {
  if (!queueItems.length) {
    return { currentLeadId: null, currentPhoneIndex: 0 };
  }

  if (outcome === "restart") {
    return {
      currentLeadId: queueItems[0].leadId,
      currentPhoneIndex: queueItems[0].phoneIndex,
    };
  }

  const currentIndex = resolveQueueIndex(queueItems, cursor);
  const nextItem = currentIndex >= 0 ? queueItems[currentIndex + 1] ?? null : queueItems[0] ?? null;

  return {
    currentLeadId: nextItem?.leadId ?? null,
    currentPhoneIndex: nextItem?.phoneIndex ?? 0,
  };
}

function mapUser(row: DbUserRow): User {
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

function mapCallStatus(value: string, disposition: ApiCallDisposition): ApiCallLogStatus {
  if (value === "connected" || value === "missed" || value === "follow_up" || value === "failed") {
    return value;
  }

  if (value === "completed") {
    return missedDispositions.has(disposition) ? "missed" : "connected";
  }

  return missedDispositions.has(disposition)
    ? "missed"
    : disposition === "Call Back Later" || disposition === "Follow-Up Required"
      ? "follow_up"
      : "connected";
}

function mapCallType(value: string): ApiCallType {
  return value === "incoming" ? "incoming" : "outgoing";
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

  if (missedDispositions.has(disposition)) {
    return "missed";
  }

  return disposition === "Call Back Later" || disposition === "Follow-Up Required"
    ? "follow_up"
    : "connected";
}

function activityTypeFromDisposition(disposition: ApiCallDisposition) {
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

function normalizeSipDomain(value: string) {
  return value
    .trim()
    .replace(/^(wss?|https?):\/\//i, "")
    .replace(/\/+$/, "")
    .replace(/\/.*$/, "");
}

function normalizeSipProviderUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^wss?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http/i, "ws");
  }

  return `wss://${normalizeSipDomain(trimmed)}/`;
}

function maskSecret(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length <= 4) {
    return "*".repeat(trimmed.length);
  }

  return `${"*".repeat(Math.max(0, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

function canManageSharedProfiles(user: User) {
  return user.role === "admin" || user.role === "team_leader";
}

function mapSipProfileRow(
  row: DbSipProfileRow,
  activeProfileId: string | null,
  usersById: Map<string, User>,
): ApiSipProfile {
  return {
    id: row.id,
    label: row.label,
    providerUrl: row.provider_url,
    sipDomain: row.sip_domain,
    sipUsername: row.sip_username,
    callerId: row.caller_id,
    ownerUserId: row.owner_user_id,
    ownerUserName: row.owner_user_id ? (usersById.get(row.owner_user_id)?.name ?? null) : null,
    isShared: row.is_shared,
    isActive: row.id === activeProfileId,
    passwordPreview: maskSecret(row.sip_password),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStoredSipProfile(
  row: DbSipProfileRow,
  activeProfileId: string | null,
  usersById: Map<string, User>,
): StoredSipProfile {
  const apiProfile = mapSipProfileRow(row, activeProfileId, usersById);
  return {
    ...apiProfile,
    sipPassword: row.sip_password,
  };
}

function mapLeadRow(
  lead: DbLeadRow,
  usersById: Map<string, User>,
  relations: {
    tags: Map<string, DbLeadTagRow[]>;
    notes: Map<string, DbLeadNoteRow[]>;
    calls: Map<string, DbCallLogRow[]>;
    activities: Map<string, DbActivityRow[]>;
    callbacks: Map<string, DbCallbackRow[]>;
  },
) {
  const assignedAgent = lead.assigned_agent ? usersById.get(lead.assigned_agent) ?? null : null;
  const activeCallback = (relations.callbacks.get(lead.id) ?? [])[0];
  const phoneNumbers = buildLeadDialNumbers({
    phone: lead.phone ?? "",
    altPhone: lead.alt_phone ?? "",
    phoneNumbers: lead.phone_numbers ?? [],
  });
  const primaryPhone = phoneNumbers[0] ?? lead.phone ?? "";
  const secondaryPhone = phoneNumbers[1] ?? lead.alt_phone ?? "";
  const activitiesForLead = relations.activities.get(lead.id) ?? [];
  const callHistory: ApiCallLog[] = (relations.calls.get(lead.id) ?? []).map((call) => {
    const status = mapCallStatus(call.call_status, call.disposition);
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
      leadName: lead.full_name || "Untitled Lead",
      phone: primaryPhone,
      createdAt: call.created_at,
      agentId: call.agent_id ?? "",
      agentName: call.agent_id ? usersById.get(call.agent_id)?.name ?? "Unknown Agent" : "Unknown Agent",
      callType: mapCallType(call.direction),
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
        leadName: lead.full_name || "Untitled Lead",
        primaryPhone,
        createdAt: activity.created_at,
        actor: activity.actor_id ? usersById.get(activity.actor_id) ?? null : null,
        diagnostic,
      }),
    );
  });

  callHistory.sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  return {
    id: lead.id,
    fullName: lead.full_name || "Untitled Lead",
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
    tags: (relations.tags.get(lead.id) ?? []).map((tag) => tag.label),
    callHistory,
    notesHistory: (relations.notes.get(lead.id) ?? []).map((note) => ({
      id: note.id,
      body: note.note_body,
      createdAt: note.created_at,
      authorId: note.author_id ?? "",
      authorName: note.author_id ? usersById.get(note.author_id)?.name ?? "System" : "System",
    })),
    activities: activitiesForLead.map((activity) => {
      const diagnostic = parseFailedAttemptDescription(activity.description);
      return {
        id: activity.id,
        type:
          activity.activity_type === "call" ||
          activity.activity_type === "note" ||
          activity.activity_type === "callback" ||
          activity.activity_type === "status" ||
          activity.activity_type === "appointment" ||
          activity.activity_type === "sale"
            ? activity.activity_type
            : "status",
        title: activity.title,
        description: diagnostic ? formatFailedAttemptSummary(diagnostic) : activity.description ?? "",
        createdAt: activity.created_at,
        actorName: activity.actor_id ? usersById.get(activity.actor_id)?.name ?? "System" : "System",
      };
    }),
    leadScore: lead.lead_score ?? 0,
    timezone: assignedAgent?.timezone ?? "UTC",
  } satisfies Lead;
}

export async function loadVoiceSession(token?: string | null) {
  const client = requireSupabaseClient();
  const { data, error } = await client.functions.invoke<VoiceSessionResponse>("voice-session", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (error) {
    return {
      provider: "embedded-sip" as const,
      available: false,
      source: "unconfigured" as const,
      callerId: null,
      websocketUrl: null,
      sipDomain: null,
      username: null,
      profileId: null,
      profileLabel: null,
      message: error.message,
    } satisfies VoiceSessionResponse;
  }

  return data ?? {
    provider: "embedded-sip" as const,
    available: false,
    source: "unconfigured" as const,
    callerId: null,
    websocketUrl: null,
    sipDomain: null,
    username: null,
    profileId: null,
    profileLabel: null,
    message: "The CRM softphone is not configured yet.",
  } satisfies VoiceSessionResponse;
}

async function fetchWorkspaceUsers() {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("app_users")
    .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
    .order("full_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as DbUserRow[];
}

async function fetchWorkspaceUserPreferences(userIds: string[]) {
  const client = requireSupabaseClient();
  if (!userIds.length) {
    return [] as DbUserSipPreferenceRow[];
  }

  const { data, error } = await client
    .from("user_sip_preferences")
    .select("user_id, active_sip_profile_id")
    .in("user_id", userIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as DbUserSipPreferenceRow[];
}

async function fetchSipProfiles() {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("sip_profiles")
    .select(
      "id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared, created_at, updated_at",
    )
    .order("is_shared", { ascending: false })
    .order("label", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as DbSipProfileRow[];
}

async function fetchQueueProgress(currentUserId: string, queueKey: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("queue_progress")
    .select(
      "user_id, queue_key, queue_scope, queue_sort, queue_filter, current_lead_id, current_phone_index, created_at, updated_at",
    )
    .eq("user_id", currentUserId)
    .eq("queue_key", queueKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as DbQueueProgressRow | null) ?? null;
}

function toQueueProgressRecord(row: DbQueueProgressRow): QueueProgressRecord {
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

async function upsertQueueProgress(input: {
  userId: string;
  queueScope: string;
  queueSort: QueueSort;
  queueFilter: QueueFilter;
  currentLeadId: string | null;
  currentPhoneIndex: number;
}) {
  const client = requireSupabaseClient();
  const now = new Date().toISOString();
  const queueKey = getQueueKey(input.queueScope, input.queueSort, input.queueFilter);

  const { error } = await client.from("queue_progress").upsert(
    {
      user_id: input.userId,
      queue_key: queueKey,
      queue_scope: input.queueScope,
      queue_sort: input.queueSort,
      queue_filter: input.queueFilter,
      current_lead_id: input.currentLeadId,
      current_phone_index: Math.max(0, input.currentPhoneIndex),
      updated_at: now,
    },
    {
      onConflict: "user_id,queue_key",
    },
  );

  if (error) {
    throw error;
  }
}

async function fetchLeadsWorkspace() {
  const client = requireSupabaseClient();
  const [users, leadRows, tagRows, noteRows, callRows, activityRows, callbackRows] =
    await Promise.all([
      fetchWorkspaceUsers(),
      client
        .from("leads")
        .select(
          "id, external_id, full_name, phone, alt_phone, phone_numbers, email, company, job_title, location, source, interest, status, notes, last_contacted, assigned_agent, callback_time, priority, lead_score, created_at, updated_at",
        )
        .order("created_at", { ascending: false }),
      client.from("lead_tags").select("id, lead_id, label"),
      client.from("lead_notes").select("id, lead_id, author_id, note_body, created_at"),
      client.from("call_logs").select(
        "id, lead_id, agent_id, direction, disposition, duration_seconds, call_status, recording_enabled, outcome_summary, notes, created_at",
      ),
      client.from("activity_logs").select(
        "id, lead_id, actor_id, activity_type, title, description, created_at",
      ),
      client.from("callbacks").select(
        "id, lead_id, owner_id, scheduled_for, priority, status, completed_at, created_at, updated_at",
      ),
    ]);

  if (leadRows.error) throw leadRows.error;
  if (tagRows.error) throw tagRows.error;
  if (noteRows.error) throw noteRows.error;
  if (callRows.error) throw callRows.error;
  if (activityRows.error) throw activityRows.error;
  if (callbackRows.error) throw callbackRows.error;

  const usersById = new Map(users.map((user) => [user.id, mapUser(user)]));
  const tags = new Map<string, DbLeadTagRow[]>();
  const notes = new Map<string, DbLeadNoteRow[]>();
  const calls = new Map<string, DbCallLogRow[]>();
  const activities = new Map<string, DbActivityRow[]>();
  const callbacks = new Map<string, DbCallbackRow[]>();

  ((tagRows.data ?? []) as DbLeadTagRow[]).forEach((row) => {
    const bucket = tags.get(row.lead_id) ?? [];
    bucket.push(row);
    tags.set(row.lead_id, bucket);
  });
  ((noteRows.data ?? []) as DbLeadNoteRow[]).forEach((row) => {
    const bucket = notes.get(row.lead_id) ?? [];
    bucket.push(row);
    notes.set(row.lead_id, bucket);
  });
  ((callRows.data ?? []) as DbCallLogRow[]).forEach((row) => {
    const bucket = calls.get(row.lead_id) ?? [];
    bucket.push(row);
    calls.set(row.lead_id, bucket);
  });
  ((activityRows.data ?? []) as DbActivityRow[]).forEach((row) => {
    const bucket = activities.get(row.lead_id) ?? [];
    bucket.push(row);
    activities.set(row.lead_id, bucket);
  });
  ((callbackRows.data ?? []) as DbCallbackRow[]).forEach((row) => {
    if (row.status !== "scheduled") {
      return;
    }
    const bucket = callbacks.get(row.lead_id) ?? [];
    bucket.push(row);
    callbacks.set(row.lead_id, bucket);
  });

  const leadData = ((leadRows.data ?? []) as DbLeadRow[]).map((lead) =>
    mapLeadRow(lead, usersById, { tags, notes, calls, activities, callbacks }),
  );

  return {
    users: Array.from(usersById.values()),
    leads: leadData,
    usersById,
  };
}

async function loadSipProfileState(currentUser: User, users: User[]) {
  const client = requireSupabaseClient();
  const [profileRows, preferenceRows] = await Promise.all([
    fetchSipProfiles(),
    client
      .from("user_sip_preferences")
      .select("user_id, active_sip_profile_id")
      .eq("user_id", currentUser.id)
      .maybeSingle(),
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));
  const activeProfileId = (preferenceRows.data as DbUserSipPreferenceRow | null)?.active_sip_profile_id ?? null;
  const activeRow = activeProfileId ? profileRows.find((profile) => profile.id === activeProfileId) ?? null : null;
  const activeProfile = activeRow ? mapSipProfileRow(activeRow, activeProfileId, usersById) : null;
  const activeStoredProfile = activeRow ? mapStoredSipProfile(activeRow, activeProfileId, usersById) : null;

  const visibleProfiles =
    currentUser.role === "admin"
      ? profileRows.map((row) => mapSipProfileRow(row, activeProfileId, usersById))
      : [];

  return {
    profiles: visibleProfiles,
    activeProfile,
    activeStoredProfile,
    selectionRequired: currentUser.role === "admin" && visibleProfiles.length > 0 && !activeProfileId,
  };
}

function buildWorkspaceSettingsStatus(voice: VoiceSessionResponse): WorkspaceSettingsStatus {
  return {
    authMode: "supabase",
    signupEnabled: true,
    importFormats: ["csv", "xlsx", "xls"],
    voice: {
      provider: "embedded-sip",
      available: voice.available,
      callerId: voice.callerId,
      configuredFields: {
        websocketUrl: Boolean(voice.websocketUrl),
        sipDomain: Boolean(voice.sipDomain),
        sipUsername: Boolean(voice.username),
        sipPassword: Boolean(voice.authorizationPassword),
        callerId: Boolean(voice.callerId),
      },
    },
    supabase: {
      connected: true,
      publishableKeyConfigured: hasSupabaseBrowserConfig,
      serviceRoleConfigured: true,
      reason: null,
      realtimeAvailable: true,
    },
  };
}

export async function loadWorkspace(currentUser: User): Promise<WorkspacePayload> {
  const { users, leads } = await fetchLeadsWorkspace();
  const session = await loadVoiceSession();
  const sipState = await loadSipProfileState(currentUser, users);
  const usersWithAssignments = await attachSipAssignments(users);
  const currentSessionUser = {
    ...currentUser,
    activeSipProfileId: sipState.activeProfile?.id ?? null,
    activeSipProfileLabel: sipState.activeProfile?.label ?? null,
  };

  return {
    user: currentSessionUser,
    users: usersWithAssignments,
    leads,
    analytics: buildWorkspaceAnalytics(leads, usersWithAssignments, currentSessionUser),
    settings: buildWorkspaceSettingsStatus(session),
    voice: session,
    sipProfiles: sipState.profiles,
    activeSipProfile: sipState.activeProfile,
    sipProfileSelectionRequired: sipState.selectionRequired,
  };
}

async function attachSipAssignments(users: User[]) {
  const client = requireSupabaseClient();
  const ids = users.map((user) => user.id);
  if (!ids.length) {
    return users;
  }

  const { data, error } = await client
    .from("user_sip_preferences")
    .select("user_id, active_sip_profile_id")
    .in("user_id", ids);

  if (error) {
    return users;
  }

  const profileIds = Array.from(
    new Set(
      ((data ?? []) as DbUserSipPreferenceRow[])
        .map((row) => row.active_sip_profile_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const profileRows = profileIds.length
    ? ((await client
        .from("sip_profiles")
        .select("id, label")
        .in("id", profileIds)) as { data: Array<{ id: string; label: string }> | null; error: Error | null })
    : { data: [], error: null };

  const profileMap = new Map(
    ((profileRows.data ?? []) as Array<{ id: string; label: string }>).map((row) => [row.id, row.label]),
  );
  const assignmentMap = new Map<string, { profileId: string | null; profileLabel: string | null }>();
  ((data ?? []) as DbUserSipPreferenceRow[]).forEach((row) => {
    assignmentMap.set(row.user_id, {
      profileId: row.active_sip_profile_id ?? null,
      profileLabel: row.active_sip_profile_id ? profileMap.get(row.active_sip_profile_id) ?? null : null,
    });
  });

  return users.map((user) => {
    const assignment = assignmentMap.get(user.id);
    return {
      ...user,
      activeSipProfileId: assignment?.profileId ?? null,
      activeSipProfileLabel: assignment?.profileLabel ?? null,
    };
  });
}

export async function loadQueueCursor(
  currentUser: User,
  leads: Lead[],
  queueSort: QueueSort,
  queueFilter: QueueFilter,
  queueScope = "default",
): Promise<QueueState> {
  const queueItems = buildQueueItems(leads, currentUser, queueSort, queueFilter, queueScope);
  const queueKey = getQueueKey(queueScope, queueSort, queueFilter);
  const progress = await fetchQueueProgress(currentUser.id, queueKey);
  return selectQueueState(
    queueItems,
    progress ? toQueueProgressRecord(progress) : null,
    queueScope,
    queueSort,
    queueFilter,
  );
}

export async function saveQueueCursor(
  currentUser: User,
  queueScope: string,
  queueSort: QueueSort,
  queueFilter: QueueFilter,
  currentLeadId: string | null,
  currentPhoneIndex: number,
) {
  await upsertQueueProgress({
    userId: currentUser.id,
    queueScope,
    queueSort,
    queueFilter,
    currentLeadId,
    currentPhoneIndex,
  });
}

export function computeNextQueueCursor(
  leads: Lead[],
  currentUser: User,
  queueSort: QueueSort,
  queueFilter: QueueFilter,
  queueScope: string,
  cursor: QueueCursor | null,
  outcome: "completed" | "failed" | "skipped" | "invalid" | "restart" = "completed",
) {
  const queueItems = buildQueueItems(leads, currentUser, queueSort, queueFilter, queueScope);
  return advanceQueueCursor(queueItems, cursor, outcome);
}

async function ensureLeadAccess(leadId: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("Lead not found");
  }

  return data as DbLeadRow;
}

async function ensureCallLogAccess(callId: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client.from("call_logs").select("*").eq("id", callId).maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("Call log not found");
  }

  return data as DbCallLogRow;
}

function leadStatusFromCallStatus(status: ApiCallLogStatus): ApiLeadStatus {
  if (status === "failed") {
    return "contacted";
  }

  if (status === "follow_up") {
    return "follow_up";
  }

  return "qualified";
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

interface WorkspaceDispositionInput extends SaveDispositionInput {
  leadId: string;
  durationSeconds: number;
  recordingEnabled: boolean;
}

export async function saveFailedCallAttempt(
  input: SaveFailedCallAttemptInput,
  currentUser: User,
) {
  const client = requireSupabaseClient();
  await ensureLeadAccess(input.leadId);
  const now = new Date().toISOString();
  const description = buildFailedAttemptDescription({
    ...input,
    endedAt: input.endedAt || now,
  });

  const [leadUpdate, activityInsert] = await Promise.all([
    client.from("leads").update({ updated_at: now }).eq("id", input.leadId),
    client.from("activity_logs").insert({
      lead_id: input.leadId,
      actor_id: currentUser.id,
      activity_type: "call",
      title: "Call failed before connect",
      description,
    }),
  ]);

  if (leadUpdate.error) {
    throw leadUpdate.error;
  }
  if (activityInsert.error) {
    throw activityInsert.error;
  }
}

export async function markLeadInvalid(leadId: string, currentUser: User) {
  const client = requireSupabaseClient();
  await ensureLeadAccess(leadId);

  const [leadUpdate, callbackUpdate, activityInsert] = await Promise.all([
    client
      .from("leads")
      .update({
        status: "invalid",
        notes: "Marked invalid from preview dialer queue.",
        updated_at: new Date().toISOString(),
        callback_time: null,
      })
      .eq("id", leadId),
    client
      .from("callbacks")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("lead_id", leadId)
      .eq("status", "scheduled"),
    client.from("activity_logs").insert({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "status",
      title: "Lead marked invalid",
      description: "Removed from active dialer queue after validation.",
    }),
  ]);

  if (leadUpdate.error) throw leadUpdate.error;
  if (callbackUpdate.error) throw callbackUpdate.error;
  if (activityInsert.error) throw activityInsert.error;
}

export async function saveDisposition(
  input: WorkspaceDispositionInput,
  currentUser: User,
) {
  const client = requireSupabaseClient();
  const lead = await ensureLeadAccess(input.leadId);
  const now = new Date().toISOString();
  const nextStatus = dispositionToStatus(input.disposition);
  const trimmedNotes = input.notes.trim();
  const trimmedSummary = input.outcomeSummary.trim();
  const callbackAt = input.callbackAt || null;

  const [leadUpdate, callInsert] = await Promise.all([
    client
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
    client.from("call_logs").insert({
      lead_id: input.leadId,
      agent_id: currentUser.id,
      direction: "outgoing",
      disposition: input.disposition,
      duration_seconds: input.durationSeconds,
      call_status: callStatusFromDisposition(input.disposition),
      recording_enabled: input.recordingEnabled,
      outcome_summary: trimmedSummary,
      notes: trimmedNotes || null,
    }),
  ]);

  if (leadUpdate.error) throw leadUpdate.error;
  if (callInsert.error) throw callInsert.error;

  const operations: Array<PromiseLike<{ error: unknown | null }>> = [];

  if (trimmedNotes) {
    operations.push(
      client.from("lead_notes").insert({
        lead_id: input.leadId,
        author_id: currentUser.id,
        note_body: trimmedNotes,
      }),
    );
  }

  operations.push(
    client.from("activity_logs").insert({
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
      client
        .from("callbacks")
        .update({
          status: "cancelled",
          updated_at: now,
        })
        .eq("lead_id", input.leadId)
        .eq("status", "scheduled"),
    );
    operations.push(
      client.from("callbacks").insert({
        lead_id: input.leadId,
        owner_id: currentUser.id,
        scheduled_for: callbackAt,
        priority: input.followUpPriority,
        status: "scheduled",
      }),
    );
    operations.push(
      client.from("activity_logs").insert({
        lead_id: input.leadId,
        actor_id: currentUser.id,
        activity_type: "callback",
        title: "Callback scheduled",
        description: `Callback scheduled for ${callbackAt}.`,
      }),
    );
  } else {
    operations.push(
      client
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
      client.from("appointments").insert({
        lead_id: input.leadId,
        owner_id: currentUser.id,
        scheduled_for: callbackAt,
        status: "scheduled",
        notes: trimmedSummary || trimmedNotes || null,
      }),
    );
  }

  const results = await Promise.all(operations);
  const failingResult = results.find((result) => "error" in result && result.error);
  if (failingResult && "error" in failingResult && failingResult.error) {
    throw failingResult.error;
  }
}

export async function uploadLeads(records: ApiLeadImportRecord[], currentUser: User, assignToUserId?: string) {
  const client = requireSupabaseClient();
  let duplicates = 0;
  let invalidRows = 0;
  const normalizedRecords = records.map((record) => {
    const dialablePhones = normalizeLeadImportPhoneFields({
      phone: record.phone,
      altPhone: record.altPhone,
      phoneNumbers: record.phoneNumbers,
    });

    return {
      record,
      dialablePhones,
      normalizedEmail: record.email.trim().toLowerCase(),
    };
  });

  const normalizedPhones = normalizedRecords.flatMap(({ dialablePhones }) => dialablePhones.phoneNumbers).filter(Boolean);
  const normalizedEmails = normalizedRecords.map(({ normalizedEmail }) => normalizedEmail).filter(Boolean);

  const [existingByPhoneResult, existingByAltPhoneResult, existingByEmailResult] = await Promise.all([
    normalizedPhones.length
      ? client.from("leads").select("phone, alt_phone").in("phone", normalizedPhones)
      : Promise.resolve({ data: [], error: null }),
    normalizedPhones.length
      ? client.from("leads").select("phone, alt_phone").in("alt_phone", normalizedPhones)
      : Promise.resolve({ data: [], error: null }),
    normalizedEmails.length
      ? client.from("leads").select("email").in("email", normalizedEmails)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (existingByPhoneResult.error) throw existingByPhoneResult.error;
  if (existingByAltPhoneResult.error) throw existingByAltPhoneResult.error;
  if (existingByEmailResult.error) throw existingByEmailResult.error;

  const existingPhoneRows = [
    ...((existingByPhoneResult.data ?? []) as Array<{ phone: string | null; alt_phone: string | null }>),
    ...((existingByAltPhoneResult.data ?? []) as Array<{ phone: string | null; alt_phone: string | null }>),
  ];
  const existingPhones = new Set(
    existingPhoneRows.flatMap((row) =>
      buildLeadDialNumbers({ phone: row.phone ?? "", altPhone: row.alt_phone ?? "" }),
    ),
  );
  const existingEmails = new Set(
    ((existingByEmailResult.data ?? []) as Array<{ email: string | null }>)
      .map((row) => row.email?.toLowerCase() ?? "")
      .filter(Boolean),
  );

  const rows = normalizedRecords.flatMap(({ record, dialablePhones, normalizedEmail }) => {
    if (!record.fullName.trim() || !dialablePhones.phoneNumbers.length) {
      invalidRows += 1;
      return [];
    }

    const normalizedPhone = dialablePhones.phone;
    const normalizedAltPhone = dialablePhones.altPhone;
    if (
      existingPhones.has(normalizedPhone) ||
      (normalizedAltPhone && existingPhones.has(normalizedAltPhone)) ||
      (normalizedEmail && existingEmails.has(normalizedEmail))
    ) {
      duplicates += 1;
      return [];
    }

    existingPhones.add(normalizedPhone);
    if (normalizedAltPhone) {
      existingPhones.add(normalizedAltPhone);
    }
    if (normalizedEmail) {
      existingEmails.add(normalizedEmail);
    }

    return [
      {
        full_name: record.fullName.trim(),
        phone: normalizedPhone,
        alt_phone: normalizedAltPhone || null,
        phone_numbers: dialablePhones.phoneNumbers,
        email: normalizedEmail || null,
        company: record.company.trim() || null,
        job_title: record.jobTitle.trim() || null,
        location: record.location.trim() || null,
        source: record.source.trim() || "Bulk Import",
        interest: record.interest.trim() || null,
        status: record.status,
        notes: record.notes.trim() || null,
        last_contacted: record.lastContacted || null,
        assigned_agent: currentUser.role === "agent" ? currentUser.id : assignToUserId ?? null,
        callback_time: record.callbackTime || null,
        priority: record.priority,
        lead_score: 60,
      },
    ];
  });

  if (rows.length) {
    const { data, error } = await client.from("leads").insert(rows).select("id");
    if (error) throw error;

    const insertedIds = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (insertedIds.length) {
      const [tagInsert, activityInsert] = await Promise.all([
        client.from("lead_tags").insert(
          insertedIds.map((leadId) => ({
            lead_id: leadId,
            label: "bulk-import",
          })),
        ),
        client.from("activity_logs").insert(
          insertedIds.map((leadId) => ({
            lead_id: leadId,
            actor_id: currentUser.id,
            activity_type: "status",
            title: "Lead imported",
            description: "Imported from spreadsheet and added to the calling queue.",
          })),
        ),
      ]);

      if (tagInsert.error) throw tagInsert.error;
      if (activityInsert.error) throw activityInsert.error;
    }
  }

  return {
    added: rows.length,
    duplicates,
    invalidRows,
  } satisfies UploadResult;
}

export async function assignLead(leadId: string, userId: string, currentUser: User) {
  const client = requireSupabaseClient();
  await ensureLeadAccess(leadId);

  const { data: assignee, error: assigneeError } = await client
    .from("app_users")
    .select("id, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (assigneeError) throw assigneeError;
  if (!assignee) {
    throw new Error("Assignee not found");
  }

  const { error } = await client
    .from("leads")
    .update({ assigned_agent: userId, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw error;

  const { error: activityError } = await client.from("activity_logs").insert({
    lead_id: leadId,
    actor_id: currentUser.id,
    activity_type: "status",
    title: "Lead reassigned",
    description: `Lead assigned to ${assignee.full_name}.`,
  });
  if (activityError) throw activityError;
}

export async function bulkUpdateLeadStatus(leadIds: string[], status: ApiLeadStatus, currentUser: User) {
  const client = requireSupabaseClient();
  if (!leadIds.length) {
    return 0;
  }

  const { error } = await client
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", leadIds);
  if (error) throw error;

  const { error: activityError } = await client.from("activity_logs").insert(
    leadIds.map((leadId) => ({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "status",
      title: "Bulk status update",
      description: `Lead moved to ${status.replace("_", " ")}.`,
    })),
  );
  if (activityError) throw activityError;

  return leadIds.length;
}

export async function deleteLeads(leadIds: string[], currentUser: User) {
  const client = requireSupabaseClient();
  if (!leadIds.length) {
    return 0;
  }

  const { error } = await client.from("leads").delete().in("id", leadIds);
  if (error) throw error;

  return leadIds.length;
}

export async function createCallLog(input: CreateCallLogInput, currentUser: User) {
  const client = requireSupabaseClient();
  const lead = await ensureLeadAccess(input.leadId);
  const now = new Date().toISOString();
  const disposition = dispositionFromCallStatus(input.status);
  const aiAssist = buildAiAssist({
    notes: input.notes,
    status: input.status,
    disposition,
    callbackAt: input.callbackAt || null,
  });

  const [callInsert, leadUpdate] = await Promise.all([
    client.from("call_logs").insert({
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
    client
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

  if (callInsert.error) throw callInsert.error;
  if (leadUpdate.error) throw leadUpdate.error;

  const operations: Array<PromiseLike<{ error: unknown | null }>> = [
    client.from("activity_logs").insert({
      lead_id: input.leadId,
      actor_id: currentUser.id,
      activity_type: input.status === "follow_up" ? "callback" : "call",
      title: `${input.callType === "incoming" ? "Incoming" : "Outgoing"} call logged`,
      description: aiAssist.aiSummary,
    }),
    client
      .from("callbacks")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("lead_id", input.leadId)
      .eq("status", "scheduled"),
  ];

  if (input.notes.trim()) {
    operations.push(
      client.from("lead_notes").insert({
        lead_id: input.leadId,
        author_id: currentUser.id,
        note_body: input.notes.trim(),
      }),
    );
  }

  if (input.callbackAt) {
    operations.push(
      client.from("callbacks").insert({
        lead_id: input.leadId,
        owner_id: currentUser.id,
        scheduled_for: input.callbackAt,
        priority: input.priority,
        status: "scheduled",
      }),
    );
  }

  const results = await Promise.all(operations);
  const failure = results.find((result) => "error" in result && result.error);
  if (failure && "error" in failure && failure.error) {
    throw failure.error;
  }
}

export async function updateCallLog(callId: string, input: CreateCallLogInput, currentUser: User) {
  const client = requireSupabaseClient();
  const lead = await ensureLeadAccess(input.leadId);
  const existingCall = await ensureCallLogAccess(callId);
  void existingCall;
  const now = new Date().toISOString();
  const disposition = dispositionFromCallStatus(input.status);
  const aiAssist = buildAiAssist({
    notes: input.notes,
    status: input.status,
    disposition,
    callbackAt: input.callbackAt || null,
  });

  const [callUpdate, leadUpdate] = await Promise.all([
    client
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
    client
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

  if (callUpdate.error) throw callUpdate.error;
  if (leadUpdate.error) throw leadUpdate.error;

  const operations: Array<PromiseLike<{ error: unknown | null }>> = [
    client.from("activity_logs").insert({
      lead_id: input.leadId,
      actor_id: currentUser.id,
      activity_type: input.status === "follow_up" ? "callback" : "call",
      title: "Call log updated",
      description: aiAssist.aiSummary,
    }),
    client
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
      client.from("callbacks").insert({
        lead_id: input.leadId,
        owner_id: currentUser.id,
        scheduled_for: input.callbackAt,
        priority: input.priority,
        status: "scheduled",
      }),
    );
  }

  const results = await Promise.all(operations);
  const failure = results.find((result) => "error" in result && result.error);
  if (failure && "error" in failure && failure.error) {
    throw failure.error;
  }
}

export async function deleteCallLog(callId: string, currentUser: User) {
  const client = requireSupabaseClient();
  const callLog = await ensureCallLogAccess(callId);
  const { error } = await client.from("call_logs").delete().eq("id", callId);
  if (error) throw error;
  void currentUser;
  void callLog;
}

export async function rescheduleCallback(leadId: string, callbackAt: string, priority: ApiLeadPriority, currentUser: User) {
  const client = requireSupabaseClient();
  await ensureLeadAccess(leadId);
  const now = new Date().toISOString();

  const [leadUpdate, callbackUpdate, callbackInsert, activityInsert] = await Promise.all([
    client
      .from("leads")
      .update({
        callback_time: callbackAt,
        priority,
        status: "callback_due",
        updated_at: now,
      })
      .eq("id", leadId),
    client
      .from("callbacks")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("lead_id", leadId)
      .eq("status", "scheduled"),
    client.from("callbacks").insert({
      lead_id: leadId,
      owner_id: currentUser.id,
      scheduled_for: callbackAt,
      priority,
      status: "scheduled",
    }),
    client.from("activity_logs").insert({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "callback",
      title: "Callback rescheduled",
      description: `Callback moved to ${callbackAt}.`,
    }),
  ]);

  if (leadUpdate.error) throw leadUpdate.error;
  if (callbackUpdate.error) throw callbackUpdate.error;
  if (callbackInsert.error) throw callbackInsert.error;
  if (activityInsert.error) throw activityInsert.error;
}

export async function markCallbackCompleted(leadId: string, currentUser: User) {
  const client = requireSupabaseClient();
  await ensureLeadAccess(leadId);
  const now = new Date().toISOString();

  const [leadUpdate, callbackUpdate, activityInsert] = await Promise.all([
    client
      .from("leads")
      .update({
        callback_time: null,
        status: "contacted",
        updated_at: now,
      })
      .eq("id", leadId),
    client
      .from("callbacks")
      .update({
        status: "completed",
        completed_at: now,
        updated_at: now,
      })
      .eq("lead_id", leadId)
      .eq("status", "scheduled"),
    client.from("activity_logs").insert({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "callback",
      title: "Callback completed",
      description: "Scheduled callback was completed and removed from queue.",
    }),
  ]);

  if (leadUpdate.error) throw leadUpdate.error;
  if (callbackUpdate.error) throw callbackUpdate.error;
  if (activityInsert.error) throw activityInsert.error;
}

export async function reopenLead(leadId: string, currentUser: User) {
  const client = requireSupabaseClient();
  await ensureLeadAccess(leadId);
  const now = new Date().toISOString();

  const [leadUpdate, callbackUpdate, activityInsert] = await Promise.all([
    client
      .from("leads")
      .update({
        status: "follow_up",
        callback_time: null,
        updated_at: now,
      })
      .eq("id", leadId),
    client
      .from("callbacks")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("lead_id", leadId)
      .eq("status", "scheduled"),
    client.from("activity_logs").insert({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "status",
      title: "Lead reopened",
      description: "Lead moved back into the follow-up queue.",
    }),
  ]);

  if (leadUpdate.error) throw leadUpdate.error;
  if (callbackUpdate.error) throw callbackUpdate.error;
  if (activityInsert.error) throw activityInsert.error;
}

async function callWorkspaceUsersFunction<T>(
  action: "create" | "delete",
  payload: Record<string, unknown>,
) {
  const client = requireSupabaseClient();
  const { data, error } = await client.functions.invoke("workspace-users", {
    body: { action, ...payload },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as T;
}

export async function inviteWorkspaceUser(input: {
  name: string;
  email: string;
  role: User["role"];
  team: string;
  timezone: string;
  title: string;
}) {
  return callWorkspaceUsersFunction<{
    user: User;
    temporaryPassword: string;
  }>("create", input);
}

export async function deleteWorkspaceUser(userId: string) {
  await callWorkspaceUsersFunction("delete", { userId });
}

export async function updateWorkspaceUserStatus(userId: string, status: User["status"], currentUser: User) {
  const client = requireSupabaseClient();
  const { error } = await client
    .from("app_users")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    throw error;
  }

  void currentUser;
}

export async function createSipProfile(input: CreateSipProfileInput, currentUser: User) {
  const client = requireSupabaseClient();
  const normalizedLabel = input.label.trim();
  const normalizedUrl = normalizeSipProviderUrl(input.providerUrl);
  const normalizedDomain = normalizeSipDomain(input.sipDomain);
  const normalizedUsername = input.sipUsername.trim();
  const normalizedPassword = input.sipPassword.trim();
  const normalizedCallerId = input.callerId.trim();
  const isShared = canManageSharedProfiles(currentUser) ? input.isShared : false;

  if (
    !normalizedLabel ||
    !normalizedUrl ||
    !normalizedDomain ||
    !normalizedUsername ||
    !normalizedPassword ||
    !normalizedCallerId
  ) {
    throw new Error("Every SIP profile field is required");
  }

  const { data, error } = await client
    .from("sip_profiles")
    .insert({
      label: normalizedLabel,
      provider_url: normalizedUrl,
      sip_domain: normalizedDomain,
      sip_username: normalizedUsername,
      sip_password: normalizedPassword,
      caller_id: normalizedCallerId,
      owner_user_id: isShared ? null : currentUser.id,
      is_shared: isShared,
    })
    .select(
      "id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared, created_at, updated_at",
    )
    .single();

  if (error) throw error;

  const usersById = new Map([[currentUser.id, currentUser]]);
  return mapSipProfileRow(data as DbSipProfileRow, null, usersById);
}

export async function activateSipProfile(profileId: string, currentUser: User) {
  const client = requireSupabaseClient();
  const row = await getSipProfileById(profileId);
  if (!row) {
    throw new Error("SIP profile not found");
  }

  const now = new Date().toISOString();
  const { error } = await client.from("user_sip_preferences").upsert(
    {
      user_id: currentUser.id,
      active_sip_profile_id: profileId,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

export async function updateSipProfile(
  profileId: string,
  input: UpdateSipProfileInput,
  currentUser: User,
) {
  const client = requireSupabaseClient();
  const existing = await getSipProfileById(profileId);
  if (!existing) {
    throw new Error("SIP profile not found");
  }

  const normalizedLabel = input.label.trim();
  const normalizedUrl = normalizeSipProviderUrl(input.providerUrl);
  const normalizedDomain = normalizeSipDomain(input.sipDomain);
  const normalizedUsername = input.sipUsername.trim();
  const normalizedPassword = input.sipPassword?.trim() ?? "";
  const normalizedCallerId = input.callerId.trim();
  const isShared = canManageSharedProfiles(currentUser) ? input.isShared : existing.is_shared;

  if (
    !normalizedLabel ||
    !normalizedUrl ||
    !normalizedDomain ||
    !normalizedUsername ||
    !normalizedCallerId
  ) {
    throw new Error("Every SIP profile field except password is required");
  }

  const updatePayload: Record<string, string | boolean | null> = {
    label: normalizedLabel,
    provider_url: normalizedUrl,
    sip_domain: normalizedDomain,
    sip_username: normalizedUsername,
    caller_id: normalizedCallerId,
    is_shared: isShared,
    owner_user_id: isShared ? null : existing.owner_user_id,
  };

  if (normalizedPassword) {
    updatePayload.sip_password = normalizedPassword;
  }

  const { data, error } = await client
    .from("sip_profiles")
    .update(updatePayload)
    .eq("id", profileId)
    .select(
      "id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared, created_at, updated_at",
    )
    .single();

  if (error) throw error;

  const usersById = new Map([[currentUser.id, currentUser]]);
  return mapSipProfileRow(data as DbSipProfileRow, profileId, usersById);
}

export async function deleteSipProfile(profileId: string, currentUser: User) {
  const client = requireSupabaseClient();
  const existing = await getSipProfileById(profileId);
  if (!existing) {
    throw new Error("SIP profile not found");
  }

  const { error: preferenceError } = await client
    .from("user_sip_preferences")
    .delete()
    .eq("active_sip_profile_id", profileId);
  if (preferenceError) throw preferenceError;

  const { error } = await client.from("sip_profiles").delete().eq("id", profileId);
  if (error) throw error;

  void currentUser;
}

export async function assignSipProfileToUser(userId: string, profileId: string | null) {
  const client = requireSupabaseClient();
  if (!profileId) {
    const { error } = await client.from("user_sip_preferences").delete().eq("user_id", userId);
    if (error) throw error;
    return;
  }

  const row = await getSipProfileById(profileId);
  if (!row) {
    throw new Error("SIP profile not found");
  }

  const now = new Date().toISOString();
  const { error } = await client.from("user_sip_preferences").upsert(
    {
      user_id: userId,
      active_sip_profile_id: profileId,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

async function getSipProfileById(profileId: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("sip_profiles")
    .select(
      "id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared, created_at, updated_at",
    )
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as DbSipProfileRow | null) ?? null;
}
