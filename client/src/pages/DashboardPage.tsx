import {
  CalendarClock,
  Clock3,
  PhoneCall,
  Target,
  Trophy,
  Users2,
} from "lucide-react";

import { BreakdownDonutChart } from "../components/charts/BreakdownDonutChart";
import { PerformanceChart } from "../components/charts/PerformanceChart";
import { PipelineBarChart } from "../components/charts/PipelineBarChart";
import { Badge } from "../components/shared/Badge";
import { Card } from "../components/shared/Card";
import { EmptyState } from "../components/shared/EmptyState";
import { PageHeader } from "../components/shared/PageHeader";
import { StatCard } from "../components/shared/StatCard";
import { useAppState } from "../hooks/useAppState";
import {
  formatDateTime,
  formatDuration,
  formatPhone,
  getInsightTone,
  getLeadStatusTone,
  getPriorityTone,
} from "../lib/utils";

export function DashboardPage() {
  const { currentUser, leads, analytics, workspaceLoading } = useAppState();

  if (!currentUser) {
    return null;
  }

  const isAgent = currentUser.role === "agent";
  const agentMetrics = analytics.agentMetrics;
  const adminMetrics = analytics.adminMetrics;
  const activeAssignedLeads = leads
    .filter((lead) => lead.assignedAgentId === currentUser.id)
    .slice(0, 4);
  const allCalls = leads.flatMap((lead) => lead.callHistory);
  const weeklyCalls = allCalls.filter(
    (call) => Date.now() - new Date(call.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000,
  ).length;
  const monthlyCalls = allCalls.filter(
    (call) => Date.now() - new Date(call.createdAt).getTime() <= 30 * 24 * 60 * 60 * 1000,
  ).length;
  const successfulCalls = allCalls.filter((call) => call.status === "connected").length;
  const completedFollowUps = leads.flatMap((lead) => lead.activities).filter(
    (activity) =>
      activity.type === "callback" && activity.description.toLowerCase().includes("completed"),
  ).length;
  const hasWorkspaceData = leads.length > 0 || allCalls.length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={isAgent ? "Agent Dashboard" : "Revenue Dashboard"}
        title={isAgent ? `Welcome back, ${currentUser.name.split(" ")[0]}` : "Team productivity at a glance"}
        description={
          isAgent
            ? "Calls, callbacks, risks, and the next leads to move right now."
            : "Live team performance, duplicate watch, and the next action queue."
        }
      />

      {!hasWorkspaceData ? (
        <EmptyState
          icon={Users2}
          title={workspaceLoading ? "Loading workspace" : "No CRM activity yet"}
          description={
            workspaceLoading
              ? "The dashboard is waiting for the latest CRM data."
              : isAgent
                ? "Assigned leads and call activity will appear here once the queue is populated."
                : "Import leads and assign them to agents to start generating call and follow-up metrics."
          }
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isAgent && agentMetrics ? (
          <>
            <StatCard
              title="Calls Made Today"
              value={String(agentMetrics.callsMadeToday)}
              hint={`${agentMetrics.connectedCalls} connected conversations`}
              icon={PhoneCall}
            />
            <StatCard
              title="Callbacks Scheduled"
              value={String(agentMetrics.callbacksScheduled)}
              hint={`${agentMetrics.remainingLeads} leads still active`}
              icon={CalendarClock}
            />
            <StatCard
              title="Appointments Booked"
              value={String(agentMetrics.appointmentsBooked)}
              hint={`${agentMetrics.salesClosed} sales closed`}
              icon={Target}
            />
            <StatCard
              title="Average Call Duration"
              value={formatDuration(agentMetrics.averageCallDuration)}
              hint={`${agentMetrics.conversionRate}% conversion rate`}
              icon={Clock3}
            />
          </>
        ) : null}

        {!isAgent && adminMetrics ? (
          <>
            <StatCard
              title="Total Team Calls"
              value={String(adminMetrics.totalTeamCalls)}
              hint={`${adminMetrics.connectedCalls} connected calls`}
              icon={Users2}
            />
            <StatCard
              title="Callback Completion"
              value={`${adminMetrics.callbackCompletionRate}%`}
              hint={`${analytics.callbackCounts.overdue} overdue callbacks`}
              icon={CalendarClock}
            />
            <StatCard
              title="Appointments Booked"
              value={String(adminMetrics.appointmentsBooked)}
              hint={`${adminMetrics.salesClosed} deals closed`}
              icon={Target}
            />
            <StatCard
              title="Average Call Duration"
              value={formatDuration(adminMetrics.averageCallDuration)}
              hint={`${adminMetrics.activeLeads} active leads in motion`}
              icon={Clock3}
            />
          </>
        ) : null}
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Weekly calls</p>
          <p className="mt-2 text-[24px] font-semibold text-slate-900 dark:text-white">{weeklyCalls}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Monthly calls</p>
          <p className="mt-2 text-[24px] font-semibold text-slate-900 dark:text-white">{monthlyCalls}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Conversion rate</p>
          <p className="mt-2 text-[24px] font-semibold text-slate-900 dark:text-white">
            {allCalls.length ? Math.round((successfulCalls / allCalls.length) * 100) : 0}%
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Completed follow-ups</p>
          <p className="mt-2 text-[24px] font-semibold text-slate-900 dark:text-white">{completedFollowUps}</p>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        {analytics.focusMetrics.map((metric) => (
          <Card key={metric.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {metric.label}
                </p>
                <p className="mt-2 text-[24px] font-semibold text-slate-900 dark:text-white">
                  {metric.value}
                </p>
                <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  {metric.hint}
                </p>
              </div>
              <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-medium ${getInsightTone(metric.tone)}`}>
                Focus
              </span>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Daily Performance
              </p>
              <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
                Calls vs connected
              </h3>
            </div>
            <Badge className="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
              Last 7 days
            </Badge>
          </div>
          <div className="mt-6">
            <PerformanceChart data={analytics.performanceData} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Action Queue
              </p>
              <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
                Work next
              </h3>
            </div>
            <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {analytics.recommendedLeads.length} prioritized
            </Badge>
          </div>
          <div className="mt-5 space-y-3">
            {analytics.recommendedLeads.length ? (
              analytics.recommendedLeads.map((lead) => (
                <div
                  key={lead.leadId}
                  className="rounded-[8px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-slate-900 dark:text-white">
                          {lead.fullName}
                        </p>
                        <Badge className={getPriorityTone(lead.priority)}>{lead.priority}</Badge>
                        <Badge className={getLeadStatusTone(lead.status)}>
                          {lead.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-[12px] text-slate-500 dark:text-slate-400">
                        {lead.company || "No company"} • {formatPhone(lead.phone)}
                      </p>
                      <p className="mt-2 text-[12px] font-medium text-slate-700 dark:text-slate-200">
                        {lead.reason}
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                        {lead.suggestedAction}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Score</p>
                      <p className="text-[18px] font-semibold text-slate-900 dark:text-white">
                        {lead.leadScore}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                No urgent work items in queue right now.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr_1fr]">
        <Card>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Disposition Breakdown
          </p>
          <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
            Outcomes
          </h3>
          <div className="mt-5">
            <BreakdownDonutChart data={analytics.dispositionData} />
          </div>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Pipeline Snapshot
          </p>
          <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
            Pipeline
          </h3>
          <div className="mt-5">
            <PipelineBarChart data={analytics.pipelineData} />
          </div>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            {isAgent ? "Assigned Leads" : "Top Performers"}
          </p>
          <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
            {isAgent ? "Priority leads on your desk" : "Agent leaderboard"}
          </h3>
          <div className="mt-5 space-y-3">
            {isAgent
              ? activeAssignedLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="rounded-[8px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {lead.fullName}
                          </p>
                          <Badge className={getPriorityTone(lead.priority)}>{lead.priority}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {lead.company} • {formatPhone(lead.phone)}
                        </p>
                      </div>
                      <Badge className={getLeadStatusTone(lead.status)}>
                        {lead.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </div>
                ))
              : analytics.topAgents.slice(0, 4).map((agent, index) => (
                  <div
                    key={agent.id}
                    className="rounded-[8px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-900 font-semibold text-white dark:bg-white dark:text-slate-900">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {agent.name}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {agent.calls} calls • {agent.conversions} conversions
                          </p>
                        </div>
                      </div>
                      <Trophy size={18} className="text-amber-500" />
                    </div>
                  </div>
                ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Recent CRM Activity
              </p>
              <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
                Latest movement
              </h3>
            </div>
            <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Live feed
            </Badge>
          </div>
          <div className="mt-5 space-y-3">
            {analytics.activityFeed.length ? (
              analytics.activityFeed.map((activity) => (
                <div
                  key={activity.id}
                  className="rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {activity.title}
                      </p>
                      <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                        {activity.leadName} • {activity.actorName}
                      </p>
                      <p className="mt-2 text-[12px] leading-5 text-slate-600 dark:text-slate-300">
                        {activity.description || "Activity logged on this lead."}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDateTime(activity.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                Activity will appear here as calls, notes, and callbacks are logged.
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Pipeline Risks
            </p>
            <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
              What needs attention
            </h3>
            <div className="mt-5 space-y-3">
              {analytics.riskMetrics.map((risk) => (
                <div
                  key={risk.id}
                  className="rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-medium text-slate-700 dark:text-slate-200">
                        {risk.label}
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                        {risk.hint}
                      </p>
                    </div>
                    <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-medium ${getInsightTone(risk.tone)}`}>
                      {risk.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Duplicate Watch
            </p>
            <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
              Possible duplicate records
            </h3>
            <div className="mt-5 space-y-3">
              {analytics.duplicateInsights.length ? (
                analytics.duplicateInsights.slice(0, 4).map((group) => (
                  <div
                    key={group.id}
                    className="rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12px] font-medium text-slate-900 dark:text-white">
                        {group.matchType === "phone" ? "Phone match" : "Email match"}
                      </p>
                      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                        {group.count} records
                      </Badge>
                    </div>
                    <p className="mt-2 text-[12px] text-slate-600 dark:text-slate-300">
                      {group.value}
                    </p>
                    <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                      {group.leadNames.join(", ")}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  No duplicate patterns detected in the visible workspace.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
