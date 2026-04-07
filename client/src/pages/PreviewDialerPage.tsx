import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileUp,
  History,
  LayoutGrid,
  PhoneOff,
  SkipForward,
  StickyNote,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import { ActivityTimeline } from "../components/dialer/ActivityTimeline";
import { DialerControls } from "../components/dialer/DialerControls";
import { LeadPreviewCard } from "../components/dialer/LeadPreviewCard";
import { PostCallPanel } from "../components/dialer/PostCallPanel";
import { QueuePanel } from "../components/dialer/QueuePanel";
import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { EmptyState } from "../components/shared/EmptyState";
import { useAppState } from "../hooks/useAppState";
import { getQueueLeads } from "../lib/analytics";
import { parseLeadFile } from "../lib/csv";
import {
  formatDateTime,
  formatDuration,
  formatPhone,
  getDispositionTone,
  getInitials,
  getLeadStatusTone,
  getPriorityTone,
  toDatetimeLocalInput,
} from "../lib/utils";
import type { LeadPriority, QueueFilter } from "../types";

type WorkspaceTab = "record" | "notes" | "history" | "timeline";

function buildCallbackDraft(value?: string | null) {
  if (value) {
    return toDatetimeLocalInput(value);
  }

  const nextHour = new Date(Date.now() + 60 * 60 * 1000);
  const offset = nextHour.getTimezoneOffset() * 60 * 1000;
  return new Date(nextHour.getTime() - offset).toISOString().slice(0, 16);
}

