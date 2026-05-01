import type {
  ActivityFeedItem,
  AdminDashboardMetrics,
  AgentDashboardMetrics,
  ApiCallDisposition,
  ApiLead,
  ApiUser,
  ChartDatum,
  DailyPerformanceDatum,
  DuplicateInsight,
  FocusMetric,
  RecommendedLead,
  RiskMetric,
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

const missedDispositions = new Set(["No Answer", "Busy", "Voicemail", "Wrong Number"]);

function isDiagnosticCall(call: ApiLead["callHistory"][number]) {
  return call.source === "failed_attempt" || call.status === "failed";
}

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

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isOpenLead(lead: ApiLead) {
  return openStatuses.has(lead.status);
}

function isHotLead(lead: ApiLead) {
  return lead.priority === "Urgent" || lead.priority === "High" || lead.leadScore >= 75;
}

function isUntouchedLead(lead: ApiLead) {
  return lead.callHistory.length === 0 && lead.notesHistory.length === 0 && !lead.lastContacted;
}

function hoursSince(value?: string | null) {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60));
}

function leadFreshnessHours(lead: ApiLead) {
  return hoursSince(lead.lastContacted || lead.updatedAt || lead.createdAt);
}

function isStaleLead(lead: ApiLead) {
  return isOpenLead(lead) && leadFreshnessHours(lead) >= 48;
}

function summarizeLeadAction(lead: ApiLead): Omit<RecommendedLead, "leadId" | "fullName" | "company" | "phone" | "priority" | "status" | "leadScore" | "callbackTime" | "assignedAgentName"> & {
  rank: number;
} {
  if (lead.callbackTime && isPast(lead.callbackTime)) {
    return {
      rank: 1100,
      reason: "Callback is overdue and needs immediate follow-up.",
      suggestedAction: "Reconnect now and reset the next step before the lead cools off.",
    };
  }

  if (lead.callbackTime && isToday(lead.callbackTime)) {
    return {
      rank: 980,
      reason: "Callback is due today.",
      suggestedAction: "Keep this lead in the front of the queue and close the loop this shift.",
    };
  }

  if (lead.status === "qualified" && lead.leadScore >= 75) {
    return {
      rank: 930,
      reason: "Qualified lead is showing strong buying intent.",
      suggestedAction: "Push for an appointment while the interest is still warm.",
    };
  }

  if (lead.status === "appointment_booked") {
    return {
      rank: 900,
      reason: "Appointment has been booked and needs confirmation.",
      suggestedAction: "Confirm attendance and lock in any prep details.",
    };
  }

  if (isHotLead(lead) && isUntouchedLead(lead)) {
    return {
      rank: 860,
      reason: "Hot lead has not received a first touch yet.",
      suggestedAction: "Move this to the top of the dialer and start the first conversation.",
    };
  }

  if (lead.status === "follow_up") {
    return {
      rank: 820,
      reason: "Lead is waiting on a follow-up step.",
      suggestedAction: "Review the last note, answer objections, and move the deal forward.",
    };
  }

  if (isUntouchedLead(lead)) {
    return {
      rank: 760,
      reason: "New lead is still untouched.",
      suggestedAction: "Make the first call and capture a clear summary immediately after.",
    };
  }

  if (lead.callHistory.length > 0 && lead.notesHistory.length === 0) {
    return {
      rank: 700,
      reason: "Conversation history exists but the lead has no notes.",
      suggestedAction: "Capture context on the next touch so the next rep is not blind.",
    };
  }

  return {
    rank: 540 + lead.leadScore,
    reason: "Lead is active in pipeline and ready for the next step.",
    suggestedAction: "Review context and keep it moving through the workflow.",
  };
}

export function getDispositionBreakdown(leads: ApiLead[], userId?: string) {
  const buckets = new Map<ApiCallDisposition, number>();

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
      (lead) => lead.callbackTime && !isPast(lead.callbackTime) && !isToday(lead.callbackTime),
    ).length,
  };
}

export function getAgentDashboardMetrics(
  leads: ApiLead[],
  userId: string,
): AgentDashboardMetrics {
  const scopedLeads = leads.filter((lead) => lead.assignedAgentId === userId);
  const todayCalls = scopedLeads.flatMap((lead) =>
    lead.callHistory.filter(
      (call) => call.agentId === userId && isToday(call.createdAt) && !isDiagnosticCall(call),
    ),
  );

  const connectedCalls = todayCalls.filter((call) => !missedDispositions.has(call.disposition));
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
    conversionRate: todayCalls.length ? Math.round((salesClosed / todayCalls.length) * 100) : 0,
    averageCallDuration,
    remainingLeads: scopedLeads.filter((lead) => openStatuses.has(lead.status)).length,
  };
}

export function getAdminDashboardMetrics(leads: ApiLead[]): AdminDashboardMetrics {
  const calls = leads.flatMap((lead) => lead.callHistory).filter((call) => !isDiagnosticCall(call));
  const connectedCalls = calls.filter((call) => !missedDispositions.has(call.disposition));
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
      connected: calls.filter((call) => !missedDispositions.has(call.disposition)).length,
    };
  });
}

