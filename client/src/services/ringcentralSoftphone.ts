import type { BrowserSoftphoneConfig } from "../lib/browserSoftphone";

export interface WebPhoneSipInfo {
  authorizationId: string;
  domain: string;
  outboundProxy: string;
  outboundProxyBackup: string;
  username: string;
  password: string;
  stunServers: string[];
}

export interface RingCentralSoftphoneSession {
  callId?: string;
  direction?: "inbound" | "outbound";
  state?: "init" | "ringing" | "answered" | "disposed" | "failed";
  remoteNumber?: string;
  answer?: () => Promise<void>;
  decline?: () => Promise<void>;
  hangup?: () => Promise<void>;
  dispose?: () => Promise<void> | void;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
}

export interface RingCentralSoftphoneClient {
  start(): Promise<void>;
  unregister(): Promise<void>;
  disconnect(): Promise<void>;
  dispose(): Promise<void>;
  call(callee: string, callerId?: string): Promise<RingCentralSoftphoneSession>;
  answer(): Promise<void>;
  reject(): Promise<void>;
  hangup(): Promise<void>;
  getCurrentSession(): RingCentralSoftphoneSession | null;
}

export interface RingCentralSoftphoneHandlers {
  onInboundCall?: (session: RingCentralSoftphoneSession) => void;
  onOutboundCall?: (session: RingCentralSoftphoneSession) => void;
  onAnswered?: (session: RingCentralSoftphoneSession) => void;
  onRinging?: (session: RingCentralSoftphoneSession) => void;
  onDisposed?: (session: RingCentralSoftphoneSession) => void;
  onFailed?: (session: RingCentralSoftphoneSession, error: unknown) => void;
}

const fallbackStunServers = ["stun.l.google.com:19302"];

function normalizeProxyUrl(websocketUrl: string | null): string {
  if (!websocketUrl) {
    return "";
  }

  try {
    const parsed = new URL(websocketUrl);
    return parsed.host;
  } catch {
    return websocketUrl.replace(/^wss?:\/\//i, "").replace(/\/.*$/, "");
  }
}

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function buildWebPhoneSipInfo(config: BrowserSoftphoneConfig): WebPhoneSipInfo {
  const proxy = normalizeProxyUrl(config.websocketUrl);
  const sipDomain = normalizeText(config.sipDomain) || proxy;
  const authUsername = normalizeText(config.authorizationUsername);
  const authorizationId = normalizeText(config.authorizationId) || authUsername;
  const password = normalizeText(config.authorizationPassword);

  return {
    authorizationId,
    domain: sipDomain,
    outboundProxy: proxy,
    outboundProxyBackup: proxy,
    username: authUsername,
    password,
    stunServers: fallbackStunServers.slice(),
  };
}

type WebPhoneModule = {
  default: new (options: { sipInfo: WebPhoneSipInfo; autoAnswer?: boolean; debug?: boolean }) => {
    start(): Promise<void>;
    dispose(): Promise<void>;
    call(callee: string, callerId?: string): Promise<RingCentralSoftphoneSession>;
    on(event: "inboundCall" | "outboundCall", handler: (session: RingCentralSoftphoneSession) => void): void;
  };
};

function attachSessionHandlers(
  session: RingCentralSoftphoneSession,
  handlers: RingCentralSoftphoneHandlers,
  state: { currentSession: RingCentralSoftphoneSession | null },
) {
  state.currentSession = session;

  session.on?.("ringing", () => {
    handlers.onRinging?.(session);
  });

  session.on?.("answered", () => {
    handlers.onAnswered?.(session);
  });

  session.on?.("disposed", () => {
    if (state.currentSession === session) {
      state.currentSession = null;
    }

    handlers.onDisposed?.(session);
  });

  session.on?.("failed", (error) => {
    if (state.currentSession === session) {
      state.currentSession = null;
    }

    handlers.onFailed?.(session, error);
  });
}

export async function createRingCentralSoftphone(
  config: BrowserSoftphoneConfig,
  handlers: RingCentralSoftphoneHandlers = {},
): Promise<RingCentralSoftphoneClient | null> {
  if (
    !config.available ||
    !config.websocketUrl ||
    !config.sipDomain ||
    !config.authorizationUsername ||
    !config.authorizationPassword
  ) {
    return null;
  }

  const module = (await import("ringcentral-web-phone")) as unknown as WebPhoneModule;
  const webPhone = new module.default({
    sipInfo: buildWebPhoneSipInfo(config),
    autoAnswer: false,
  });

  const state = {
    currentSession: null as RingCentralSoftphoneSession | null,
  };

  webPhone.on("inboundCall", (session) => {
    attachSessionHandlers(session, handlers, state);
    handlers.onInboundCall?.(session);
  });

  webPhone.on("outboundCall", (session) => {
    attachSessionHandlers(session, handlers, state);
    handlers.onOutboundCall?.(session);
  });

  return {
    async start() {
      await webPhone.start();
    },
    async unregister() {
      state.currentSession = null;
      await webPhone.dispose();
    },
    async disconnect() {
      state.currentSession = null;
      await webPhone.dispose();
    },
    async dispose() {
      state.currentSession = null;
      await webPhone.dispose();
    },
    async call(callee: string, callerId?: string) {
      const session = await webPhone.call(callee, callerId);
      attachSessionHandlers(session, handlers, state);
      return session;
    },
    async answer() {
      await state.currentSession?.answer?.();
    },
    async reject() {
      if (state.currentSession?.decline) {
        await state.currentSession.decline();
        return;
      }

      await state.currentSession?.hangup?.();
    },
    async hangup() {
      await state.currentSession?.hangup?.();
    },
    getCurrentSession() {
      return state.currentSession;
    },
  };
}
