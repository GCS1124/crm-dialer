export type UserRole = "admin" | "team_leader" | "agent";

export type ThemeMode = "light" | "dark";

export type LeadPriority = "Low" | "Medium" | "High" | "Urgent";

export type QueueSort = "priority" | "newest" | "callback_due";

export type QueueFilter = "all" | LeadStatus;

export type LeadStatus =
  | "new"
  | "contacted"
  | "callback_due"
  | "follow_up"
  | "qualified"
  | "appointment_booked"
  | "closed_won"
  | "closed_lost"
  | "invalid";

export type CallDisposition =
  | "No Answer"
  | "Busy"
  | "Voicemail"
  | "Wrong Number"
  | "Not Interested"
  | "Interested"
  | "Call Back Later"
  | "Follow-Up Required"
  | "Appointment Booked"
  | "Sale Closed"
  | "Failed Attempt";

export type CallType = "incoming" | "outgoing";

export type CallLogStatus = "connected" | "missed" | "follow_up" | "failed";

export type CallSentiment = "positive" | "neutral" | "negative";

export type CallAttemptFailureStage =
  | "session_unavailable"
  | "session_start"
  | "invite"
  | "microphone"
  | "server_disconnect"
  | "sip_reject"
  | "hangup_before_connect"
  | "unknown";

export type CallActivityType =
  | "call"
  | "note"
  | "callback"
  | "status"
  | "appointment"
  | "sale";

export type CallControlStatus =
  | "idle"
  | "ringing"
  | "connected"
  | "manual"
  | "on_hold"
  | "ended";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  team: string;
  timezone: string;
  avatar: string;
  title: string;
  status: "online" | "away" | "offline";
  activeSipProfileId?: string | null;
  activeSipProfileLabel?: string | null;
}

export interface NoteEntry {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
}

export interface CallLog {
  id: string;
  leadId: string;
  leadName: string;
  phone: string;
  createdAt: string;
  agentId: string;
  agentName: string;
  callType: CallType;
  durationSeconds: number;
  disposition: CallDisposition;
  status: CallLogStatus;
  source?: "call_log" | "failed_attempt";
  failureStage?: CallAttemptFailureStage;
  sipStatus?: number | null;
  sipReason?: string | null;
  failureMessage?: string | null;
  notes: string;
  recordingEnabled: boolean;
  outcomeSummary: string;
  aiSummary: string;
  sentiment: CallSentiment;
  suggestedNextAction: string;
  followUpAt: string | null;
}

export interface LeadActivity {
  id: string;
  type: CallActivityType;
  title: string;
  description: string;
  createdAt: string;
  actorName: string;
}

export interface Lead {
  id: string;
  fullName: string;
  phone: string;
  altPhone: string;
  phoneNumbers?: string[];
  email: string;
  company: string;
  jobTitle: string;
  location: string;
  source: string;
  interest: string;
  status: LeadStatus;
  notes: string;
  lastContacted: string | null;
  assignedAgentId: string;
  assignedAgentName: string;
  callbackTime: string | null;
  priority: LeadPriority;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  callHistory: CallLog[];
  notesHistory: NoteEntry[];
  activities: LeadActivity[];
  leadScore: number;
  timezone: string;
}

export interface ActiveCall {
  leadId: string | null;
  dialedNumber: string;
  displayName: string;
  startedAt: number;
  status: CallControlStatus;
  muted: boolean;
  recordingEnabled: boolean;
}

export interface SaveDispositionInput {
  disposition: CallDisposition;
  notes: string;
  callbackAt: string;
  followUpPriority: LeadPriority;
  outcomeSummary: string;
}

export interface CallLogFormInput {
  leadId: string;
  callType: CallType;
  durationSeconds: number;
  status: CallLogStatus;
  notes: string;
  callbackAt: string;
  priority: LeadPriority;
}

export interface LeadImportRecord {
  fullName: string;
  phone: string;
  altPhone: string;
  phoneNumbers?: string[];
  email: string;
  company: string;
  jobTitle: string;
  location: string;
  source: string;
  interest: string;
  status: LeadStatus;
  notes: string;
  lastContacted: string | null;
  assignedAgentName: string;
  callbackTime: string | null;
  priority: LeadPriority;
}

export interface UploadResult {
  added: number;
  duplicates: number;
  invalidRows: number;
}

export interface AgentDashboardMetrics {
  totalAssignedLeads: number;
  callsMadeToday: number;
  connectedCalls: number;
  noAnswers: number;
  callbacksScheduled: number;
  appointmentsBooked: number;
  salesClosed: number;
  conversionRate: number;
  averageCallDuration: number;
  remainingLeads: number;
}

export interface AdminDashboardMetrics {
  totalTeamCalls: number;
  connectedCalls: number;
  callbackCompletionRate: number;
  appointmentsBooked: number;
  salesClosed: number;
  activeLeads: number;
  averageCallDuration: number;
}

export interface ChartDatum {
  label: string;
  value: number;
}

export interface DailyPerformanceDatum {
  label: string;
  calls: number;
  connected: number;
}

