import { Call, Device } from "@twilio/voice-sdk";
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
import type {
  ActiveCall,
  Lead,
  LeadImportRecord,
  LeadPriority,
  LeadStatus,
  QueueFilter,
  QueueSort,
  SaveDispositionInput,
  ThemeMode,
  TwilioDialerConfig,
  UploadResult,
  User,
  WorkspaceAnalytics,
  WorkspaceSettingsStatus,
  WorkspacePayload,
} from "../types";

interface VoiceTokenResponse {
  available: boolean;
  callerId: string | null;
  appSid: string | null;
  token?: string;
  identity?: string;
  message?: string;
}

interface InviteUserResult {
  user: User;
  temporaryPassword: string;
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
};

const emptyTwilioConfig: TwilioDialerConfig = {
  available: false,
  callerId: null,
  appSid: null,
};

const emptySettingsStatus: WorkspaceSettingsStatus = {
  authMode: "supabase",
  signupEnabled: true,
  importFormats: ["csv", "xlsx", "xls"],
  twilio: {
    available: false,
    callerId: null,
    configuredFields: {
      accountSid: false,
      apiKey: false,
      apiSecret: false,
      appSid: false,
      callerId: false,
    },
  },
  supabase: {
    connected: false,
    publishableKeyConfigured: false,
    serviceRoleConfigured: false,
  },
};

interface AppStateContextValue {
  currentUser: User | null;
  users: User[];
  leads: Lead[];
  analytics: WorkspaceAnalytics;
  settingsStatus: WorkspaceSettingsStatus;
  twilioConfig: TwilioDialerConfig;
  theme: ThemeMode;
  sessionReady: boolean;
  workspaceLoading: boolean;
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
  startCall: () => Promise<void>;
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
  const [twilioConfig, setTwilioConfig] = useState<TwilioDialerConfig>(emptyTwilioConfig);
  const [sessionReady, setSessionReady] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
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
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const autoDialTimerRef = useRef<number | null>(null);
  const lastAutoDialLeadIdRef = useRef<string | null>(null);

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
          setTwilioConfig(emptyTwilioConfig);
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
        await loadWorkspace(authToken);
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
      deviceRef.current?.destroy();
      deviceRef.current = null;
      callRef.current = null;
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
        void startCall();
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

  async function loadWorkspace(tokenOverride?: string | null) {
    const token = tokenOverride ?? authToken;
    if (!token) {
      return;
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
      setTwilioConfig(payload.twilio);
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
    setTwilioConfig(emptyTwilioConfig);
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
    callRef.current = null;
    deviceRef.current?.destroy();
    deviceRef.current = null;
  }

  function finishCallSession(leadId: string, startedAt: number) {
    setActiveCall((existing) =>
      existing && existing.leadId === leadId ? null : existing,
    );
    setWrapUpLeadId(leadId);
    setWrapUpDurationSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
    callRef.current = null;
  }

  async function ensureVoiceDevice() {
    if (!authToken) {
      throw new Error("Missing session");
    }

    const response = await apiRequest<VoiceTokenResponse>("/dialer/token", {
      token: authToken,
    });

    setTwilioConfig({
      available: response.available,
      callerId: response.callerId ?? null,
      appSid: response.appSid ?? null,
    });

    if (!response.available || !response.token) {
      return null;
    }

    if (!deviceRef.current) {
      deviceRef.current = new Device(response.token);
      await deviceRef.current.register();
    } else {
      deviceRef.current.updateToken(response.token);
    }

    return deviceRef.current;
  }

  const login = async (email: string, password: string) => {
    try {
      const payload = await apiRequest<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      setAuthToken(payload.token);
      setCurrentUser(payload.user);
      await loadWorkspace(payload.token);
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
      const payload = await apiRequest<{ token: string; user: User }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(input),
      });

      setAuthToken(payload.token);
      setCurrentUser(payload.user);
      await loadWorkspace(payload.token);
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
    await loadWorkspace();
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

  const startCall = async () => {
    if (!currentLeadId || activeCall || wrapUpLeadId) {
      return;
    }

    if (autoDialTimerRef.current) {
      window.clearInterval(autoDialTimerRef.current);
      autoDialTimerRef.current = null;
    }
    setAutoDialCountdown(null);

    const startedAt = Date.now();
    setActiveCall({
      leadId: currentLeadId,
      startedAt,
      status: "ringing",
      muted: false,
      recordingEnabled: twilioConfig.available,
    });

    try {
      const device = await ensureVoiceDevice();
      if (!device) {
        window.setTimeout(() => {
          setActiveCall((existing) =>
            existing && existing.leadId === currentLeadId
              ? { ...existing, status: "connected" }
              : existing,
          );
        }, 400);
        return;
      }

      const lead = leads.find((item) => item.id === currentLeadId);
      if (!lead) {
        throw new Error("Lead not found");
      }

      const call = await device.connect({
        params: {
          To: lead.phone,
          leadId: lead.id,
        },
      });
      callRef.current = call;

      call.on("accept", () => {
        setActiveCall((existing) =>
          existing && existing.leadId === lead.id ? { ...existing, status: "connected" } : existing,
        );
      });
      call.on("disconnect", () => finishCallSession(lead.id, startedAt));
      call.on("cancel", () => finishCallSession(lead.id, startedAt));
      call.on("error", () => finishCallSession(lead.id, startedAt));
    } catch {
      setActiveCall({
        leadId: currentLeadId,
        startedAt,
        status: "connected",
        muted: false,
        recordingEnabled: false,
      });
    }
  };

  const toggleMute = () => {
    setActiveCall((existing) => {
      if (!existing) {
        return existing;
      }

      const nextMuted = !existing.muted;
      callRef.current?.mute(nextMuted);
      return { ...existing, muted: nextMuted };
    });
  };

  const holdCall = () => {
    setActiveCall((existing) => {
      if (!existing) {
        return existing;
      }

      callRef.current?.mute(true);
      return { ...existing, status: "on_hold", muted: true };
    });
  };

  const resumeCall = () => {
    setActiveCall((existing) => {
      if (!existing) {
        return existing;
      }

      callRef.current?.mute(false);
      return { ...existing, status: "connected", muted: false };
    });
  };

  const endCall = () => {
    if (!activeCall) {
      return;
    }

    if (callRef.current) {
      callRef.current.disconnect();
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
        recordingEnabled: activeCall?.recordingEnabled ?? twilioConfig.available,
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

  return (
    <AppStateContext.Provider
      value={{
        currentUser,
        users,
        leads,
        analytics,
        settingsStatus,
        twilioConfig,
        theme,
        sessionReady,
        workspaceLoading,
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
        rescheduleCallback,
        markCallbackCompleted,
        reopenLead: reopenLeadRecord,
        inviteUser,
        setUserStatus,
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
