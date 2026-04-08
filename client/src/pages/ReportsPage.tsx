import { Badge } from "../components/shared/Badge";
import { Card } from "../components/shared/Card";
import { PageHeader } from "../components/shared/PageHeader";
import { BreakdownDonutChart } from "../components/charts/BreakdownDonutChart";
import { PerformanceChart } from "../components/charts/PerformanceChart";
import { PipelineBarChart } from "../components/charts/PipelineBarChart";
import { useAppState } from "../hooks/useAppState";
import { formatDuration, getInsightTone } from "../lib/utils";

export function ReportsPage() {
  const { analytics } = useAppState();
  const metrics = analytics.adminMetrics;

  if (!metrics) {
    return null;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Reports"
        title="Outbound performance reporting"
        description="Team calls, outcomes, and conversions."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">Total team calls</p>
          <p className="mt-3 text-[30px] font-semibold text-slate-900 dark:text-white">
            {metrics.totalTeamCalls}
          </p>
        </Card>
        <Card>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">Connected calls</p>
          <p className="mt-3 text-[30px] font-semibold text-slate-900 dark:text-white">
            {metrics.connectedCalls}
          </p>
        </Card>
        <Card>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">Callback completion</p>
          <p className="mt-3 text-[30px] font-semibold text-slate-900 dark:text-white">
            {metrics.callbackCompletionRate}%
          </p>
        </Card>
        <Card>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">Average duration</p>
          <p className="mt-3 text-[30px] font-semibold text-slate-900 dark:text-white">
            {formatDuration(metrics.averageCallDuration)}
          </p>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.95fr]">
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Daily Productivity
              </p>
              <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
                Calls by day
              </h3>
            </div>
            <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Team-wide
            </Badge>
          </div>
          <div className="mt-6">
            <PerformanceChart data={analytics.performanceData} />
          </div>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Disposition Breakdown
          </p>
          <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
            Outcome mix
          </h3>
          <div className="mt-5">
            <BreakdownDonutChart data={analytics.dispositionData} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Lead Status Distribution
          </p>
          <div className="mt-5 space-y-3">
            {analytics.statusData.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-[12px] font-medium capitalize text-slate-700 dark:text-slate-200">
                  {item.label.replace("_", " ")}
                </p>
                <p className="text-[24px] font-semibold text-slate-900 dark:text-white">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Pipeline Overview
          </p>
          <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
            Pipeline
          </h3>
          <div className="mt-5">
            <PipelineBarChart data={analytics.pipelineData} />
          </div>
        </Card>
      </div>

      <Card>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Agent-wise performance
        </p>
        <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
          Top performing agents
        </h3>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Calls</th>
                <th className="px-4 py-3">Conversions</th>
                <th className="px-4 py-3">Callback completion</th>
              </tr>
            </thead>
            <tbody>
              {analytics.topAgents.map((agent) => (
                <tr
                  key={agent.id}
                  className="border-t border-slate-200/80 dark:border-slate-800"
                >
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-900 dark:text-white">{agent.name}</p>
                    <p className="text-slate-500 dark:text-slate-400">{agent.role}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{agent.calls}</td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    {agent.conversions}
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    {agent.callbackCompletionRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Pipeline Risks
          </p>
          <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
            Attention areas
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
            Potential duplicate records
          </h3>
          <div className="mt-5 space-y-3">
            {analytics.duplicateInsights.length ? (
              analytics.duplicateInsights.map((group) => (
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
                No duplicate records detected across the current report scope.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
