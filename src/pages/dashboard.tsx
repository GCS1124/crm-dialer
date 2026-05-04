import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Clock3,
  FileStack,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOutgoing,
} from "lucide-react";
import { RecentActivityPanel } from "@/components/dashboard/recent-activity-panel";
import { PerformanceSnapshot } from "@/components/dashboard/performance-snapshot";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { queryKeys } from "@/lib/query-keys";
import { getDashboardSummary } from "@/services/dashboard";

export function DashboardPage() {
  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboard.summary,
    queryFn: getDashboardSummary,
  });

  const summary = summaryQuery.data;

  return (
    <div className="flex h-full flex-col gap-6 overflow-hidden">
      <div className="grid gap-4 xl:grid-cols-6">
        <SummaryCard
          label="Total imports"
          value={summary?.totalImports ?? 0}
          detail="All uploaded files"
          icon={<FileStack className="size-4" />}
        />
        <SummaryCard
          label="Pending"
          value={summary?.pendingCallers ?? 0}
          detail="Ready in queue"
          icon={<PhoneIncoming className="size-4" />}
        />
        <SummaryCard
          label="In progress"
          value={summary?.inProgressCallers ?? 0}
          detail="Currently being worked"
          icon={<PhoneOutgoing className="size-4" />}
        />
        <SummaryCard
          label="Completed"
          value={summary?.completedCallers ?? 0}
          detail="Closed this cycle"
          icon={<PhoneForwarded className="size-4" />}
        />
        <SummaryCard
          label="Callbacks due"
          value={summary?.callbacksDue ?? 0}
          detail="Require attention"
          icon={<Clock3 className="size-4" />}
        />
        <SummaryCard
          label="Invalid rows"
          value={summary?.invalidRowsRecent ?? 0}
          detail="Recent import issues"
          icon={<AlertCircle className="size-4" />}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <RecentActivityPanel items={summary?.recentActivity ?? []} />
        <PerformanceSnapshot
          performance={
            summary?.performance ?? {
              callsToday: 0,
              connected: 0,
              interested: 0,
              completionRate: 0,
            }
          }
        />
      </div>
    </div>
  );
}
