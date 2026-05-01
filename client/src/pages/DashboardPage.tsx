import { AlarmClock, Clock3, PhoneCall, Users2 } from "lucide-react";

import { BreakdownDonutChart } from "../components/charts/BreakdownDonutChart";
import { PerformanceChart } from "../components/charts/PerformanceChart";
import { Badge } from "../components/shared/Badge";
import { Card } from "../components/shared/Card";
import { EmptyState } from "../components/shared/EmptyState";
import { MetricCard } from "../components/shared/MetricCard";
import { PageHeader } from "../components/shared/PageHeader";
import { useAppState } from "../hooks/useAppState";
import { formatDateTime, formatDuration, getInsightTone } from "../lib/utils";

export function DashboardPage() {
  const { currentUser, leads, analytics, workspaceLoading } = useAppState();

  if (!currentUser) {
    return null;
  }

  const isAgent = currentUser.role === "agent";
  const agentMetrics = analytics.agentMetrics;
  const adminMetrics = analytics.adminMetrics;
  const allCalls = leads
    .flatMap((lead) => lead.callHistory)
    .filter((call) => call.source !== "failed_attempt" && call.status !== "failed");
  const hasWorkspaceData = leads.length > 0 || allCalls.length > 0;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const todayCalls = allCalls.filter((call) => new Date(call.createdAt) >= startOfToday).length;
  const weekCalls = allCalls.filter((call) => new Date(call.createdAt) >= startOfWeek).length;
  const monthCalls = allCalls.filter((call) => new Date(call.createdAt) >= startOfMonth).length;

  const averageDurationValue =
    (isAgent ? agentMetrics?.averageCallDuration : adminMetrics?.averageCallDuration) ??
    (allCalls.length
      ? Math.round(
          allCalls.reduce((total, call) => total + call.durationSeconds, 0) / allCalls.length,
        )
      : 0);

  const visibleFocusMetrics = analytics.focusMetrics.filter((metric) => metric.label !== "Hot leads");
  const focusGridColumns =
    visibleFocusMetrics.length >= 4
      ? "xl:grid-cols-4"
      : visibleFocusMetrics.length === 3
        ? "xl:grid-cols-3"
        : "xl:grid-cols-2";

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
        {[
          { label: "Today", value: String(todayCalls), icon: PhoneCall },
          { label: "This week", value: String(weekCalls), icon: Users2 },
          { label: "This month", value: String(monthCalls), icon: AlarmClock },
          { label: "Average duration", value: formatDuration(averageDurationValue), icon: Clock3 },
        ].map((item) => (
          <MetricCard
            key={item.label}
            label={item.label}
            value={item.value}
            icon={item.icon}
          />
        ))}
      </div>

      <div className={`grid gap-3 md:grid-cols-2 ${focusGridColumns}`}>
        {visibleFocusMetrics.map((metric) => (
          <MetricCard
            key={metric.id}
            label={metric.label}
            value={metric.value}
            hint={metric.hint}
            className="p-4"
            valueClassName="mt-3 text-[26px]"
            action={
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${getInsightTone(metric.tone)}`}
              >
                Focus
              </span>
            }
          />
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="crm-section-label">
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

        <Card className="p-5">
          <p className="crm-section-label">
            Disposition Breakdown
          </p>
          <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
            Outcomes
          </h3>
          <div className="mt-5">
            <BreakdownDonutChart data={analytics.dispositionData} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="crm-section-label">
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
                  className="crm-subtle-card px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {activity.title}
                      </p>
                      <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                        {activity.leadName} | {activity.actorName}
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
      </div>
    </div>
  );
}