export interface TopAgentDatum {
  id: string;
  name: string;
  role: UserRole;
  calls: number;
  conversions: number;
  callbackCompletionRate: number;
}

export type InsightTone = "slate" | "blue" | "amber" | "rose" | "emerald";

export interface FocusMetric {
  id: string;
  label: string;
  value: number;
  hint: string;
  tone: InsightTone;
}

export interface RecommendedLead {
  leadId: string;
  fullName: string;
  company: string;
  phone: string;
  priority: LeadPriority;
  status: LeadStatus;
  leadScore: number;
  callbackTime: string | null;
  reason: string;
  suggestedAction: string;
  assignedAgentName: string;
}

export interface ActivityFeedItem {
  id: string;
  leadId: string;
  leadName: string;
  type: CallActivityType;
  title: string;
  description: string;
  createdAt: string;
  actorName: string;
}

export interface RiskMetric {
  id: string;
  label: string;
  value: number;
  hint: string;
  tone: InsightTone;
}

export interface DuplicateInsight {
  id: string;
  matchType: "phone" | "email";
  value: string;
  count: number;
  leadIds: string[];
  leadNames: string[];
}

export interface WorkspaceAnalytics {
  agentMetrics: AgentDashboardMetrics | null;
  adminMetrics: AdminDashboardMetrics | null;
  callbackCounts: {
    today: number;
    overdue: number;
    upcoming: number;
  };
  performanceData: DailyPerformanceDatum[];
  dispositionData: ChartDatum[];
  pipelineData: ChartDatum[];
  statusData: ChartDatum[];
  topAgents: TopAgentDatum[];
  focusMetrics: FocusMetric[];
  recommendedLeads: RecommendedLead[];
  activityFeed: ActivityFeedItem[];
  riskMetrics: RiskMetric[];
  duplicateInsights: DuplicateInsight[];
}

export type VoiceProviderName = "embedded-sip";

export interface SipProfile {
  id: string;
  label: string;
  providerUrl: string;
  sipDomain: string;
  sipUsername: string;
  callerId: string;
  ownerUserId: string | null;
  ownerUserName: string | null;
  isShared: boolean;
  isActive: boolean;
  passwordPreview: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSipProfileInput {
  label: string;
  providerUrl: string;
  sipDomain: string;
  sipUsername: string;
  sipPassword: string;
  callerId: string;
  isShared: boolean;
}

export interface UpdateSipProfileInput {
  label: string;
  providerUrl: string;
  sipDomain: string;
  sipUsername: string;
  sipPassword?: string;
  callerId: string;
  isShared: boolean;
}

export interface VoiceProviderConfig {
  provider: VoiceProviderName;
  available: boolean;
  source: "profile" | "environment" | "unconfigured";
  callerId: string | null;
  websocketUrl: string | null;
  sipDomain: string | null;
  username: string | null;
  profileId: string | null;
  profileLabel: string | null;
}

export interface WorkspaceSettingsStatus {
  authMode: "supabase";
  signupEnabled: boolean;
  importFormats: string[];
  voice: {
    provider: VoiceProviderName;
    available: boolean;
    callerId: string | null;
    configuredFields: {
      websocketUrl: boolean;
      sipDomain: boolean;
      sipUsername: boolean;
      sipPassword: boolean;
      callerId: boolean;
    };
  };
  supabase: {
    connected: boolean;
    publishableKeyConfigured: boolean;
    serviceRoleConfigured: boolean;
    reason?: string | null;
    realtimeAvailable?: boolean;
  };
}

export interface RuntimeStatus {
  backend: "ok";
  dataMode: "supabase";
  signupEnabled: boolean;
  message: string;
  supabase: {
    configured: boolean;
    reachable: boolean;
    host: string | null;
    reason: string | null;
  };
  voice: {
    provider: VoiceProviderName;
    available: boolean;
  };
}

export interface WorkspacePayload {
  user: User;
  users: User[];
  leads: Lead[];
  analytics: WorkspaceAnalytics;
  settings: WorkspaceSettingsStatus;
  voice: VoiceProviderConfig;
  sipProfiles: SipProfile[];
  activeSipProfile: SipProfile | null;
  sipProfileSelectionRequired: boolean;
}

export interface QueueCursor {
  currentLeadId: string | null;
  currentPhoneIndex: number;
}

export interface QueueItem {
  queueKey: string;
  queueScope: string;
  queueSort: QueueSort;
  queueFilter: QueueFilter;
  leadId: string;
  leadName: string;
  phoneIndex: number;
  phoneNumber: string;
  numberCount: number;
}

export interface QueueProgressRecord extends QueueCursor {
  userId: string;
  queueKey: string;
  queueScope: string;
  queueSort: QueueSort;
  queueFilter: QueueFilter;
  createdAt: string;
  updatedAt: string;
}

export interface QueueState {
  queueKey: string;
  queueScope: string;
  queueSort: QueueSort;
  queueFilter: QueueFilter;
  currentItem: QueueItem | null;
  nextItem: QueueItem | null;
  items: QueueItem[];
  progress: QueueProgressRecord | null;
}
