import type { CallDisposition, CallLogStatus, Lead } from "../types/index.ts";

export interface IncomingAlertItem {
  id: string;
  callId: string;
  leadId: string;
  leadName: string;
  phone: string;
  createdAt: string;
  status: CallLogStatus;
  disposition: CallDisposition | null;
}

function seenStorageKey(userId: string) {
  return `preview-dialer-incoming-alerts-seen:${userId}`;
}

export function buildIncomingAlerts(leads: Lead[]): IncomingAlertItem[] {
  return leads
    .flatMap((lead) =>
      lead.callHistory
        .filter((call) => call.callType === "incoming")
        .map((call) => ({
          id: `${lead.id}:${call.id}`,
          callId: call.id,
          leadId: lead.id,
          leadName: lead.fullName,
          phone: call.phone || lead.phone,
          createdAt: call.createdAt,
          status: call.status,
          disposition: call.disposition,
        })),
    )
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function loadSeenIncomingAlertIds(userId: string): Set<string> {
  if (typeof localStorage === "undefined") {
    return new Set();
  }

  try {
    const raw = localStorage.getItem(seenStorageKey(userId));
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

export function saveSeenIncomingAlertIds(userId: string, ids: Set<string>): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(seenStorageKey(userId), JSON.stringify([...ids]));
}

export function countUnreadIncomingAlerts(items: IncomingAlertItem[], seenIds: Set<string>) {
  return items.reduce((count, item) => count + (seenIds.has(item.id) ? 0 : 1), 0);
}
