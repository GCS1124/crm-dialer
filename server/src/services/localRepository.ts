import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "../config/env.js";
import { buildAiAssist } from "./aiAssistService.js";
import {
  buildFailedAttemptCallLog,
  formatFailedAttemptSummary,
} from "./callAttemptDiagnostics.js";
import { buildWorkspaceAnalytics } from "./analyticsService.js";
import { getRuntimeStatus } from "./runtimeMode.js";
import { buildLeadDialNumbers } from "./phoneNumberService.js";
import { getQueueKey, toQueueProgressRecord } from "./queueService.js";
import { getVoiceFieldStatus, getVoiceProviderConfig } from "./voiceProviderService.js";
import { buildSipWorkspaceExposure, canManageWorkspaceAdmin } from "./workspaceAccessService.js";
import type {
  ApiCallActivityType,
  ApiCallDisposition,
  ApiCallLog,
  ApiCallLogStatus,
  ApiCallType,
  ApiLead,
  ApiLeadActivity,
  ApiLeadImportRecord,
  ApiLeadPriority,
  ApiLeadStatus,
  ApiNoteEntry,
  ApiSipProfile,
  ApiUser,
  ApiUserRole,
  CreateCallLogInput,
  CreateSipProfileInput,
  CreateUserInput,
  QueueCursor,
  QueueFilter,
  QueueProgressRecord,
  QueueSort,
  SaveDispositionInput,
  SaveFailedCallAttemptInput,
  SignupInput,
  StoredSipProfile,
  UpdateSipProfileInput,
  UploadResult,
  WorkspacePayload,
} from "../types/index.js";

