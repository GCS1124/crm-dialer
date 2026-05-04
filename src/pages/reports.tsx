import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { queryKeys } from "@/lib/query-keys";
import { getReportSummary } from "@/services/reports";

export function ReportsPage() {
  const reportQuery = useQuery({
    queryKey: queryKeys.reports.summary,
    queryFn: getReportSummary,
  });

  const report = reportQuery.data;

  return (
    <div className="grid h-full gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Rolling 30-day totals</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Total calls</p>
            <p className="mt-2 text-3xl font-semibold">{report?.totalCalls ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Active lists</p>
            <p className="mt-2 text-3xl font-semibold">{report?.activeLists ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Archived lists</p>
            <p className="mt-2 text-3xl font-semibold">{report?.archivedLists ?? 0}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Disposition breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(report?.outcomeMap ?? {}).length ? (
            Object.entries(report?.outcomeMap ?? {}).map(([label, count]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-xl border border-border/70 bg-background/70 px-4 py-3"
              >
                <span className="text-sm font-medium capitalize">{label.replaceAll("_", " ")}</span>
                <span className="text-lg font-semibold">{count}</span>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              No call logs yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
