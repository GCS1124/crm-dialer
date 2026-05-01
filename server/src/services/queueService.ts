import type {
  ApiLead,
  ApiUser,
  QueueCursor,
  QueueFilter,
  QueueItem,
  QueueProgressRecord,
  QueueSort,
  QueueState,
} from "../types/index.js";

import { buildLeadDialNumbers } from "./phoneNumberService.js";

const priorityOrder: Record<"Urgent" | "High" | "Medium" | "Low", number> = {
  Urgent: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

const openStatuses = new Set<ApiLead["status"]>([
  "new",
  "contacted",
  "callback_due",
  "follow_up",
  "qualified",
  "appointment_booked",
]);

export function getQueueKey(queueScope: string, queueSort: QueueSort, queueFilter: QueueFilter) {
  return `${queueScope}:${queueSort}:${queueFilter}`;
}

function getVisibleLeads(leads: ApiLead[], role: ApiUser["role"], userId: string) {
  return role === "agent" ? leads.filter((lead) => lead.assignedAgentId === userId) : leads;
}

function sortQueueLeads(leads: ApiLead[], sortBy: QueueSort) {
  const queue = [...leads];

  queue.sort((left, right) => {
    if (sortBy === "priority") {
      const priorityGap = priorityOrder[left.priority] - priorityOrder[right.priority];
      if (priorityGap !== 0) {
        return priorityGap;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }

    if (sortBy === "callback_due") {
      const leftValue = left.callbackTime
        ? new Date(left.callbackTime).getTime()
        : Number.MAX_SAFE_INTEGER;
      const rightValue = right.callbackTime
        ? new Date(right.callbackTime).getTime()
        : Number.MAX_SAFE_INTEGER;

      if (leftValue !== rightValue) {
        return leftValue - rightValue;
      }
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  return queue;
}

function resolveQueueIndex(queueItems: QueueItem[], cursor: QueueCursor | null | undefined) {
  if (!queueItems.length) {
    return -1;
  }

  if (!cursor?.currentLeadId) {
    return 0;
  }

  const exactIndex = queueItems.findIndex(
    (item) =>
      item.leadId === cursor.currentLeadId &&
      item.phoneIndex === cursor.currentPhoneIndex,
  );

  if (exactIndex >= 0) {
    return exactIndex;
  }

  const sameLeadItems = queueItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.leadId === cursor.currentLeadId);

  if (!sameLeadItems.length) {
    return 0;
  }

  const nextSameLead = sameLeadItems.find(
    ({ item }) => item.phoneIndex > cursor.currentPhoneIndex,
  );

  if (nextSameLead) {
    return nextSameLead.index;
  }

  return sameLeadItems[sameLeadItems.length - 1].index + 1;
}

export function buildQueueItems(
  leads: ApiLead[],
  currentUser: ApiUser,
  queueSort: QueueSort,
  queueFilter: QueueFilter,
  queueScope = "default",
): QueueItem[] {
  const scoped = getVisibleLeads(leads, currentUser.role, currentUser.id).filter((lead) =>
    queueFilter === "all" ? openStatuses.has(lead.status) : lead.status === queueFilter,
  );

  return sortQueueLeads(scoped, queueSort).flatMap((lead) => {
    const phoneNumbers = buildLeadDialNumbers({
      phone: lead.phone,
      altPhone: lead.altPhone,
      phoneNumbers: lead.phoneNumbers,
    });

    return phoneNumbers.map((phoneNumber, phoneIndex) => ({
      queueKey: getQueueKey(queueScope, queueSort, queueFilter),
      queueScope,
      queueSort,
      queueFilter,
      leadId: lead.id,
      leadName: lead.fullName,
      phoneIndex,
      phoneNumber,
      numberCount: phoneNumbers.length,
    }));
  });
}

export function selectQueueState(
  queueItems: QueueItem[],
  cursor: QueueCursor | QueueProgressRecord | null | undefined,
  queueScope = "default",
  queueSort: QueueSort = "priority",
  queueFilter: QueueFilter = "all",
): QueueState {
  const currentIndex = resolveQueueIndex(queueItems, cursor);
  const currentItem =
    currentIndex >= 0 && currentIndex < queueItems.length ? queueItems[currentIndex] : null;
  const nextItem = currentIndex >= 0 ? queueItems[currentIndex + 1] ?? null : queueItems[0] ?? null;

  return {
    queueKey: getQueueKey(queueScope, queueSort, queueFilter),
    queueScope,
    queueSort,
    queueFilter,
    currentItem,
    nextItem,
    items: queueItems,
    progress:
      cursor && "userId" in cursor
        ? cursor
        : cursor?.currentLeadId != null
          ? {
              userId: "",
              queueKey: getQueueKey(queueScope, queueSort, queueFilter),
              queueScope,
              queueSort,
              queueFilter,
              currentLeadId: cursor.currentLeadId,
              currentPhoneIndex: cursor.currentPhoneIndex,
              createdAt: "",
              updatedAt: "",
            }
          : null,
  };
}

export function advanceQueueCursor(
  queueItems: QueueItem[],
  cursor: QueueCursor | null | undefined,
  outcome: "completed" | "failed" | "skipped" | "invalid" | "restart" = "completed",
): QueueCursor {
  if (!queueItems.length) {
    return {
      currentLeadId: null,
      currentPhoneIndex: 0,
    };
  }

  if (outcome === "restart") {
    return {
      currentLeadId: queueItems[0].leadId,
      currentPhoneIndex: queueItems[0].phoneIndex,
    };
  }

  const currentIndex = resolveQueueIndex(queueItems, cursor);
  const nextItem =
    currentIndex >= 0 ? queueItems[currentIndex + 1] ?? null : queueItems[0] ?? null;

  return {
    currentLeadId: nextItem?.leadId ?? null,
    currentPhoneIndex: nextItem?.phoneIndex ?? 0,
  };
}

export function toQueueProgressRecord(
  userId: string,
  queueScope: string,
  queueSort: QueueSort,
  queueFilter: QueueFilter,
  cursor: QueueCursor,
  timestamps: {
    createdAt: string;
    updatedAt: string;
  },
): QueueProgressRecord {
  return {
    userId,
    queueKey: getQueueKey(queueScope, queueSort, queueFilter),
    queueScope,
    queueSort,
    queueFilter,
    currentLeadId: cursor.currentLeadId,
    currentPhoneIndex: cursor.currentPhoneIndex,
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  };
}
