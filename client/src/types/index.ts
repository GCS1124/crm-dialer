export type UserRole = "admin" | "team_leader" | "agent";

export type ThemeMode = "light" | "dark";

export type LeadPriority = "Low" | "Medium" | "High" | "Urgent";

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
  | "Sale Closed";

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
  | "on_hold"
  | "ended";

export type QueueSort = "priority" | "newest" | "callback_due";

export type QueueFilter = "all" | LeadStatus;

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
  createdAt: string;
  agentId: string;
  agentName: string;
  durationSeconds: number;
  disposition: CallDisposition;
  status: "completed" | "missed";
  notes: string;
  recordingEnabled: boolean;
  outcomeSummary: string;
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
  leadId: string;
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

export interface LeadImportRecord {
  fullName: string;
  phone: string;
  altPhone: string;
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
}

export interface TwilioDialerConfig {
  available: boolean;
  callerId: string | null;
  appSid: string | null;
}

export interface WorkspaceSettingsStatus {
  authMode: "supabase";
  signupEnabled: boolean;
  importFormats: string[];
  twilio: {
    available: boolean;
    callerId: string | null;
    configuredFields: {
      accountSid: boolean;
      apiKey: boolean;
      apiSecret: boolean;
      appSid: boolean;
      callerId: boolean;
    };
  };
  supabase: {
    connected: boolean;
    publishableKeyConfigured: boolean;
    serviceRoleConfigured: boolean;
  };
}

export interface WorkspacePayload {
  user: User;
  users: User[];
  leads: Lead[];
  analytics: WorkspaceAnalytics;
  settings: WorkspaceSettingsStatus;
  twilio: TwilioDialerConfig;
}
