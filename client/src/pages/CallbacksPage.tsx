import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { EmptyState } from "../components/shared/EmptyState";
import { MetricCard } from "../components/shared/MetricCard";
import { PageHeader } from "../components/shared/PageHeader";
import { useAppState } from "../hooks/useAppState";
import { getCallbackBuckets } from "../lib/analytics";
import {
  cn,
  formatDate,
  formatDateTime,
  getLeadStatusTone,
  getPriorityTone,
  isPast,
  isToday,
  toDatetimeLocalInput,
} from "../lib/utils";
import type { Lead, LeadPriority } from "../types";

const priorities: LeadPriority[] = ["Low", "Medium", "High", "Urgent"];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ViewMode = "list" | "calendar";

interface CalendarEvent {
  id: string;
  leadId: string;
  leadName: string;
  title: string;
  date: string;
  tone: "red" | "yellow" | "green" | "blue";
  kind: "follow_up" | "completed" | "call";
}

function toneClass(tone: CalendarEvent["tone"]) {
  if (tone === "red") {
    return "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300";
  }
  if (tone === "yellow") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300";
  }
  if (tone === "green") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300";
  }
  return "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300";
}

function monthDays(baseDate: Date) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - start.getDay());

  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return {
      key: day.toISOString(),
      date: day,
      inMonth: day.getMonth() === baseDate.getMonth(),
      isToday: isToday(day.toISOString()),
    };
  });

  return {
    label: new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(baseDate),
    days,
    totalDays: end.getDate(),
  };
}

function buildCalendarEvents(leads: Lead[]) {
  const events: CalendarEvent[] = [];

  leads.forEach((lead) => {
    if (lead.callbackTime) {
      events.push({
        id: `callback:${lead.id}:${lead.callbackTime}`,
        leadId: lead.id,
        leadName: lead.fullName,
        title: "Follow-up",
        date: lead.callbackTime,
        tone: isPast(lead.callbackTime) ? "red" : isToday(lead.callbackTime) ? "yellow" : "blue",
        kind: "follow_up",
      });
    }

    lead.activities.forEach((activity) => {
      if (
        activity.type === "callback" &&
        activity.description.toLowerCase().includes("completed")
      ) {
        events.push({
          id: `completed:${activity.id}`,
          leadId: lead.id,
          leadName: lead.fullName,
          title: "Completed",
          date: activity.createdAt,
          tone: "green",
          kind: "completed",
        });
      }
    });

    lead.callHistory.forEach((call) => {
      events.push({
        id: `call:${call.id}`,
        leadId: lead.id,
        leadName: lead.fullName,
        title: call.callType === "incoming" ? "Incoming call" : "Outgoing call",
        date: call.createdAt,
        tone: "blue",
        kind: "call",
      });
    });
  });

  return events.sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}

