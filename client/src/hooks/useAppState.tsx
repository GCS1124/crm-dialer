import {
  createContext,
  useMemo,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getQueueLeads } from "../lib/analytics";
import { apiRequest } from "../lib/api";
import { buildBrowserSoftphoneConfig } from "../lib/browserSoftphone";
import {
  createIncomingCallState,
  createOutgoingCallState,
  promoteCallToConnected,
} from "../lib/callSession";
import {
  buildIncomingAlerts,
  countUnreadIncomingAlerts,
  loadSeenIncomingAlertIds,
  saveSeenIncomingAlertIds,
  type IncomingAlertItem,
} from "../lib/incomingAlerts.ts";
import { findLeadForDialNumber } from "../lib/dialerNumbers";
import { createRingbackToneController } from "../lib/ringbackTone";
import type { RingbackAudioContextLike } from "../lib/ringbackTone";
import {
  formatDialNumberForSession,
} from "../lib/softphoneDialing";
import {
  checkIn as createCheckedInTimeTrackingState,
  checkOut as createCheckedOutTimeTrackingState,
  createInitialTimeTrackingState,
  endBreak as createEndedBreakTimeTrackingState,
  getDisplayedSeconds,
  startBreak as createStartedBreakTimeTrackingState,
} from "../lib/timeTracking.ts";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import {
  beginRingCentralConnection as beginRingCentralConnectionAction,
  disconnectRingCentral as disconnectRingCentralAction,
  loadRingCentralStatus as loadRingCentralStatusAction,
  saveRingCentralCallerIdNumber as saveRingCentralCallerIdNumberAction,
  type RingCentralIntegrationStatus,
} from "../services/ringcentral";
import {
  clearRingCentralBrowserVoiceSessionCache,
} from "../services/workspace";
import {
  createRingCentralSoftphone,
  type RingCentralSoftphoneClient,
  type RingCentralSoftphoneSession,
} from "../services/ringcentralSoftphone";
import {
  isRingCentralRateLimitError,
  shouldAdvanceQueueAfterCallFailure,
} from "../lib/ringcentral";
import type {
  ActiveCall,
  CallAttemptFailureStage,
  CallLogFormInput,
  CallType,
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
  BreakType,
  ThemeMode,
  UpdateSipProfileInput,
  UploadResult,
  User,
  VoiceProviderConfig,
  WorkspaceAnalytics,
  WorkspaceSettingsStatus,
  WorkspacePayload,
  TimeTrackingState,
  CallTransportMode,
} from "../types";