export function getTopAgents(leads: ApiLead[], users: ApiUser[]): TopAgentDatum[] {
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

export function getFocusMetrics(leads: ApiLead[]): FocusMetric[] {
  return [
    {
      id: "due_today",
      label: "Callbacks due today",
      value: leads.filter(
        (lead) => lead.callbackTime && isToday(lead.callbackTime) && !isPast(lead.callbackTime),
      ).length,
      hint: "Callbacks and same-day follow-ups waiting in queue",
      tone: "blue",
    },
    {
      id: "overdue_callbacks",
      label: "Callbacks overdue",
      value: leads.filter((lead) => lead.callbackTime && isPast(lead.callbackTime)).length,
      hint: "Callbacks that slipped past their scheduled time",
      tone: "rose",
    },
    {
      id: "hot_leads",
      label: "Hot leads",
      value: leads.filter((lead) => isOpenLead(lead) && isHotLead(lead)).length,
      hint: "High-score or high-priority opportunities still open",
      tone: "amber",
    },
    {
      id: "untouched",
      label: "Untouched",
      value: leads.filter((lead) => isOpenLead(lead) && isUntouchedLead(lead)).length,
      hint: "Open leads without a first touch or context note yet",
      tone: "slate",
    },
  ];
}

export function getRecommendedLeads(leads: ApiLead[]): RecommendedLead[] {
  return leads
    .filter((lead) => isOpenLead(lead))
    .map((lead) => {
      const summary = summarizeLeadAction(lead);
      const callbackWeight = lead.callbackTime
        ? Math.max(0, 36 - hoursSince(lead.callbackTime))
        : 0;

      return {
        leadId: lead.id,
        fullName: lead.fullName,
        company: lead.company,
        phone: lead.phone,
        priority: lead.priority,
        status: lead.status,
        leadScore: lead.leadScore,
        callbackTime: lead.callbackTime,
        reason: summary.reason,
        suggestedAction: summary.suggestedAction,
        assignedAgentName: lead.assignedAgentName,
        rank:
          summary.rank +
          callbackWeight +
          (lead.priority === "Urgent" ? 30 : lead.priority === "High" ? 15 : 0),
      };
    })
    .sort((left, right) => right.rank - left.rank)
    .slice(0, 6)
    .map(({ rank: _rank, ...lead }) => lead);
}

export function getActivityFeed(leads: ApiLead[]): ActivityFeedItem[] {
  return leads
    .flatMap((lead) =>
      lead.activities.map((activity) => ({
        id: activity.id,
        leadId: lead.id,
        leadName: lead.fullName,
        type: activity.type,
        title: activity.title,
        description: activity.description,
        createdAt: activity.createdAt,
        actorName: activity.actorName,
      })),
    )
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .slice(0, 8);
}

export function getRiskMetrics(leads: ApiLead[]): RiskMetric[] {
  return [
    {
      id: "risk_overdue",
      label: "Overdue callbacks",
      value: leads.filter((lead) => lead.callbackTime && isPast(lead.callbackTime)).length,
      hint: "Leads that need to be recovered fast",
      tone: "rose",
    },
    {
      id: "risk_stale",
      label: "Stale leads",
      value: leads.filter((lead) => isStaleLead(lead)).length,
      hint: "Open leads with no recent movement in the last 48 hours",
      tone: "amber",
    },
    {
      id: "risk_notes",
      label: "Missing notes",
      value: leads.filter(
        (lead) => isOpenLead(lead) && lead.callHistory.length > 0 && lead.notesHistory.length === 0,
      ).length,
      hint: "Conversations happened, but context is still missing",
      tone: "blue",
    },
    {
      id: "risk_unassigned",
      label: "Unassigned",
      value: leads.filter((lead) => isOpenLead(lead) && !lead.assignedAgentId).length,
      hint: "Open leads not owned by any rep yet",
      tone: "slate",
    },
  ];
}

export function getDuplicateInsights(leads: ApiLead[]): DuplicateInsight[] {
  const phoneGroups = new Map<string, ApiLead[]>();
  const emailGroups = new Map<string, ApiLead[]>();

  leads.forEach((lead) => {
    const phoneKey = normalizePhone(lead.phone);
    if (phoneKey) {
      phoneGroups.set(phoneKey, [...(phoneGroups.get(phoneKey) ?? []), lead]);
    }

    const emailKey = normalizeEmail(lead.email);
    if (emailKey) {
      emailGroups.set(emailKey, [...(emailGroups.get(emailKey) ?? []), lead]);
    }
  });

  const duplicates: DuplicateInsight[] = [];

  phoneGroups.forEach((group, key) => {
    if (group.length < 2) {
      return;
    }

    duplicates.push({
      id: `phone:${key}`,
      matchType: "phone",
      value: group[0]?.phone ?? key,
      count: group.length,
      leadIds: group.map((lead) => lead.id),
      leadNames: group.map((lead) => lead.fullName),
    });
  });

  emailGroups.forEach((group, key) => {
    if (group.length < 2) {
      return;
    }

    duplicates.push({
      id: `email:${key}`,
      matchType: "email",
      value: group[0]?.email ?? key,
      count: group.length,
      leadIds: group.map((lead) => lead.id),
      leadNames: group.map((lead) => lead.fullName),
    });
  });

  return duplicates.sort((left, right) => right.count - left.count).slice(0, 6);
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
    adminMetrics: currentUser.role === "agent" ? null : getAdminDashboardMetrics(leads),
    callbackCounts: getCallbackCounts(leads, scopedUserId),
    performanceData: getDailyPerformance(leads, scopedUserId),
    dispositionData: getDispositionBreakdown(leads, scopedUserId),
    pipelineData: getPipelineSummary(leads),
    statusData: getLeadStatusDistribution(leads),
    topAgents: getTopAgents(leads, users),
    focusMetrics: getFocusMetrics(leads),
    recommendedLeads: getRecommendedLeads(leads),
    activityFeed: getActivityFeed(leads),
    riskMetrics: getRiskMetrics(leads),
    duplicateInsights: getDuplicateInsights(leads),
  };
}