interface LocalUserRecord extends ApiUser {
  authUserId: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

interface LocalSipProfileRecord {
  id: string;
  label: string;
  providerUrl: string;
  sipDomain: string;
  sipUsername: string;
  sipPassword: string;
  callerId: string;
  ownerUserId: string | null;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LocalUserSipPreferenceRecord {
  userId: string;
  activeSipProfileId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LocalStoreState {
  version: number;
  createdAt: string;
  updatedAt: string;
  users: LocalUserRecord[];
  leads: ApiLead[];
  sipProfiles: LocalSipProfileRecord[];
  userSipPreferences: LocalUserSipPreferenceRecord[];
  queueProgress: QueueProgressRecord[];
}

function resolveStorePath() {
  const override = process.env.CRM_DIALER_LOCAL_STORE_PATH?.trim();
  if (override) {
    return override;
  }

  return process.env.VERCEL
    ? join(tmpdir(), "crm-dialer", "local-dev-store.json")
    : join(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        "data",
        "local-dev-store.json",
      );
}

const storePath = resolveStorePath();

let cachedState: LocalStoreState | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let persistenceDisabled = false;

function nowIso() {
  return new Date().toISOString();
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number) {
  return hoursAgo(days * 24);
}

function clone<T>(value: T): T {
  return structuredClone(value);
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

function hashPassword(value: string) {
  return createHash("sha256").update(value).digest("hex");
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

function mapUser(user: LocalUserRecord): ApiUser {
  const { authUserId: _authUserId, passwordHash: _passwordHash, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } =
    user;
  return rest;
}

function normalizeLeadDialNumbers(lead: ApiLead): ApiLead {
  const phoneNumbers = buildLeadDialNumbers({
    phone: lead.phone,
    altPhone: lead.altPhone,
    phoneNumbers: lead.phoneNumbers,
  });

  return {
    ...lead,
    phone: phoneNumbers[0] ?? lead.phone,
    altPhone: phoneNumbers[1] ?? lead.altPhone,
    phoneNumbers,
  };
}

function mapUsers(users: LocalUserRecord[]) {
  return users.map(mapUser).sort((left, right) => left.name.localeCompare(right.name));
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

function buildTemporaryPassword() {
  return `Dialer${Math.random().toString(36).slice(2, 8)}!2026`;
}

function buildCallRecord(input: {
  lead: ApiLead;
  agent: ApiUser;
  callType: ApiCallType;
  durationSeconds: number;
  disposition: ApiCallDisposition;
  status: ApiCallLogStatus;
  notes: string;
  callbackAt?: string | null;
  createdAt?: string;
  id?: string;
}): ApiCallLog {
  const aiAssist = buildAiAssist({
    notes: input.notes,
    status: input.status,
    disposition: input.disposition,
    callbackAt: input.callbackAt ?? null,
  });

  return {
    id: input.id ?? randomUUID(),
    leadId: input.lead.id,
    leadName: input.lead.fullName,
    phone: input.lead.phoneNumbers?.[0] ?? input.lead.phone,
    createdAt: input.createdAt ?? nowIso(),
    agentId: input.agent.id,
    agentName: input.agent.name,
    callType: input.callType,
    durationSeconds: input.durationSeconds,
    disposition: input.disposition,
    status: input.status,
    source: "call_log",
    notes: input.notes,
    recordingEnabled: false,
    outcomeSummary: aiAssist.aiSummary,
    aiSummary: aiAssist.aiSummary,
    sentiment: aiAssist.sentiment,
    suggestedNextAction: aiAssist.suggestedNextAction,
    followUpAt: input.callbackAt ?? null,
  };
}

function buildNoteEntry(author: ApiUser, body: string, createdAt = nowIso()): ApiNoteEntry {
  return {
    id: randomUUID(),
    body,
    createdAt,
    authorId: author.id,
    authorName: author.name,
  };
}

function buildActivity(
  actor: ApiUser,
  type: ApiCallActivityType,
  title: string,
  description: string,
  createdAt = nowIso(),
): ApiLeadActivity {
  return {
    id: randomUUID(),
    type,
    title,
    description,
    createdAt,
    actorName: actor.name,
  };
}

function createSeedUsers(): LocalUserRecord[] {
  const seedPasswordHash = hashPassword(env.AUTH_SEED_PASSWORD);
  const createdAt = daysAgo(30);

  return [
    {
      id: "usr_admin_1",
      authUserId: "usr_admin_1",
      name: "Anika Rao",
      email: "admin@previewdialer.local",
      role: "admin",
      team: "Revenue Operations",
      timezone: "Asia/Kolkata",
      avatar: "AR",
      title: "CRM Administrator",
      status: "online",
      passwordHash: seedPasswordHash,
      createdAt,
      updatedAt: hoursAgo(2),
    },
    {
      id: "usr_lead_1",
      authUserId: "usr_lead_1",
      name: "Rohit Malhotra",
      email: "lead@previewdialer.local",
      role: "team_leader",
      team: "North Growth",
      timezone: "Asia/Kolkata",
      avatar: "RM",
      title: "Team Leader",
      status: "away",
      passwordHash: seedPasswordHash,
      createdAt,
      updatedAt: hoursAgo(5),
    },
    {
      id: "usr_agent_1",
      authUserId: "usr_agent_1",
      name: "Sara Khan",
      email: "agent@previewdialer.local",
      role: "agent",
      team: "North Growth",
      timezone: "Asia/Kolkata",
      avatar: "SK",
      title: "Outbound Agent",
      status: "online",
      passwordHash: seedPasswordHash,
      createdAt,
      updatedAt: hoursAgo(1),
    },
  ];
}

function createSeedLeads(users: LocalUserRecord[]): ApiLead[] {
  const agent = mapUsers(users).find((user) => user.role === "agent");
  const leader = mapUsers(users).find((user) => user.role === "team_leader");
  if (!agent || !leader) {
    return [];
  }

  const callLeadA = {
    id: "lead_1",
    fullName: "Aarav Mehta",
    phone: "+91 98765 43001",
    altPhone: "",
    email: "aarav.mehta@northstar.in",
    company: "Northstar Logistics",
    jobTitle: "Operations Head",
    location: "Delhi",
    source: "Website demo request",
    interest: "Outbound automation",
    status: "qualified" as ApiLeadStatus,
    notes: "Asked for a pricing follow-up after the operations review.",
    lastContacted: hoursAgo(18),
    assignedAgentId: agent.id,
    assignedAgentName: agent.name,
    callbackTime: hoursFromNow(6),
    priority: "High" as ApiLeadPriority,
    createdAt: daysAgo(5),
    updatedAt: hoursAgo(18),
    tags: ["pricing", "warm"],
    callHistory: [] as ApiCallLog[],
    notesHistory: [] as ApiNoteEntry[],
    activities: [] as ApiLeadActivity[],
    leadScore: 88,
    timezone: agent.timezone,
  };

  const callLeadB = {
    id: "lead_2",
    fullName: "Neha Bansal",
    phone: "+91 98765 43002",
    altPhone: "",
    email: "neha@fluxretail.in",
    company: "Flux Retail",
    jobTitle: "Founder",
    location: "Mumbai",
    source: "Referral",
    interest: "Sales acceleration",
    status: "follow_up" as ApiLeadStatus,
    notes: "Needs a follow-up with the ROI breakdown.",
    lastContacted: hoursAgo(30),
    assignedAgentId: agent.id,
    assignedAgentName: agent.name,
    callbackTime: hoursAgo(2),
    priority: "Urgent" as ApiLeadPriority,
    createdAt: daysAgo(7),
    updatedAt: hoursAgo(30),
    tags: ["vip", "founder"],
    callHistory: [] as ApiCallLog[],
    notesHistory: [] as ApiNoteEntry[],
    activities: [] as ApiLeadActivity[],
    leadScore: 91,
    timezone: agent.timezone,
  };

  const callLeadC = {
    id: "lead_3",
    fullName: "Kabir Sethi",
    phone: "+91 98765 43003",
    altPhone: "",
    email: "kabir@octacare.ai",
    company: "OctaCare",
    jobTitle: "Growth Manager",
    location: "Bengaluru",
    source: "Outbound list",
    interest: "Team dialer",
    status: "new" as ApiLeadStatus,
    notes: "",
    lastContacted: null,
    assignedAgentId: agent.id,
    assignedAgentName: agent.name,
    callbackTime: null,
    priority: "Medium" as ApiLeadPriority,
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
    tags: ["new"],
    callHistory: [] as ApiCallLog[],
    notesHistory: [] as ApiNoteEntry[],
    activities: [] as ApiLeadActivity[],
    leadScore: 64,
    timezone: agent.timezone,
  };

  const callLeadD = {
    id: "lead_4",
    fullName: "Priya Narang",
    phone: "+91 98765 43004",
    altPhone: "",
    email: "priya@apexedu.org",
    company: "Apex Education",
    jobTitle: "Admissions Director",
    location: "Noida",
    source: "Campaign import",
    interest: "Lead routing",
    status: "appointment_booked" as ApiLeadStatus,
    notes: "Booked a product walkthrough for Friday.",
    lastContacted: hoursAgo(8),
    assignedAgentId: agent.id,
    assignedAgentName: agent.name,
    callbackTime: hoursFromNow(20),
    priority: "High" as ApiLeadPriority,
    createdAt: daysAgo(4),
    updatedAt: hoursAgo(8),
    tags: ["demo-booked"],
    callHistory: [] as ApiCallLog[],
    notesHistory: [] as ApiNoteEntry[],
    activities: [] as ApiLeadActivity[],
    leadScore: 84,
    timezone: agent.timezone,
  };

  const sharedCreatedAt = hoursAgo(18);
  const initialNote = buildNoteEntry(agent, "Shared pricing summary and confirmed buying timeline.", sharedCreatedAt);
  callLeadA.callHistory.push(
    buildCallRecord({
      lead: callLeadA,
      agent,
      callType: "outgoing",
      durationSeconds: 420,
      disposition: "Interested",
      status: "connected",
      notes: "Prospect is interested in multi-user access and pricing.",
      callbackAt: callLeadA.callbackTime,
      createdAt: sharedCreatedAt,
      id: "call_seed_1",
    }),
  );
  callLeadA.notesHistory.push(initialNote);
  callLeadA.activities.push(
    buildActivity(agent, "call", "Discovery call completed", "Prospect requested pricing follow-up.", sharedCreatedAt),
    buildActivity(agent, "callback", "Callback scheduled", `Follow-up scheduled for ${callLeadA.callbackTime}.`, sharedCreatedAt),
  );

  const overdueCreatedAt = hoursAgo(30);
  callLeadB.callHistory.push(
    buildCallRecord({
      lead: callLeadB,
      agent,
      callType: "outgoing",
      durationSeconds: 305,
      disposition: "Follow-Up Required",
      status: "follow_up",
      notes: "Requested a detailed ROI case study before moving forward.",
      callbackAt: callLeadB.callbackTime,
      createdAt: overdueCreatedAt,
      id: "call_seed_2",
    }),
  );
  callLeadB.notesHistory.push(
    buildNoteEntry(agent, "Send industry-specific ROI case study and confirm CFO attendance.", overdueCreatedAt),
  );
  callLeadB.activities.push(
    buildActivity(agent, "callback", "Callback scheduled", `Callback scheduled for ${callLeadB.callbackTime}.`, overdueCreatedAt),
  );

  const bookedCreatedAt = hoursAgo(8);
  callLeadD.callHistory.push(
    buildCallRecord({
      lead: callLeadD,
      agent,
      callType: "outgoing",
      durationSeconds: 510,
      disposition: "Appointment Booked",
      status: "connected",
      notes: "Booked a live workflow review with the admissions team.",
      callbackAt: callLeadD.callbackTime,
      createdAt: bookedCreatedAt,
      id: "call_seed_3",
    }),
  );
  callLeadD.notesHistory.push(
    buildNoteEntry(agent, "Demo agenda confirmed. Need to send calendar invite and sample flow.", bookedCreatedAt),
  );
  callLeadD.activities.push(
    buildActivity(agent, "appointment", "Demo booked", "Product walkthrough booked for the admissions team.", bookedCreatedAt),
  );

  const unassignedLead: ApiLead = {
    id: "lead_5",
    fullName: "Devika Sharma",
    phone: "+91 98765 43005",
    altPhone: "",
    email: "devika@clearstack.io",
    company: "ClearStack",
    jobTitle: "Revenue Operations",
    location: "Pune",
    source: "Inbound contact form",
    interest: "Call analytics",
    status: "contacted",
    notes: "Needs an owner for follow-up.",
    lastContacted: hoursAgo(48),
    assignedAgentId: "",
    assignedAgentName: "Unassigned",
    callbackTime: null,
    priority: "Medium",
    createdAt: daysAgo(3),
    updatedAt: hoursAgo(48),
    tags: ["unassigned"],
    callHistory: [],
    notesHistory: [],
    activities: [buildActivity(leader, "status", "Lead created", "Inbound lead captured and awaiting assignment.", daysAgo(3))],
    leadScore: 58,
    timezone: leader.timezone,
  };

  const wonLead: ApiLead = {
    id: "lead_6",
    fullName: "Ishita Verma",
    phone: "+91 98765 43006",
    altPhone: "",
    email: "ishita@syncbridge.co",
    company: "SyncBridge",
    jobTitle: "Co-Founder",
    location: "Gurugram",
    source: "Founder network",
    interest: "Outbound team operating system",
    status: "closed_won",
    notes: "Closed after pilot approval.",
    lastContacted: daysAgo(1),
    assignedAgentId: agent.id,
    assignedAgentName: agent.name,
    callbackTime: null,
    priority: "High",
    createdAt: daysAgo(9),
    updatedAt: daysAgo(1),
    tags: ["closed-won"],
    callHistory: [
      buildCallRecord({
        lead: {
          id: "lead_6",
          fullName: "Ishita Verma",
          phone: "+91 98765 43006",
          altPhone: "",
          email: "ishita@syncbridge.co",
          company: "SyncBridge",
          jobTitle: "Co-Founder",
          location: "Gurugram",
          source: "Founder network",
          interest: "Outbound team operating system",
          status: "closed_won",
          notes: "Closed after pilot approval.",
          lastContacted: daysAgo(1),
          assignedAgentId: agent.id,
          assignedAgentName: agent.name,
          callbackTime: null,
          priority: "High",
          createdAt: daysAgo(9),
          updatedAt: daysAgo(1),
          tags: [],
          callHistory: [],
          notesHistory: [],
          activities: [],
          leadScore: 95,
          timezone: agent.timezone,
        },
        agent,
        callType: "outgoing",
        durationSeconds: 660,
        disposition: "Sale Closed",
        status: "connected",
        notes: "Pilot approved and next billing step shared with the founder.",
        createdAt: daysAgo(1),
        id: "call_seed_4",
      }),
    ],
    notesHistory: [buildNoteEntry(agent, "Closed won after procurement sign-off.", daysAgo(1))],
    activities: [buildActivity(agent, "sale", "Deal closed", "Pilot converted into a signed engagement.", daysAgo(1))],
    leadScore: 95,
    timezone: agent.timezone,
  };

  return [
    callLeadA,
    callLeadB,
    callLeadC,
    callLeadD,
    unassignedLead,
    wonLead,
  ].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function createInitialState(): LocalStoreState {
  const users = createSeedUsers();
  const createdAt = nowIso();

  return {
    version: 3,
    createdAt,
    updatedAt: createdAt,
    users,
    leads: createSeedLeads(users),
    sipProfiles: [],
    userSipPreferences: [],
    queueProgress: [],
  };
}

function ensureDefaultSipProfileRecord(state: LocalStoreState) {
  const voice = getVoiceProviderConfig();
  const sipPassword = env.SIP_PASSWORD.trim();

  if (
    !voice.available ||
    !voice.websocketUrl ||
    !voice.sipDomain ||
    !voice.username ||
    !voice.callerId ||
    !sipPassword
  ) {
    return;
  }

  const normalizedUrl = normalizeSipProviderUrl(voice.websocketUrl);
  const normalizedDomain = normalizeSipDomain(voice.sipDomain);
  const existing = state.sipProfiles.find(
    (profile) =>
      profile.isShared &&
      normalizeSipDomain(profile.sipDomain) === normalizedDomain &&
      profile.sipUsername === voice.username,
  );

  if (existing) {
    existing.label = "Unified Voice Shared";
    existing.providerUrl = normalizedUrl;
    existing.sipPassword = sipPassword;
    existing.callerId = voice.callerId;
    existing.ownerUserId = null;
    existing.isShared = true;
    existing.updatedAt = nowIso();
    return;
  }

  const timestamp = nowIso();
  state.sipProfiles.push({
    id: randomUUID(),
    label: "Unified Voice Shared",
    providerUrl: normalizedUrl,
    sipDomain: normalizedDomain,
    sipUsername: voice.username,
    sipPassword,
    callerId: voice.callerId,
    ownerUserId: null,
    isShared: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

async function persistState(state: LocalStoreState) {
  state.updatedAt = nowIso();
  cachedState = state;
  if (persistenceDisabled) {
    return;
  }

  try {
    await mkdir(dirname(storePath), { recursive: true });
    await writeFile(storePath, JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    persistenceDisabled = true;
    console.warn(
      `Local workspace persistence is unavailable at ${storePath}. Falling back to in-memory state.`,
      error,
    );
  }
}

async function loadState() {
  if (cachedState) {
    return cachedState;
  }

  try {
    if (persistenceDisabled) {
      throw new Error("Persistence disabled");
    }

    const raw = await readFile(storePath, "utf8");
    cachedState = JSON.parse(raw) as LocalStoreState;
  } catch {
    cachedState = createInitialState();
  }

  cachedState.version = 3;
  cachedState.sipProfiles ??= [];
  cachedState.userSipPreferences ??= [];
  cachedState.queueProgress ??= [];
  ensureDefaultSipProfileRecord(cachedState);
  await persistState(cachedState);

  return cachedState;
}

async function withWrite<T>(action: (state: LocalStoreState) => Promise<T> | T) {
  const task = writeQueue.then(async () => {
    const state = await loadState();
    const result = await action(state);
    await persistState(state);
    return result;
  });

  writeQueue = task.then(
    () => undefined,
    () => undefined,
  );

  return task;
}

async function getSnapshot() {
  return clone(await loadState());
}

function getUserRecordByEmail(state: LocalStoreState, email: string) {
  return state.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
}

function getUserRecordById(state: LocalStoreState, userId: string) {
  return state.users.find((user) => user.id === userId) ?? null;
}

function getUserRecordByAuthId(state: LocalStoreState, authUserId: string) {
  return state.users.find((user) => user.authUserId === authUserId) ?? null;
}

function mapSipProfile(
  profile: LocalSipProfileRecord,
  activeProfileId: string | null,
  usersById: Map<string, ApiUser>,
): ApiSipProfile {
  return {
    id: profile.id,
    label: profile.label,
    providerUrl: profile.providerUrl,
    sipDomain: profile.sipDomain,
    sipUsername: profile.sipUsername,
    callerId: profile.callerId,
    ownerUserId: profile.ownerUserId,
    ownerUserName: profile.ownerUserId ? (usersById.get(profile.ownerUserId)?.name ?? null) : null,
    isShared: profile.isShared,
    isActive: profile.id === activeProfileId,
    passwordPreview: maskSecret(profile.sipPassword),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function mapStoredSipProfile(
  profile: LocalSipProfileRecord,
  activeProfileId: string | null,
  usersById: Map<string, ApiUser>,
): StoredSipProfile {
  return {
    ...mapSipProfile(profile, activeProfileId, usersById),
    sipPassword: profile.sipPassword,
  };
}

function getVisibleSipProfiles(state: LocalStoreState, currentUser: ApiUser) {
  return state.sipProfiles.filter(
    (profile) =>
      currentUser.role === "admin" || profile.isShared || profile.ownerUserId === currentUser.id,
  );
}

function getActiveSipProfilePreference(state: LocalStoreState, userId: string) {
  return state.userSipPreferences.find((preference) => preference.userId === userId) ?? null;
}

function attachSipAssignmentsToUsers(state: LocalStoreState, users: ApiUser[]) {
  return users.map((user) => {
    const preference = getActiveSipProfilePreference(state, user.id);
    const profile = preference?.activeSipProfileId
      ? state.sipProfiles.find((item) => item.id === preference.activeSipProfileId) ?? null
      : null;

    return {
      ...user,
      activeSipProfileId: profile?.id ?? null,
      activeSipProfileLabel: profile?.label ?? null,
    };
  });
}

function ensureLeadAccess(state: LocalStoreState, leadId: string, currentUser: ApiUser) {
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) {
    throw new Error("Lead not found");
  }

  if (currentUser.role === "agent" && lead.assignedAgentId !== currentUser.id) {
    throw new Error("You do not have access to this lead");
  }

  return lead;
}

function findCall(state: LocalStoreState, callId: string) {
  for (const lead of state.leads) {
    const call = lead.callHistory.find((item) => item.id === callId);
    if (call) {
      return { lead, call };
    }
  }

  return null;
}

function syncLeadAssignment(lead: ApiLead, assignee: ApiUser | null) {
  lead.assignedAgentId = assignee?.id ?? "";
  lead.assignedAgentName = assignee?.name ?? "Unassigned";
  lead.timezone = assignee?.timezone ?? "UTC";
}

async function buildSettingsStatus() {
  const runtime = await getRuntimeStatus();
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

  return {
    authMode: "local" as const,
    signupEnabled: false,
    importFormats: ["csv", "xlsx", "xls"],
    voice: {
      provider: voice.provider,
      available: voice.available,
      callerId: voice.available ? voice.callerId : null,
      configuredFields: getVoiceFieldStatus(),
    },
    supabase: {
      connected: false,
      publishableKeyConfigured,
      serviceRoleConfigured,
      reason:
        runtime.supabase.reason ??
        (isConfiguredSupabaseUrl()
          ? "Supabase is configured, but local development mode is active."
          : "Supabase is not configured for this workspace."),
      realtimeAvailable: false,
    },
  };
}

export async function authenticateLocalUser(email: string, password: string) {
  const state = await getSnapshot();
  const user = getUserRecordByEmail(state, email);
  if (!user || user.passwordHash !== hashPassword(password)) {
    return null;
  }

  return clone(user);
}

export async function getUserByEmail(email: string) {
  const state = await getSnapshot();
  const user = getUserRecordByEmail(state, email);
  return user ? mapUser(user) : null;
}

export async function getUserByAuthUserId(authUserId: string) {
  const state = await getSnapshot();
  const user = getUserRecordByAuthId(state, authUserId);
  return user ? mapUser(user) : null;
}

export async function getUserById(userId: string) {
  const state = await getSnapshot();
  const user = getUserRecordById(state, userId);
  return user ? mapUser(user) : null;
}

export async function syncAuthUserLink(email: string, authUserId: string) {
  await withWrite((state) => {
    const user = getUserRecordByEmail(state, email);
    if (!user) {
      return;
    }

    user.authUserId = authUserId;
    user.updatedAt = nowIso();
  });
}

export async function listUsers() {
  const state = await getSnapshot();
  return attachSipAssignmentsToUsers(state, mapUsers(state.users));
}

export async function getWorkspace(currentUser: ApiUser): Promise<WorkspacePayload> {
  const state = await getSnapshot();
  const baseUsers = mapUsers(state.users);
  const users = canManageWorkspaceAdmin(currentUser)
    ? attachSipAssignmentsToUsers(state, baseUsers)
    : baseUsers;
  const usersById = new Map(users.map((user) => [user.id, user]));
  const leads =
    currentUser.role === "agent"
      ? state.leads.filter((lead) => lead.assignedAgentId === currentUser.id)
      : state.leads;
  const scopedLeads = clone(leads)
    .map((lead) => normalizeLeadDialNumbers(lead))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  const visibleSipProfiles = getVisibleSipProfiles(state, currentUser);
  const activePreference = getActiveSipProfilePreference(state, currentUser.id);
  const assignedSipProfileRecord = activePreference?.activeSipProfileId
    ? state.sipProfiles.find((profile) => profile.id === activePreference.activeSipProfileId) ?? null
    : null;
  const activeVisibleSipProfileRecord =
    visibleSipProfiles.find((profile) => profile.id === assignedSipProfileRecord?.id) ?? null;
  const activeSipProfile = activeVisibleSipProfileRecord
    ? mapSipProfile(activeVisibleSipProfileRecord, assignedSipProfileRecord?.id ?? null, usersById)
    : null;
  const sipProfiles = visibleSipProfiles.map((profile) =>
    mapSipProfile(profile, assignedSipProfileRecord?.id ?? null, usersById),
  );
  const sipExposure = buildSipWorkspaceExposure(currentUser, {
    profiles: sipProfiles,
    activeProfile: activeSipProfile,
    selectionRequired:
      currentUser.role === "admin" && visibleSipProfiles.length > 0 && !assignedSipProfileRecord,
  });
  const voice = assignedSipProfileRecord
    ? {
        provider: "embedded-sip" as const,
        available: true,
        source: "profile" as const,
        callerId: assignedSipProfileRecord.callerId,
        websocketUrl: assignedSipProfileRecord.providerUrl,
        sipDomain: assignedSipProfileRecord.sipDomain,
        username: assignedSipProfileRecord.sipUsername,
        profileId: assignedSipProfileRecord.id,
        profileLabel: assignedSipProfileRecord.label,
      }
    : sipExposure.selectionRequired
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
    leads: scopedLeads,
    analytics: buildWorkspaceAnalytics(scopedLeads, users, currentUser),
    settings: await buildSettingsStatus(),
    voice,
    sipProfiles: sipExposure.profiles,
    activeSipProfile: sipExposure.activeProfile,
    sipProfileSelectionRequired: sipExposure.selectionRequired,
  };
}

export async function listLeads(currentUser: ApiUser) {
  const workspace = await getWorkspace(currentUser);
  return workspace.leads;
}

export async function listCallLogs(currentUser: ApiUser) {
  const leads = await listLeads(currentUser);
  return leads
    .flatMap((lead) => lead.callHistory)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export async function createManualCallLog(input: CreateCallLogInput, currentUser: ApiUser) {
  await withWrite((state) => {
    const lead = ensureLeadAccess(state, input.leadId, currentUser);
    const now = nowIso();
    const disposition = dispositionFromCallStatus(input.status);
    const call = buildCallRecord({
      lead,
      agent: currentUser,
      callType: input.callType,
      durationSeconds: input.durationSeconds,
      disposition,
      status: input.status,
      notes: input.notes.trim(),
      callbackAt: input.callbackAt || null,
    });

    lead.callHistory.unshift(call);
    if (input.notes.trim()) {
      lead.notesHistory.unshift(buildNoteEntry(currentUser, input.notes.trim(), now));
    }
    lead.activities.unshift(
      buildActivity(
        currentUser,
        input.callbackAt ? "callback" : "call",
        "Manual call logged",
        input.callbackAt
          ? `Call saved and callback scheduled for ${input.callbackAt}.`
          : "Call saved from the manual logging workflow.",
        now,
      ),
    );
    lead.lastContacted = now;
    lead.callbackTime = input.callbackAt || null;
    lead.priority = input.priority;
    lead.status = leadStatusFromCallStatus(input.status);
    lead.notes = input.notes.trim() || lead.notes;
    lead.updatedAt = now;
  });
}

export async function updateManualCallLog(
  callId: string,
  input: CreateCallLogInput,
  currentUser: ApiUser,
) {
  await withWrite((state) => {
    const existing = findCall(state, callId);
    if (!existing) {
      throw new Error("Call log not found");
    }

    const targetLead = ensureLeadAccess(state, input.leadId, currentUser);
    if (currentUser.role === "agent" && existing.call.agentId && existing.call.agentId !== currentUser.id) {
      throw new Error("You do not have access to this call log");
    }

    existing.lead.callHistory = existing.lead.callHistory.filter((call) => call.id !== callId);
    const now = nowIso();
    const disposition = dispositionFromCallStatus(input.status);
    const updatedCall = buildCallRecord({
      lead: targetLead,
      agent: currentUser,
      callType: input.callType,
      durationSeconds: input.durationSeconds,
      disposition,
      status: input.status,
      notes: input.notes.trim(),
      callbackAt: input.callbackAt || null,
      createdAt: existing.call.createdAt,
      id: callId,
    });

    targetLead.callHistory.unshift(updatedCall);
    targetLead.callbackTime = input.callbackAt || null;
    targetLead.priority = input.priority;
    targetLead.status = leadStatusFromCallStatus(input.status);
    targetLead.notes = input.notes.trim() || targetLead.notes;
    targetLead.updatedAt = now;
    targetLead.activities.unshift(
      buildActivity(currentUser, "call", "Call log updated", "Call details were edited from the call log workspace.", now),
    );
  });
}

export async function deleteManualCallLog(callId: string, currentUser: ApiUser) {
  await withWrite((state) => {
    const existing = findCall(state, callId);
    if (!existing) {
      throw new Error("Call log not found");
    }
    ensureLeadAccess(state, existing.lead.id, currentUser);

    existing.lead.callHistory = existing.lead.callHistory.filter((call) => call.id !== callId);
    existing.lead.updatedAt = nowIso();
    existing.lead.activities.unshift(
      buildActivity(currentUser, "call", "Call log deleted", "A manual call entry was removed.", existing.lead.updatedAt),
    );
  });
}

export async function importLeads(
  records: ApiLeadImportRecord[],
  currentUser: ApiUser,
  assignToUserId?: string,
) {
  return withWrite((state) => {
    let duplicates = 0;
    let invalidRows = 0;
    const existingPhones = new Set(state.leads.map((lead) => lead.phone.trim()));
    const existingEmails = new Set(
      state.leads.map((lead) => lead.email.trim().toLowerCase()).filter(Boolean),
    );
    const assigneeRecord = assignToUserId ? getUserRecordById(state, assignToUserId) : null;
    const assignee =
      currentUser.role === "agent"
        ? currentUser
        : assigneeRecord
          ? mapUser(assigneeRecord)
          : null;

    const createdRows = records.flatMap((record) => {
      const fullName = record.fullName.trim();
      const phone = record.phone.trim();
      const email = record.email.trim().toLowerCase();

      if (!fullName || !phone) {
        invalidRows += 1;
        return [];
      }
      if (existingPhones.has(phone) || (email && existingEmails.has(email))) {
        duplicates += 1;
        return [];
      }

      existingPhones.add(phone);
      if (email) {
        existingEmails.add(email);
      }

      const lead: ApiLead = {
        id: randomUUID(),
        fullName,
        phone,
        altPhone: record.altPhone.trim(),
        phoneNumbers: buildLeadDialNumbers({
          phone,
          altPhone: record.altPhone.trim(),
          phoneNumbers: record.phoneNumbers,
        }),
        email,
        company: record.company.trim(),
        jobTitle: record.jobTitle.trim(),
        location: record.location.trim(),
        source: record.source.trim() || "Bulk import",
        interest: record.interest.trim(),
        status: record.status,
        notes: record.notes.trim(),
        lastContacted: record.lastContacted,
        assignedAgentId: assignee?.id ?? "",
        assignedAgentName: assignee?.name ?? "Unassigned",
        callbackTime: record.callbackTime,
        priority: record.priority,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        tags: ["bulk-import"],
        callHistory: [],
        notesHistory: [],
        activities: [
          buildActivity(currentUser, "status", "Lead imported", "Lead imported into the active queue.", nowIso()),
        ],
        leadScore: 60,
        timezone: assignee?.timezone ?? currentUser.timezone,
      };

      return [lead];
    });

    state.leads.unshift(...createdRows);

    return {
      added: createdRows.length,
      duplicates,
      invalidRows,
    } satisfies UploadResult;
  });
}

export async function assignLeadToUser(
  leadId: string,
  userId: string,
  currentUser: ApiUser,
) {
  await withWrite((state) => {
    const lead = ensureLeadAccess(state, leadId, currentUser);
    const assigneeRecord = getUserRecordById(state, userId);
    if (!assigneeRecord) {
      throw new Error("Assignee not found");
    }

    syncLeadAssignment(lead, mapUser(assigneeRecord));
    lead.updatedAt = nowIso();
    lead.activities.unshift(
      buildActivity(currentUser, "status", "Lead reassigned", `Lead assigned to ${assigneeRecord.name}.`, lead.updatedAt),
    );
  });
}

export async function updateLeadStatuses(
  leadIds: string[],
  status: ApiLeadStatus,
  currentUser: ApiUser,
) {
  return withWrite((state) => {
    let updated = 0;
    const now = nowIso();

    for (const lead of state.leads) {
      if (!leadIds.includes(lead.id)) {
        continue;
      }
      if (currentUser.role === "agent" && lead.assignedAgentId !== currentUser.id) {
        continue;
      }

      lead.status = status;
      lead.updatedAt = now;
      lead.activities.unshift(
        buildActivity(currentUser, "status", "Bulk status update", `Lead moved to ${status.replaceAll("_", " ")}.`, now),
      );
      updated += 1;
    }

    return updated;
  });
}

export async function deleteLeadRecords(leadIds: string[], currentUser: ApiUser) {
  return withWrite((state) => {
    const before = state.leads.length;
    state.leads = state.leads.filter((lead) => {
      if (!leadIds.includes(lead.id)) {
        return true;
      }
      if (currentUser.role === "agent" && lead.assignedAgentId !== currentUser.id) {
        return true;
      }
      return false;
    });

    return before - state.leads.length;
  });
}

export async function markLeadInvalid(leadId: string, currentUser: ApiUser) {
  await withWrite((state) => {
    const lead = ensureLeadAccess(state, leadId, currentUser);
    const now = nowIso();
    lead.status = "invalid";
    lead.callbackTime = null;
    lead.notes = "Marked invalid from preview dialer queue.";
    lead.updatedAt = now;
    lead.activities.unshift(
      buildActivity(currentUser, "status", "Lead marked invalid", "Removed from the active queue after validation.", now),
    );
  });
}

export async function saveDisposition(input: SaveDispositionInput, currentUser: ApiUser) {
  await withWrite((state) => {
    const lead = ensureLeadAccess(state, input.leadId, currentUser);
    const now = nowIso();
    const callbackAt = input.callbackAt || null;
    const status = callStatusFromDisposition(input.disposition);
    const call = buildCallRecord({
      lead,
      agent: currentUser,
      callType: "outgoing",
      durationSeconds: input.durationSeconds,
      disposition: input.disposition,
      status,
      notes: input.notes.trim(),
      callbackAt,
    });

    call.recordingEnabled = input.recordingEnabled;
    call.outcomeSummary = input.outcomeSummary.trim() || call.outcomeSummary;
    call.aiSummary = call.outcomeSummary;
    lead.callHistory.unshift(call);
    if (input.notes.trim()) {
      lead.notesHistory.unshift(buildNoteEntry(currentUser, input.notes.trim(), now));
    }
    lead.status = dispositionToStatus(input.disposition);
    lead.lastContacted = now;
    lead.callbackTime = callbackAt;
    lead.priority = input.followUpPriority;
    lead.notes = input.notes.trim() || lead.notes;
    lead.updatedAt = now;
    lead.activities.unshift(
      buildActivity(
        currentUser,
        activityTypeFromDisposition(input.disposition),
        `${input.disposition} saved`,
        input.outcomeSummary.trim() || `Disposition ${input.disposition} saved after call completion.`,
        now,
      ),
    );
    if (callbackAt) {
      lead.activities.unshift(
        buildActivity(currentUser, "callback", "Callback scheduled", `Callback scheduled for ${callbackAt}.`, now),
      );
    }
  });
}

export async function saveFailedCallAttempt(
  input: SaveFailedCallAttemptInput,
  currentUser: ApiUser,
) {
  await withWrite((state) => {
    const lead = ensureLeadAccess(state, input.leadId, currentUser);
    const now = nowIso();
    const diagnostic = {
      dialedNumber: input.dialedNumber,
      failureStage: input.failureStage,
      sipStatus: input.sipStatus ?? null,
      sipReason: input.sipReason ?? null,
      failureMessage: input.failureMessage ?? null,
      startedAt: input.startedAt,
      endedAt: input.endedAt || now,
    };
    const activity = buildActivity(
      currentUser,
      "call",
      "Call attempt failed",
      formatFailedAttemptSummary(diagnostic),
      now,
    );

    lead.callHistory.unshift(
      buildFailedAttemptCallLog({
        id: activity.id,
        leadId: lead.id,
        leadName: lead.fullName,
        primaryPhone: lead.phoneNumbers?.[0] ?? lead.phone,
        createdAt: activity.createdAt,
        actor: currentUser,
        diagnostic,
      }),
    );
    lead.activities.unshift(activity);
    lead.updatedAt = now;
  });
}

export async function rescheduleLeadCallback(
  leadId: string,
  callbackAt: string,
  priority: ApiLeadPriority,
  currentUser: ApiUser,
) {
  await withWrite((state) => {
    const lead = ensureLeadAccess(state, leadId, currentUser);
    const now = nowIso();
    lead.callbackTime = callbackAt;
    lead.priority = priority;
    lead.status = "callback_due";
    lead.updatedAt = now;
    lead.activities.unshift(
      buildActivity(currentUser, "callback", "Callback rescheduled", `Callback moved to ${callbackAt}.`, now),
    );
  });
}

export async function completeLeadCallback(leadId: string, currentUser: ApiUser) {
  await withWrite((state) => {
    const lead = ensureLeadAccess(state, leadId, currentUser);
    const now = nowIso();
    lead.callbackTime = null;
    lead.status = "contacted";
    lead.updatedAt = now;
    lead.activities.unshift(
      buildActivity(currentUser, "callback", "Callback completed", "Scheduled callback was completed and cleared.", now),
    );
  });
}

export async function reopenLead(leadId: string, currentUser: ApiUser) {
  await withWrite((state) => {
    const lead = ensureLeadAccess(state, leadId, currentUser);
    const now = nowIso();
    lead.callbackTime = null;
    lead.status = "follow_up";
    lead.updatedAt = now;
    lead.activities.unshift(
      buildActivity(currentUser, "status", "Lead reopened", "Lead moved back into the follow-up queue.", now),
    );
  });
}

export async function createWorkspaceUser(input: CreateUserInput, _currentUser: ApiUser) {
  return withWrite((state) => {
    if (getUserRecordByEmail(state, input.email)) {
      throw new Error("A workspace user with this email already exists");
    }

    const temporaryPassword = input.temporaryPassword ?? buildTemporaryPassword();
    const createdAt = nowIso();
    const user: LocalUserRecord = {
      id: randomUUID(),
      authUserId: randomUUID(),
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      role: input.role,
      team: input.team.trim(),
      timezone: input.timezone.trim(),
      avatar: getInitials(input.name.trim()),
      title: input.title.trim(),
      status: "offline",
      passwordHash: hashPassword(temporaryPassword),
      createdAt,
      updatedAt: createdAt,
    };

    state.users.push(user);
    return {
      user: mapUser(user),
      temporaryPassword,
    };
  });
}

export async function createPublicSignup(input: SignupInput) {
  void input;
  throw new Error("Account creation is managed by an administrator.");
}

export async function updateWorkspaceUserStatus(
  userId: string,
  status: "online" | "away" | "offline",
  _currentUser: ApiUser,
) {
  await withWrite((state) => {
    const user = getUserRecordById(state, userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.status = status;
    user.updatedAt = nowIso();
  });
}

export async function listSipProfiles(currentUser: ApiUser): Promise<ApiSipProfile[]> {
  const state = await getSnapshot();
  const users = mapUsers(state.users);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const profiles = getVisibleSipProfiles(state, currentUser).map((profile) =>
    mapSipProfile(profile, null, usersById),
  );

  return buildSipWorkspaceExposure(currentUser, {
    profiles,
    activeProfile: null,
    selectionRequired: false,
  }).profiles;
}

export async function getActiveSipProfile(currentUser: ApiUser): Promise<StoredSipProfile | null> {
  const state = await getSnapshot();
  const users = mapUsers(state.users);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const activePreference = getActiveSipProfilePreference(state, currentUser.id);
  const activeProfile = activePreference?.activeSipProfileId
    ? state.sipProfiles.find((profile) => profile.id === activePreference.activeSipProfileId) ?? null
    : null;

  return activeProfile
    ? mapStoredSipProfile(activeProfile, activeProfile.id, usersById)
    : null;
}

export async function createSipProfile(input: CreateSipProfileInput, currentUser: ApiUser) {
  return withWrite((state) => {
    const normalizedLabel = input.label.trim();
    const normalizedUrl = normalizeSipProviderUrl(input.providerUrl);
    const normalizedDomain = normalizeSipDomain(input.sipDomain);
    const normalizedUsername = input.sipUsername.trim();
    const normalizedPassword = input.sipPassword.trim();
    const normalizedCallerId = input.callerId.trim();
    const isShared =
      currentUser.role !== "agent" && input.isShared;

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

    const timestamp = nowIso();
    const profile: LocalSipProfileRecord = {
      id: randomUUID(),
      label: normalizedLabel,
      providerUrl: normalizedUrl,
      sipDomain: normalizedDomain,
      sipUsername: normalizedUsername,
      sipPassword: normalizedPassword,
      callerId: normalizedCallerId,
      ownerUserId: isShared ? null : currentUser.id,
      isShared,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    state.sipProfiles.push(profile);

    return mapSipProfile(profile, null, new Map([[currentUser.id, currentUser]]));
  });
}

export async function setActiveSipProfile(profileId: string, currentUser: ApiUser) {
  await withWrite((state) => {
    const visibleSipProfiles = getVisibleSipProfiles(state, currentUser);
    const profile = visibleSipProfiles.find((item) => item.id === profileId);
    if (!profile) {
      throw new Error("SIP profile not found");
    }

    const now = nowIso();
    const existing = getActiveSipProfilePreference(state, currentUser.id);
    if (existing) {
      existing.activeSipProfileId = profileId;
      existing.updatedAt = now;
      return;
    }

    state.userSipPreferences.push({
      userId: currentUser.id,
      activeSipProfileId: profileId,
      createdAt: now,
      updatedAt: now,
    });
  });
}

export async function updateSipProfile(
  profileId: string,
  input: UpdateSipProfileInput,
  currentUser: ApiUser,
) {
  return withWrite((state) => {
    const profile = state.sipProfiles.find((item) => item.id === profileId);
    if (!profile) {
      throw new Error("SIP profile not found");
    }
    if (currentUser.role !== "admin" && !profile.isShared && profile.ownerUserId !== currentUser.id) {
      throw new Error("SIP profile not found");
    }

    const normalizedLabel = input.label.trim();
    const normalizedUrl = normalizeSipProviderUrl(input.providerUrl);
    const normalizedDomain = normalizeSipDomain(input.sipDomain);
    const normalizedUsername = input.sipUsername.trim();
    const normalizedPassword = input.sipPassword?.trim() ?? "";
    const normalizedCallerId = input.callerId.trim();
    const isShared = currentUser.role !== "agent" && input.isShared;

    if (
      !normalizedLabel ||
      !normalizedUrl ||
      !normalizedDomain ||
      !normalizedUsername ||
      !normalizedCallerId
    ) {
      throw new Error("Every SIP profile field except password is required");
    }

    profile.label = normalizedLabel;
    profile.providerUrl = normalizedUrl;
    profile.sipDomain = normalizedDomain;
    profile.sipUsername = normalizedUsername;
    if (normalizedPassword) {
      profile.sipPassword = normalizedPassword;
    }
    profile.callerId = normalizedCallerId;
    profile.isShared = isShared;
    profile.ownerUserId = isShared ? null : profile.ownerUserId;
    profile.updatedAt = nowIso();

    return mapSipProfile(profile, profile.id, new Map([[currentUser.id, currentUser]]));
  });
}

export async function deleteSipProfile(profileId: string, currentUser: ApiUser) {
  await withWrite((state) => {
    const profile = state.sipProfiles.find((item) => item.id === profileId);
    if (!profile) {
      throw new Error("SIP profile not found");
    }
    if (currentUser.role !== "admin" && !profile.isShared && profile.ownerUserId !== currentUser.id) {
      throw new Error("SIP profile not found");
    }

    state.sipProfiles = state.sipProfiles.filter((item) => item.id !== profileId);
    state.userSipPreferences = state.userSipPreferences.filter(
      (preference) => preference.activeSipProfileId !== profileId,
    );
  });
}

export async function assignSipProfileToUser(
  userId: string,
  profileId: string | null,
  _currentUser: ApiUser,
) {
  await withWrite((state) => {
    const user = getUserRecordById(state, userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (profileId) {
      const profile = state.sipProfiles.find((item) => item.id === profileId);
      if (!profile) {
        throw new Error("SIP profile not found");
      }
    }

    const now = nowIso();
    const existing = getActiveSipProfilePreference(state, userId);
    if (existing) {
      existing.activeSipProfileId = profileId;
      existing.updatedAt = now;
      return;
    }

    state.userSipPreferences.push({
      userId,
      activeSipProfileId: profileId,
      createdAt: now,
      updatedAt: now,
    });
  });
}

export async function deleteWorkspaceUser(userId: string, currentUser: ApiUser) {
  await withWrite((state) => {
    if (userId === currentUser.id) {
      throw new Error("You cannot delete your own admin account.");
    }

    const user = getUserRecordById(state, userId);
    if (!user) {
      throw new Error("User not found");
    }

    state.leads.forEach((lead) => {
      if (lead.assignedAgentId === userId) {
        syncLeadAssignment(lead, null);
        lead.updatedAt = nowIso();
      }

      lead.callHistory = lead.callHistory.map((call) =>
        call.agentId === userId
          ? {
              ...call,
              agentId: "",
              agentName: "Removed User",
            }
          : call,
      );

      lead.notesHistory = lead.notesHistory.map((note) =>
        note.authorId === userId
          ? {
              ...note,
              authorId: "",
              authorName: "Removed User",
            }
          : note,
      );

      lead.activities = lead.activities.map((activity) =>
        activity.actorName === user.name
          ? {
              ...activity,
              actorName: "Removed User",
            }
          : activity,
      );
    });

    const ownedProfileIds = state.sipProfiles
      .filter((profile) => profile.ownerUserId === userId)
      .map((profile) => profile.id);

    state.sipProfiles = state.sipProfiles.filter((profile) => profile.ownerUserId !== userId);
    state.userSipPreferences = state.userSipPreferences.filter(
      (preference) =>
        preference.userId !== userId &&
        !ownedProfileIds.includes(preference.activeSipProfileId ?? ""),
    );
    state.queueProgress = state.queueProgress.filter((entry) => entry.userId !== userId);
    state.users = state.users.filter((item) => item.id !== userId);
  });
}

export function getVoiceIdentity(user: ApiUser) {
  return sanitizeIdentity(`${user.id}_${user.email}`);
}

export interface SaveQueueProgressInput {
  queueScope: string;
  queueSort: QueueSort;
  queueFilter: QueueFilter;
  currentLeadId: string | null;
  currentPhoneIndex: number;
}

export async function getQueueProgress(currentUser: ApiUser, queueKey?: string) {
  const state = await getSnapshot();
  return state.queueProgress
    .filter((entry) => entry.userId === currentUser.id && (!queueKey || entry.queueKey === queueKey))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .map((entry) => clone(entry));
}

export async function saveQueueProgress(
  input: SaveQueueProgressInput,
  currentUser: ApiUser,
) {
  return withWrite((state) => {
    const queueKey = getQueueKey(input.queueScope, input.queueSort, input.queueFilter);
    const now = nowIso();
    const nextRecord = {
      ...toQueueProgressRecord(
        currentUser.id,
        input.queueScope,
        input.queueSort,
        input.queueFilter,
        {
          currentLeadId: input.currentLeadId,
          currentPhoneIndex: Math.max(0, input.currentPhoneIndex),
        },
        {
          createdAt: now,
          updatedAt: now,
        },
      ),
      updatedAt: now,
    };

    const existingIndex = state.queueProgress.findIndex(
      (entry) => entry.userId === currentUser.id && entry.queueKey === queueKey,
    );

    if (existingIndex >= 0) {
      state.queueProgress[existingIndex] = {
        ...state.queueProgress[existingIndex],
        ...nextRecord,
        createdAt: state.queueProgress[existingIndex].createdAt,
        updatedAt: now,
      };
      return clone(state.queueProgress[existingIndex]);
    }

    state.queueProgress.push(nextRecord);
    return clone(nextRecord);
  });
}

export async function resetQueueProgress(
  currentUser: ApiUser,
  queueScope: string,
  queueSort: QueueSort,
  queueFilter: QueueFilter,
) {
  await withWrite((state) => {
    const queueKey = getQueueKey(queueScope, queueSort, queueFilter);
    state.queueProgress = state.queueProgress.filter(
      (entry) => !(entry.userId === currentUser.id && entry.queueKey === queueKey),
    );
  });
}
