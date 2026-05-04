import { SimpleUser, type SimpleUserOptions } from "sip.js/lib/platform/web";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getQueueLeads } from "../lib/analytics";
import { apiRequest } from "../lib/api";
import { formatDialNumberForSession, normalizeDialTarget } from "../lib/softphoneDialing";
import { supabase } from "../lib/supabase";
import type {
  ActiveCall,
  CallAttemptFailureStage,
  CallLogFormInput,
  CreateSipProfileInput,
  Lead,
  LeadImportRecord,
  LeadPriority,
  LeadStatus,
  QueueFilter,
  QueueSort,
  QueueState,
  SaveDispositionInput,
  SipProfile,
  ThemeMode,
  UpdateSipProfileInput,
  UploadResult,
  User,
  VoiceProviderConfig,
  WorkspaceAnalytics,
  WorkspaceSettingsStatus,
  WorkspacePayload,
} from "../types";

interface VoiceSessionResponse {
  provider: "embedded-sip";
  available: boolean;
  source: "profile" | "environment" | "unconfigured";
  callerId: string | null;
  websocketUrl: string | null;
  sipDomain: string | null;
  username: string | null;
  profileId: string | null;
  profileLabel: string | null;
  sipUri?: string;
  authorizationUsername?: string;
  authorizationPassword?: string;
  dialPrefix?: string;
  displayName?: string;
  message?: string;
}

interface InviteUserResult {
  user: User;
  temporaryPassword: string;
}

interface AuthResponse {
  token: string | null;
  refreshToken?: string | null;
  user: User;
  message?: string;
}

function buildVoiceConfigSignature(session: VoiceSessionResponse, displayName: string) {
  return JSON.stringify({
    provider: session.provider,
    websocketUrl: session.websocketUrl,
    sipDomain: session.sipDomain,
    username: session.username,
    sipUri: session.sipUri,
    displayName,
  });
}

function isMicrophoneAccessError(error: unknown) {
  const candidate = error as { name?: unknown; message?: unknown } | null;
  const name = typeof candidate?.name === "string" ? candidate.name : "";
  const message = typeof candidate?.message === "string" ? candidate.message : "";

  return (
    ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name) ||
    /permission denied|permission dismissed|not allowed|denied by system|microphone/i.test(message)
  );
}

function buildMicrophoneBlockedMessage(openedSystemDialer: boolean) {
  return openedSystemDialer
    ? "Browser microphone access is blocked, so the system dialer was opened as a fallback. Keep this call active here and save the outcome when finished."
    : "Browser microphone access is blocked for this site. Allow microphone access from the address bar site settings, reload the page, and start the call again.";
}

function openSystemDialer(phone: string) {
  if (typeof window === "undefined") {
    return false;
  }

  const normalized = phone.trim();
  if (!normalized) {
    return false;
  }

  window.location.href = `tel:${encodeURIComponent(normalized)}`;
  return true;
}

async function ensureMicrophoneAccess() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  stream.getTracks().forEach((track) => track.stop());
}

