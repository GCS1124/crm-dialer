import {
  AlertTriangle,
  PhoneCall,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AlertBanner } from "../components/shared/AlertBanner";
import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { EmptyState } from "../components/shared/EmptyState";
import { MetricCard } from "../components/shared/MetricCard";
import { PageHeader } from "../components/shared/PageHeader";
import { useAppState } from "../hooks/useAppState";
import {
  formatDateTime,
  formatDuration,
  formatPhone,
  getSentimentTone,
  isToday,
  toDatetimeLocalInput,
} from "../lib/utils";
import type { CallLog, CallLogFormInput, CallType, LeadPriority } from "../types";

const noteTemplates = [
  "Asked for pricing and wants a follow-up this week.",
  "Reached voicemail. Retry during business hours.",
  "Interested in a demo. Needs schedule options.",
  "Not the decision maker. Need the right contact.",
];

type CallViewFilter = "all" | "today" | "pending" | "priority";

function buildAiPreview(notes: string, callbackAt: string) {
  const text = notes.toLowerCase();
  const sentiment = text.includes("interested") || text.includes("demo") || text.includes("pricing")
    ? "positive"
    : text.includes("not interested") || text.includes("wrong number") || text.includes("angry")
      ? "negative"
      : "neutral";

  const summary =
    notes.trim().split(/\r?\n/).find(Boolean)?.trim().slice(0, 140) ||
    "Capture the call context and the next step.";

  const nextAction =
    callbackAt
      ? "Keep this in the follow-up queue and reconnect at the scheduled time."
      : sentiment === "positive"
        ? "Push toward a demo, appointment, or next concrete step."
        : sentiment === "negative"
          ? "Review objections and decide whether to nurture or close out."
          : "Capture a clear next step and keep the lead moving.";

  return { summary, sentiment, nextAction };
}

function toFormInput(call?: CallLog): CallLogFormInput {
  if (!call) {
    return {
      leadId: "",
      callType: "outgoing",
      durationSeconds: 180,
      status: "connected",
      notes: "",
      callbackAt: "",
      priority: "Medium",
    };
  }

  return {
    leadId: call.leadId,
    callType: call.callType,
    durationSeconds: call.durationSeconds,
    status: call.status,
    notes: call.notes,
    callbackAt: call.followUpAt ?? "",
    priority: "Medium",
  };
}

