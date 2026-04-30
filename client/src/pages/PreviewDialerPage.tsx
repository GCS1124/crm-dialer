import {
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileUp,
  Grid2x2,
  History,
  Mail,
  MapPin,
  Mic,
  MoreVertical,
  Pause,
  Phone,
  PhoneCall,
  PhoneOff,
  Search,
  SkipForward,
  StickyNote,
  UserRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";

import { ActivityTimeline } from "../components/dialer/ActivityTimeline";
import { PostCallPanel } from "../components/dialer/PostCallPanel";
import { AlertBanner } from "../components/shared/AlertBanner";
import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { EmptyState } from "../components/shared/EmptyState";
import { useAppState } from "../hooks/useAppState";
import { getQueueLeads } from "../lib/analytics";
import { parseLeadFile } from "../lib/csv";
import {
  cn,
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

type WorkspaceTab = "about" | "notes" | "history" | "timeline";
const dialPadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

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

function sanitizeDialPadInput(value: string) {
  return value.replace(/[^\d+*#]/g, "");
}

function getLeadProductivityHint(lead: {
  status: string;
  callbackTime: string | null;
  leadScore: number;
  priority: string;
  callHistory: Array<unknown>;
  notesHistory: Array<unknown>;
}) {
  if (lead.callbackTime && new Date(lead.callbackTime).getTime() < Date.now()) {
    return {
      title: "Callback overdue",
      detail: "This record should be reworked now before it slips any further.",
    };
  }

  if (lead.status === "qualified" && lead.leadScore >= 75) {
    return {
      title: "Push for appointment",
      detail: "Intent is strong enough to move this call toward booking.",
    };
  }

  if (!lead.callHistory.length) {
    return {
      title: "First touch pending",
      detail: "Use the preview, open with relevance, and capture context on wrap-up.",
    };
  }

  if (!lead.notesHistory.length) {
    return {
      title: "Context is thin",
      detail: "Add a sharp note after the next touch so the queue stays usable.",
    };
  }

  return {
    title: "Advance the opportunity",
    detail: "Use the last outcome and move this lead to its next concrete step.",
  };
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
    analytics,
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
    callError,
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
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("about");
  const [heroTimer, setHeroTimer] = useState(0);
  const [queueSearch, setQueueSearch] = useState("");
  const [dialPadOpen, setDialPadOpen] = useState(false);
  const [dialPadValue, setDialPadValue] = useState("");
  const [dialPadMessage, setDialPadMessage] = useState("");

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
  const recommendedLead = analytics.recommendedLeads.find((lead) => lead.leadId === activeLead?.id);
  const duplicateInsight = analytics.duplicateInsights.find((group) =>
    activeLead ? group.leadIds.includes(activeLead.id) : false,
  );
  const productivityHint = activeLead
    ? recommendedLead
      ? { title: recommendedLead.reason, detail: recommendedLead.suggestedAction }
      : getLeadProductivityHint(activeLead)
    : null;
  const activeCallLead = activeCall?.leadId
    ? leads.find((lead) => lead.id === activeCall.leadId) ?? null
    : null;
  const headerName = activeCallLead?.fullName || activeCall?.displayName || activeLead?.fullName || "--";
  const headerPhone = activeCallLead?.phone || activeCall?.dialedNumber || activeLead?.phone || "--";
  const headerInitials = getInitials(headerName);
  const manualCallActive = activeCall?.status === "manual";
  const quickFillNumbers = [activeLead?.phone || "", activeLead?.altPhone || ""]
    .map((value) => sanitizeDialPadInput(value))
    .filter((value, index, items) => Boolean(value) && items.indexOf(value) === index);

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

  const handleDialPadToggle = () => {
    if (!dialPadOpen && !dialPadValue) {
      setDialPadValue(sanitizeDialPadInput(activeLead?.phone || activeLead?.altPhone || ""));
    }

    setDialPadMessage("");
    setAutoDialEnabled(false);
    setDialPadOpen((open) => !open);
  };

  const handleDialPadInputChange = (value: string) => {
    setDialPadMessage("");
    setDialPadValue(sanitizeDialPadInput(value));
  };

  const handleDialPadAppend = (value: string) => {
    handleDialPadInputChange(`${dialPadValue}${value}`);
  };

  const handleDialPadBackspace = () => {
    handleDialPadInputChange(dialPadValue.slice(0, -1));
  };

  const handleDialPadCall = async () => {
    const number = sanitizeDialPadInput(dialPadValue);
    if (!number || activeCall) {
      return;
    }

    setDialPadMessage("");
    try {
      await startCall({
        phone: number,
        leadId: null,
        displayName: number,
      });
      setDialPadValue(number);
      setDialPadOpen(false);
    } catch (error) {
      setDialPadMessage(
        error instanceof Error ? error.message : "Unable to start that call.",
      );
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
    const uploadFailed =
      uploadMessage.toLowerCase().includes("unable") ||
      uploadMessage.toLowerCase().includes("error");

    return (
      <EmptyState
        icon={PhoneOff}
        title="No leads available in the current queue"
        description="Import a spreadsheet here or reset the queue filter to bring leads back into the dialer."
        action={
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[#2d84b5] bg-[#3b91c3] px-4 py-2.5 text-[12px] font-medium text-white transition hover:bg-[#327eab]">
                <FileUp size={14} />
                {uploading ? "Importing..." : "Upload CSV / Excel"}
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleBulkFileUpload}
                />
              </label>
              {queueFilter !== "all" ? (
                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => setQueueFilter("all")}
                >
                  Show all active
                </Button>
              ) : null}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Accepted formats: `.csv`, `.xlsx`, `.xls`
            </p>
            {uploadMessage ? (
              <p
                className={cn(
                  "max-w-md text-[12px]",
                  uploadFailed
                    ? "text-rose-700 dark:text-rose-300"
                    : "text-emerald-700 dark:text-emerald-300",
                )}
              >
                {uploadMessage}
              </p>
            ) : null}
          </div>
        }
      />
    );
  }

  const workspaceTabs: Array<{
    id: WorkspaceTab;
    label: string;
    icon: LucideIcon;
  }> = [
    { id: "about", label: "About", icon: UserRound },
    { id: "history", label: "History", icon: History },
    { id: "notes", label: "Notes", icon: StickyNote },
    { id: "timeline", label: "Timeline", icon: Clock3 },
  ];

  const contactDetails = [
    { icon: Mail, label: "Email", value: activeLead.email || "--" },
    { icon: Phone, label: "Phone", value: formatPhone(activeLead.phone) },
    { icon: Building2, label: "Organization", value: activeLead.company || "--" },
    { icon: MapPin, label: "Location", value: activeLead.location || "--" },
    { icon: Clock3, label: "Created", value: formatDateTime(activeLead.createdAt) },
    { icon: History, label: "Last updated", value: formatDateTime(activeLead.updatedAt) },
  ];

  return (
    <div className="space-y-4 text-sm">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#eef4fb] shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDialPadToggle}
              aria-pressed={dialPadOpen}
              className="inline-flex items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Grid2x2 size={14} />
              Dial Pad
            </button>
          </div>

          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-300">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-[11px] font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
              {currentUser.avatar}
            </div>
          </div>
        </div>

        {uploadMessage ? (
          <div className="border-b border-cyan-200 bg-cyan-50 px-4 py-2 text-[12px] text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-950/20 dark:text-cyan-300">
            {uploadMessage}
          </div>
        ) : null}

        {callbackMessage ? (
          <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-[12px] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-300">
            {callbackMessage}
          </div>
        ) : null}

        {callError ? (
          <div className="border-b border-rose-200 bg-rose-50/80 px-4 py-3 dark:border-rose-500/20 dark:bg-rose-950/20">
            <AlertBanner
              title="Softphone error"
              description={callError}
              tone="error"
            />
          </div>
        ) : null}

        {dialPadOpen ? (
          <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="space-y-3 rounded-[18px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold text-slate-900 dark:text-white">
                      Manual dial
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Type or tap a number, then start the call.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDialPadOpen(false)}
                    className="rounded-[12px] border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
                  >
                    Close
                  </button>
                </div>
                <input
                  value={dialPadValue}
                  onChange={(event) => handleDialPadInputChange(event.target.value)}
                  placeholder="Enter number"
                  className="crm-input text-[13px] tracking-[0.18em]"
                />
                <div className="grid grid-cols-3 gap-2">
                  {dialPadKeys.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleDialPadAppend(key)}
                      className="rounded-[14px] border border-slate-200 bg-white px-3 py-3 text-[14px] font-semibold text-slate-800 transition hover:border-sky-400 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      {key}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleDialPadBackspace}
                    disabled={!dialPadValue}
                  >
                    Backspace
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDialPadInputChange("")}
                    disabled={!dialPadValue}
                  >
                    Clear
                  </Button>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => void handleDialPadCall()}
                  disabled={!dialPadValue || Boolean(activeCall)}
                >
                  <PhoneCall size={14} />
                  {activeCall ? "Call in progress" : "Call number"}
                </Button>
                {dialPadMessage ? (
                  <p className="text-[12px] text-rose-600 dark:text-rose-300">{dialPadMessage}</p>
                ) : null}
              </div>

              <div className="space-y-3 rounded-[18px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold text-slate-900 dark:text-white">
                      Quick fill
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Pull numbers from the current record or paste a new one.
                    </p>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {activeLead.fullName}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {quickFillNumbers.length ? (
                    quickFillNumbers.map((value, index) => (
                      <button
                        key={`${value}-${index}`}
                        type="button"
                        onClick={() => handleDialPadInputChange(value)}
                        className="rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 transition hover:border-sky-400 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                      >
                        {formatPhone(value)}
                      </button>
                    ))
                  ) : (
                    <span className="text-[12px] text-slate-500 dark:text-slate-400">
                      No numbers on this lead.
                    </span>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    { label: "Primary", value: activeLead.phone || "--" },
                    { label: "Alternate", value: activeLead.altPhone || "--" },
                    {
                      label: "Selected lead",
                      value: activeLead.company || activeLead.fullName,
                    },
                  ].map((item) => (
                    <div key={item.label} className="crm-subtle-card px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                        {item.label}
                      </p>
                      <p className="mt-1 text-[13px] font-medium text-slate-900 dark:text-white">
                        {item.label === "Selected lead" ? item.value : formatPhone(item.value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid xl:min-h-[calc(100vh-245px)] xl:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white">Calls</h2>
              </div>
            </div>

            <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-center justify-between text-[12px] font-medium text-slate-700 dark:text-slate-200">
                <span>Active</span>
                <ChevronDown size={14} />
              </div>
              <button
                type="button"
                onClick={() => selectLead(activeLead.id)}
                className="mt-3 flex w-full items-center gap-3 rounded-[4px] bg-[#4c88bc] px-4 py-3 text-left text-white"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/30 text-[12px] font-semibold">
                  {getInitials(activeLead.fullName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{activeLead.fullName}</p>
                  <p className="mt-0.5 text-[12px] text-white/85">{formatPhone(activeLead.phone)}</p>
                </div>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ff6d63]">
                  <PhoneOff size={14} className="text-white" />
                </div>
              </button>
            </div>

            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex items-center justify-between text-[12px] font-medium text-slate-700 dark:text-slate-200">
                <span>Queue ({queuedLeads.length})</span>
                <ChevronDown size={14} />
              </div>
              <div className="mt-3 grid gap-2">
                <label className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={queueSearch}
                    onChange={(event) => setQueueSearch(event.target.value)}
                    placeholder="Search queue"
                    className="crm-input py-2 pl-9 text-[12px]"
                  />
                </label>
                <select
                  value={queueSort}
                  onChange={(event) =>
                    setQueueSort(event.target.value as "priority" | "newest" | "callback_due")
                  }
                  className="crm-input py-2 text-[12px]"
                >
                  <option value="priority">Priority</option>
                  <option value="newest">Newest</option>
                  <option value="callback_due">Callback due</option>
                </select>
                <select
                  value={queueFilter}
                  onChange={(event) => setQueueFilter(event.target.value as QueueFilter)}
                  className="crm-input py-2 text-[12px]"
                >
                  <option value="all">All active</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="callback_due">Callback due</option>
                  <option value="follow_up">Follow up</option>
                  <option value="qualified">Qualified</option>
                  <option value="appointment_booked">Appointment booked</option>
                </select>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <FileUp size={14} />
                  {uploading ? "Importing..." : "Import file"}
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={handleBulkFileUpload}
                  />
                </label>
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {filteredQueuedLeads.length ? (
                filteredQueuedLeads.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => selectLead(lead.id)}
                    className="flex w-full items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                        {getInitials(lead.fullName)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-slate-900 dark:text-white">
                          {lead.fullName}
                        </p>
                        <p className="truncate text-[12px] text-slate-500 dark:text-slate-400">
                          {formatPhone(lead.phone)}
                        </p>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {formatRelativeTime(lead.lastContacted || lead.createdAt)}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-6 text-[12px] text-slate-500 dark:text-slate-400">
                  No queued leads match this search.
                </div>
              )}
            </div>

            <button
              type="button"
              className="flex w-full items-center justify-between border-t border-slate-200 px-4 py-3 text-[12px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              <span>Recent Calls</span>
              <ChevronRight size={14} />
            </button>

            <div className="space-y-3 border-t border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="grid grid-cols-3 gap-2">
                <Button size="sm" variant="secondary" onClick={previousLead} disabled={Boolean(wrapUpLeadId)}>
                  <ChevronLeft size={14} />
                </Button>
                <Button size="sm" variant="secondary" onClick={nextLead} disabled={Boolean(wrapUpLeadId)}>
                  <ChevronRight size={14} />
                </Button>
                <Button size="sm" variant="ghost" onClick={skipLead} disabled={Boolean(wrapUpLeadId)}>
                  <SkipForward size={14} />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
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
                  <CalendarClock size={14} />
                  Callback
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void markLeadInvalid()}
                  disabled={Boolean(wrapUpLeadId)}
                >
                  <XCircle size={14} />
                  Invalid
                </Button>
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Auto dial
                  </p>
                  <button
                    type="button"
                    onClick={() => setAutoDialEnabled(!autoDialEnabled)}
                    disabled={Boolean(activeCall)}
                    className={cn(
                      "relative h-6 w-11 rounded-full transition",
                      autoDialEnabled ? "bg-surface-700" : "bg-slate-300 dark:bg-slate-700",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1 h-4 w-4 rounded-full bg-white transition",
                        autoDialEnabled ? "left-6" : "left-1",
                      )}
                    />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_92px] gap-2">
                  <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                    {activeCall
                      ? "Paused during call"
                      : autoDialEnabled && autoDialCountdown !== null
                        ? `Next in ${autoDialCountdown}s`
                        : autoDialEnabled
                          ? "Queue armed"
                          : "Off"}
                  </div>
                  <select
                    value={autoDialDelaySeconds}
                    onChange={(event) => setAutoDialDelaySeconds(Number(event.target.value))}
                    className="rounded-md border border-slate-200 bg-white px-2 py-2 text-[12px] outline-none focus:border-surface-600 dark:border-slate-700 dark:bg-slate-950"
                    disabled={!autoDialEnabled || Boolean(activeCall)}
                  >
                    <option value={2}>2 sec</option>
                    <option value={3}>3 sec</option>
                    <option value={5}>5 sec</option>
                    <option value={8}>8 sec</option>
                  </select>
                </div>
              </div>

              {callbackPanelOpen ? (
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                  <div className="grid gap-2">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "+30m", value: buildQuickCallbackInput(0.5) },
                        { label: "+2h", value: buildQuickCallbackInput(2) },
                        { label: "Tomorrow 9:30", value: buildQuickCallbackInput(1, 9, 30) },
                      ].map((shortcut) => (
                        <button
                          key={shortcut.label}
                          type="button"
                          onClick={() => setCallbackAt(shortcut.value)}
                          className="rounded-md border border-slate-200 bg-white px-2 py-2 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                        >
                          {shortcut.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="datetime-local"
                      value={scheduleCallbackDraft}
                      onChange={(event) => setCallbackAt(event.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-surface-600 dark:border-slate-700 dark:bg-slate-950"
                    />
                    <select
                      value={callbackPriority}
                      onChange={(event) => setCallbackPriority(event.target.value as LeadPriority)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-surface-600 dark:border-slate-700 dark:bg-slate-950"
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
                </div>
              ) : null}
            </div>
          </aside>

          <section className="min-w-0">
            <div className="rounded-none border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#ff8f7b] text-[12px] font-semibold text-white">
                    {headerInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">
                      {headerName}
                    </p>
                    <p className="truncate text-[12px] text-slate-500 dark:text-slate-400">
                      {formatPhone(headerPhone)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleMute}
                    disabled={!activeCall || manualCallActive}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Mic size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={activeCall?.status === "on_hold" ? resumeCall : holdCall}
                    disabled={!activeCall || manualCallActive}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Pause size={15} />
                  </button>
                  <div className="min-w-[60px] text-right text-[16px] font-medium text-slate-800 dark:text-white">
                    {activeCall ? formatDuration(heroTimer) : "00:00"}
                  </div>
                  {activeCall ? (
                    <Button size="md" variant="danger" onClick={endCall}>
                      <PhoneOff size={15} />
                      {manualCallActive ? "Finish manual call" : "End call"}
                    </Button>
                  ) : (
                    <Button size="md" onClick={() => void startCall().catch(() => undefined)}>
                      <PhoneCall size={15} />
                      Call
                    </Button>
                  )}
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 transition hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge className={getLeadStatusTone(activeLead.status)}>
                  {activeLead.status.replace("_", " ")}
                </Badge>
                <Badge className={getPriorityTone(activeLead.priority)}>{activeLead.priority}</Badge>
                <div className="text-[12px] text-slate-500 dark:text-slate-400">
                  Queue {Math.max(queuePosition, 0)} / {queue.length || 1}
                </div>
              </div>
            </div>

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
              {wrapUpLeadId ? (
                <PostCallPanel
                  open={Boolean(wrapUpLeadId)}
                  leadName={activeLead.fullName}
                  onSave={saveDisposition}
                />
              ) : null}

              {workspaceTab === "about" ? (
                <>
                  <div className="grid gap-4">
                    <DetailSection title="Contact details">
                      <div className="space-y-4">
                        {contactDetails.map((item) => (
                          <div key={item.label} className="flex gap-3">
                            <div className="mt-0.5 text-slate-400 dark:text-slate-500">
                              <item.icon size={15} />
                            </div>
                            <div>
                              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                                {item.label}
                              </p>
                              <p className="mt-0.5 text-[13px] text-slate-900 dark:text-white">
                                {item.value}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </DetailSection>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                    <DetailSection
                      title="Satisfaction"
                      action={
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          View reporting
                        </button>
                      }
                    >
                      {callEntries.length ? (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-left text-[12px]">
                            <thead className="text-slate-500 dark:text-slate-400">
                              <tr>
                                <th className="pb-3 pr-4 font-medium">Rating</th>
                                <th className="pb-3 pr-4 font-medium">Comment</th>
                                <th className="pb-3 pr-4 font-medium">Agent</th>
                                <th className="pb-3 font-medium">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {callEntries.slice(0, 5).map((call) => (
                                <tr
                                  key={call.id}
                                  className="border-t border-slate-200 dark:border-slate-800"
                                >
                                  <td className="py-3 pr-4">
                                    <Badge className={getDispositionTone(call.disposition)}>
                                      {call.disposition}
                                    </Badge>
                                  </td>
                                  <td className="py-3 pr-4 text-slate-700 dark:text-slate-300">
                                    {call.outcomeSummary || call.notes || "No summary"}
                                  </td>
                                  <td className="py-3 pr-4 text-slate-700 dark:text-slate-300">
                                    {call.agentName}
                                  </td>
                                  <td className="py-3 text-slate-500 dark:text-slate-400">
                                    {formatDateTime(call.createdAt)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-[12px] text-slate-500 dark:text-slate-400">No calls yet.</p>
                      )}
                    </DetailSection>

                    <DetailSection title="Queue overview">
                      <div className="space-y-4">
                        {productivityHint ? (
                          <div className="rounded-[10px] border border-sky-200 bg-sky-50 px-3 py-3 dark:border-sky-500/20 dark:bg-sky-950/20">
                            <p className="text-[12px] font-semibold text-slate-900 dark:text-white">
                              {productivityHint.title}
                            </p>
                            <p className="mt-1 text-[11px] leading-5 text-slate-600 dark:text-slate-300">
                              {productivityHint.detail}
                            </p>
                          </div>
                        ) : null}
                        {duplicateInsight ? (
                          <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-3 dark:border-amber-500/20 dark:bg-amber-950/20">
                            <p className="text-[12px] font-semibold text-slate-900 dark:text-white">
                              Duplicate watch
                            </p>
                            <p className="mt-1 text-[11px] leading-5 text-slate-600 dark:text-slate-300">
                              {duplicateInsight.count} records share this {duplicateInsight.matchType}.
                            </p>
                          </div>
                        ) : null}
                        <div>
                          <p className="text-[12px] text-slate-500 dark:text-slate-400">Assigned</p>
                          <p className="mt-1 text-[13px] text-slate-900 dark:text-white">
                            {activeLead.assignedAgentName}
                          </p>
                        </div>
                        <div>
                          <p className="text-[12px] text-slate-500 dark:text-slate-400">Last contacted</p>
                          <p className="mt-1 text-[13px] text-slate-900 dark:text-white">
                            {formatDateTime(activeLead.lastContacted)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[12px] text-slate-500 dark:text-slate-400">Next callback</p>
                          <p className="mt-1 text-[13px] text-slate-900 dark:text-white">
                            {formatDateTime(activeLead.callbackTime)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[12px] text-slate-500 dark:text-slate-400">Auto dial</p>
                          <p className="mt-1 text-[13px] text-slate-900 dark:text-white">
                            {autoDialEnabled
                              ? autoDialCountdown !== null
                                ? `Next in ${autoDialCountdown}s`
                                : `${autoDialDelaySeconds}s delay`
                              : "Off"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[12px] text-slate-500 dark:text-slate-400">Lead score</p>
                          <p className="mt-1 text-[13px] text-slate-900 dark:text-white">
                            {activeLead.leadScore} / 100
                          </p>
                        </div>
                      </div>
                    </DetailSection>
                  </div>
                </>
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
                        <p className="text-[12px] text-slate-500 dark:text-slate-400">No notes yet.</p>
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

              {workspaceTab === "history" ? (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <DetailSection title="Call history">
                    <div className="space-y-3">
                      {callEntries.length ? (
                        callEntries.map((call) => (
                          <div
                            key={call.id}
                            className="rounded-[16px] border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge className={getDispositionTone(call.disposition)}>
                                  {call.disposition}
                                </Badge>
                                <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  {formatDuration(call.durationSeconds)}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {formatDateTime(call.createdAt)}
                              </p>
                            </div>
                            <p className="mt-2 text-[12px] text-slate-600 dark:text-slate-300">
                              {call.outcomeSummary || call.notes || "No summary"}
                            </p>
                            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                              {call.agentName}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-[12px] text-slate-500 dark:text-slate-400">No calls yet.</p>
                      )}
                    </div>
                  </DetailSection>

                  <DetailSection title="Call actions">
                    <div className="space-y-2">
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => void startCall().catch(() => undefined)}
                        disabled={Boolean(activeCall)}
                      >
                        <PhoneCall size={14} />
                        Call now
                      </Button>
                      <Button size="sm" variant="danger" className="w-full" onClick={endCall} disabled={!activeCall}>
                        <PhoneOff size={14} />
                        {manualCallActive ? "Finish manual call" : "End call"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onClick={toggleMute}
                        disabled={!activeCall || manualCallActive}
                      >
                        <Mic size={14} />
                        {activeCall?.muted ? "Unmute" : "Mute"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onClick={activeCall?.status === "on_hold" ? resumeCall : holdCall}
                        disabled={!activeCall || manualCallActive}
                      >
                        <Pause size={14} />
                        {activeCall?.status === "on_hold" ? "Resume" : "Hold"}
                      </Button>
                    </div>
                  </DetailSection>
                </div>
              ) : null}

              {workspaceTab === "timeline" ? (
                <div className="rounded-[18px] border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
                  <ActivityTimeline lead={activeLead} embedded />
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