function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    if (!stored) {
      return fallback;
    }

    try {
      return JSON.parse(stored) as T;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

const emptyAnalytics: WorkspaceAnalytics = {
  agentMetrics: null,
  adminMetrics: null,
  callbackCounts: {
    today: 0,
    overdue: 0,
    upcoming: 0,
  },
  performanceData: [],
  dispositionData: [],
  pipelineData: [],
  statusData: [],
  topAgents: [],
  focusMetrics: [],
  recommendedLeads: [],
  activityFeed: [],
  riskMetrics: [],
  duplicateInsights: [],
};

const emptyVoiceConfig: VoiceProviderConfig = {
  provider: "embedded-sip",
  available: false,
  source: "unconfigured",
  callerId: null,
  websocketUrl: null,
  sipDomain: null,
  username: null,
  profileId: null,
  profileLabel: null,
};

const emptySettingsStatus: WorkspaceSettingsStatus = {
  authMode: "supabase",
  signupEnabled: false,
  importFormats: ["csv", "xlsx", "xls"],
  voice: {
    provider: "embedded-sip",
    available: false,
    callerId: null,
    configuredFields: {
      websocketUrl: false,
      sipDomain: false,
      sipUsername: false,
      sipPassword: false,
      callerId: false,
    },
  },
  supabase: {
    connected: false,
    publishableKeyConfigured: false,
    serviceRoleConfigured: false,
    reason: "Workspace settings have not loaded yet.",
    realtimeAvailable: false,
  },
};

interface AppStateContextValue {
  currentUser: User | null;
  users: User[];
  leads: Lead[];
  analytics: WorkspaceAnalytics;
  settingsStatus: WorkspaceSettingsStatus;
  voiceConfig: VoiceProviderConfig;
  sipProfiles: SipProfile[];
  activeSipProfile: SipProfile | null;
  sipProfileSelectionRequired: boolean;
  callError: string | null;
  theme: ThemeMode;
  sessionReady: boolean;
  workspaceLoading: boolean;
  workspaceError: string | null;
  lastWorkspaceSyncAt: string | null;
  queueSort: QueueSort;
  queueFilter: QueueFilter;
  currentLeadId: string | null;
  activeCall: ActiveCall | null;
  wrapUpLeadId: string | null;
  autoDialEnabled: boolean;
  autoDialDelaySeconds: number;
  autoDialCountdown: number | null;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; message?: string }>;
  continueWithGoogle: () => Promise<{ success: boolean; message?: string }>;
  signup: (input: {
    name: string;
    email: string;
    password: string;
    team: string;
    timezone: string;
    title: string;
  }) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  refreshWorkspace: () => Promise<void>;
  setTheme: (theme: ThemeMode) => void;
  setQueueSort: (sort: QueueSort) => void;
  setQueueFilter: (filter: QueueFilter) => void;
  setAutoDialEnabled: (enabled: boolean) => void;
  setAutoDialDelaySeconds: (delay: number) => void;
  selectLead: (leadId: string) => void;
  previousLead: () => void;
  nextLead: () => void;
  skipLead: () => void;
  markLeadInvalid: () => Promise<void>;
  startCall: (input?: {
    phone?: string;
    leadId?: string | null;
    displayName?: string;
  }) => Promise<void>;
  toggleMute: () => void;
  holdCall: () => void;
  resumeCall: () => void;
  endCall: () => void;
  saveDisposition: (input: SaveDispositionInput) => Promise<void>;
  uploadLeads: (
    records: LeadImportRecord[],
    assignToUserId?: string,
  ) => Promise<UploadResult>;
  assignLead: (leadId: string, userId: string) => Promise<void>;
  bulkUpdateLeadStatus: (leadIds: string[], status: LeadStatus) => Promise<void>;
  deleteLeads: (leadIds: string[]) => Promise<void>;
  createCallLog: (input: CallLogFormInput) => Promise<void>;
  updateCallLog: (callId: string, input: CallLogFormInput) => Promise<void>;
  deleteCallLog: (callId: string) => Promise<void>;
  rescheduleCallback: (leadId: string, callbackAt: string, priority: LeadPriority) => Promise<void>;
  markCallbackCompleted: (leadId: string) => Promise<void>;
  reopenLead: (leadId: string) => Promise<void>;
  inviteUser: (input: {
    name: string;
    email: string;
    role: User["role"];
    team: string;
    timezone: string;
    title: string;
  }) => Promise<InviteUserResult>;
  setUserStatus: (userId: string, status: User["status"]) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  createSipProfile: (
    input: CreateSipProfileInput,
    options?: { activate?: boolean },
  ) => Promise<SipProfile>;
  activateSipProfile: (profileId: string) => Promise<void>;
  updateSipProfile: (profileId: string, input: UpdateSipProfileInput) => Promise<SipProfile>;
  deleteSipProfile: (profileId: string) => Promise<void>;
  assignSipProfileToUser: (userId: string, profileId: string | null) => Promise<void>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = usePersistentState<ThemeMode>("preview-dialer-theme", "light");
  const [authToken, setAuthToken] = usePersistentState<string | null>("preview-dialer-token", null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [analytics, setAnalytics] = useState<WorkspaceAnalytics>(emptyAnalytics);
  const [settingsStatus, setSettingsStatus] = useState<WorkspaceSettingsStatus>(emptySettingsStatus);
  const [voiceConfig, setVoiceConfig] = useState<VoiceProviderConfig>(emptyVoiceConfig);
  const [sipProfiles, setSipProfiles] = useState<SipProfile[]>([]);
  const [activeSipProfile, setActiveSipProfile] = useState<SipProfile | null>(null);
  const [sipProfileSelectionRequired, setSipProfileSelectionRequired] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [lastWorkspaceSyncAt, setLastWorkspaceSyncAt] = useState<string | null>(null);
  const [queueSort, setQueueSort] = useState<QueueSort>("priority");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [autoDialEnabled, setAutoDialEnabled] = usePersistentState<boolean>(
    "preview-dialer-auto-dial-enabled",
    false,
  );
  const [autoDialDelaySeconds, setAutoDialDelaySeconds] = usePersistentState<number>(
    "preview-dialer-auto-dial-delay",
    3,
  );
  const [autoDialCountdown, setAutoDialCountdown] = useState<number | null>(null);
  const [currentLeadId, setCurrentLeadId] = useState<string | null>(null);
  const [currentPhoneIndex, setCurrentPhoneIndex] = useState(0);
  const [queueCursorHydrated, setQueueCursorHydrated] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [wrapUpLeadId, setWrapUpLeadId] = useState<string | null>(null);
  const [wrapUpDurationSeconds, setWrapUpDurationSeconds] = useState(0);
  const voiceClientRef = useRef<SimpleUser | null>(null);
  const voiceConfigSignatureRef = useRef<string | null>(null);
  const wrapUpLeadIdRef = useRef<string | null>(null);
  const suppressVoiceDisconnectRef = useRef(0);
  const activeCallMetaRef = useRef<{
    leadId: string | null;
    dialedNumber: string;
    phoneIndex: number;
    startedAt: number;
    connected: boolean;
    userHangup: boolean;
    fallbackOpened: boolean;
    attemptPersisted: boolean;
    sipStatusCode?: number | null;
    sipReasonPhrase?: string | null;
  } | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const autoDialTimerRef = useRef<number | null>(null);
  const lastAutoDialLeadIdRef = useRef<string | null>(null);
  const pendingFallbackDialRef = useRef<{
    leadId: string;
    phoneNumber: string;
    phoneIndex: number;
  } | null>(null);
  const notifiedCallbacksRef = useRef<Set<string>>(new Set());
  const queueStateSignatureRef = useRef<string | null>(null);

  const queue = currentUser
    ? getQueueLeads(leads, currentUser.role, currentUser.id, queueSort, queueFilter)
    : [];
  const queueScope = "default";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (!queueCursorHydrated) {
      return;
    }

    if (!queue.length) {
      setCurrentLeadId(null);
      setCurrentPhoneIndex(0);
      return;
    }

    if (!currentLeadId || !queue.some((lead) => lead.id === currentLeadId)) {
      setCurrentLeadId(queue[0].id);
      setCurrentPhoneIndex(0);
    }
  }, [queue, currentLeadId, queueCursorHydrated]);

  useEffect(() => {
    if (!authToken || !currentUser || workspaceLoading) {
      return;
    }

    const signature = `${queueScope}:${queueSort}:${queueFilter}`;
    if (queueStateSignatureRef.current === signature) {
      return;
    }

    void syncQueueCursorFromServer(authToken).catch((error) => {
      const message =
        error instanceof Error ? error.message : "Unable to sync the active queue cursor.";
      setWorkspaceError(message);
    });
  }, [authToken, currentUser?.id, queueFilter, queueSort, queueScope, workspaceLoading]);

  useEffect(() => {
    return () => {
      if (autoDialTimerRef.current) {
        window.clearInterval(autoDialTimerRef.current);
        autoDialTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function hydrateSession() {
      let nextToken = authToken;

      if (!nextToken && supabase) {
        const sessionResult = await supabase.auth.getSession();
        nextToken = sessionResult.data.session?.access_token ?? null;
      }

      if (!nextToken) {
        if (active) {
          setCurrentUser(null);
          setUsers([]);
          setLeads([]);
          setAnalytics(emptyAnalytics);
          setSettingsStatus(emptySettingsStatus);
          setVoiceConfig(emptyVoiceConfig);
          setSipProfiles([]);
          setActiveSipProfile(null);
          setSipProfileSelectionRequired(false);
          setCallError(null);
          setWorkspaceError(null);
          setLastWorkspaceSyncAt(null);
          setSessionReady(true);
        }
        return;
      }

      try {
        const payload = await apiRequest<{ user: User }>("/auth/me", {
          token: nextToken,
        });

        if (!active) {
          return;
        }

        if (!authToken && nextToken) {
          setAuthToken(nextToken);
        }
        setCurrentUser(payload.user);
        await loadWorkspace(nextToken, { silent: true });
      } catch {
        if (!authToken) {
          await supabase?.auth.signOut();
        }
        if (active) {
          cleanupSession();
        }
      } finally {
        if (active) {
          setSessionReady(true);
        }
      }
    }

    void hydrateSession();

    return () => {
      active = false;
    };
  }, [authToken]);

  useEffect(() => {
    return () => {
      const client = voiceClientRef.current;
      voiceClientRef.current = null;
      voiceConfigSignatureRef.current = null;
      activeCallMetaRef.current = null;
      remoteAudioRef.current = null;
      if (client) {
        void client.unregister().catch(() => undefined);
        void client.disconnect().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !autoDialEnabled ||
      !currentLeadId ||
      !queue.some((lead) => lead.id === currentLeadId) ||
      activeCall ||
      wrapUpLeadId ||
      workspaceLoading ||
      lastAutoDialLeadIdRef.current === currentLeadId
    ) {
      if (autoDialTimerRef.current) {
        window.clearInterval(autoDialTimerRef.current);
        autoDialTimerRef.current = null;
      }
      setAutoDialCountdown(null);
      return;
    }

    const duration = Math.max(1, autoDialDelaySeconds);
    const leadId = currentLeadId;
    const startAt = Date.now();

    setAutoDialCountdown(duration);

    autoDialTimerRef.current = window.setInterval(() => {
      const remaining = Math.max(
        0,
        duration - Math.floor((Date.now() - startAt) / 1000),
      );
      setAutoDialCountdown(remaining);

      if (remaining === 0) {
        if (autoDialTimerRef.current) {
          window.clearInterval(autoDialTimerRef.current);
          autoDialTimerRef.current = null;
        }
        setAutoDialCountdown(null);
        lastAutoDialLeadIdRef.current = leadId;
        void startCall().catch(() => undefined);
      }
    }, 250);

    return () => {
      if (autoDialTimerRef.current) {
        window.clearInterval(autoDialTimerRef.current);
        autoDialTimerRef.current = null;
      }
    };
  }, [
    autoDialDelaySeconds,
    autoDialEnabled,
    activeCall,
    currentLeadId,
    queue,
    wrapUpLeadId,
    workspaceLoading,
  ]);

  useEffect(() => {
    if (!currentLeadId) {
      lastAutoDialLeadIdRef.current = null;
      return;
    }

    if (lastAutoDialLeadIdRef.current && lastAutoDialLeadIdRef.current !== currentLeadId) {
      setAutoDialCountdown(null);
    }
  }, [currentLeadId]);

  useEffect(() => {
    if (!authToken) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadWorkspace(authToken, { silent: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [authToken]);

  useEffect(() => {
    if (
      !authToken ||
      settingsStatus.authMode !== "supabase" ||
      !settingsStatus.supabase.connected ||
      !supabase
    ) {
      return;
    }

    const supabaseClient = supabase;

    supabaseClient.realtime.setAuth(authToken);
    const handleChange = () => {
      void loadWorkspace(authToken, { silent: true });
    };

    const channel = supabaseClient
      .channel(`crm-live-${currentUser?.id ?? "session"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "call_logs" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_logs" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "callbacks" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "followups" }, handleChange)
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [authToken, currentUser?.id, settingsStatus.authMode, settingsStatus.supabase.connected]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    if (Notification.permission !== "granted") {
      return;
    }

    const scopeLeads =
      currentUser?.role === "agent"
        ? leads.filter((lead) => lead.assignedAgentId === currentUser.id)
        : leads;

    scopeLeads.forEach((lead) => {
      if (!lead.callbackTime) {
        return;
      }

      const callbackAt = new Date(lead.callbackTime).getTime();
      const diffMinutes = Math.round((callbackAt - Date.now()) / (1000 * 60));
      const notificationId = `${lead.id}:${lead.callbackTime}`;
      if (notifiedCallbacksRef.current.has(notificationId)) {
        return;
      }

      if (diffMinutes <= 0) {
        new Notification("Missed follow-up", {
          body: `${lead.fullName} is overdue for follow-up.`,
        });
        notifiedCallbacksRef.current.add(notificationId);
      } else if (diffMinutes <= 30) {
        new Notification("Upcoming follow-up", {
          body: `${lead.fullName} needs attention in the next ${diffMinutes} minutes.`,
        });
        notifiedCallbacksRef.current.add(notificationId);
      }
    });
  }, [currentUser, leads]);

  async function loadWorkspace(
    tokenOverride?: string | null,
    options: { silent?: boolean } = {},
  ) {
    const token = tokenOverride ?? authToken;
    if (!token) {
      return false;
    }

    setWorkspaceLoading(true);
    try {
      const payload = await apiRequest<WorkspacePayload>("/workspace", {
        token,
      });
      setCurrentUser(payload.user);
      setUsers(payload.users);
      setLeads(payload.leads);
      setAnalytics(payload.analytics);
      setSettingsStatus(payload.settings);
      setVoiceConfig(payload.voice);
      setSipProfiles(payload.sipProfiles);
      setActiveSipProfile(payload.activeSipProfile);
      setSipProfileSelectionRequired(payload.sipProfileSelectionRequired);
      await syncQueueCursorFromServer(token);
      setWorkspaceError(null);
      setLastWorkspaceSyncAt(new Date().toISOString());
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to sync the CRM workspace.";
      if (!options.silent || !workspaceError) {
        setWorkspaceError(message);
      }
      return false;
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function syncQueueCursorFromServer(tokenOverride?: string | null) {
    const token = tokenOverride ?? authToken;
    if (!token) {
      return null;
    }

    const signature = `${queueScope}:${queueSort}:${queueFilter}`;
    setQueueCursorHydrated(false);
    const response = await apiRequest<QueueState>(
      `/queue?sort=${encodeURIComponent(queueSort)}&filter=${encodeURIComponent(queueFilter)}&scope=${encodeURIComponent(queueScope)}`,
      {
        token,
      },
    );
    setCurrentLeadId(response.currentItem?.leadId ?? null);
    setCurrentPhoneIndex(response.currentItem?.phoneIndex ?? 0);
    setQueueCursorHydrated(true);
    queueStateSignatureRef.current = signature;
    return response;
  }

  async function persistQueueCursor(nextLeadId: string | null, nextPhoneIndex: number) {
    if (!authToken || !currentUser) {
      return null;
    }

    const response = await apiRequest<QueueState>("/queue", {
      method: "PUT",
      token: authToken,
      body: JSON.stringify({
        queueScope,
        queueSort,
        queueFilter,
        currentLeadId: nextLeadId,
        currentPhoneIndex: nextPhoneIndex,
      }),
    });

    setCurrentLeadId(response.currentItem?.leadId ?? null);
    setCurrentPhoneIndex(response.currentItem?.phoneIndex ?? 0);
    setQueueCursorHydrated(true);
    return response;
  }

  async function advanceQueueCursor(
    outcome: "completed" | "failed" | "skipped" | "invalid" | "restart",
    currentLeadIdOverride?: string | null,
    currentPhoneIndexOverride?: number,
  ) {
    if (!authToken || !currentUser) {
      return null;
    }

    const response = await apiRequest<QueueState>("/queue/advance", {
      method: "POST",
      token: authToken,
      body: JSON.stringify({
        queueScope,
        queueSort,
        queueFilter,
        currentLeadId: currentLeadIdOverride ?? currentLeadId,
        currentPhoneIndex:
          typeof currentPhoneIndexOverride === "number" ? currentPhoneIndexOverride : currentPhoneIndex,
        outcome,
      }),
    });

    setCurrentLeadId(response.currentItem?.leadId ?? null);
    setCurrentPhoneIndex(response.currentItem?.phoneIndex ?? 0);
    setQueueCursorHydrated(true);
    return response;
  }

  function cleanupSession() {
    setAuthToken(null);
    setCurrentUser(null);
    setUsers([]);
    setLeads([]);
    setAnalytics(emptyAnalytics);
    setSettingsStatus(emptySettingsStatus);
    setVoiceConfig(emptyVoiceConfig);
    setSipProfiles([]);
      setActiveSipProfile(null);
      setSipProfileSelectionRequired(false);
      setCallError(null);
      setWorkspaceError(null);
      setLastWorkspaceSyncAt(null);
      setAutoDialCountdown(null);
      setCurrentLeadId(null);
    setCurrentPhoneIndex(0);
    setQueueCursorHydrated(false);
    setActiveCall(null);
    setWrapUpLeadId(null);
    setWrapUpDurationSeconds(0);
    wrapUpLeadIdRef.current = null;
    lastAutoDialLeadIdRef.current = null;
    queueStateSignatureRef.current = null;
    if (autoDialTimerRef.current) {
      window.clearInterval(autoDialTimerRef.current);
      autoDialTimerRef.current = null;
    }
    activeCallMetaRef.current = null;
    void destroyVoiceClient();
  }

  async function persistFailedCallAttempt(
    meta: NonNullable<typeof activeCallMetaRef.current>,
    failureStage: CallAttemptFailureStage,
    failureMessage: string,
  ) {
    if (!authToken || !meta.leadId || meta.connected || meta.attemptPersisted) {
      return;
    }

    meta.attemptPersisted = true;

    try {
      await apiRequest("/dialer/attempt", {
        method: "POST",
        token: authToken,
        body: JSON.stringify({
          leadId: meta.leadId,
          dialedNumber: meta.dialedNumber,
          failureStage,
          sipStatus: meta.sipStatusCode ?? null,
          sipReason: meta.sipReasonPhrase ?? null,
          failureMessage,
          startedAt: new Date(meta.startedAt).toISOString(),
          endedAt: new Date().toISOString(),
        }),
      });
      await loadWorkspace(authToken, { silent: true });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to save failed call diagnostics.";
      setWorkspaceError(message);
    }
  }

  function finishCallSession(leadId: string | null, startedAt: number) {
    setActiveCall((existing) =>
      existing && existing.startedAt === startedAt ? null : existing,
    );

    if (leadId) {
      wrapUpLeadIdRef.current = leadId;
      setWrapUpLeadId(leadId);
      setWrapUpDurationSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
      setCallError(null);
    } else {
      wrapUpLeadIdRef.current = null;
      setWrapUpLeadId(null);
      setWrapUpDurationSeconds(0);
    }

    activeCallMetaRef.current = null;
  }

  async function failCallSession(
    message: string,
    startedAt: number,
    failureStage: CallAttemptFailureStage = "unknown",
    advanceQueue = false,
  ) {
    const meta = activeCallMetaRef.current;
    let shouldSurfaceCallError = true;
    if (meta && meta.startedAt === startedAt && !meta.userHangup) {
      await persistFailedCallAttempt(meta, failureStage, message);
    }

    setActiveCall((existing) => {
      if (!existing || existing.startedAt !== startedAt) {
        return existing;
      }

      if (
        existing.status === "connected" ||
        existing.status === "on_hold" ||
        existing.status === "manual"
      ) {
        if (existing.leadId) {
          wrapUpLeadIdRef.current = existing.leadId;
          setWrapUpLeadId(existing.leadId);
          setWrapUpDurationSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
        }
        shouldSurfaceCallError = false;
        return null;
      }

      return null;
    });
    activeCallMetaRef.current = null;
    setCallError(shouldSurfaceCallError ? message : null);

    if (advanceQueue && meta?.leadId && !meta.connected && !meta.fallbackOpened && !meta.userHangup) {
      const nextState = await advanceQueueCursor("failed", meta.leadId, meta.phoneIndex).catch(() => null);
      const nextItem = nextState?.currentItem;
      if (
        nextItem?.leadId === meta.leadId &&
        nextItem.phoneIndex > meta.phoneIndex &&
        nextItem.phoneNumber
      ) {
        pendingFallbackDialRef.current = {
          leadId: nextItem.leadId,
          phoneNumber: nextItem.phoneNumber,
          phoneIndex: nextItem.phoneIndex,
        };
      }
    }
  }

  async function destroyVoiceClient() {
    const client = voiceClientRef.current;
    voiceClientRef.current = null;
    voiceConfigSignatureRef.current = null;
    remoteAudioRef.current = null;

    if (!client) {
      return;
    }

    suppressVoiceDisconnectRef.current += 1;
    try {
      await client.unregister();
    } catch {
      // Ignore unregister failures during cleanup.
    }

    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect failures during cleanup.
    } finally {
      suppressVoiceDisconnectRef.current = Math.max(
        0,
        suppressVoiceDisconnectRef.current - 1,
      );
    }
  }

  async function ensureVoiceClient() {
    if (!authToken) {
      throw new Error("Missing session");
    }

    const response = await apiRequest<VoiceSessionResponse>("/dialer/session", {
      token: authToken,
    });

    setVoiceConfig({
      provider: response.provider,
      available: response.available,
      source: response.source,
      callerId: response.callerId ?? null,
      websocketUrl: response.websocketUrl ?? null,
      sipDomain: response.sipDomain ?? null,
      username: response.username ?? null,
      profileId: response.profileId ?? null,
      profileLabel: response.profileLabel ?? null,
    });

    if (
      !response.available ||
      !response.websocketUrl ||
      !response.sipDomain ||
      !response.sipUri ||
      !response.authorizationUsername ||
      !response.authorizationPassword
    ) {
      return { client: null, session: response };
    }

    const displayName = response.displayName ?? currentUser?.name ?? response.username ?? "Agent";
    const signature = buildVoiceConfigSignature(response, displayName);

    if (!voiceClientRef.current || voiceConfigSignatureRef.current !== signature) {
      await destroyVoiceClient();

      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudioRef.current = remoteAudio;

      const options: SimpleUserOptions = {
        aor: response.sipUri,
        media: {
          constraints: {
            audio: true,
            video: false,
          },
          remote: {
            audio: remoteAudio,
          },
        },
        userAgentOptions: {
          authorizationUsername: response.authorizationUsername,
          authorizationPassword: response.authorizationPassword,
          displayName,
        },
      };

      const client = new SimpleUser(response.websocketUrl, options);
      client.delegate = {
        onCallCreated: () => {
          const session = (client as unknown as { session?: unknown }).session;
          const sessionObject = session as Record<string, unknown> | undefined;

          if (sessionObject && !("crmDialerPatched" in sessionObject)) {
            sessionObject.crmDialerPatched = true;
            const attachResponse = (inviteResponse: unknown) => {
              const response = inviteResponse as { message?: { statusCode?: unknown; reasonPhrase?: unknown } };
              const statusCode = response.message?.statusCode;
              const reasonPhrase = response.message?.reasonPhrase;

              const meta = activeCallMetaRef.current;
              if (!meta) {
                return;
              }

              meta.sipStatusCode = typeof statusCode === "number" ? statusCode : null;
              meta.sipReasonPhrase = typeof reasonPhrase === "string" ? reasonPhrase : null;
            };

            const wrapSessionMethod = (methodName: "onReject" | "onRedirect") => {
              const original = sessionObject[methodName];
              if (typeof original !== "function") {
                return;
              }
              sessionObject[methodName] = (inviteResponse: unknown) => {
                attachResponse(inviteResponse);
                return (original as (response: unknown) => unknown).call(sessionObject, inviteResponse);
              };
            };

            wrapSessionMethod("onReject");
            wrapSessionMethod("onRedirect");
          }

          setCallError(null);
          setActiveCall((existing) =>
            existing ? { ...existing, status: "ringing" } : existing,
          );
        },
        onCallAnswered: () => {
          const meta = activeCallMetaRef.current;
          if (meta) {
            meta.connected = true;
          }
          setCallError(null);
          setActiveCall((existing) =>
            existing ? { ...existing, status: "connected" } : existing,
          );
        },
        onCallHangup: () => {
          const meta = activeCallMetaRef.current;
          if (!meta) {
            return;
          }
          if (meta.userHangup) {
            finishCallSession(meta.leadId, meta.startedAt);
            return;
          }

          if (!meta.connected) {
            const sipSummary = meta.sipStatusCode
              ? `SIP ${meta.sipStatusCode}${meta.sipReasonPhrase ? ` ${meta.sipReasonPhrase}` : ""}`
              : null;

            void failCallSession(
              sipSummary
                ? `Call ended before connecting (${sipSummary}).`
                : "Call ended before connecting (rejected, busy, or no answer).",
              meta.startedAt,
              meta.sipStatusCode ? "sip_reject" : "hangup_before_connect",
              true,
            );
            return;
          }

          finishCallSession(meta.leadId, meta.startedAt);
        },
        onServerDisconnect: (error) => {
          const message =
            error?.message?.trim() ||
            "The CRM softphone disconnected from the SIP server before the call could be completed.";
          const meta = activeCallMetaRef.current;

          if (suppressVoiceDisconnectRef.current > 0 || wrapUpLeadIdRef.current) {
            return;
          }

          if (meta) {
            void failCallSession(message, meta.startedAt, "server_disconnect", true);
            return;
          }

          setCallError(message);
        },
      };

      await client.connect();
      await client.register();

      voiceClientRef.current = client;
      voiceConfigSignatureRef.current = signature;
    }

    return { client: voiceClientRef.current, session: response };
  }

  const login = async (email: string, password: string) => {
    try {
      const payload = await apiRequest<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (!payload.token) {
        return {
          success: false,
          message: payload.message ?? "Supabase session could not be established.",
        };
      }

      setAuthToken(payload.token);
      setCurrentUser(payload.user);
      setWorkspaceError(null);
      await loadWorkspace(payload.token, { silent: true });
      setSessionReady(true);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Cannot reach the sign-in service. Check that the backend is running.",
      };
    }
  };

  const continueWithGoogle = async () => {
    if (!supabase) {
      return {
        success: false,
        message: "Google sign-in requires a configured Supabase browser client.",
      };
    }

    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      return {
        success: false,
        message: error.message,
      };
    }

    return { success: true };
  };

  const logout = () => {
    void supabase?.auth.signOut();
    cleanupSession();
    setSessionReady(true);
  };

  const signup = async (input: {
    name: string;
    email: string;
    password: string;
    team: string;
    timezone: string;
    title: string;
  }) => {
    try {
      const payload = await apiRequest<AuthResponse>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(input),
      });

      if (!payload.token) {
        return {
          success: false,
          message: payload.message ?? "Account created, but sign-in is still required.",
        };
      }

      setAuthToken(payload.token);
      setCurrentUser(payload.user);
      setWorkspaceError(null);
      await loadWorkspace(payload.token, { silent: true });
      setSessionReady(true);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unable to create your account.",
      };
    }
  };

  const refreshWorkspace = async () => {
    await loadWorkspace(undefined, { silent: false });
  };

  const selectLead = (leadId: string) => {
    if (!wrapUpLeadId) {
      lastAutoDialLeadIdRef.current = null;
      setCurrentLeadId(leadId);
      setCurrentPhoneIndex(0);
      void persistQueueCursor(leadId, 0).catch(() => undefined);
    }
  };

  const previousLead = () => {
    if (wrapUpLeadId || !queue.length) {
      return;
    }

    const currentIndex = queue.findIndex((lead) => lead.id === currentLeadId);
    lastAutoDialLeadIdRef.current = null;
    const nextLeadId = queue[Math.max(0, currentIndex - 1)]?.id ?? queue[0].id;
    setCurrentLeadId(nextLeadId);
    setCurrentPhoneIndex(0);
    void persistQueueCursor(nextLeadId, 0).catch(() => undefined);
  };

  const nextLead = () => {
    if (wrapUpLeadId || !queue.length) {
      return;
    }

    const currentIndex = queue.findIndex((lead) => lead.id === currentLeadId);
    lastAutoDialLeadIdRef.current = null;
    const nextLeadId = queue[Math.min(queue.length - 1, currentIndex + 1)]?.id ?? queue[0].id;
    setCurrentLeadId(nextLeadId);
    setCurrentPhoneIndex(0);
    void persistQueueCursor(nextLeadId, 0).catch(() => undefined);
  };

  const skipLead = () => {
    if (wrapUpLeadId) {
      return;
    }

    const currentIndex = queue.findIndex((lead) => lead.id === currentLeadId);
    const next = queue[currentIndex + 1] ?? queue[currentIndex - 1] ?? null;
    lastAutoDialLeadIdRef.current = null;
    const nextLeadId = next?.id ?? null;
    setCurrentLeadId(nextLeadId);
    setCurrentPhoneIndex(0);
    void persistQueueCursor(nextLeadId, 0).catch(() => undefined);
  };

  const markLeadInvalid = async () => {
    if (!authToken || !currentLeadId || !currentUser || wrapUpLeadId) {
      return;
    }

    await apiRequest(`/leads/${currentLeadId}/invalid`, {
      method: "PATCH",
      token: authToken,
    });
    await advanceQueueCursor("invalid", currentLeadId, currentPhoneIndex);
    await refreshWorkspace();
    lastAutoDialLeadIdRef.current = null;
  };

  const startCall = async (input?: {
    phone?: string;
    leadId?: string | null;
    displayName?: string;
  }) => {
    if (activeCall || wrapUpLeadId) {
      return;
    }

    if (autoDialTimerRef.current) {
      window.clearInterval(autoDialTimerRef.current);
      autoDialTimerRef.current = null;
    }
    setAutoDialCountdown(null);
    setCallError(null);

    const startedAt = Date.now();
    const requestedLeadId =
      input && Object.prototype.hasOwnProperty.call(input, "leadId")
        ? input.leadId ?? null
        : currentLeadId;
    const lead = requestedLeadId
      ? leads.find((item) => item.id === requestedLeadId) ?? null
      : null;

    if (requestedLeadId && !lead) {
      throw new Error("Lead not found");
    }

    const leadPhoneNumbers = lead?.phoneNumbers?.length
      ? lead.phoneNumbers
      : [lead?.phone ?? "", lead?.altPhone ?? ""].filter(Boolean);
    const queueDialedNumber = (input?.phone ?? leadPhoneNumbers[currentPhoneIndex] ?? leadPhoneNumbers[0] ?? "").trim();
    if (!queueDialedNumber) {
      throw new Error("Phone number not found");
    }

    const callLeadId = lead?.id ?? requestedLeadId ?? null;
    const formattedDialNumber = formatDialNumberForSession(queueDialedNumber, {
      callerId: voiceConfig.callerId ?? activeSipProfile?.callerId,
      timezone: currentUser?.timezone,
    });
    const outboundDialNumber = formattedDialNumber || queueDialedNumber;
    const displayName = (input?.displayName ?? lead?.fullName ?? queueDialedNumber).trim();

    if (!callLeadId && currentLeadId) {
      lastAutoDialLeadIdRef.current = currentLeadId;
    }

    activeCallMetaRef.current = {
      leadId: callLeadId,
      dialedNumber: outboundDialNumber,
      phoneIndex: currentPhoneIndex,
      startedAt,
      connected: false,
      userHangup: false,
      fallbackOpened: false,
      attemptPersisted: false,
    };
    setActiveCall({
      leadId: callLeadId,
      dialedNumber: outboundDialNumber,
      displayName,
      startedAt,
      status: "ringing",
      muted: false,
      recordingEnabled: voiceConfig.available,
    });

    if (callLeadId) {
      try {
        await persistQueueCursor(callLeadId, currentPhoneIndex);
      } catch (error) {
        await failCallSession(
          error instanceof Error && error.message.trim()
            ? error.message
            : "Unable to save the active queue cursor before dialing.",
          startedAt,
          "session_start",
        );
        throw error;
      }
    }

    try {
      const { client, session } = await ensureVoiceClient();
      if (!session.available) {
        const meta = activeCallMetaRef.current;
        if (meta && meta.startedAt === startedAt) {
          void persistFailedCallAttempt(
            meta,
            "session_unavailable",
            session.message ??
              "Browser calling is unavailable, so the call continued in manual mode.",
          );
        }
        setActiveCall((existing) =>
          existing && existing.startedAt === startedAt
            ? {
                ...existing,
                status: "manual",
                recordingEnabled: false,
              }
            : existing,
        );
        setCallError(
          session.message ??
            "Browser calling is unavailable right now. Continue the call manually and log the outcome here.",
        );
        return;
      }

      if (!client || !session.sipDomain) {
        throw new Error(
          session.message ??
            "The CRM softphone could not start a SIP session for this call.",
        );
      }

      await ensureMicrophoneAccess();
      await client.call(normalizeDialTarget(outboundDialNumber, session.sipDomain, session.dialPrefix));
    } catch (error) {
      await destroyVoiceClient();
      if (isMicrophoneAccessError(error)) {
        const openedSystemDialer = openSystemDialer(outboundDialNumber);
        const meta = activeCallMetaRef.current;
        if (meta && meta.startedAt === startedAt) {
          void persistFailedCallAttempt(
            meta,
            "microphone",
            "Browser microphone access was blocked before the SIP call could connect.",
          );
        }
        activeCallMetaRef.current = null;
        setActiveCall((existing) =>
          existing && existing.startedAt === startedAt
            ? {
                ...existing,
                status: "manual",
                recordingEnabled: false,
              }
            : existing,
        );
        setCallError(buildMicrophoneBlockedMessage(openedSystemDialer));
        return;
      }

      await failCallSession(
        error instanceof Error && error.message.trim()
          ? error.message
          : "The CRM softphone could not place the SIP call.",
        startedAt,
        "invite",
        true,
      );
      throw error;
    }
  };

  useEffect(() => {
    const pending = pendingFallbackDialRef.current;
    if (!pending || activeCall || wrapUpLeadId) {
      return;
    }

    if (currentLeadId !== pending.leadId || currentPhoneIndex !== pending.phoneIndex) {
      return;
    }

    pendingFallbackDialRef.current = null;
    void startCall({
      leadId: pending.leadId,
      phone: pending.phoneNumber,
    }).catch(() => undefined);
  }, [activeCall, currentLeadId, currentPhoneIndex, wrapUpLeadId]);

  const toggleMute = () => {
    setActiveCall((existing) => {
      if (!existing) {
        return existing;
      }

      const nextMuted = !existing.muted;
      if (nextMuted) {
        voiceClientRef.current?.mute();
      } else {
        voiceClientRef.current?.unmute();
      }
      return { ...existing, muted: nextMuted };
    });
  };

  const holdCall = () => {
    setActiveCall((existing) => {
      if (!existing) {
        return existing;
      }

      void voiceClientRef.current?.hold().catch(() => undefined);
      return { ...existing, status: "on_hold", muted: true };
    });
  };

  const resumeCall = () => {
    setActiveCall((existing) => {
      if (!existing) {
        return existing;
      }

      void voiceClientRef.current?.unhold().catch(() => undefined);
      return { ...existing, status: "connected", muted: false };
    });
  };

  const endCall = () => {
    if (!activeCall) {
      return;
    }

    if (voiceClientRef.current) {
      const meta = activeCallMetaRef.current;
      if (meta && meta.startedAt === activeCall.startedAt) {
        meta.userHangup = true;
      }
      void voiceClientRef.current.hangup().catch(() => undefined);
      return;
    }

    finishCallSession(activeCall.leadId, activeCall.startedAt);
  };

  const saveDisposition = async (input: SaveDispositionInput) => {
    if (!authToken || !wrapUpLeadId) {
      return;
    }

    const response = await apiRequest<{ success: boolean; queueState?: QueueState }>("/dialer/disposition", {
      method: "POST",
      token: authToken,
      body: JSON.stringify({
        ...input,
        leadId: wrapUpLeadId,
        durationSeconds: wrapUpDurationSeconds || 60,
        recordingEnabled: activeCall?.recordingEnabled ?? voiceConfig.available,
        queueScope,
        queueSort,
        queueFilter,
        currentPhoneIndex,
      }),
    });

    lastAutoDialLeadIdRef.current = wrapUpLeadId;
    setWrapUpLeadId(null);
    setWrapUpDurationSeconds(0);
    wrapUpLeadIdRef.current = null;
    if (response.queueState?.currentItem) {
      setCurrentLeadId(response.queueState.currentItem.leadId);
      setCurrentPhoneIndex(response.queueState.currentItem.phoneIndex);
    }
    await refreshWorkspace();
  };

  const uploadLeads = async (records: LeadImportRecord[], assignToUserId?: string) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    const result = await apiRequest<UploadResult>("/leads/upload", {
      method: "POST",
      token: authToken,
      body: JSON.stringify({ records, assignToUserId }),
    });
    await refreshWorkspace();
    return result;
  };

  const assignLead = async (leadId: string, userId: string) => {
    if (!authToken) {
      return;
    }
    await apiRequest(`/leads/${leadId}/assign`, {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify({ userId }),
    });
    await refreshWorkspace();
  };

  const bulkUpdateLeadStatus = async (leadIds: string[], status: LeadStatus) => {
    if (!authToken || !leadIds.length) {
      return;
    }
    await apiRequest("/leads/bulk-status", {
      method: "POST",
      token: authToken,
      body: JSON.stringify({ leadIds, status }),
    });
    await refreshWorkspace();
  };

  const deleteLeads = async (leadIds: string[]) => {
    if (!authToken || !leadIds.length) {
      return;
    }
    await apiRequest("/leads/bulk-delete", {
      method: "POST",
      token: authToken,
      body: JSON.stringify({ leadIds }),
    });
    await refreshWorkspace();
  };

  const createCallLog = async (input: CallLogFormInput) => {
    if (!authToken) {
      return;
    }

    await apiRequest("/calls", {
      method: "POST",
      token: authToken,
      body: JSON.stringify(input),
    });
    await refreshWorkspace();
  };

  const updateCallLog = async (callId: string, input: CallLogFormInput) => {
    if (!authToken) {
      return;
    }

    await apiRequest(`/calls/${callId}`, {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify(input),
    });
    await refreshWorkspace();
  };

  const deleteCallLog = async (callId: string) => {
    if (!authToken) {
      return;
    }

    await apiRequest(`/calls/${callId}`, {
      method: "DELETE",
      token: authToken,
    });
    await refreshWorkspace();
  };

  const rescheduleCallback = async (
    leadId: string,
    callbackAt: string,
    priority: LeadPriority,
  ) => {
    if (!authToken) {
      return;
    }
    await apiRequest(`/callbacks/${leadId}/reschedule`, {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify({ callbackTime: callbackAt, priority }),
    });
    await refreshWorkspace();
  };

  const markCallbackCompleted = async (leadId: string) => {
    if (!authToken) {
      return;
    }
    await apiRequest(`/callbacks/${leadId}/complete`, {
      method: "PATCH",
      token: authToken,
    });
    await refreshWorkspace();
  };

  const reopenLeadRecord = async (leadId: string) => {
    if (!authToken) {
      return;
    }
    await apiRequest(`/callbacks/${leadId}/reopen`, {
      method: "PATCH",
      token: authToken,
    });
    await refreshWorkspace();
  };

  const inviteUser = async (input: {
    name: string;
    email: string;
    role: User["role"];
    team: string;
    timezone: string;
    title: string;
  }) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    const result = await apiRequest<InviteUserResult>("/users", {
      method: "POST",
      token: authToken,
      body: JSON.stringify(input),
    });
    await refreshWorkspace();
    return result;
  };

  const setUserStatus = async (userId: string, status: User["status"]) => {
    if (!authToken) {
      return;
    }
    await apiRequest(`/users/${userId}/status`, {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify({ status }),
    });
    await refreshWorkspace();
  };

  const deleteUser = async (userId: string) => {
    if (!authToken) {
      return;
    }

    await apiRequest(`/users/${userId}`, {
      method: "DELETE",
      token: authToken,
    });
    await refreshWorkspace();
  };

  const activateSipProfile = async (profileId: string) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    if (activeCall) {
      throw new Error("End the current call before switching the SIP profile.");
    }

    await destroyVoiceClient();
    await apiRequest("/sip-profiles/active", {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify({ profileId }),
    });
    await refreshWorkspace();
  };

  const createSipProfile = async (
    input: CreateSipProfileInput,
    options: { activate?: boolean } = {},
  ) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    const response = await apiRequest<{ profile: SipProfile }>("/sip-profiles", {
      method: "POST",
      token: authToken,
      body: JSON.stringify(input),
    });

    if (options.activate) {
      await activateSipProfile(response.profile.id);
      return response.profile;
    }

    await refreshWorkspace();
    return response.profile;
  };

  const updateSipProfile = async (profileId: string, input: UpdateSipProfileInput) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    const response = await apiRequest<{ profile: SipProfile }>(`/sip-profiles/${profileId}`, {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify(input),
    });

    await refreshWorkspace();
    return response.profile;
  };

  const deleteSipProfile = async (profileId: string) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    await apiRequest(`/sip-profiles/${profileId}`, {
      method: "DELETE",
      token: authToken,
    });
    await refreshWorkspace();
  };

  const assignSipProfileToUser = async (userId: string, profileId: string | null) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    await apiRequest("/sip-profiles/assign", {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify({ userId, profileId }),
    });
    await refreshWorkspace();
  };

  return (
    <AppStateContext.Provider
      value={{
        currentUser,
        users,
        leads,
        analytics,
        settingsStatus,
        voiceConfig,
        sipProfiles,
        activeSipProfile,
        sipProfileSelectionRequired,
        callError,
        theme,
        sessionReady,
        workspaceLoading,
        workspaceError,
        lastWorkspaceSyncAt,
        queueSort,
        queueFilter,
        currentLeadId,
        activeCall,
        wrapUpLeadId,
        autoDialEnabled,
        autoDialDelaySeconds,
        autoDialCountdown,
        login,
        continueWithGoogle,
        signup,
        logout,
        refreshWorkspace,
        setTheme,
        setQueueSort,
        setQueueFilter,
        setAutoDialEnabled,
        setAutoDialDelaySeconds,
        selectLead,
        previousLead,
        nextLead,
        skipLead,
        markLeadInvalid,
        startCall,
        toggleMute,
        holdCall,
        resumeCall,
        endCall,
        saveDisposition,
        uploadLeads,
        assignLead,
        bulkUpdateLeadStatus,
        deleteLeads,
        createCallLog,
        updateCallLog,
        deleteCallLog,
        rescheduleCallback,
        markCallbackCompleted,
        reopenLead: reopenLeadRecord,
        inviteUser,
        setUserStatus,
        deleteUser,
        createSipProfile,
        activateSipProfile,
        updateSipProfile,
        deleteSipProfile,
        assignSipProfileToUser,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }

  return context;
}
