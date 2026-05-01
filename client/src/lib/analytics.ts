import type {
  AdminDashboardMetrics,
  AgentDashboardMetrics,
  CallDisposition,
  ChartDatum,
  DailyPerformanceDatum,
  Lead,
  QueueFilter,
  QueueSort,
  TopAgentDatum,
  User,
  UserRole,
} from "../types";
import { isPast, isToday } from "./utils";

const priorityOrder = {
  Urgent: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

const openStatuses = new Set([
  "new",
  "contacted",
  "callback_due",
  "follow_up",
  "qualified",
  "appointment_booked",
]);

function isDiagnosticCall(call: Lead["callHistory"][number]) {
  return call.source === "failed_attempt" || call.status === "failed";
}

export function getVisibleLeads(leads: Lead[], role: UserRole, userId: string) {
  if (role === "agent") {
    return leads.filter((lead) => lead.assignedAgentId === userId);
  }

  return leads;
}

export function getQueueLeads(
  leads: Lead[],
  role: UserRole,
  userId: string,
  sortBy: QueueSort,
  filterBy: QueueFilter,
) {
  const scoped = getVisibleLeads(leads, role, userId).filter((lead) =>
    filterBy === "all" ? openStatuses.has(lead.status) : lead.status === filterBy,
  );

  const queue = [...scoped];

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

export function getDispositionBreakdown(leads: Lead[], userId?: string) {
  const buckets = new Map<CallDisposition, number>();

  leads.forEach((lead) => {
    lead.callHistory.forEach((call) => {
      if (userId && call.agentId !== userId) {
        return;
      }

      if (!isDiagnosticCall(call)) {
        buckets.set(call.disposition, (buckets.get(call.disposition) ?? 0) + 1);
      }
    });
  });

  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value);
}

export function getLeadStatusDistribution(leads: Lead[]) {
  const buckets = new Map<string, number>();

  leads.forEach((lead) => {
    buckets.set(lead.status, (buckets.get(lead.status) ?? 0) + 1);
  });

  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
}

export function getCallbackBuckets(leads: Lead[], userId?: string) {
  const callbacks = userId
    ? leads.filter((lead) => lead.assignedAgentId === userId)
    : leads;

  return {
    today: callbacks.filter(
      (lead) => lead.callbackTime && isToday(lead.callbackTime) && !isPast(lead.callbackTime),
    ),
    overdue: callbacks.filter(
      (lead) => lead.callbackTime && isPast(lead.callbackTime),
    ),
    upcoming: callbacks.filter(
      (lead) =>
        lead.callbackTime &&
        !isPast(lead.callbackTime) &&
        !isToday(lead.callbackTime),
    ),
  };
}

export function getAgentDashboardMetrics(
  leads: Lead[],
  userId: string,
): AgentDashboardMetrics {
  const scopedLeads = leads.filter((lead) => lead.assignedAgentId === userId);
  const todayCalls = scopedLeads.flatMap((lead) =>
    lead.callHistory.filter(
      (call) => call.agentId === userId && isToday(call.createdAt) && !isDiagnosticCall(call),
    ),
  );

  const connectedCalls = todayCalls.filter((call) =>
    !["No Answer", "Busy", "Voicemail", "Wrong Number"].includes(call.disposition),
  );

  const appointmentsBooked = todayCalls.filter(
    (call) => call.disposition === "Appointment Booked",
  ).length;

  const salesClosed = todayCalls.filter(
    (call) => call.disposition === "Sale Closed",
  ).length;

  const callbacksScheduled = scopedLeads.filter(
    (lead) => lead.callbackTime && isToday(lead.callbackTime),
  ).length;

  const averageCallDuration =
    todayCalls.length > 0
      ? todayCalls.reduce((sum, call) => sum + call.durationSeconds, 0) / todayCalls.length
      : 0;

  return {
    totalAssignedLeads: scopedLeads.length,
    callsMadeToday: todayCalls.length,
    connectedCalls: connectedCalls.length,
    noAnswers: todayCalls.filter((call) => call.disposition === "No Answer").length,
    callbacksScheduled,
    appointmentsBooked,
    salesClosed,
    conversionRate: todayCalls.length
      ? Math.round((salesClosed / todayCalls.length) * 100)
      : 0,
    averageCallDuration,
    remainingLeads: scopedLeads.filter((lead) => openStatuses.has(lead.status)).length,
  };
}

export function getAdminDashboardMetrics(leads: Lead[]): AdminDashboardMetrics {
  const calls = leads.flatMap((lead) => lead.callHistory).filter((call) => !isDiagnosticCall(call));
  const connectedCalls = calls.filter(
    (call) =>
      !["No Answer", "Busy", "Voicemail", "Wrong Number"].includes(call.disposition),
  );

  const completedCallbacks = leads.filter(
    (lead) =>
      lead.activities.some(
        (activity) =>
          activity.type === "callback" &&
          activity.description.toLowerCase().includes("completed"),
      ),
  ).length;

  const totalCallbacks = leads.filter((lead) => lead.callbackTime).length;

  return {
    totalTeamCalls: calls.length,
    connectedCalls: connectedCalls.length,
    callbackCompletionRate: totalCallbacks
      ? Math.round((completedCallbacks / totalCallbacks) * 100)
      : 0,
    appointmentsBooked: calls.filter(
      (call) => call.disposition === "Appointment Booked",
    ).length,
    salesClosed: calls.filter((call) => call.disposition === "Sale Closed").length,
    activeLeads: leads.filter((lead) => openStatuses.has(lead.status)).length,
    averageCallDuration:
      calls.length > 0
        ? calls.reduce((sum, call) => sum + call.durationSeconds, 0) / calls.length
        : 0,
  };
}

export function getDailyPerformance(leads: Lead[], userId?: string): DailyPerformanceDatum[] {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date;
  });

  return days.map((day) => {
    const label = new Intl.DateTimeFormat("en", { weekday: "short" }).format(day);
    const calls = leads.flatMap((lead) =>
      lead.callHistory.filter((call) => {
        const callDate = new Date(call.createdAt);
        if (userId && call.agentId !== userId) {
          return false;
        }

        return (
          !isDiagnosticCall(call) &&
          callDate.getFullYear() === day.getFullYear() &&
          callDate.getMonth() === day.getMonth() &&
          callDate.getDate() === day.getDate()
        );
      }),
    );

    return {
      label,
      calls: calls.length,
      connected: calls.filter(
        (call) =>
          !["No Answer", "Busy", "Voicemail", "Wrong Number"].includes(call.disposition),
      ).length,
    };
  });
}

