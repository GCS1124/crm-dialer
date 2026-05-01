import type {
  ApiCallAttemptFailureStage,
  ApiCallLog,
  ApiUser,
  SaveFailedCallAttemptInput,
} from "../types/index.js";

const diagnosticPrefix = "CALL_ATTEMPT_DIAGNOSTIC:";

interface FailedAttemptDiagnostic {
  dialedNumber: string;
  failureStage: ApiCallAttemptFailureStage;
  sipStatus: number | null;
  sipReason: string | null;
  failureMessage: string | null;
  startedAt: string;
  endedAt: string;
}

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

export function isFailedAttemptDescription(description: string | null | undefined) {
  return Boolean(description?.startsWith(diagnosticPrefix));
}

export function buildFailedAttemptDescription(input: SaveFailedCallAttemptInput) {
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

export function parseFailedAttemptDescription(
  description: string | null | undefined,
): FailedAttemptDiagnostic | null {
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

export function formatFailedAttemptSummary(diagnostic: FailedAttemptDiagnostic) {
  const stage = failureStageLabels[diagnostic.failureStage];
  const sipSummary = diagnostic.sipStatus
    ? ` SIP ${diagnostic.sipStatus}${diagnostic.sipReason ? ` ${diagnostic.sipReason}` : ""}.`
    : "";
  const message = diagnostic.failureMessage ? ` ${diagnostic.failureMessage}` : "";

  return `${stage} before connect for ${diagnostic.dialedNumber || "unknown number"}.${sipSummary}${message}`.trim();
}

export function buildFailedAttemptCallLog(input: {
  id: string;
  leadId: string;
  leadName: string;
  primaryPhone: string;
  createdAt: string;
  actor: ApiUser | null;
  diagnostic: FailedAttemptDiagnostic;
}): ApiCallLog {
  const durationSeconds = Math.max(
    0,
    Math.floor(
      (new Date(input.diagnostic.endedAt).getTime() -
        new Date(input.diagnostic.startedAt).getTime()) /
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
