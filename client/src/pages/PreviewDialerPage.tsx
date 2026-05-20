import {
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileUp,
  History,
  Mail,
  MapPin,
  MoreVertical,
  Phone,
  PhoneCall,
  PhoneOff,
  Search,
  SkipForward,
  SkipBack,
  StickyNote,
  UserRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";

import { ActivityTimeline } from "../components/dialer/ActivityTimeline";
import { PostCallPanel } from "../components/dialer/PostCallPanel";
import { ImportTemplateCard } from "../components/import/ImportTemplateCard";
import { AlertBanner } from "../components/shared/AlertBanner";
import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { EmptyState } from "../components/shared/EmptyState";
import { useAppState } from "../hooks/useAppState";
import { getQueueLeads } from "../lib/analytics";
import { buildLeadDestinationOptions } from "../lib/dialerNumbers";
import { parseLeadFile } from "../lib/csv";
import {
  cn,
  formatDateTime,
  formatDuration,
  formatPhone,
  getCallStatusTone,
  getDispositionTone,
  getInitials,
  getLeadStatusTone,
  getPriorityTone,
  toDatetimeLocalInput,
} from "../lib/utils";
import { formatDialNumberForSession } from "../lib/softphoneDialing";
import type { LeadPriority } from "../types";

type WorkspaceTab = "history" | "notes" | "timeline";

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "new";
  }

  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) {
    return `${seconds} sec ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildCallbackDraft(value?: string | null) {
  if (value) {
    return toDatetimeLocalInput(value);
  }

  const nextHour = new Date(Date.now() + 60 * 60 * 1000);
  const offset = nextHour.getTimezoneOffset() * 60 * 1000;
  return new Date(nextHour.getTime() - offset).toISOString().slice(0, 16);
}

function buildQuickCallbackInput(hoursFromNow: number, hour?: number, minute = 0) {
  const value = new Date();
  value.setSeconds(0, 0);

  if (typeof hour === "number") {
    value.setDate(value.getDate() + hoursFromNow);
    value.setHours(hour, minute, 0, 0);
  } else {
    value.setMinutes(value.getMinutes() + hoursFromNow * 60);
  }

  return toDatetimeLocalInput(value.toISOString());
}

function DetailSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[6px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">{title}</h3>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function PreviewDialerPage() {
  const {
    currentUser,
    leads,
    queueSort,
    queueFilter,
    setQueueFilter,
    currentLeadId,
    activeCall,
    wrapUpLeadId,
    callError,
    selectLead,
    previousLead,
    nextLead,
    skipLead,
    markLeadInvalid,
    startCall,
    endCall,
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
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("history");
  const [heroTimer, setHeroTimer] = useState(0);
  const [queueSearch, setQueueSearch] = useState("");
  const [destinationChoice, setDestinationChoice] = useState("custom");
  const [customDestination, setCustomDestination] = useState("");

  if (!currentUser) {
    return null;
  }

  const queue = getQueueLeads(leads, currentUser.role, currentUser.id, queueSort, queueFilter);
  const activeLead = leads.find((lead) => lead.id === (wrapUpLeadId || currentLeadId)) ?? null;
  const scheduleCallbackDraft = callbackAt || buildCallbackDraft(activeLead?.callbackTime);
  const queuePosition = activeLead ? queue.findIndex((lead) => lead.id === activeLead.id) + 1 : 0;

  const noteEntries = useMemo(() => activeLead?.notesHistory ?? [], [activeLead]);
  const callEntries = useMemo(() => activeLead?.callHistory ?? [], [activeLead]);
  const queuedLeads = useMemo(
    () => queue.filter((lead) => lead.id !== activeLead?.id),
    [activeLead?.id, queue],
  );
  const filteredQueuedLeads = useMemo(() => {
    const query = queueSearch.trim().toLowerCase();
    if (!query) {
      return queuedLeads;
    }

    return queuedLeads.filter((lead) =>
      [lead.fullName, lead.company, lead.phone, lead.email].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [queueSearch, queuedLeads]);
  const activeCallLead = activeCall?.leadId
    ? leads.find((lead) => lead.id === activeCall.leadId) ?? null
    : null;
  const headerName = activeCallLead?.fullName || activeCall?.displayName || activeLead?.fullName || "--";
  const headerPhone = activeCallLead?.phone || activeCall?.dialedNumber || activeLead?.phone || "--";
  const headerInitials = getInitials(headerName);
  const leadDestinationOptions = useMemo(
    () => buildLeadDestinationOptions(activeLead),
    [activeLead],
  );
  const selectedDestinationOption = useMemo(
    () =>
      destinationChoice === "custom"
        ? null
        : leadDestinationOptions.find((option) => option.value === destinationChoice) ?? null,
    [destinationChoice, leadDestinationOptions],
  );
  const customDestinationTrimmed = customDestination.trim();
  const destinationPhone = selectedDestinationOption?.value ?? customDestinationTrimmed;
  const destinationPhoneIndex =
    destinationChoice === "custom" ? undefined : selectedDestinationOption?.phoneIndex;
  const destinationDialNumber = destinationPhone
    ? formatDialNumberForSession(destinationPhone, {
        callerId: null,
        timezone: currentUser?.timezone,
      })
    : "";
  const canCallLead = Boolean(destinationDialNumber) && !activeCall && !wrapUpLeadId;
  const isIncomingRinging = activeCall?.direction === "incoming" && activeCall?.status === "ringing";

  useEffect(() => {
    const nextChoice = leadDestinationOptions[0]?.value ?? "custom";
    setDestinationChoice(nextChoice);
    setCustomDestination("");
  }, [activeLead?.id, leadDestinationOptions]);

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

  const handleCallLead = () => {
    if (!activeLead || !destinationPhone) {
      return;
    }

    void startCall({
      phone: destinationPhone,
      leadId: activeLead.id,
      displayName: activeLead.fullName,
      phoneIndex: destinationPhoneIndex,
    }).catch(() => undefined);
  };

  const handleBulkFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadMessage("");
    setUploading(true);
    try {
      const parsed = await parseLeadFile(file);
      const result = await uploadLeads(
        parsed.rows,
        currentUser.role === "agent" ? currentUser.id : undefined,
      );
      const invalidRows = parsed.invalidRows + result.invalidRows;
      setUploadMessage(
        `${result.added} leads added. ${result.duplicates} duplicates skipped.${invalidRows ? ` ${invalidRows} invalid rows ignored.` : ""}`,
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
        description="The dialer will load the next lead automatically when one becomes available."
      />
    );
  }

  const workspaceTabs: Array<{
    id: WorkspaceTab;
    label: string;
    icon: LucideIcon;
  }> = [
    { id: "history", label: "History", icon: History },
    { id: "notes", label: "Notes", icon: StickyNote },
    { id: "timeline", label: "Timeline", icon: Clock3 },
  ];

  const leadStatusLabel = activeLead.status.replace("_", " ");
  const callStatusText = wrapUpLeadId
    ? "Disposition open"
    : activeCall
    ? `${activeCall.status.replace(/_/g, " ")} | ${formatDuration(heroTimer)}`
    : "Ready to dial";
  const callStatusTone = wrapUpLeadId
    ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-300"
    : activeCall
    ? "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/30 dark:bg-cyan-950/20 dark:text-cyan-300"
    : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
  const leadDetails = [
    { icon: Mail, label: "Email", value: activeLead.email || "--" },
    { icon: Phone, label: "Phone", value: formatPhone(activeLead.phone) },
    { icon: Phone, label: "Alt phone", value: activeLead.altPhone ? formatPhone(activeLead.altPhone) : "--" },
    { icon: Building2, label: "Company", value: activeLead.company || "--" },
    { icon: UserRound, label: "Job title", value: activeLead.jobTitle || "--" },
    { icon: MapPin, label: "Location", value: activeLead.location || "--" },
    { icon: History, label: "Source", value: activeLead.source || "--" },
    { icon: Clock3, label: "Assigned agent", value: activeLead.assignedAgentName || "--" },
    { icon: Clock3, label: "Timezone", value: activeLead.timezone || "--" },
    {
      icon: History,
      label: "Last contacted",
      value: activeLead.lastContacted ? formatDateTime(activeLead.lastContacted) : "Not contacted yet",
    },
    { icon: Clock3, label: "Created", value: formatDateTime(activeLead.createdAt) },
    { icon: History, label: "Updated", value: formatDateTime(activeLead.updatedAt) },
  ];

  return (
    <div className={cn("space-y-4 text-sm", wrapUpLeadId ? "pb-[22rem]" : "pb-4")}>
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#eef4fb] shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-[11px] font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
            {currentUser.avatar}
          </div>
        </div>

        {callError ? (
          <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
            <AlertBanner
              title="Dialer notice"
              description={callError}
              tone="error"
            />
          </div>
        ) : null}

        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#ff8f7b] text-[13px] font-semibold text-white">
                {headerInitials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[18px] font-semibold text-slate-900 dark:text-white">
                  {headerName}
                </p>
                <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">
                  {formatPhone(headerPhone)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  <span>Queue {Math.max(queuePosition, 0)} / {queue.length || 1}</span>
                  <span>|</span>
                  <span>{activeLead.company || "No company"}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="md"
                variant="secondary"
                className="w-10 px-0 text-slate-900 dark:text-white"
                onClick={previousLead}
                disabled={Boolean(wrapUpLeadId || activeCall)}
                aria-label="Back to previous lead"
                title="Back"
              >
                <SkipBack size={16} strokeWidth={2.5} />
              </Button>

              <Button
                size="md"
                variant="secondary"
                className="w-10 px-0 text-slate-900 dark:text-white"
                onClick={skipLead}
                disabled={Boolean(wrapUpLeadId || activeCall)}
                aria-label="Skip current lead"
                title="Skip"
              >
                <SkipForward size={16} strokeWidth={2.5} />
              </Button>

              <Button
                size="md"
                onClick={() => {
                  if (activeCall) {
                    void endCall();
                    return;
                  }

                  void handleCallLead();
                }}
                disabled={Boolean(wrapUpLeadId) || (!activeCall && !canCallLead)}
              >
                {activeCall ? <PhoneOff size={15} /> : <PhoneCall size={15} />}
                {activeCall ? (isIncomingRinging ? "Reject" : "End call") : "Call"}
              </Button>

              <div
                className={cn(
                  "min-w-[180px] rounded-[18px] border px-4 py-2",
                  callStatusTone,
                )}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
                  Call log / status
                </p>
                <p className="mt-1 text-[12px] font-medium leading-5">{callStatusText}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:min-h-[calc(100vh-320px)] xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <aside className="space-y-4">
              <DetailSection title="Lead snapshot">
                <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[13px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                {getInitials(activeLead.fullName)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-slate-900 dark:text-white">
                      {activeLead.fullName}
                    </p>
                <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">
                  {formatPhone(activeLead.phone)}
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <div className="flex flex-col gap-2">
               
                <select
                  value={destinationChoice}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setDestinationChoice(nextValue);
                    if (nextValue !== "custom") {
                      setCustomDestination("");
                    }
                  }}
                  className="crm-input py-2 text-[12px]"
                >
                  {leadDestinationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  <option value="custom">Custom number</option>
                </select>
               
              </div>

              {destinationChoice === "custom" ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Custom number
                  </p>
                  <input
                    value={customDestination}
                    onChange={(event) => setCustomDestination(event.target.value)}
                    placeholder="Enter destination phone number"
                    inputMode="tel"
                    className="crm-input py-2 text-[12px]"
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-4 text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Status</span>
                  <Badge className={getLeadStatusTone(activeLead.status)}>
                    {leadStatusLabel}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Priority</span>
                  <Badge className={getPriorityTone(activeLead.priority)}>
                    {activeLead.priority}
                  </Badge>
                </div>
              </div>
            </div>
              </DetailSection>

              <DetailSection title="Contact details">
                <div className="space-y-3">
                  {leadDetails.map((item) => (
                    <div key={item.label} className="flex gap-3">
                      <div className="mt-0.5 text-slate-400 dark:text-slate-500">
                        <item.icon size={15} />
                      </div>
                      <div>
                        <p className="text-[12px] text-slate-500 dark:text-slate-400">{item.label}</p>
                        <p className="mt-0.5 text-[13px] text-slate-900 dark:text-white">
                          {item.value}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </DetailSection>
            </aside>

            <section className="min-w-0">
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950">
                <div className="border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex flex-wrap items-center gap-5">
                    {workspaceTabs.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = workspaceTab === tab.id;

                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setWorkspaceTab(tab.id)}
                          className={cn(
                            "inline-flex items-center gap-2 border-b-2 px-1 py-3 text-[12px] font-medium transition",
                            isActive
                              ? "border-surface-700 text-surface-700 dark:border-cyan-400 dark:text-cyan-300"
                              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
                          )}
                        >
                          <Icon size={14} />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4 bg-[#f5f7fc] p-4 dark:bg-slate-950">
                  {workspaceTab === "history" ? (
                    <DetailSection title="Call history" className="p-4">
                      {callEntries.length ? (
                        <div className="overflow-x-auto rounded-[14px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                          <table className="min-w-[680px] w-full border-collapse">
                            <thead className="bg-slate-50 dark:bg-slate-900/50">
                              <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                <th className="px-3 py-2.5">Outcome</th>
                                <th className="px-3 py-2.5">Disposition</th>
                                <th className="px-3 py-2.5">Duration</th>
                                <th className="px-3 py-2.5">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {callEntries.map((call) => {
                                const outcomeLabel =
                                  call.source === "failed_attempt" || call.status === "failed"
                                    ? "Failed"
                                    : call.status.replace(/_/g, " ");

                                return (
                                  <tr
                                    key={call.id}
                                    className="border-t border-slate-200 text-[11px] text-slate-700 dark:border-slate-800 dark:text-slate-200"
                                  >
                                    <td className="whitespace-nowrap px-3 py-2.5">
                                      <Badge
                                        className={cn(
                                          "px-2.5 py-1 text-[10px] font-medium",
                                          getCallStatusTone(call.status),
                                        )}
                                      >
                                        {outcomeLabel}
                                      </Badge>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5">
                                      <Badge
                                        className={cn(
                                          "px-2.5 py-1 text-[10px] font-medium",
                                          getDispositionTone(call.disposition),
                                        )}
                                      >
                                        {call.disposition}
                                      </Badge>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900 dark:text-white">
                                      {formatDuration(call.durationSeconds)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500 dark:text-slate-400">
                                      {formatDateTime(call.createdAt)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-[12px] text-slate-500 dark:text-slate-400">
                          No calls yet.
                        </p>
                      )}
                    </DetailSection>
                  ) : null}

                  {workspaceTab === "notes" ? (
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                      <DetailSection title="Notes history">
                        <div className="space-y-3">
                          {noteEntries.length ? (
                            noteEntries.map((note) => (
                              <div
                                key={note.id}
                                className="rounded-[16px] border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-[13px] font-medium text-slate-900 dark:text-white">
                                    {note.authorName}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {formatDateTime(note.createdAt)}
                                  </p>
                                </div>
                                <p className="mt-2 text-[12px] leading-5 text-slate-600 dark:text-slate-300">
                                  {note.body}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-[12px] text-slate-500 dark:text-slate-400">
                              No notes yet.
                            </p>
                          )}
                        </div>
                      </DetailSection>

                      <DetailSection title="Summary">
                        <p className="text-[12px] leading-6 text-slate-600 dark:text-slate-300">
                          {activeLead.notes || "No note saved."}
                        </p>
                      </DetailSection>
                    </div>
                  ) : null}

                  {workspaceTab === "timeline" ? (
                    <div className="rounded-[18px] border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
                      <ActivityTimeline lead={activeLead} embedded />
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        </div>

        {wrapUpLeadId && activeLead ? (
          <div className="fixed inset-0 z-40 bg-slate-950/15 backdrop-blur-[1px]" />
        ) : null}

        {wrapUpLeadId && activeLead ? (
          <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
            <div className="mx-auto max-w-4xl overflow-hidden rounded-[28px] border border-cyan-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] dark:border-cyan-500/30 dark:bg-slate-950">
              <PostCallPanel
                open={Boolean(wrapUpLeadId)}
                leadName={activeLead.fullName}
                onSave={saveDisposition}
              />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