export function CallsPage() {
  const {
    leads,
    currentUser,
    createCallLog,
    updateCallLog,
    deleteCallLog,
    workspaceLoading,
  } = useAppState();
  const [query, setQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<CallViewFilter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCall, setEditingCall] = useState<CallLog | null>(null);
  const [form, setForm] = useState<CallLogFormInput>(toFormInput());
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");

  const calls = useMemo(
    () =>
      leads
        .flatMap((lead) => lead.callHistory)
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        ),
    [leads],
  );
  const normalCalls = useMemo(
    () => calls.filter((call) => call.source !== "failed_attempt" && call.status !== "failed"),
    [calls],
  );
  const failedAttemptCount = calls.length - normalCalls.length;

  const filteredCalls = useMemo(() => {
    const lowered = query.trim().toLowerCase();

    return calls.filter((call) => {
      const matchesQuery =
        !lowered ||
        [call.leadName, call.phone, call.agentName, call.notes, call.aiSummary]
          .join(" ")
          .toLowerCase()
          .includes(lowered);

      const lead = leads.find((item) => item.id === call.leadId);
      const matchesView =
        viewFilter === "all"
          ? true
          : viewFilter === "today"
            ? isToday(call.createdAt)
            : viewFilter === "pending"
              ? call.status === "follow_up" || Boolean(call.followUpAt)
              : lead?.priority === "High" || lead?.priority === "Urgent";

      return matchesQuery && matchesView;
    });
  }, [calls, leads, query, viewFilter]);

  const todayCalls = normalCalls.filter((call) => isToday(call.createdAt)).length;
  const weekCalls = normalCalls.filter(
    (call) => Date.now() - new Date(call.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000,
  ).length;
  const monthCalls = normalCalls.filter(
    (call) => Date.now() - new Date(call.createdAt).getTime() <= 30 * 24 * 60 * 60 * 1000,
  ).length;
  const hasFilters = Boolean(query.trim()) || viewFilter !== "all";

  const aiPreview = buildAiPreview(form.notes, form.callbackAt);
  const activeLead = leads.find((lead) => lead.id === form.leadId);
  const openCreate = () => {
    const defaultLeadId = leads[0]?.id ?? "";
    setEditingCall(null);
    setForm({ ...toFormInput(), leadId: defaultLeadId });
    setEditorError("");
    setEditorOpen(true);
  };

  const openEdit = (call: CallLog) => {
    setEditingCall(call);
    setForm(toFormInput(call));
    setEditorError("");
    setEditorOpen(true);
  };

  const clearFilters = () => {
    setQuery("");
    setViewFilter("all");
  };

  const handleDeleteCall = async (callId: string) => {
    try {
      await deleteCallLog(callId);
      toast.success("Call log deleted.");
      setEditorOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete the call log.");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Call Management"
        title="Calls workspace"
        description="Log calls, keep summaries clean, and convert follow-ups into next actions."
        actions={
          <Button onClick={openCreate}>
            <Plus size={16} />
            Quick add call
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Today" value={todayCalls} icon={PhoneCall} />
        <MetricCard label="This week" value={weekCalls} icon={Search} />
        <MetricCard label="This month" value={monthCalls} icon={Plus} />
        <MetricCard
          label="Failed attempts"
          value={String(failedAttemptCount)}
          icon={AlertTriangle}
        />
      </div>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["all", "All calls"],
            ["today", "Today's calls"],
            ["pending", "Pending follow-ups"],
            ["priority", "High priority leads"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setViewFilter(value as CallViewFilter)}
              className={
                value === viewFilter
                  ? "rounded-md bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white dark:bg-white dark:text-slate-900"
                  : "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
              }
            >
              {label}
            </button>
          ))}
        </div>

        <label className="relative block">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search calls by contact, phone, notes, or summary"
            className="crm-input py-3 pl-11"
          />
        </label>
      </Card>

      {filteredCalls.length ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="crm-table min-w-[790px] text-[12px]">
              <thead>
                <tr>
                  <th className="w-[180px]">Lead</th>
                  <th className="w-[150px]">Phone</th>
                  <th className="w-[130px]">Agent</th>
                  <th className="w-[100px]">Type</th>
                  <th className="w-[90px]">Duration</th>
                  <th className="w-[140px]">Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {filteredCalls.map((call) => {
                  const lead = leads.find((item) => item.id === call.leadId);

                  return (
                    <tr
                      key={call.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open call details for ${call.leadName}`}
                      onClick={() => openEdit(call)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openEdit(call);
                        }
                      }}
                      className="group cursor-pointer border-t border-slate-200/80 transition hover:bg-slate-50/80 focus-visible:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-900/70 dark:focus-visible:bg-slate-900/70"
                    >
                      <td className="px-3 py-3">
                        <p className="font-semibold leading-tight text-slate-900 dark:text-white">
                          {call.leadName}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium leading-tight text-slate-700 dark:text-slate-200">
                          {formatPhone(call.phone)}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium leading-tight text-slate-700 dark:text-slate-200">
                          {call.agentName}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge className="bg-slate-100 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {call.callType}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                        {formatDuration(call.durationSeconds)}
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                        {call.followUpAt ? formatDateTime(call.followUpAt) : "Not scheduled"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : calls.length ? (
        <EmptyState
          icon={PhoneCall}
          title="No call logs match this view"
          description="Adjust the filters or clear the search to see more activity."
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <EmptyState
          icon={PhoneCall}
          title={workspaceLoading ? "Loading call activity" : "No call logs yet"}
          description={
            workspaceLoading
              ? "The CRM is loading recent activity."
              : "Use quick add call to capture the first interaction and start building lead history."
          }
          action={
            !workspaceLoading ? (
              <Button onClick={openCreate}>
                <Plus size={16} />
                Quick add call
              </Button>
            ) : undefined
          }
        />
      )}

      <button
        type="button"
        onClick={openCreate}
        className="fixed bottom-6 right-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#1f7db3] text-white shadow-[0_16px_34px_rgba(31,125,179,0.35)] transition hover:bg-[#186791]"
        aria-label="Quick add call"
      >
        <Plus size={22} />
      </button>

      {editorOpen ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-3 sm:p-4"
          onClick={() => setEditorOpen(false)}
        >
          <div className="mx-auto flex min-h-full max-w-[920px] items-center justify-center py-4">
            <div
              className="flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-[#eef4fb] p-4 shadow-[0_24px_80px_rgba(15,23,42,0.22)] dark:border-slate-800 dark:bg-slate-950"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                    {editingCall ? "Call details" : "Quick add"}
                  </p>
                  <h2 className="mt-1 text-[16px] font-semibold text-slate-900 dark:text-white">
                    {editingCall ? "Edit call log" : "Add call log"}
                  </h2>
                  {editingCall ? (
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {formatPhone(editingCall.phone)} | {editingCall.agentName} |{" "}
                      {formatDateTime(editingCall.createdAt)}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {editingCall ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void handleDeleteCall(editingCall.id)}
                    >
                      <Trash2 size={14} />
                      Delete
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex-1 overflow-y-auto pr-1">
                {editingCall ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="crm-subtle-card p-3">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        Lead
                      </p>
                      <p className="mt-1 text-[12px] font-semibold text-slate-900 dark:text-white">
                        {editingCall.leadName}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {formatPhone(editingCall.phone)}
                      </p>
                    </div>
                    <div className="crm-subtle-card p-3">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        Agent
                      </p>
                      <p className="mt-1 text-[12px] font-semibold text-slate-900 dark:text-white">
                        {editingCall.agentName}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {formatDateTime(editingCall.createdAt)}
                      </p>
                    </div>
                    <div className="crm-subtle-card p-3">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        Timing
                      </p>
                      <p className="mt-1 text-[12px] font-semibold text-slate-900 dark:text-white">
                        {formatDuration(editingCall.durationSeconds)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {editingCall.followUpAt ? formatDateTime(editingCall.followUpAt) : "Not scheduled"}
                      </p>
                    </div>
                    <div className="crm-subtle-card p-3 md:col-span-2 xl:col-span-3">
                      <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        AI summary
                      </p>
                      <p className="mt-1 text-[12px] font-medium text-slate-900 dark:text-white">
                        {editingCall.aiSummary}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {editingCall.suggestedNextAction}
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1 text-[10px]">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          Contact
                        </span>
                        <select
                          value={form.leadId}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, leadId: event.target.value }))
                          }
                          disabled={Boolean(editingCall)}
                          className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value="">Select lead</option>
                          {leads.map((lead) => (
                            <option key={lead.id} value={lead.id}>
                              {lead.fullName} {lead.company ? `| ${lead.company}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1 text-[10px]">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          Call type
                        </span>
                        <select
                          value={form.callType}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              callType: event.target.value as CallType,
                            }))
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value="outgoing">Outgoing</option>
                          <option value="incoming">Incoming</option>
                        </select>
                      </label>

                      <label className="space-y-1 text-[10px]">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          Call duration
                        </span>
                        <input
                          type="number"
                          min={0}
                          value={form.durationSeconds}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              durationSeconds: Number(event.target.value || 0),
                            }))
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                        />
                      </label>

                      <label className="space-y-1 text-[10px]">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          Follow-up time
                        </span>
                        <input
                          type="datetime-local"
                          value={toDatetimeLocalInput(form.callbackAt)}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              callbackAt: event.target.value
                                ? new Date(event.target.value).toISOString()
                                : "",
                            }))
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                        />
                      </label>

                      <label className="space-y-1 text-[10px]">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          Priority
                        </span>
                        <select
                          value={form.priority}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              priority: event.target.value as LeadPriority,
                            }))
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Urgent">Urgent</option>
                        </select>
                      </label>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-medium text-slate-700 dark:text-slate-200">
                        Note templates
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {noteTemplates.map((template) => (
                          <button
                            key={template}
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                notes: current.notes ? `${current.notes}\n${template}` : template,
                              }))
                            }
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                          >
                            {template}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="space-y-1 text-[10px]">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Notes</span>
                      <textarea
                        rows={4}
                        value={form.notes}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, notes: event.target.value }))
                        }
                        placeholder="Capture objections, buying signals, timing, and any promised next step."
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                      />
                    </label>
                  </div>

                  <div className="space-y-4">
                    <Card className="border border-sky-200 bg-sky-50 p-3 dark:border-sky-500/20 dark:bg-sky-950/20">
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                        <Sparkles size={13} />
                        AI preview
                      </div>
                      <p className="mt-2.5 text-[13px] font-semibold text-slate-900 dark:text-white">
                        {aiPreview.summary}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <Badge className={getSentimentTone(aiPreview.sentiment as CallLog["sentiment"])}>
                          {aiPreview.sentiment}
                        </Badge>
                      </div>
                      <p className="mt-2.5 text-[11px] leading-5 text-slate-600 dark:text-slate-300">
                        {aiPreview.nextAction}
                      </p>
                    </Card>

                    <Card className="p-3">
                      <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        Selected contact
                      </p>
                      <p className="mt-2 text-[13px] font-semibold text-slate-900 dark:text-white">
                        {activeLead?.fullName || "Choose a lead"}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {activeLead
                          ? `${formatPhone(activeLead.phone)} | ${activeLead.company || "No company"}`
                          : "The CRM will link this call to the selected lead and update its timeline automatically."}
                      </p>
                    </Card>

                    {editorError ? (
                      <AlertBanner
                        title="Unable to save call"
                        description={editorError}
                        tone="error"
                      />
                    ) : null}

                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setEditorOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!form.leadId) {
                            setEditorError("Choose a lead before saving the call log.");
                            return;
                          }

                          setSaving(true);
                          setEditorError("");

                          try {
                            if (editingCall) {
                              await updateCallLog(editingCall.id, form);
                              toast.success("Call log updated.");
                            } else {
                              await createCallLog(form);
                              toast.success("Call log saved.");
                            }

                            setEditorOpen(false);
                          } catch (error) {
                            setEditorError(
                              error instanceof Error ? error.message : "Unable to save the call log.",
                            );
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={!form.leadId || saving || !currentUser}
                      >
                        {saving ? "Saving..." : editingCall ? "Update call" : "Save call"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
