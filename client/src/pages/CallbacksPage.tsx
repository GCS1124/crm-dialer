import { BellRing, CalendarClock, CheckCircle2, RotateCcw } from "lucide-react";
import { useState } from "react";

import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { EmptyState } from "../components/shared/EmptyState";
import { PageHeader } from "../components/shared/PageHeader";
import { useAppState } from "../hooks/useAppState";
import { getCallbackBuckets } from "../lib/analytics";
import {
  formatDateTime,
  getLeadStatusTone,
  getPriorityTone,
  toDatetimeLocalInput,
} from "../lib/utils";
import type { LeadPriority } from "../types";

const priorities: LeadPriority[] = ["Low", "Medium", "High", "Urgent"];

export function CallbacksPage() {
  const { currentUser, leads, rescheduleCallback, markCallbackCompleted, reopenLead, analytics } =
    useAppState();
  const [rescheduleMap, setRescheduleMap] = useState<Record<string, string>>({});
  const [priorityMap, setPriorityMap] = useState<Record<string, LeadPriority>>({});

  if (!currentUser) {
    return null;
  }

  const scopedUserId = currentUser.role === "agent" ? currentUser.id : undefined;
  const buckets = getCallbackBuckets(leads, scopedUserId);
  const allCallbacks = [...buckets.today, ...buckets.overdue, ...buckets.upcoming];

  const renderList = (title: string, description: string, items: typeof allCallbacks) => (
    <Card className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          {title}
        </p>
        <h3 className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-white">{description}</h3>
      </div>
      <div className="space-y-4">
        {items.length ? (
          items.map((lead) => (
            <div key={lead.id} className="rounded-[8px] border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getPriorityTone(lead.priority)}>{lead.priority}</Badge>
                    <Badge className={getLeadStatusTone(lead.status)}>
                      {lead.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <h4 className="mt-3 text-[16px] font-semibold text-slate-900 dark:text-white">
                    {lead.fullName}
                  </h4>
                  <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                    {lead.company} - {lead.assignedAgentName} - {formatDateTime(lead.callbackTime)}
                  </p>
                  <p className="mt-3 text-[12px] text-slate-600 dark:text-slate-300">{lead.notes}</p>
                </div>

                <div className="grid gap-3 rounded-[8px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 xl:min-w-[320px]">
                  <input
                    type="datetime-local"
                    value={rescheduleMap[lead.id] ?? toDatetimeLocalInput(lead.callbackTime)}
                    onChange={(event) =>
                      setRescheduleMap((existing) => ({
                        ...existing,
                        [lead.id]: event.target.value,
                      }))
                    }
                    className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                  />
                  <select
                    value={priorityMap[lead.id] ?? lead.priority}
                    onChange={(event) =>
                      setPriorityMap((existing) => ({
                        ...existing,
                        [lead.id]: event.target.value as LeadPriority,
                      }))
                    }
                    className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                  >
                    {priorities.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void rescheduleCallback(
                          lead.id,
                          new Date(
                            rescheduleMap[lead.id] ?? toDatetimeLocalInput(lead.callbackTime),
                          ).toISOString(),
                          priorityMap[lead.id] ?? lead.priority,
                        )
                      }
                    >
                      <CalendarClock size={16} />
                      Reschedule
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => void markCallbackCompleted(lead.id)}
                    >
                      <CheckCircle2 size={16} />
                      Mark completed
                    </Button>
                    <Button variant="ghost" onClick={() => void reopenLead(lead.id)}>
                      <RotateCcw size={16} />
                      Reopen lead
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            No callbacks in this bucket right now.
          </div>
        )}
      </div>
    </Card>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Callbacks"
        title="Follow-up center"
        description="Due, overdue, and upcoming follow-ups."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">Today's callbacks</p>
          <p className="mt-3 text-[30px] font-semibold text-slate-900 dark:text-white">{analytics.callbackCounts.today}</p>
        </Card>
        <Card>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">Overdue callbacks</p>
          <p className="mt-3 text-[30px] font-semibold text-slate-900 dark:text-white">{analytics.callbackCounts.overdue}</p>
        </Card>
        <Card>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">Upcoming follow-ups</p>
          <p className="mt-3 text-[30px] font-semibold text-slate-900 dark:text-white">{analytics.callbackCounts.upcoming}</p>
        </Card>
      </div>

      {allCallbacks.length ? (
        <div className="space-y-5">
          {renderList("Today", "Callbacks due today", buckets.today)}
          {renderList("Overdue", "Callbacks needing immediate recovery", buckets.overdue)}
          {renderList("Upcoming", "Scheduled follow-ups on deck", buckets.upcoming)}
        </div>
      ) : (
        <EmptyState
          icon={BellRing}
          title="No callbacks scheduled"
          description="As agents log callback outcomes, this workspace will automatically organize due and overdue follow-ups."
        />
      )}
    </div>
  );
}
