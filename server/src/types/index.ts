export type ApiUserRole = "admin" | "team_leader" | "agent";

export type ApiLeadPriority = "Low" | "Medium" | "High" | "Urgent";

export type ApiLeadStatus =
  | "new"
  | "contacted"
  | "callback_due"
  | "follow_up"
  | "qualified"
  | "appointment_booked"
  | "closed_won"
  | "closed_lost"
  | "invalid";

export type ApiCallDisposition =
  | "No Answer"
  | "Busy"
  | "Voicemail"
  | "Wrong Number"
  | "Not Interested"
  | "Interested"
  | "Call Back Later"
  | "Follow-Up Required"
  | "Appointment Booked"
  | "Sale Closed";

export type ApiCallType = "incoming" | "outgoing";

export type ApiCallLogStatus = "connected" | "missed" | "follow_up";

export type ApiCallSentiment = "positive" | "neutral" | "negative";

export type ApiCallActivityType =
  | "call"
  | "note"
  | "callback"
  | "status"
  | "appointment"
  | "sale";

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: ApiUserRole;
  team: string;
  timezone: string;
  avatar: string;
  title: string;
  status: "online" | "away" | "offline";
  activeSipProfileId?: string | null;
  activeSipProfileLabel?: string | null;
}

export interface ApiNoteEntry {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
}

export interface ApiCallLog {
  id: string;
  leadId: string;
  leadName: string;
  phone: string;
  createdAt: string;
  agentId: string;
  agentName: string;
  callType: ApiCallType;
  durationSeconds: number;
  disposition: ApiCallDisposition;
  status: ApiCallLogStatus;
  notes: string;
  recordingEnabled: boolean;
  outcomeSummary: string;
  aiSummary: string;
  sentiment: ApiCallSentiment;
  suggestedNextAction: string;
  followUpAt: string | null;
}

export interface ApiLeadActivity {
  id: string;
  type: ApiCallActivityType;
  title: string;
  description: string;
  createdAt: string;
  actorName: string;
}

export interface ApiLead {
  id: string;
  fullName: string;
  phone: string;
  altPhone: string;
  email: string;
  company: string;
  jobTitle: string;
  location: string;
  source: string;
  interest: string;
  status: ApiLeadStatus;
  notes: string;
  lastContacted: string | null;
  assignedAgentId: string;
  assignedAgentName: string;
  callbackTime: string | null;
  priority: ApiLeadPriority;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  callHistory: ApiCallLog[];
  notesHistory: ApiNoteEntry[];
  activities: ApiLeadActivity[];
  leadScore: number;
  timezone: string;
}

export interface ApiLeadImportRecord {
  fullName: string;
  phone: string;
  altPhone: string;
  email: string;
  company: string;
  jobTitle: string;
  location: string;
  source: string;
  interest: string;
  status: ApiLeadStatus;
  notes: string;
  lastContacted: string | null;
  assignedAgentName: string;
  callbackTime: string | null;
  priority: ApiLeadPriority;
}

export interface UploadResult {
  added: number;
  duplicates: number;
  invalidRows: number;
}

export interface SaveDispositionInput {
  leadId: string;
  disposition: ApiCallDisposition;
  notes: string;
  callbackAt: string;
  followUpPriority: ApiLeadPriority;
  outcomeSummary: string;
  durationSeconds: number;
  recordingEnabled: boolean;
}

export interface CreateCallLogInput {
  leadId: string;
  callType: ApiCallType;
  durationSeconds: number;
  status: ApiCallLogStatus;
  notes: string;
  callbackAt: string;
  priority: ApiLeadPriority;
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
  role: ApiUserRole;
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
  priority: ApiLeadPriority;
  status: ApiLeadStatus;
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
  type: ApiCallActivityType;
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

export interface ApiSipProfile {
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

export interface StoredSipProfile extends Omit<ApiSipProfile, "passwordPreview"> {
  sipPassword: string;
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
  authMode: "supabase" | "local";
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

export interface WorkspacePayload {
  user: ApiUser;
  users: ApiUser[];
  leads: ApiLead[];
  analytics: WorkspaceAnalytics;
  settings: WorkspaceSettingsStatus;
  voice: VoiceProviderConfig;
  sipProfiles: ApiSipProfile[];
  activeSipProfile: ApiSipProfile | null;
  sipProfileSelectionRequired: boolean;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: ApiUserRole;
  team: string;
  timezone: string;
  title: string;
  temporaryPassword?: string;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  team: string;
  timezone: string;
  title: string;
}
