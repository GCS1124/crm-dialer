import type {
  ApiCallDisposition,
  ApiCallLogStatus,
  ApiCallSentiment,
} from "../types/index.js";

const positiveSignals = [
  "interested",
  "booked",
  "qualified",
  "proposal",
  "pricing",
  "demo",
  "yes",
  "approved",
  "happy",
  "good",
];

const negativeSignals = [
  "not interested",
  "wrong number",
  "angry",
  "bad",
  "declined",
  "cancel",
  "spam",
  "busy",
  "no answer",
  "voicemail",
  "later",
];

function trimSentence(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function detectSentiment(text: string, status: ApiCallLogStatus): ApiCallSentiment {
  const content = text.toLowerCase();

  if (status === "missed") {
    return "neutral";
  }
  if (status === "failed") {
    return "neutral";
  }

  const positiveCount = positiveSignals.filter((signal) => content.includes(signal)).length;
  const negativeCount = negativeSignals.filter((signal) => content.includes(signal)).length;

  if (positiveCount > negativeCount) {
    return "positive";
  }
  if (negativeCount > positiveCount) {
    return "negative";
  }
  return "neutral";
}

function buildSuggestedNextAction(
  status: ApiCallLogStatus,
  sentiment: ApiCallSentiment,
  callbackAt?: string | null,
) {
  if (status === "follow_up" && callbackAt) {
    return "Reschedule the next touch and keep the lead in the active follow-up queue.";
  }
  if (status === "missed") {
    return "Retry later and leave a note only if you learned something useful.";
  }
  if (status === "failed") {
    return "Review SIP diagnostics, retry the browser call, or continue in manual mode.";
  }
  if (sentiment === "positive") {
    return "Move the lead forward with a concrete next step or booking.";
  }
  if (sentiment === "negative") {
    return "Review objections, decide whether to nurture later, or close out the lead.";
  }
  return "Capture the context clearly and decide whether a follow-up is needed.";
}

function firstUsefulLine(value: string) {
  return (
    value
      .split(/\r?\n/)
      .map((line) => trimSentence(line))
      .find(Boolean) ?? ""
  );
}

function buildSummary(text: string, status: ApiCallLogStatus, disposition?: ApiCallDisposition) {
  const firstLine = firstUsefulLine(text);
  if (firstLine) {
    return firstLine.slice(0, 160);
  }

  if (disposition) {
    return `${disposition} logged from the call workflow.`;
  }

  if (status === "follow_up") {
    return "Follow-up required after this call.";
  }
  if (status === "missed") {
    return "Call attempt was missed and needs another try.";
  }
  if (status === "failed") {
    return "Browser call failed before connecting.";
  }

  return "Call completed and saved to the CRM.";
}

export function buildAiAssist(input: {
  notes: string;
  status: ApiCallLogStatus;
  callbackAt?: string | null;
  disposition?: ApiCallDisposition;
  outcomeSummary?: string;
}) {
  const source = trimSentence([input.outcomeSummary ?? "", input.notes].filter(Boolean).join(". "));
  const aiSummary = buildSummary(source, input.status, input.disposition);
  const sentiment = detectSentiment(source, input.status);
  const suggestedNextAction = buildSuggestedNextAction(input.status, sentiment, input.callbackAt);

  return {
    aiSummary,
    sentiment,
    suggestedNextAction,
  };
}
