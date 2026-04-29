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
import { supabase } from "../lib/supabase";
import type {
  ActiveCall,
  CallLogFormInput,
  CreateSipProfileInput,
  Lead,
  LeadImportRecord,
  LeadPriority,
  LeadStatus,
  QueueFilter,
  QueueSort,
  SaveDispositionInput,
  SipProfile,
  ThemeMode,
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

function normalizeDialTarget(phone: string, sipDomain: string, dialPrefix = "") {
  const normalizedPhone = phone.replace(/[^\d+]/g, "");
  const withoutPlus = normalizedPhone.startsWith("+") ? normalizedPhone.slice(1) : normalizedPhone;
  const userPart = `${dialPrefix}${withoutPlus}`.trim();
  return `sip:${userPart}@${sipDomain}`;
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
  signupEnabled: true,
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
  createSipProfile: (
    input: CreateSipProfileInput,
    options?: { activate?: boolean },
  ) => Promise<SipProfile>;
  activateSipProfile: (profileId: string) => Promise<void>;
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
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [wrapUpLeadId, setWrapUpLeadId] = useState<string | null>(null);
  const [wrapUpDurationSeconds, setWrapUpDurationSeconds] = useState(0);
  const voiceClientRef = useRef<SimpleUser | null>(null);
  const voiceConfigSignatureRef = useRef<string | null>(null);
  const activeCallMetaRef = useRef<{ leadId: string | null; startedAt: number } | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const autoDialTimerRef = useRef<number | null>(null);
  const lastAutoDialLeadIdRef = useRef<string | null>(null);
  const notifiedCallbacksRef = useRef<Set<string>>(new Set());

  const queue = currentUser
    ? getQueueLeads(leads, currentUser.role, currentUser.id, queueSort, queueFilter)
    : [];

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (!queue.length) {
      setCurrentLeadId(null);
      return;
    }

    if (!currentLeadId || !queue.some((lead) => lead.id === currentLeadId)) {
      setCurrentLeadId(queue[0].id);
    }
  }, [queue, currentLeadId]);

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
      if (!authToken) {
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
          token: authToken,
        });

        if (!active) {
          return;
        }

        setCurrentUser(payload.user);
        await loadWorkspace(authToken, { silent: true });
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
    setActiveCall(null);
    setWrapUpLeadId(null);
    setWrapUpDurationSeconds(0);
    lastAutoDialLeadIdRef.current = null;
    if (autoDialTimerRef.current) {
      window.clearInterval(autoDialTimerRef.current);
      autoDialTimerRef.current = null;
    }
    activeCallMetaRef.current = null;
    const client = voiceClientRef.current;
    voiceClientRef.current = null;
    voiceConfigSignatureRef.current = null;
    remoteAudioRef.current = null;
    if (client) {
      void client.unregister().catch(() => undefined);
      void client.disconnect().catch(() => undefined);
    }
  }

  function finishCallSession(leadId: string | null, startedAt: number) {
    setActiveCall((existing) =>
      existing && existing.startedAt === startedAt ? null : existing,
    );

    if (leadId) {
      setWrapUpLeadId(leadId);
      setWrapUpDurationSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
    } else {
      setWrapUpLeadId(null);
      setWrapUpDurationSeconds(0);
    }

    activeCallMetaRef.current = null;
  }

  function failCallSession(message: string, startedAt: number) {
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
          setWrapUpLeadId(existing.leadId);
          setWrapUpDurationSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
        }
        return null;
      }

      return null;
    });
    activeCallMetaRef.current = null;
    setCallError(message);
  }

  async function destroyVoiceClient() {
    const client = voiceClientRef.current;
    voiceClientRef.current = null;
    voiceConfigSignatureRef.current = null;
    remoteAudioRef.current = null;

    if (!client) {
      return;
    }

    try {
      await client.unregister();
    } catch {
      // Ignore unregister failures during cleanup.
    }

    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect failures during cleanup.
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
          setCallError(null);
          setActiveCall((existing) =>
            existing ? { ...existing, status: "ringing" } : existing,
          );
        },
        onCallAnswered: () => {
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
          finishCallSession(meta.leadId, meta.startedAt);
        },
        onServerDisconnect: (error) => {
          const message =
            error?.message?.trim() ||
            "The CRM softphone disconnected from the SIP server before the call could be completed.";
          const meta = activeCallMetaRef.current;

          if (meta) {
            failCallSession(message, meta.startedAt);
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
    }
  };

  const previousLead = () => {
    if (wrapUpLeadId || !queue.length) {
      return;
    }

    const currentIndex = queue.findIndex((lead) => lead.id === currentLeadId);
    lastAutoDialLeadIdRef.current = null;
    setCurrentLeadId(queue[Math.max(0, currentIndex - 1)]?.id ?? queue[0].id);
  };

  const nextLead = () => {
    if (wrapUpLeadId || !queue.length) {
      return;
    }

    const currentIndex = queue.findIndex((lead) => lead.id === currentLeadId);
    lastAutoDialLeadIdRef.current = null;
    setCurrentLeadId(queue[Math.min(queue.length - 1, currentIndex + 1)]?.id ?? queue[0].id);
  };

  const skipLead = () => {
    if (wrapUpLeadId) {
      return;
    }

    const currentIndex = queue.findIndex((lead) => lead.id === currentLeadId);
    const next = queue[currentIndex + 1] ?? queue[currentIndex - 1] ?? null;
    lastAutoDialLeadIdRef.current = null;
    setCurrentLeadId(next?.id ?? null);
  };

  const markLeadInvalid = async () => {
    if (!authToken || !currentLeadId || !currentUser || wrapUpLeadId) {
      return;
    }

    const nextId = queue.find((lead) => lead.id !== currentLeadId)?.id ?? null;
    await apiRequest(`/leads/${currentLeadId}/invalid`, {
      method: "PATCH",
      token: authToken,
    });
    await refreshWorkspace();
    lastAutoDialLeadIdRef.current = null;
    setCurrentLeadId(nextId);
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

    const dialedNumber = (input?.phone ?? lead?.phone ?? "").trim();
    if (!dialedNumber) {
      throw new Error("Phone number not found");
    }

    const callLeadId = lead?.id ?? requestedLeadId ?? null;
    const displayName = (input?.displayName ?? lead?.fullName ?? dialedNumber).trim();

    if (!callLeadId && currentLeadId) {
      lastAutoDialLeadIdRef.current = currentLeadId;
    }

    activeCallMetaRef.current = {
      leadId: callLeadId,
      startedAt,
    };
    setActiveCall({
      leadId: callLeadId,
      dialedNumber,
      displayName,
      startedAt,
      status: "ringing",
      muted: false,
      recordingEnabled: voiceConfig.available,
    });

    try {
      const { client, session } = await ensureVoiceClient();
      if (!session.available) {
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

      await client.call(normalizeDialTarget(dialedNumber, session.sipDomain, session.dialPrefix));
    } catch (error) {
      await destroyVoiceClient();
      failCallSession(
        error instanceof Error && error.message.trim()
          ? error.message
          : "The CRM softphone could not place the SIP call.",
        startedAt,
      );
      throw error;
    }
  };

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
      void voiceClientRef.current.hangup().catch(() => undefined);
      return;
    }

    finishCallSession(activeCall.leadId, activeCall.startedAt);
  };

  const saveDisposition = async (input: SaveDispositionInput) => {
    if (!authToken || !wrapUpLeadId) {
      return;
    }

    const currentIndex = queue.findIndex((lead) => lead.id === wrapUpLeadId);
    const nextLeadId =
      queue.filter((lead) => lead.id !== wrapUpLeadId)[currentIndex] ??
      queue.filter((lead) => lead.id !== wrapUpLeadId)[0] ??
      null;

    await apiRequest("/dialer/disposition", {
      method: "POST",
      token: authToken,
      body: JSON.stringify({
        ...input,
        leadId: wrapUpLeadId,
        durationSeconds: wrapUpDurationSeconds || 60,
        recordingEnabled: activeCall?.recordingEnabled ?? voiceConfig.available,
      }),
    });

    lastAutoDialLeadIdRef.current = wrapUpLeadId;
    setWrapUpLeadId(null);
    setWrapUpDurationSeconds(0);
    await refreshWorkspace();
    setCurrentLeadId(nextLeadId?.id ?? null);
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
        createSipProfile,
        activateSipProfile,
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
