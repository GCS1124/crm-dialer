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
import { PageHeader } from "../components/shared/PageHeader";
import { StatCard } from "../components/shared/StatCard";
import { useAppState } from "../hooks/useAppState";
import { formatDuration, formatPhone, getLeadStatusTone } from "../lib/utils";

export function DashboardPage() {
  const { currentUser, leads, analytics } = useAppState();

  if (!currentUser) {
    return null;
  }

  const isAgent = currentUser.role === "agent";
  const agentMetrics = analytics.agentMetrics;
  const adminMetrics = analytics.adminMetrics;
  const activeAssignedLeads = leads
    .filter((lead) => lead.assignedAgentId === currentUser.id)
    .slice(0, 4);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={isAgent ? "Agent Dashboard" : "Revenue Dashboard"}
        title={
          isAgent
            ? `Welcome back, ${currentUser.name.split(" ")[0]}`
            : "Team productivity at a glance"
        }
        description={
          isAgent
            ? "Your calls, callbacks, and next leads."
            : "Live team performance."
        }
      />

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

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
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
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Callback Queue
          </p>
          <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
            Follow-ups
          </h3>
          <div className="mt-6 space-y-4">
            {[
              { label: "Today", value: analytics.callbackCounts.today },
              { label: "Overdue", value: analytics.callbackCounts.overdue },
              { label: "Upcoming", value: analytics.callbackCounts.upcoming },
            ].map((bucket) => (
              <div
                key={bucket.label}
                className="rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                    {bucket.label}
                  </p>
                  <p className="text-[28px] font-semibold text-slate-900 dark:text-white">
                    {bucket.value}
                  </p>
                </div>
              </div>
            ))}
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
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {lead.fullName}
                        </p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {lead.company} - {formatPhone(lead.phone)}
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
                            {agent.calls} calls - {agent.conversions} conversions
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
    </div>
  );
}
