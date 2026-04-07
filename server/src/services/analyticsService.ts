import type {
  AdminDashboardMetrics,
  AgentDashboardMetrics,
  ApiCallDisposition,
  ApiLead,
  ApiUser,
  ChartDatum,
  DailyPerformanceDatum,
  TopAgentDatum,
  WorkspaceAnalytics,
} from "../types/index.js";

const openStatuses = new Set([
  "new",
  "contacted",
  "callback_due",
  "follow_up",
  "qualified",
  "appointment_booked",
]);

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isPast(value?: string | null) {
  if (!value) {
    return false;
  }

  return new Date(value).getTime() < Date.now();
}

export function getDispositionBreakdown(leads: ApiLead[], userId?: string) {
  const buckets = new Map<ApiCallDisposition, number>();

  leads.forEach((lead) => {
    lead.callHistory.forEach((call) => {
      if (userId && call.agentId !== userId) {
        return;
      }

      buckets.set(call.disposition, (buckets.get(call.disposition) ?? 0) + 1);
    });
  });

  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value);
}

export function getLeadStatusDistribution(leads: ApiLead[]) {
  const buckets = new Map<string, number>();

  leads.forEach((lead) => {
    buckets.set(lead.status, (buckets.get(lead.status) ?? 0) + 1);
  });

  return Array.from(buckets.entries()).map(([label, value]) => ({ label, value }));
}

export function getCallbackCounts(leads: ApiLead[], userId?: string) {
  const callbacks = userId
    ? leads.filter((lead) => lead.assignedAgentId === userId)
    : leads;

  return {
    today: callbacks.filter(
      (lead) => lead.callbackTime && isToday(lead.callbackTime) && !isPast(lead.callbackTime),
    ).length,
    overdue: callbacks.filter((lead) => lead.callbackTime && isPast(lead.callbackTime)).length,
    upcoming: callbacks.filter(
      (lead) =>
        lead.callbackTime &&
        !isPast(lead.callbackTime) &&
        !isToday(lead.callbackTime),
    ).length,
  };
}

export function getAgentDashboardMetrics(
  leads: ApiLead[],
  userId: string,
): AgentDashboardMetrics {
  const scopedLeads = leads.filter((lead) => lead.assignedAgentId === userId);
  const todayCalls = scopedLeads.flatMap((lead) =>
    lead.callHistory.filter((call) => call.agentId === userId && isToday(call.createdAt)),
  );

  const connectedCalls = todayCalls.filter(
    (call) => !["No Answer", "Busy", "Voicemail", "Wrong Number"].includes(call.disposition),
  );

  const appointmentsBooked = todayCalls.filter(
    (call) => call.disposition === "Appointment Booked",
  ).length;

  const salesClosed = todayCalls.filter((call) => call.disposition === "Sale Closed").length;

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

export function getAdminDashboardMetrics(leads: ApiLead[]): AdminDashboardMetrics {
  const calls = leads.flatMap((lead) => lead.callHistory);
  const connectedCalls = calls.filter(
    (call) => !["No Answer", "Busy", "Voicemail", "Wrong Number"].includes(call.disposition),
  );

  const completedCallbacks = leads.filter((lead) =>
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
    appointmentsBooked: calls.filter((call) => call.disposition === "Appointment Booked").length,
    salesClosed: calls.filter((call) => call.disposition === "Sale Closed").length,
    activeLeads: leads.filter((lead) => openStatuses.has(lead.status)).length,
    averageCallDuration:
      calls.length > 0
        ? calls.reduce((sum, call) => sum + call.durationSeconds, 0) / calls.length
        : 0,
  };
}

export function getDailyPerformance(leads: ApiLead[], userId?: string): DailyPerformanceDatum[] {
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
        (call) => !["No Answer", "Busy", "Voicemail", "Wrong Number"].includes(call.disposition),
      ).length,
    };
  });
}

export function getTopAgents(leads: ApiLead[], users: ApiUser[]): TopAgentDatum[] {
  const metrics = users
    .filter((user) => user.role !== "admin")
    .map((user) => {
      const calls = leads.flatMap((lead) =>
        lead.callHistory.filter((call) => call.agentId === user.id),
      );
      const conversions = calls.filter(
        (call) =>
          call.disposition === "Appointment Booked" || call.disposition === "Sale Closed",
      ).length;
      const callbackActivities = leads.flatMap((lead) =>
        lead.activities.filter(
          (activity) => activity.type === "callback" && activity.actorName === user.name,
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

export function getPipelineSummary(leads: ApiLead[]): ChartDatum[] {
  return [
    {
      label: "Hot Leads",
      value: leads.filter((lead) => lead.priority === "Urgent" || lead.priority === "High")
        .length,
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

export function buildWorkspaceAnalytics(
  leads: ApiLead[],
  users: ApiUser[],
  currentUser: ApiUser,
): WorkspaceAnalytics {
  const scopedUserId = currentUser.role === "agent" ? currentUser.id : undefined;

  return {
    agentMetrics:
      currentUser.role === "agent" ? getAgentDashboardMetrics(leads, currentUser.id) : null,
    adminMetrics:
      currentUser.role === "agent" ? null : getAdminDashboardMetrics(leads),
    callbackCounts: getCallbackCounts(leads, scopedUserId),
    performanceData: getDailyPerformance(leads, scopedUserId),
    dispositionData: getDispositionBreakdown(leads, scopedUserId),
    pipelineData: getPipelineSummary(leads),
    statusData: getLeadStatusDistribution(leads),
    topAgents: getTopAgents(leads, users),
  };
}
