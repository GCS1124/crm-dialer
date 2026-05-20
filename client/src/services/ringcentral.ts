import { getSupabaseClient } from "../lib/supabase";
import {
  selectRingCentralRingOutFromNumber,
  type RingCentralPhoneNumber,
} from "../lib/ringcentral";

export interface RingCentralIntegrationStatus {
  connected: boolean;
  accountId: string | null;
  extensionId: string | null;
  selectedRingOutNumber: string | null;
  availableRingOutNumbers: RingCentralPhoneNumber[];
  connectedAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  message: string | null;
}

export interface RingCentralRingOutResult {
  id: string | null;
  status: string | null;
  callStatus: string | null;
  callerStatus: string | null;
  calleeStatus: string | null;
  to: string | null;
  from: string | null;
}

async function invokeRingCentralFunction<T>(body: Record<string, unknown>, functionName = "ringcentral") {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke(functionName, {
    body,
  });

  if (error) {
    throw new Error(await getRingCentralFunctionErrorMessage(error));
  }

  return data as T;
}

function readErrorPayloadMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const values = payload as Record<string, unknown>;
  if (typeof values.message === "string" && values.message.trim()) {
    return values.message.trim();
  }

  if (typeof values.error === "string" && values.error.trim()) {
    return values.error.trim();
  }

  if (typeof values.code === "string" && values.code.trim()) {
    return values.code.trim();
  }

  return "";
}

async function getRingCentralFunctionErrorMessage(error: unknown) {
  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: unknown }).context
    : null;

  if (context instanceof Response) {
    const status = context.status;
    const fallback = `RingCentral function failed${status ? ` (${status})` : ""}.`;
    const text = await context
      .clone()
      .text()
      .catch(() => "");

    if (!text) {
      return fallback;
    }

    try {
      const message = readErrorPayloadMessage(JSON.parse(text));
      if (message) {
        return message;
      }
    } catch {
      return text.length > 300 ? `${text.slice(0, 300)}...` : text;
    }

    return fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to reach RingCentral settings.";
}

function normalizeRingCentralNumbers(numbers: RingCentralPhoneNumber[]) {
  return numbers.map((number) => ({
    ...number,
    phoneNumber: number.phoneNumber.replace(/[^\d]/g, ""),
  }));
}

export async function beginRingCentralConnection() {
  const response = await invokeRingCentralFunction<{ status: RingCentralIntegrationStatus }>({
    action: "connect",
  });

  return {
    ...response.status,
    availableRingOutNumbers: normalizeRingCentralNumbers(response.status.availableRingOutNumbers ?? []),
  };
}

export async function loadRingCentralStatus() {
  const response = await invokeRingCentralFunction<{ status: RingCentralIntegrationStatus }>({
    action: "status",
  });

  return {
    ...response.status,
    availableRingOutNumbers: normalizeRingCentralNumbers(response.status.availableRingOutNumbers ?? []),
  };
}

export async function saveRingCentralRingOutNumber(ringOutNumber: string | null) {
  const response = await invokeRingCentralFunction<{ status: RingCentralIntegrationStatus }>({
    action: "update-ringout-number",
    ringOutNumber,
  });

  return {
    ...response.status,
    availableRingOutNumbers: normalizeRingCentralNumbers(response.status.availableRingOutNumbers ?? []),
  };
}

export async function disconnectRingCentral() {
  await invokeRingCentralFunction<{ success: boolean }>({
    action: "disconnect",
  });
}

export async function placeRingOutCall(input: {
  to: string;
  playPrompt?: boolean;
}) {
  const payload: Record<string, unknown> = {
    action: "ring-out",
    to: input.to.trim(),
    playPrompt: input.playPrompt ?? false,
  };

  const response = await invokeRingCentralFunction<{ call: RingCentralRingOutResult }>(payload);

  return response.call;
}

export async function getRingOutCallStatus(input: { ringOutId: string }) {
  const response = await invokeRingCentralFunction<{ call: RingCentralRingOutResult }>({
    action: "ring-out-status",
    ringOutId: input.ringOutId.trim(),
  }, "ringcentral-live");

  return response.call;
}

export async function cancelRingOutCall(input: { ringOutId: string }) {
  await invokeRingCentralFunction<{ success: boolean }>({
    action: "ring-out-cancel",
    ringOutId: input.ringOutId.trim(),
  }, "ringcentral-live");
}

export async function endRingCentralCall(input: { ringOutId: string; connected: boolean }) {
  await invokeRingCentralFunction<{ success: boolean }>({
    action: "ring-out-end",
    ringOutId: input.ringOutId.trim(),
    connected: input.connected,
  }, "ringcentral-live");
}

export function chooseRingCentralRingOutNumber(
  numbers: RingCentralPhoneNumber[],
  preferredRingOutNumber: string | null,
) {
  return selectRingCentralRingOutFromNumber(numbers, preferredRingOutNumber);
}