export function getTopAgents(leads: Lead[], users: User[]): TopAgentDatum[] {
  const metrics = users
    .filter((user) => user.role !== "admin")
    .map((user) => {
      const calls = leads.flatMap((lead) =>
        lead.callHistory.filter((call) => call.agentId === user.id && !isDiagnosticCall(call)),
      );
      const conversions = calls.filter(
        (call) =>
          call.disposition === "Appointment Booked" || call.disposition === "Sale Closed",
      ).length;
      const callbackActivities = leads.flatMap((lead) =>
        lead.activities.filter(
          (activity) =>
            activity.type === "callback" && activity.actorName === user.name,
        ),
      );

      const completedCallbacks = callbackActivities.filter((activity) =>
        activity.description.toLowerCase().includes("completed"),
      ).length;

      return {
        id: user.id,
        name: user.name,
        role: user.role,
        calls: calls.length,
        conversions,
        callbackCompletionRate: callbackActivities.length
          ? Math.round((completedCallbacks / callbackActivities.length) * 100)
          : 0,
      };
    });

  return metrics.sort((left, right) => right.conversions - left.conversions);
}

export function getPipelineSummary(leads: Lead[]): ChartDatum[] {
  return [
    {
      label: "Hot Leads",
      value: leads.filter(
        (lead) => lead.priority === "Urgent" || lead.priority === "High",
      ).length,
    },
    {
      label: "Callbacks",
      value: leads.filter((lead) => lead.callbackTime).length,
    },
    {
      label: "Appointments",
      value: leads.filter((lead) => lead.status === "appointment_booked").length,
    },
    {
      label: "Closed Won",
      value: leads.filter((lead) => lead.status === "closed_won").length,
    },
  ];
}