export function CallbacksPage() {
  const {
    currentUser,
    leads,
    rescheduleCallback,
    markCallbackCompleted,
    reopenLead,
    analytics,
    workspaceLoading,
  } = useAppState();
  const [rescheduleMap, setRescheduleMap] = useState<Record<string, string>>({});
  const [priorityMap, setPriorityMap] = useState<Record<string, LeadPriority>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [monthCursor, setMonthCursor] = useState(() => new Date());

  if (!currentUser) {
    return null;
  }

  const scopedUserId = currentUser.role === "agent" ? currentUser.id : undefined;
  const scopedLeads =
    currentUser.role === "agent"
      ? leads.filter((lead) => lead.assignedAgentId === currentUser.id)
      : leads;
  const buckets = getCallbackBuckets(leads, scopedUserId);
  const allCallbacks = [...buckets.today, ...buckets.overdue, ...buckets.upcoming];
  const calendar = monthDays(monthCursor);
  const events = useMemo(() => buildCalendarEvents(scopedLeads), [scopedLeads]);

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      return;
    }

    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  };

  const renderList = (title: string, description: string, items: typeof allCallbacks) => (
    <Card className="space-y-5 p-5">
      <div>
        <p className="crm-section-label">{title}</p>
        <h3 className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-white">
          {description}
        </h3>
      </div>
      <div className="space-y-4">
        {items.length ? (
          items.map((lead) => (
            <div
              key={lead.id}
              className={cn(
                "rounded-[8px] border p-5",
                title === "Overdue"
                  ? "border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-950/20"
                  : title === "Today"
                    ? "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-950/20"
                    : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900",
              )}
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getPriorityTone(lead.priority)}>{lead.priority}</Badge>
                    <Badge className={getLeadStatusTone(lead.status)}>
                      {lead.status.replace("_", " ")}
                    </Badge>
                    <Badge className={toneClass(title === "Overdue" ? "red" : title === "Today" ? "yellow" : "blue")}>
                      {title}
                    </Badge>
                  </div>
                  <h4 className="mt-3 text-[16px] font-semibold text-slate-900 dark:text-white">
                    {lead.fullName}
                  </h4>
                  <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                    {lead.company} • {lead.assignedAgentName} • {formatDateTime(lead.callbackTime)}
                  </p>
                  <p className="mt-3 text-[12px] text-slate-600 dark:text-slate-300">
                    {lead.notes || "No notes saved for this follow-up yet."}
                  </p>
                </div>

                <div className="grid gap-3 rounded-[16px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 xl:min-w-[360px]">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "+1h", value: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
                      { label: "Tomorrow 9:30", value: (() => {
                        const date = new Date();
                        date.setDate(date.getDate() + 1);
                        date.setHours(9, 30, 0, 0);
                        return date.toISOString();
                      })() },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() =>
                          setRescheduleMap((existing) => ({
                            ...existing,
                            [lead.id]: toDatetimeLocalInput(item.value),
                          }))
                        }
                        className="rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="datetime-local"
                    value={rescheduleMap[lead.id] ?? toDatetimeLocalInput(lead.callbackTime)}
                    onChange={(event) =>
                      setRescheduleMap((existing) => ({
                        ...existing,
                        [lead.id]: event.target.value,
                      }))
                    }
                    className="crm-input"
                  />
                  <select
                    value={priorityMap[lead.id] ?? lead.priority}
                    onChange={(event) =>
                      setPriorityMap((existing) => ({
                        ...existing,
                        [lead.id]: event.target.value as LeadPriority,
                      }))
                    }
                    className="crm-input"
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
                      onClick={async () => {
                        try {
                          await rescheduleCallback(
                            lead.id,
                            new Date(
                              rescheduleMap[lead.id] ?? toDatetimeLocalInput(lead.callbackTime),
                            ).toISOString(),
                            priorityMap[lead.id] ?? lead.priority,
                          );
                          toast.success("Follow-up rescheduled.");
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Unable to reschedule this follow-up.",
                          );
                        }
                      }}
                    >
                      <CalendarClock size={16} />
                      Reschedule
                    </Button>
                    <Button
                      variant="primary"
                      onClick={async () => {
                        try {
                          await markCallbackCompleted(lead.id);
                          toast.success("Follow-up marked completed.");
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Unable to complete this follow-up.",
                          );
                        }
                      }}
                    >
                      <CheckCircle2 size={16} />
                      Mark completed
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await reopenLead(lead.id);
                          toast.success("Lead reopened.");
                        } catch (error) {
                          toast.error(
                            error instanceof Error ? error.message : "Unable to reopen this lead.",
                          );
                        }
                      }}
                    >
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
        eyebrow="Follow-Ups"
        title="Follow-up center"
        description="Track calls and follow-ups in list or calendar view so nothing slips."
        actions={
          <>
            <Button variant="secondary" onClick={() => void requestNotifications()}>
              <BellRing size={16} />
              Enable reminders
            </Button>
            <div className="flex rounded-md border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] font-medium",
                  viewMode === "list"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-600 dark:text-slate-300",
                )}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setViewMode("calendar")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] font-medium",
                  viewMode === "calendar"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-600 dark:text-slate-300",
                )}
              >
                Calendar
              </button>
            </div>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Today's follow-ups" value={analytics.callbackCounts.today} icon={CalendarClock} />
        <MetricCard label="Overdue follow-ups" value={analytics.callbackCounts.overdue} icon={BellRing} />
        <MetricCard label="Upcoming follow-ups" value={analytics.callbackCounts.upcoming} icon={CheckCircle2} />
      </div>

      {viewMode === "list" ? (
        allCallbacks.length ? (
          <div className="space-y-5">
            {renderList("Today", "Follow-ups due today", buckets.today)}
            {renderList("Overdue", "Follow-ups needing immediate recovery", buckets.overdue)}
            {renderList("Upcoming", "Scheduled follow-ups on deck", buckets.upcoming)}
          </div>
        ) : (
          <EmptyState
            icon={BellRing}
            title={workspaceLoading ? "Loading follow-ups" : "No follow-ups scheduled"}
            description={
              workspaceLoading
                ? "The CRM is loading scheduled follow-ups."
                : "As agents log callback outcomes, this workspace will organize due and overdue follow-ups automatically."
            }
          />
        )
      ) : (
        <Card className="space-y-5 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="crm-section-label">Calendar</p>
              <h3 className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-white">
                {calendar.label}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  setMonthCursor(
                    (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                  )
                }
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  setMonthCursor(
                    (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                  )
                }
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {weekdays.map((day) => (
              <div key={day} className="px-2 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {day}
              </div>
            ))}
            {calendar.days.map((day) => {
              const dayEvents = events.filter((event) => formatDate(event.date) === formatDate(day.date.toISOString()));
              return (
                <div
                  key={day.key}
                  className={cn(
                    "min-h-[120px] rounded-[8px] border p-2",
                    day.inMonth
                      ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
                      : "border-slate-200/60 bg-slate-50 dark:border-slate-800 dark:bg-slate-900",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium",
                        day.isToday
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : "text-slate-600 dark:text-slate-300",
                      )}
                    >
                      {day.date.getDate()}
                    </span>
                    {dayEvents.length ? (
                      <span className="text-[10px] text-slate-400">{dayEvents.length}</span>
                    ) : null}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {dayEvents.slice(0, 3).map((event) => (
                      <div
                        key={event.id}
                        className={`rounded-md px-2 py-1 text-[10px] font-medium ${toneClass(event.tone)}`}
                        title={`${event.leadName} • ${event.title}`}
                      >
                        <p className="truncate">{event.title}</p>
                        <p className="truncate opacity-80">{event.leadName}</p>
                      </div>
                    ))}
                    {dayEvents.length > 3 ? (
                      <p className="text-[10px] text-slate-400">+{dayEvents.length - 3} more</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 text-[11px]">
            {[
              ["Overdue", "red"],
              ["Today", "yellow"],
              ["Completed", "green"],
              ["Calls", "blue"],
            ].map(([label, tone]) => (
              <span
                key={label}
                className={`inline-flex items-center gap-2 rounded-md px-2 py-1 ${toneClass(tone as CalendarEvent["tone"])}`}
              >
                <span>{label}</span>
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