export function PreviewDialerPage() {
  const {
    currentUser,
    leads,
    twilioConfig,
    queueSort,
    queueFilter,
    setQueueSort,
    setQueueFilter,
    autoDialEnabled,
    autoDialDelaySeconds,
    autoDialCountdown,
    setAutoDialEnabled,
    setAutoDialDelaySeconds,
    currentLeadId,
    activeCall,
    wrapUpLeadId,
    selectLead,
    previousLead,
    nextLead,
    skipLead,
    markLeadInvalid,
    startCall,
    endCall,
    toggleMute,
    holdCall,
    resumeCall,
    saveDisposition,
    uploadLeads,
    rescheduleCallback,
  } = useAppState();

  const [uploadMessage, setUploadMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [callbackPanelOpen, setCallbackPanelOpen] = useState(false);
  const [callbackAt, setCallbackAt] = useState("");
  const [callbackPriority, setCallbackPriority] = useState<LeadPriority>("High");
  const [callbackSaving, setCallbackSaving] = useState(false);
  const [callbackMessage, setCallbackMessage] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("record");
  const [heroTimer, setHeroTimer] = useState(0);

  if (!currentUser) {
    return null;
  }

  const queue = getQueueLeads(leads, currentUser.role, currentUser.id, queueSort, queueFilter);
  const activeLead = leads.find((lead) => lead.id === (wrapUpLeadId || currentLeadId)) ?? null;
  const scheduleCallbackDraft = callbackAt || buildCallbackDraft(activeLead?.callbackTime);

  const queuePosition = activeLead ? queue.findIndex((lead) => lead.id === activeLead.id) + 1 : 0;

  const noteEntries = useMemo(
    () => activeLead?.notesHistory ?? [],
    [activeLead],
  );
  const callEntries = useMemo(
    () => activeLead?.callHistory ?? [],
    [activeLead],
  );

  useEffect(() => {
    if (!activeCall) {
      setHeroTimer(0);
      return;
    }

    setHeroTimer(Math.max(1, Math.floor((Date.now() - activeCall.startedAt) / 1000)));
    const interval = window.setInterval(() => {
      setHeroTimer(Math.max(1, Math.floor((Date.now() - activeCall.startedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [activeCall]);

  const handleBulkFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploading(true);
    try {
      const parsed = await parseLeadFile(file);
      const result = await uploadLeads(
        parsed.rows,
        currentUser.role === "agent" ? currentUser.id : undefined,
      );
      setUploadMessage(
        `Queue import complete. ${result.added} leads added and ${result.duplicates} duplicates skipped.`,
      );
    } catch (error) {
      setUploadMessage(
        error instanceof Error ? error.message : "Unable to load that file into the queue.",
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleScheduleCallback = async () => {
    if (!activeLead || !scheduleCallbackDraft) {
      return;
    }

    const currentIndex = queue.findIndex((lead) => lead.id === activeLead.id);
    const nextLeadId = queue[currentIndex + 1]?.id ?? queue[currentIndex - 1]?.id ?? null;

    setCallbackSaving(true);
    setCallbackMessage("");
    try {
      await rescheduleCallback(
        activeLead.id,
        new Date(scheduleCallbackDraft).toISOString(),
        callbackPriority,
      );
      setCallbackMessage(`Callback scheduled for ${activeLead.fullName}.`);
      setCallbackPanelOpen(false);
      setCallbackAt("");
      if (nextLeadId) {
        selectLead(nextLeadId);
      }
    } catch (error) {
      setCallbackMessage(
        error instanceof Error ? error.message : "Unable to schedule that callback.",
      );
    } finally {
      setCallbackSaving(false);
    }
  };

  if (!activeLead) {
    return (
      <EmptyState
        icon={PhoneOff}
        title="No leads available in the current queue"
        description="Adjust the queue filters or import another spreadsheet to keep dialing."
      />
    );
  }

  const workspaceTabs: Array<{
    id: WorkspaceTab;
    label: string;
    icon: typeof LayoutGrid;
  }> = [
    { id: "record", label: "Record View", icon: LayoutGrid },
    { id: "notes", label: "Field Notes", icon: StickyNote },
    { id: "history", label: "Call History", icon: History },
    { id: "timeline", label: "Timeline", icon: Clock3 },
  ];

  return (
    <div className="space-y-3 text-sm">
      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-panel dark:border-slate-800 dark:bg-slate-950">
        <div className="grid gap-3 bg-gradient-to-r from-surface-700 via-surface-700 to-surface-600 px-5 py-4 text-white xl:grid-cols-[1.2fr_0.85fr_0.7fr]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-bold text-surface-700">
              {getInitials(activeLead.fullName)}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/65">
                Live Record
              </p>
              <h1 className="truncate text-lg font-semibold">{activeLead.fullName}</h1>
              <p className="mt-0.5 truncate text-[11px] text-white/75">
                {activeLead.company || "No company"} / {activeLead.jobTitle || "Prospect"}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-[16px] bg-white/10 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/65">Queue</p>
              <p className="mt-1 text-lg font-semibold">
                {Math.max(queuePosition, 0)}/{queue.length || 1}
              </p>
            </div>
            <div className="rounded-[16px] bg-white/10 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/65">Call timer</p>
              <p className="mt-1 text-lg font-semibold">
                {activeCall ? formatDuration(heroTimer) : "00:00"}
              </p>
            </div>
            <div className="rounded-[16px] bg-white/10 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/65">Auto dial</p>
              <p className="mt-1 text-sm font-semibold">
                {autoDialEnabled
                  ? autoDialCountdown !== null
                    ? `${autoDialCountdown}s`
                    : `${autoDialDelaySeconds}s delay`
                  : "Off"}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start justify-center gap-2 xl:items-end">
            <Badge className="bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">
              {activeCall ? activeCall.status : twilioConfig.available ? "Ready" : "Manual ready"}
            </Badge>
            <div className="text-[11px] text-white/80">
              Assigned to {activeLead.assignedAgentName}
            </div>
            <div className="text-[11px] text-white/80">{formatPhone(activeLead.phone)}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <select
            value={queueSort}
            onChange={(event) =>
              setQueueSort(event.target.value as "priority" | "newest" | "callback_due")
            }
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] outline-none focus:border-surface-600 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="priority">Priority queue</option>
            <option value="newest">Newest queue</option>
            <option value="callback_due">Callback queue</option>
          </select>
          <select
            value={queueFilter}
            onChange={(event) => setQueueFilter(event.target.value as QueueFilter)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] outline-none focus:border-surface-600 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="all">All active</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="callback_due">Callback due</option>
            <option value="follow_up">Follow up</option>
            <option value="qualified">Qualified</option>
            <option value="appointment_booked">Appointment booked</option>
          </select>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
            <FileUp size={16} />
            {uploading ? "Importing..." : "Import CSV / Excel"}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleBulkFileUpload}
            />
          </label>
        </div>
      </section>

      {uploadMessage ? (
        <Card className="border border-cyan-300/60 bg-cyan-50/80 py-4 text-sm text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-950/20 dark:text-cyan-300">
          {uploadMessage}
        </Card>
      ) : null}

      {callbackMessage ? (
        <Card className="border border-emerald-300/60 bg-emerald-50/80 py-4 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-300">
          {callbackMessage}
        </Card>
      ) : null}

      <div className="grid gap-3 xl:h-[calc(100vh-215px)] xl:grid-cols-[292px_minmax(0,1fr)]">
        <div className="space-y-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-surface-700 dark:text-cyan-300">
                Contact Details
              </p>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-surface-700 text-xs font-semibold text-white">
                  {getInitials(activeLead.fullName)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {activeLead.fullName}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {activeLead.email || "No email on record"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-2 px-4 py-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Direct Line
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-900 dark:text-white">
                    {formatPhone(activeLead.phone)}
                  </p>
                </div>
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Alternate
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-900 dark:text-white">
                    {activeLead.altPhone ? formatPhone(activeLead.altPhone) : "--"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Status
                  </p>
                  <div className="mt-1">
                    <Badge className={`px-2 py-1 text-[10px] ${getLeadStatusTone(activeLead.status)}`}>
                      {activeLead.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Priority
                  </p>
                  <div className="mt-1">
                    <Badge className={`px-2 py-1 text-[10px] ${getPriorityTone(activeLead.priority)}`}>
                      {activeLead.priority}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={previousLead} disabled={Boolean(wrapUpLeadId)}>
                  <ChevronLeft size={16} />
                  Prev
                </Button>
                <Button size="sm" variant="secondary" onClick={nextLead} disabled={Boolean(wrapUpLeadId)}>
                  Next
                  <ChevronRight size={16} />
                </Button>
                <Button size="sm" variant="ghost" onClick={skipLead} disabled={Boolean(wrapUpLeadId)}>
                  <SkipForward size={16} />
                  Skip
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setAutoDialEnabled(false);
                    setCallbackMessage("");
                    setCallbackPanelOpen((current) => !current);
                    setCallbackAt(buildCallbackDraft(activeLead.callbackTime));
                    setCallbackPriority(activeLead.priority);
                  }}
                  disabled={Boolean(wrapUpLeadId)}
                >
                  <CalendarClock size={16} />
                  Callback
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void markLeadInvalid()}
                  disabled={Boolean(wrapUpLeadId)}
                >
                  <XCircle size={16} />
                  Invalid
                </Button>
              </div>
            </div>
          </Card>

          {callbackPanelOpen ? (
            <Card className="space-y-3 p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-surface-700 dark:text-cyan-300">
                  Callback Scheduler
                </p>
                <h2 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  Set the next touch for {activeLead.fullName}
                </h2>
              </div>
              <div className="grid gap-3">
                <input
                  type="datetime-local"
                  value={scheduleCallbackDraft}
                  onChange={(event) => setCallbackAt(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] outline-none focus:border-surface-600 dark:border-slate-700 dark:bg-slate-950"
                />
                <select
                  value={callbackPriority}
                  onChange={(event) => setCallbackPriority(event.target.value as LeadPriority)}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] outline-none focus:border-surface-600 dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
                <Button
                  size="sm"
                  onClick={() => void handleScheduleCallback()}
                  disabled={!scheduleCallbackDraft || callbackSaving}
                >
                  {callbackSaving ? "Saving..." : "Save callback"}
                </Button>
              </div>
            </Card>
          ) : null}

          <DialerControls
            lead={activeLead}
            activeCall={activeCall}
            twilioReady={twilioConfig.available}
            autoDialEnabled={autoDialEnabled}
            autoDialDelaySeconds={autoDialDelaySeconds}
            autoDialCountdown={autoDialCountdown}
            onCall={startCall}
            onEnd={endCall}
            onMute={toggleMute}
            onHold={holdCall}
            onResume={resumeCall}
            onToggleAutoDial={setAutoDialEnabled}
            onAutoDialDelayChange={setAutoDialDelaySeconds}
          />

          {wrapUpLeadId ? (
            <PostCallPanel
              open={Boolean(wrapUpLeadId)}
              leadName={activeLead.fullName}
              onSave={saveDisposition}
            />
          ) : null}

          <QueuePanel leads={queue} currentLeadId={currentLeadId} onSelect={selectLead} />
        </div>

        <div className="min-h-0">
          <Card className="flex h-full min-h-0 flex-col overflow-hidden p-0">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-surface-700 dark:text-cyan-300">
                    Main Tab
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    Agent workspace
                  </h2>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Review the record, previous context, and outcomes without leaving the dialer.
                  </p>
                </div>
                <div className="rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  {twilioConfig.available
                    ? "Twilio browser calling ready"
                    : "Manual logging mode active until Twilio is configured"}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {workspaceTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = workspaceTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setWorkspaceTab(tab.id)}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                        isActive
                          ? "bg-surface-700 text-white"
                          : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      <Icon size={15} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {workspaceTab === "record" ? <LeadPreviewCard lead={activeLead} embedded /> : null}

              {workspaceTab === "notes" ? (
              <div className="space-y-4 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-surface-700 dark:text-cyan-300">
                    Notes View
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    Field notes and summary
                  </h3>
                </div>
                <Card className="rounded-[20px] p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Current Summary
                  </p>
                  <p className="mt-2 text-[11px] leading-6 text-slate-600 dark:text-slate-300">
                    {activeLead.notes || "No summary note saved yet for this record."}
                  </p>
                </Card>
                <div className="grid gap-3">
                  {noteEntries.length ? (
                    noteEntries.map((note) => (
                      <Card key={note.id} className="rounded-[20px] p-4">
                        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {note.authorName}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDateTime(note.createdAt)}
                          </p>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
                          {note.body}
                        </p>
                      </Card>
                    ))
                  ) : (
                    <Card className="rounded-[20px] p-4 text-[11px] text-slate-500 dark:text-slate-400">
                      No field notes have been added yet.
                    </Card>
                  )}
                </div>
              </div>
            ) : null}

            {workspaceTab === "history" ? (
              <div className="space-y-4 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-surface-700 dark:text-cyan-300">
                    Call History
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    Previous attempts and outcomes
                  </h3>
                </div>
                <div className="space-y-3">
                  {callEntries.length ? (
                    callEntries.map((call) => (
                      <Card key={call.id} className="rounded-[20px] p-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={`px-2 py-1 text-[10px] ${getDispositionTone(call.disposition)}`}>
                              {call.disposition}
                            </Badge>
                            <Badge className="bg-slate-100 px-2 py-1 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {formatDuration(call.durationSeconds)}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDateTime(call.createdAt)}
                          </p>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
                          {call.outcomeSummary || call.notes || "No summary saved for this call."}
                        </p>
                        <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                          {call.agentName}
                        </p>
                      </Card>
                    ))
                  ) : (
                    <Card className="rounded-[20px] p-4 text-[11px] text-slate-500 dark:text-slate-400">
                      No previous calls are on record.
                    </Card>
                  )}
                </div>
              </div>
            ) : null}

              {workspaceTab === "timeline" ? <ActivityTimeline lead={activeLead} embedded /> : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