interface VoiceSessionResponse {
  provider: "ringcentral";
  available: boolean;
  source: "profile" | "environment" | "ringcentral" | "unconfigured";
  callerId: string | null;
  websocketUrl: string | null;
  sipDomain: string | null;
  username: string | null;
  profileId: string | null;
  profileLabel: string | null;
  authorizationId?: string | null;
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
    callerId: session.callerId,
    authorizationId: session.authorizationId ?? null,
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

function isBrowserGestureRequiredError(error: unknown) {
  const candidate = error as { name?: unknown; message?: unknown } | null;
  const name = typeof candidate?.name === "string" ? candidate.name : "";
  const message = typeof candidate?.message === "string" ? candidate.message : "";

  return name === "NotAllowedError" && /user gesture|required|activation/i.test(message);
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
  const fallbackRef = useRef(fallback);
  const keyRef = useRef(key);

  fallbackRef.current = fallback;

  useEffect(() => {
    if (keyRef.current === key) {
      return;
    }

    keyRef.current = key;
    const stored = localStorage.getItem(key);
    if (!stored) {
      setValue(fallbackRef.current);
      return;
    }

    try {
      setValue(JSON.parse(stored) as T);
    } catch {
      setValue(fallbackRef.current);
    }
  }, [key]);

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

function createBrowserRingbackToneController() {
  return createRingbackToneController({
    createAudioContext: () => {
      if (typeof window === "undefined") {
        return null;
      }

      const AudioContextCtor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
        null;

      return AudioContextCtor ? (new AudioContextCtor() as unknown as RingbackAudioContextLike) : null;
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
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
  provider: "ringcentral",
  available: false,
  source: "unconfigured",
  callerId: null,
  websocketUrl: null,
  sipDomain: null,
  username: null,
  profileId: null,
  profileLabel: null,
};

const emptyRingCentralStatus: RingCentralIntegrationStatus = {
  connected: false,
  accountId: null,
  extensionId: null,
  accountMainNumber: null,
  selectedCallerIdNumber: null,
  availableCallerIdNumbers: [],
  connectedAt: null,
  updatedAt: null,
  expiresAt: null,
  message: null,
  activeTelephonySessionId: null,
  activeTelephonyPartyId: null,
  activeTelephonyDirection: null,
  activeTelephonyStatusCode: null,
  activeTelephonyUpdatedAt: null,
};

const RINGCENTRAL_STATUS_CACHE_TTL_MS = 5 * 60 * 1000;

const emptySettingsStatus: WorkspaceSettingsStatus = {
  authMode: "supabase",
  signupEnabled: false,
  importFormats: ["csv", "xlsx", "xls"],
  voice: {
    provider: "ringcentral",
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
  ringCentralStatus: RingCentralIntegrationStatus;
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
  callLaunchPending: boolean;
  autoDialEnabled: boolean;
  autoDialDelaySeconds: number;
  autoDialCountdown: number | null;
  timeTracking: TimeTrackingState;
  incomingAlerts: IncomingAlertItem[];
  unseenIncomingAlertCount: number;
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
  changePassword: (
    password: string,
  ) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  refreshWorkspace: () => Promise<void>;
  setTheme: (theme: ThemeMode) => void;
  setQueueSort: (sort: QueueSort) => void;
  setQueueFilter: (filter: QueueFilter) => void;
  setAutoDialEnabled: (enabled: boolean) => void;
  setAutoDialDelaySeconds: (delay: number) => void;
  checkIn: () => void;
  checkOut: () => void;
  startBreak: (breakType: BreakType) => void;
  endBreak: () => void;
  markIncomingAlertsSeen: () => void;
  selectLead: (leadId: string) => void;
  previousLead: () => void;
  nextLead: () => void;
  skipLead: () => void;
  markLeadInvalid: () => Promise<void>;
  startCall: (input?: {
    phone?: string;
    leadId?: string | null;
    displayName?: string;
    phoneIndex?: number;
    allowDuringWrapUp?: boolean;
  }) => Promise<void>;
  toggleMute: () => void;
  holdCall: () => void;
  resumeCall: () => void;
  answerCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  refreshRingCentralStatus: (
    options?: { force?: boolean },
  ) => Promise<RingCentralIntegrationStatus | null>;
  connectRingCentral: () => Promise<void>;
  disconnectRingCentral: () => Promise<void>;
  setRingCentralCallerIdNumber: (callerIdNumber: string | null) => Promise<void>;
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
  const [authRefreshToken, setAuthRefreshToken] = usePersistentState<string | null>(
    "preview-dialer-refresh-token",
    null,
  );
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const currentUserRef = useRef<User | null>(null);
  const leadsRef = useRef<Lead[]>([]);
  const [analytics, setAnalytics] = useState<WorkspaceAnalytics>(emptyAnalytics);
  const [settingsStatus, setSettingsStatus] = useState<WorkspaceSettingsStatus>(emptySettingsStatus);
  const [voiceConfig, setVoiceConfig] = useState<VoiceProviderConfig>(emptyVoiceConfig);
  const [ringCentralStatus, setRingCentralStatus] =
    useState<RingCentralIntegrationStatus>(emptyRingCentralStatus);
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
  const [callLaunchPending, setCallLaunchPending] = useState(false);
  const timeTrackingStorageKey = currentUser
    ? `preview-dialer-time-tracking:${currentUser.id}`
    : "preview-dialer-time-tracking:guest";
  const [timeTracking, setTimeTracking] = usePersistentState<TimeTrackingState>(
    timeTrackingStorageKey,
    createInitialTimeTrackingState(),
  );
  const [seenIncomingAlertIds, setSeenIncomingAlertIds] = useState<string[]>([]);
  const browserSoftphoneConfig = useMemo(
    () => buildBrowserSoftphoneConfig(voiceConfig, voiceConfig),
    [voiceConfig],
  );
  const voiceClientRef = useRef<RingCentralSoftphoneClient | null>(null);
  const voiceConfigSignatureRef = useRef<string | null>(null);
  const browserSoftphoneStartListenerRef = useRef<(() => void) | null>(null);
  const browserSoftphoneStartInProgressRef = useRef(false);
  const wrapUpLeadIdRef = useRef<string | null>(null);
  const suppressVoiceDisconnectRef = useRef(0);
  const callLaunchPendingRef = useRef(false);
  const activeCallMetaRef = useRef<{
    leadId: string | null;
    dialedNumber: string;
    phoneIndex: number;
    startedAt: number;
    browserCallId: string | null;
    callMode: "incoming" | "outgoing";
    connected: boolean;
    browserConnected: boolean;
    userHangup: boolean;
    attemptPersisted: boolean;
    transportMode: CallTransportMode;
    sipStatusCode?: number | null;
    sipReasonPhrase?: string | null;
  } | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const autoDialTimerRef = useRef<number | null>(null);
  const lastAutoDialLeadIdRef = useRef<string | null>(null);
  const notifiedCallbacksRef = useRef<Set<string>>(new Set());
  const notifiedRingCentralActivityIdsRef = useRef<Set<string>>(new Set());
  const ringCentralActivitySeededRef = useRef(false);
  const queueStateSignatureRef = useRef<string | null>(null);
  const ringbackToneRef = useRef<ReturnType<typeof createRingbackToneController> | null>(null);
  const ringCentralStatusCacheRef = useRef<{
    status: RingCentralIntegrationStatus;
    fetchedAt: number;
  } | null>(null);
  const ringCentralStatusRequestRef = useRef<Promise<RingCentralIntegrationStatus | null> | null>(
    null,
  );
  const ringCentralStatusRequestGenerationRef = useRef(0);

  if (!ringbackToneRef.current) {
    ringbackToneRef.current = createBrowserRingbackToneController();
  }

  currentUserRef.current = currentUser;
  leadsRef.current = leads;

  function startRingbackTone() {
    ringbackToneRef.current?.start();
  }

  function stopRingbackTone() {
    ringbackToneRef.current?.stop();
  }

  const queue = currentUser
    ? getQueueLeads(leads, currentUser.role, currentUser.id, queueSort, queueFilter)
    : [];
  const queueScope = "default";
  const incomingAlerts = useMemo(() => buildIncomingAlerts(leads), [leads]);
  const seenIncomingAlertIdSet = useMemo(
    () => new Set(seenIncomingAlertIds),
    [seenIncomingAlertIds],
  );
  const unseenIncomingAlertCount = useMemo(
    () => countUnreadIncomingAlerts(incomingAlerts, seenIncomingAlertIdSet),
    [incomingAlerts, seenIncomingAlertIdSet],
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (!currentUser) {
      setSeenIncomingAlertIds([]);
      return;
    }

    setSeenIncomingAlertIds([...loadSeenIncomingAlertIds(currentUser.id)]);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    saveSeenIncomingAlertIds(currentUser.id, new Set(seenIncomingAlertIds));
  }, [currentUser?.id, seenIncomingAlertIds]);

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
      let nextRefreshToken = authRefreshToken;

      if (
        !nextToken &&
        supabase &&
        typeof window !== "undefined" &&
        window.location.pathname === "/login" &&
        (window.location.search.includes("code=") ||
          window.location.hash.includes("access_token=") ||
          window.location.hash.includes("refresh_token="))
      ) {
        const sessionResult = await supabase.auth.getSession();
        nextToken = sessionResult.data.session?.access_token ?? null;
        nextRefreshToken = sessionResult.data.session?.refresh_token ?? null;
      }

      if (!nextToken || !nextRefreshToken) {
        if (active) {
          if (nextToken || nextRefreshToken) {
            cleanupSession();
          } else {
            setCurrentUser(null);
            setUsers([]);
            setLeads([]);
            setAnalytics(emptyAnalytics);
            setSettingsStatus(emptySettingsStatus);
            setVoiceConfig(emptyVoiceConfig);
            setRingCentralStatus(emptyRingCentralStatus);
            setSipProfiles([]);
            setActiveSipProfile(null);
            setSipProfileSelectionRequired(false);
            setCallError(null);
            setWorkspaceError(null);
            setLastWorkspaceSyncAt(null);
          }
          setSessionReady(true);
        }
        return;
      }

      try {
        const { error: sessionError } = await supabase!.auth.setSession({
          access_token: nextToken,
          refresh_token: nextRefreshToken,
        });
        if (sessionError) {
          throw sessionError;
        }

        const payload = await apiRequest<{ user: User }>("/auth/me", {
          token: nextToken,
        });

        if (!active) {
          return;
        }

        if (!authToken && nextToken) {
          setAuthToken(nextToken);
        }
        if (!authRefreshToken && nextRefreshToken) {
          setAuthRefreshToken(nextRefreshToken);
        }
        setCurrentUser(payload.user);
        if (!payload.user.mustResetPassword) {
          await loadWorkspace(nextToken, { silent: true });
        }
      } catch {
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
  }, [authRefreshToken, authToken]);

  useEffect(() => {
    return () => {
      stopRingbackTone();
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
    if (!authToken || currentUser?.mustResetPassword) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadWorkspace(authToken, { silent: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [authToken, currentUser?.mustResetPassword]);

  useEffect(() => {
    if (
      !authToken ||
      currentUser?.mustResetPassword ||
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
  }, [authToken, currentUser?.id, currentUser?.mustResetPassword, settingsStatus.authMode, settingsStatus.supabase.connected]);

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

  useEffect(() => {
    const activities = leads.flatMap((lead) => lead.activities ?? []);
    if (!activities.length) {
      return;
    }

    if (!ringCentralActivitySeededRef.current) {
      activities.forEach((activity) => {
        notifiedRingCentralActivityIdsRef.current.add(activity.id);
      });
      ringCentralActivitySeededRef.current = true;
      return;
    }

    const newRingCentralActivities = activities.filter(
      (activity) =>
        !notifiedRingCentralActivityIdsRef.current.has(activity.id) &&
        activity.title.toLowerCase().startsWith("incoming ringcentral call"),
    );

    newRingCentralActivities.forEach((activity) => {
      notifiedRingCentralActivityIdsRef.current.add(activity.id);
      toast.info(activity.title, {
        description: activity.description || "Incoming RingCentral call detected.",
      });
    });

    activities.forEach((activity) => {
      notifiedRingCentralActivityIdsRef.current.add(activity.id);
    });
  }, [leads]);

  useEffect(() => {
    notifiedRingCentralActivityIdsRef.current.clear();
    ringCentralActivitySeededRef.current = false;
  }, [currentUser?.id]);

  async function loadWorkspace(
    tokenOverride?: string | null,
    options: { silent?: boolean; ignorePasswordReset?: boolean } = {},
  ) {
    const token = tokenOverride ?? authToken;
    if (!token) {
      return false;
    }

    if (!options.ignorePasswordReset && currentUser?.mustResetPassword) {
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
      await refreshRingCentralStatus();
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

  async function refreshRingCentralStatus(options: { force?: boolean } = {}) {
    const cached = ringCentralStatusCacheRef.current;
    const now = Date.now();
    if (!options.force && cached && now - cached.fetchedAt < RINGCENTRAL_STATUS_CACHE_TTL_MS) {
      setRingCentralStatus(cached.status);
      return cached.status;
    }

    if (!options.force && ringCentralStatusRequestRef.current) {
      return ringCentralStatusRequestRef.current;
    }

    const requestGeneration = ringCentralStatusRequestGenerationRef.current + 1;
    ringCentralStatusRequestGenerationRef.current = requestGeneration;
    const request = loadRingCentralStatusAction()
      .then((status) => {
        if (ringCentralStatusRequestGenerationRef.current === requestGeneration) {
          ringCentralStatusCacheRef.current = { status, fetchedAt: Date.now() };
          setRingCentralStatus(status);
        }
        return status;
      })
      .catch((error) => {
        if (ringCentralStatusRequestGenerationRef.current === requestGeneration) {
          const message =
            error instanceof Error ? error.message : "Unable to load RingCentral settings.";
          setRingCentralStatus((existing) => ({
            ...existing,
            connected: false,
            message,
          }));
        }
        return null;
      })
      .finally(() => {
        if (ringCentralStatusRequestRef.current === request) {
          ringCentralStatusRequestRef.current = null;
        }
      });

    if (!options.force) {
      ringCentralStatusRequestRef.current = request;
    }

    return request;
  }

  function cacheRingCentralStatus(status: RingCentralIntegrationStatus) {
    const previousSelectedCallerIdNumber = ringCentralStatusCacheRef.current?.status.selectedCallerIdNumber ?? null;
    ringCentralStatusRequestGenerationRef.current += 1;
    ringCentralStatusCacheRef.current = { status, fetchedAt: Date.now() };
    ringCentralStatusRequestRef.current = null;
    if (previousSelectedCallerIdNumber !== status.selectedCallerIdNumber) {
      clearRingCentralBrowserVoiceSessionCache(currentUserRef.current?.id ?? null);
    }
    setRingCentralStatus(status);
  }

  function invalidateRingCentralStatusCache() {
    ringCentralStatusRequestGenerationRef.current += 1;
    ringCentralStatusCacheRef.current = null;
    ringCentralStatusRequestRef.current = null;
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
    stopRingbackTone();
    invalidateRingCentralStatusCache();
    clearRingCentralBrowserVoiceSessionCache(currentUserRef.current?.id ?? null);
    setAuthToken(null);
    setAuthRefreshToken(null);
    setCurrentUser(null);
    setUsers([]);
    setLeads([]);
    setAnalytics(emptyAnalytics);
    setSettingsStatus(emptySettingsStatus);
    setVoiceConfig(emptyVoiceConfig);
    setRingCentralStatus(emptyRingCentralStatus);
    setSipProfiles([]);
    setActiveSipProfile(null);
    setSipProfileSelectionRequired(false);
    setCallError(null);
    setWorkspaceError(null);
    setLastWorkspaceSyncAt(null);
    setAutoDialCountdown(null);
    setTimeTracking(createInitialTimeTrackingState());
    setSeenIncomingAlertIds([]);
    setCurrentLeadId(null);
    setCurrentPhoneIndex(0);
    setQueueCursorHydrated(false);
    setActiveCall(null);
    setWrapUpLeadId(null);
    setWrapUpDurationSeconds(0);
    setCallLaunchPending(false);
    wrapUpLeadIdRef.current = null;
    lastAutoDialLeadIdRef.current = null;
    queueStateSignatureRef.current = null;
    callLaunchPendingRef.current = false;
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
    if (
      !authToken ||
      !meta.leadId ||
      meta.connected ||
      meta.attemptPersisted ||
      meta.callMode === "incoming"
    ) {
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
    stopRingbackTone();
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
    stopRingbackTone();
    const meta = activeCallMetaRef.current;
    let shouldSurfaceCallError = true;
    if (meta?.callMode === "incoming" && !meta.connected) {
      shouldSurfaceCallError = false;
    }
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
    if (shouldSurfaceCallError && !isRingCentralRateLimitError(message)) {
      setCallError(message);
    } else {
      setCallError(null);
    }

    if (advanceQueue && meta?.leadId && !meta.connected && !meta.userHangup) {
      await advanceQueueCursor("failed", meta.leadId, meta.phoneIndex).catch(() => null);
    }
  }

  async function destroyVoiceClient() {
    const client = voiceClientRef.current;
    voiceClientRef.current = null;
    voiceConfigSignatureRef.current = null;
    remoteAudioRef.current = null;
    clearBrowserSoftphoneActivationListener();
    browserSoftphoneStartInProgressRef.current = false;

    if (!client) {
      return;
    }

    suppressVoiceDisconnectRef.current += 1;
    try {
      await client.dispose();
    } catch {
      // Ignore softphone cleanup failures during teardown.
    } finally {
      suppressVoiceDisconnectRef.current = Math.max(
        0,
        suppressVoiceDisconnectRef.current - 1,
      );
    }
  }

  function clearBrowserSoftphoneActivationListener() {
    const listener = browserSoftphoneStartListenerRef.current;
    if (!listener || typeof window === "undefined") {
      return;
    }

    window.removeEventListener("pointerdown", listener, true);
    window.removeEventListener("keydown", listener, true);
    window.removeEventListener("touchstart", listener, true);
    browserSoftphoneStartListenerRef.current = null;
  }

  function queueBrowserSoftphoneActivation(client: RingCentralSoftphoneClient) {
    if (typeof window === "undefined" || browserSoftphoneStartListenerRef.current) {
      return;
    }

    const listener = () => {
      clearBrowserSoftphoneActivationListener();
      void startBrowserSoftphone(client).catch(() => undefined);
    };

    browserSoftphoneStartListenerRef.current = listener;
    window.addEventListener("pointerdown", listener, true);
    window.addEventListener("keydown", listener, true);
    window.addEventListener("touchstart", listener, true);
  }

  async function startBrowserSoftphone(client: RingCentralSoftphoneClient) {
    if (browserSoftphoneStartInProgressRef.current || voiceClientRef.current !== client) {
      return;
    }

    browserSoftphoneStartInProgressRef.current = true;
    try {
      await client.start();
      if (voiceClientRef.current !== client) {
        return;
      }

      voiceConfigSignatureRef.current = JSON.stringify({
        provider: browserSoftphoneConfig.source,
        websocketUrl: browserSoftphoneConfig.websocketUrl,
        sipDomain: browserSoftphoneConfig.sipDomain,
        callerId: browserSoftphoneConfig.callerId,
        authorizationId: browserSoftphoneConfig.authorizationId,
        authorizationUsername: browserSoftphoneConfig.authorizationUsername,
        displayName: browserSoftphoneConfig.displayName,
        profileId: browserSoftphoneConfig.profileId,
      });
      clearBrowserSoftphoneActivationListener();
    } catch (error) {
      if (isBrowserGestureRequiredError(error)) {
        queueBrowserSoftphoneActivation(client);
        return;
      }

      const message =
        error instanceof Error ? error.message : "Unable to start the RingCentral browser softphone.";
      setCallError((existing) => existing ?? message);
    } finally {
      browserSoftphoneStartInProgressRef.current = false;
    }
  }

  function bindBrowserSoftphoneSession(
    session: RingCentralSoftphoneSession,
    input: {
      leadId: string | null;
      dialedNumber: string;
      displayName: string;
      startedAt: number;
      phoneIndex: number;
      callMode: "incoming" | "outgoing";
      transportMode: CallTransportMode;
    },
  ) {
    const browserCallId = session.callId ?? null;
    activeCallMetaRef.current = {
      leadId: input.leadId,
      dialedNumber: input.dialedNumber,
      phoneIndex: input.phoneIndex,
      startedAt: input.startedAt,
      browserCallId,
      callMode: input.callMode,
      connected: false,
      browserConnected: false,
      userHangup: false,
      attemptPersisted: false,
      transportMode: input.transportMode,
    };

    if (input.leadId) {
      setCurrentLeadId(input.leadId);
      setCurrentPhoneIndex(input.phoneIndex);
    }

    const baseCall =
      input.callMode === "incoming"
        ? createIncomingCallState({
            leadId: input.leadId,
            displayName: input.displayName,
            dialedNumber: input.dialedNumber,
            startedAt: input.startedAt,
            callId: browserCallId,
          })
        : createOutgoingCallState({
            leadId: input.leadId,
            displayName: input.displayName,
            dialedNumber: input.dialedNumber,
            startedAt: input.startedAt,
            callId: browserCallId,
            transportMode: input.transportMode,
          });

    setActiveCall({
      ...baseCall,
      callId: browserCallId,
      transportMode: input.transportMode,
    });

    session.on?.("ringing", () => {
      setActiveCall((existing) => {
        if (!existing || existing.startedAt !== input.startedAt) {
          return existing;
        }

        return {
          ...existing,
          callId: browserCallId ?? existing.callId,
          transportMode: input.transportMode,
          status: "ringing",
          lifecycleState: "ringing",
        };
      });
    });

    session.on?.("answered", () => {
      stopRingbackTone();
      activeCallMetaRef.current = {
        ...(activeCallMetaRef.current ?? {
          leadId: input.leadId,
          dialedNumber: input.dialedNumber,
          phoneIndex: input.phoneIndex,
          startedAt: input.startedAt,
          browserCallId,
          callMode: input.callMode,
          connected: false,
          browserConnected: false,
          userHangup: false,
          attemptPersisted: false,
          transportMode: input.transportMode,
        }),
        browserCallId,
        connected: true,
        browserConnected: true,
      };

      setActiveCall((existing) => {
        if (!existing || existing.startedAt !== input.startedAt) {
          return existing;
        }

        return promoteCallToConnected({
          ...existing,
          callId: browserCallId ?? existing.callId,
          transportMode: input.transportMode,
          lifecycleState: "connected",
        });
      });
    });

    session.on?.("disposed", () => {
      const meta = activeCallMetaRef.current;
      if (!meta || meta.startedAt !== input.startedAt) {
        return;
      }

      if (meta.connected) {
        finishCallSession(meta.leadId, input.startedAt);
        return;
      }

      if (meta.callMode === "incoming" || meta.userHangup) {
        setActiveCall((existing) =>
          existing && existing.startedAt === input.startedAt ? null : existing,
        );
        activeCallMetaRef.current = null;
        return;
      }

      void failCallSession(
        "RingCentral ended the call before it connected.",
        input.startedAt,
        "hangup_before_connect",
        shouldAdvanceQueueAfterCallFailure("RingCentral ended the call before it connected."),
      );
    });

    session.on?.("failed", (error) => {
      const meta = activeCallMetaRef.current;
      if (!meta || meta.startedAt !== input.startedAt) {
        return;
      }

      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Unable to place the RingCentral browser call.";

      if (meta.connected) {
        finishCallSession(meta.leadId, input.startedAt);
        return;
      }

      if (meta.callMode === "incoming") {
        setActiveCall((existing) =>
          existing && existing.startedAt === input.startedAt ? null : existing,
        );
        activeCallMetaRef.current = null;
        return;
      }

      void failCallSession(
        message,
        input.startedAt,
        "invite",
        shouldAdvanceQueueAfterCallFailure(message),
      );
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function setupBrowserSoftphone() {
      await destroyVoiceClient();

      if (!browserSoftphoneConfig.available || !ringCentralStatus.connected) {
        return;
      }

      try {
        const client = await createRingCentralSoftphone(browserSoftphoneConfig, {
          onInboundCall: (session) => {
            const remoteNumber = session.remoteNumber ?? session.callId ?? "";
            const matchedLead = findLeadForDialNumber(
              leadsRef.current,
              remoteNumber,
            );
            bindBrowserSoftphoneSession(session, {
              leadId: matchedLead?.lead.id ?? null,
              dialedNumber: remoteNumber,
              displayName: matchedLead?.lead.fullName ?? remoteNumber,
              startedAt: Date.now(),
              phoneIndex: matchedLead?.phoneIndex ?? 0,
              callMode: "incoming",
              transportMode: "browser_softphone",
            });
          },
        });

        if (!client) {
          return;
        }

        if (cancelled) {
          await client.dispose();
          return;
        }

        voiceClientRef.current = client;
        queueBrowserSoftphoneActivation(client);
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Unable to start the RingCentral browser softphone.";
          setCallError((existing) => existing ?? message);
        }
      }
    }

    void setupBrowserSoftphone();

    return () => {
      cancelled = true;
      void destroyVoiceClient();
    };
  }, [
    browserSoftphoneConfig.available,
    browserSoftphoneConfig.callerId,
    browserSoftphoneConfig.authorizationId,
    browserSoftphoneConfig.authorizationPassword,
    browserSoftphoneConfig.authorizationUsername,
    browserSoftphoneConfig.displayName,
    browserSoftphoneConfig.profileId,
    browserSoftphoneConfig.sipDomain,
    browserSoftphoneConfig.source,
    browserSoftphoneConfig.websocketUrl,
    ringCentralStatus.connected,
  ]);

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
      if (!payload.refreshToken) {
        return {
          success: false,
          message: "Supabase session is missing a refresh token.",
        };
      }

      setAuthToken(payload.token);
      setAuthRefreshToken(payload.refreshToken);
      setCurrentUser(payload.user);
      setWorkspaceError(null);
      if (!payload.user.mustResetPassword) {
        await loadWorkspace(payload.token, { silent: true });
      }
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
      if (!payload.refreshToken) {
        return {
          success: false,
          message: "Supabase session is missing a refresh token.",
        };
      }

      setAuthToken(payload.token);
      setAuthRefreshToken(payload.refreshToken);
      setCurrentUser(payload.user);
      setWorkspaceError(null);
      if (!payload.user.mustResetPassword) {
        await loadWorkspace(payload.token, { silent: true });
      }
      setSessionReady(true);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unable to create your account.",
      };
    }
  };

  const changePassword = async (password: string) => {
    try {
      if (!authToken) {
        return {
          success: false,
          message: "Missing session.",
        };
      }

      const payload = await apiRequest<{ user: User; message?: string }>("/auth/change-password", {
        method: "POST",
        token: authToken,
        body: JSON.stringify({ newPassword: password }),
      });

      if (!payload.user) {
        return {
          success: false,
          message: payload.message ?? "Unable to update your password.",
        };
      }

      setCurrentUser(payload.user);
      setWorkspaceError(null);
      await loadWorkspace(authToken, { silent: true, ignorePasswordReset: true });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unable to update your password.",
      };
    }
  };

  const refreshWorkspace = async () => {
    await loadWorkspace(authToken, { silent: false });
  };

  const checkIn = () => {
    if (activeCall || wrapUpLeadId) {
      return;
    }

    setTimeTracking((current) =>
      createCheckedInTimeTrackingState(current, new Date().toISOString()),
    );
  };

  const checkOut = () => {
    if (activeCall || wrapUpLeadId) {
      return;
    }

    setTimeTracking((current) =>
      createCheckedOutTimeTrackingState(current, new Date().toISOString()),
    );
  };

  const startBreak = (breakType: BreakType) => {
    if (activeCall || wrapUpLeadId) {
      return;
    }

    setTimeTracking((current) =>
      createStartedBreakTimeTrackingState(current, breakType, new Date().toISOString()),
    );
  };

  const endBreak = () => {
    setTimeTracking((current) => createEndedBreakTimeTrackingState(current, new Date().toISOString()));
  };

  const markIncomingAlertsSeen = () => {
    setSeenIncomingAlertIds((current) => {
      const next = new Set(current);
      incomingAlerts.forEach((alert) => {
        next.add(alert.id);
      });
      return [...next];
    });
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
    phoneIndex?: number;
    allowDuringWrapUp?: boolean;
  }) => {
    if (
      callLaunchPendingRef.current ||
      activeCall ||
      (wrapUpLeadId && !input?.allowDuringWrapUp)
    ) {
      return;
    }

    callLaunchPendingRef.current = true;
    setCallLaunchPending(true);
    try {
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
      const requestedPhoneIndex =
        input && Object.prototype.hasOwnProperty.call(input, "phoneIndex") &&
        typeof input.phoneIndex === "number"
          ? input.phoneIndex
          : currentPhoneIndex;
      const lead = requestedLeadId
        ? leads.find((item) => item.id === requestedLeadId) ?? null
        : null;

      if (requestedLeadId && !lead) {
        throw new Error("Lead not found");
      }

      const leadPhoneNumbers = lead?.phoneNumbers?.length
        ? lead.phoneNumbers
        : [lead?.phone ?? "", lead?.altPhone ?? ""].filter(Boolean);
      const queueDialedNumber = (
        input?.phone ??
        leadPhoneNumbers[requestedPhoneIndex] ??
        leadPhoneNumbers[currentPhoneIndex] ??
        leadPhoneNumbers[0] ??
        ""
      ).trim();
      if (!queueDialedNumber) {
        throw new Error("Phone number not found");
      }

      const callLeadId = lead?.id ?? requestedLeadId ?? null;
      const formattedDialNumber = formatDialNumberForSession(queueDialedNumber, {
        callerId: null,
        timezone: lead?.timezone ?? currentUser?.timezone,
      });
      if (!formattedDialNumber) {
        await failCallSession("Enter a valid 10-digit US phone number.", startedAt, "session_start");
        throw new Error("Enter a valid 10-digit US phone number.");
      }

      const outboundDialNumber = formattedDialNumber;
      const displayName = (input?.displayName ?? lead?.fullName ?? queueDialedNumber).trim();
      const browserSoftphoneClient = voiceClientRef.current;
      const browserCallingReady = Boolean(
        browserSoftphoneClient && browserSoftphoneConfig.available,
      );

      if (!browserCallingReady) {
        const message =
          "RingCentral browser calling is not ready. Reconnect RingCentral in Settings.";
        await failCallSession(
          message,
          startedAt,
          "session_unavailable",
        );
        throw new Error(message);
      }

      if (!callLeadId && currentLeadId) {
        lastAutoDialLeadIdRef.current = currentLeadId;
      }

      startRingbackTone();

      if (callLeadId) {
        try {
          await persistQueueCursor(callLeadId, requestedPhoneIndex);
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
        const browserSession = await browserSoftphoneClient!.call(
          outboundDialNumber,
          browserSoftphoneConfig.callerId ?? undefined,
        );
        bindBrowserSoftphoneSession(browserSession, {
          leadId: callLeadId,
          dialedNumber: outboundDialNumber,
          phoneIndex: requestedPhoneIndex,
          startedAt,
          callMode: "outgoing",
          displayName,
          transportMode: "browser_softphone",
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "";
        const shouldAdvanceQueue = shouldAdvanceQueueAfterCallFailure(errorMessage);
        await failCallSession(
          errorMessage.trim() ? errorMessage : "Unable to place the RingCentral browser call.",
          startedAt,
          "invite",
          shouldAdvanceQueue,
        );
        throw error;
      }
    } finally {
      callLaunchPendingRef.current = false;
      setCallLaunchPending(false);
    }
  };

  const toggleMute = () => {
    return;
  };

  const holdCall = () => {
    return;
  };

  const resumeCall = () => {
    return;
  };

  const answerCall = () => {
    if (!activeCall || activeCall.direction !== "incoming" || activeCall.status !== "ringing") {
      return;
    }

    const client = voiceClientRef.current;
    if (!client) {
      return;
    }

    void client.answer().catch(() => undefined);
  };

  const rejectCall = () => {
    if (activeCall?.direction === "incoming" && activeCall.status === "ringing") {
      const client = voiceClientRef.current;
      const startedAt = activeCall.startedAt;
      const meta = activeCallMetaRef.current;
      if (meta && meta.startedAt === startedAt) {
        meta.userHangup = true;
      }

      stopRingbackTone();
      setActiveCall((existing) =>
        existing && existing.startedAt === startedAt ? null : existing,
      );
      activeCallMetaRef.current = null;
      setCallError(null);
      void client?.reject().catch(() => undefined);
      return;
    }

    void endCall();
  };

  const endCall = () => {
    if (!activeCall) {
      return;
    }

    const callLeadId = activeCall.leadId;
    const startedAt = activeCall.startedAt;
    const meta = activeCallMetaRef.current;
    if (meta && meta.startedAt === startedAt) {
      meta.userHangup = true;
    }

    const browserClient = voiceClientRef.current;
    if (activeCall.direction === "incoming" && activeCall.status === "ringing") {
      stopRingbackTone();
      setActiveCall((existing) =>
        existing && existing.startedAt === startedAt ? null : existing,
      );
      activeCallMetaRef.current = null;
      setCallError(null);
      void browserClient?.reject().catch(() => undefined);
      return;
    }

    if (browserClient && activeCall.transportMode === "browser_softphone") {
      const connected = activeCall.status === "connected" || Boolean(meta?.connected);
      stopRingbackTone();
      void browserClient.hangup().catch(() => undefined);

      if (connected) {
        finishCallSession(callLeadId, startedAt);
      } else {
        setActiveCall((existing) =>
          existing && existing.startedAt === startedAt ? null : existing,
        );
        activeCallMetaRef.current = null;
        setCallError(null);
      }

      return;
    }
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
        recordingEnabled: activeCall?.recordingEnabled ?? false,
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

  const connectRingCentral = async () => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    const status = await beginRingCentralConnectionAction();
    cacheRingCentralStatus(status);
  };

  const disconnectRingCentral = async () => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    await disconnectRingCentralAction();
    invalidateRingCentralStatusCache();
    clearRingCentralBrowserVoiceSessionCache(currentUserRef.current?.id ?? null);
    setRingCentralStatus(emptyRingCentralStatus);
  };

  const setRingCentralCallerIdNumber = async (callerIdNumber: string | null) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    const status = await saveRingCentralCallerIdNumberAction(callerIdNumber);
    cacheRingCentralStatus(status);
    await refreshWorkspace();
  };

  const activateSipProfile = async (profileId: string) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    if (activeCall) {
      throw new Error("End the current call before changing dial settings.");
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
        ringCentralStatus,
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
        callLaunchPending,
        autoDialEnabled,
        autoDialDelaySeconds,
        autoDialCountdown,
        timeTracking,
        incomingAlerts,
        unseenIncomingAlertCount,
        login,
        continueWithGoogle,
        signup,
        changePassword,
        logout,
        refreshWorkspace,
        setTheme,
        setQueueSort,
        setQueueFilter,
        setAutoDialEnabled,
        setAutoDialDelaySeconds,
        checkIn,
        checkOut,
        startBreak,
        endBreak,
        markIncomingAlertsSeen,
        selectLead,
        previousLead,
        nextLead,
        skipLead,
        markLeadInvalid,
        startCall,
        toggleMute,
        holdCall,
        resumeCall,
        answerCall,
        rejectCall,
        endCall,
        refreshRingCentralStatus,
        connectRingCentral,
        disconnectRingCentral,
        setRingCentralCallerIdNumber,
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
