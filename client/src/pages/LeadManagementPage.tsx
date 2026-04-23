import { FileUp, Search, Trash2, UserRoundPlus } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { AlertBanner } from "../components/shared/AlertBanner";
import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { EmptyState } from "../components/shared/EmptyState";
import { MetricCard } from "../components/shared/MetricCard";
import { PageHeader } from "../components/shared/PageHeader";
import { useAppState } from "../hooks/useAppState";
import { parseLeadFile } from "../lib/csv";
import { formatDateTime, getInsightTone, getLeadStatusTone, getPriorityTone } from "../lib/utils";
import type { LeadStatus } from "../types";

const bulkStatuses: LeadStatus[] = [
  "new",
  "contacted",
  "callback_due",
  "follow_up",
  "qualified",
  "appointment_booked",
  "closed_won",
  "closed_lost",
  "invalid",
];

type LeadViewFilter = "all" | "hot" | "untouched" | "callbacks" | "duplicates" | "stale";

export function LeadManagementPage() {
  const {
    leads,
    users,
    analytics,
    uploadLeads,
    assignLead,
    bulkUpdateLeadStatus,
    deleteLeads,
    workspaceLoading,
  } = useAppState();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  const [viewFilter, setViewFilter] = useState<LeadViewFilter>("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>("follow_up");
  const [uploadTargetUserId, setUploadTargetUserId] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadTone, setUploadTone] = useState<"success" | "error">("success");
  const [isBusy, setIsBusy] = useState(false);

  const agents = users.filter((user) => user.role === "agent");
  const duplicateLeadIds = new Set(analytics.duplicateInsights.flatMap((group) => group.leadIds));
  const highlightedMetrics = [
    ...analytics.focusMetrics,
    {
      id: "duplicates",
      label: "Duplicates",
      value: analytics.duplicateInsights.length,
      hint: "Potential merge groups found in visible records",
      tone: "amber" as const,
    },
  ];

  const filteredLeads = leads.filter((lead) => {
    const query = search.toLowerCase();
    const matchesSearch =
      lead.fullName.toLowerCase().includes(query) ||
      lead.company.toLowerCase().includes(query) ||
      lead.email.toLowerCase().includes(query) ||
      lead.phone.toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" ? true : lead.status === statusFilter;
    const matchesTag = tagFilter === "all" ? true : lead.tags.includes(tagFilter);
    const freshnessHours = Math.floor(
      (Date.now() - new Date(lead.lastContacted || lead.updatedAt || lead.createdAt).getTime()) /
        (1000 * 60 * 60),
    );
    const matchesView =
      viewFilter === "all"
        ? true
        : viewFilter === "hot"
          ? lead.priority === "Urgent" || lead.priority === "High" || lead.leadScore >= 75
          : viewFilter === "untouched"
            ? lead.callHistory.length === 0 && lead.notesHistory.length === 0 && !lead.lastContacted
            : viewFilter === "callbacks"
              ? Boolean(lead.callbackTime)
              : viewFilter === "duplicates"
                ? duplicateLeadIds.has(lead.id)
                : freshnessHours >= 48;

    return matchesSearch && matchesStatus && matchesTag && matchesView;
  });

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds((existing) =>
      existing.includes(leadId)
        ? existing.filter((id) => id !== leadId)
        : [...existing, leadId],
    );
  };

  const handleSpreadsheetUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsBusy(true);
    try {
      const parsed = await parseLeadFile(file);
      const result = await uploadLeads(parsed.rows, uploadTargetUserId || undefined);
      setUploadTone("success");
      setUploadMessage(
        `Imported ${result.added} leads. ${result.duplicates} duplicates skipped. ${parsed.invalidRows + result.invalidRows} invalid rows ignored.`,
      );
      toast.success("Lead import completed.");
    } catch (error) {
      setUploadTone("error");
      setUploadMessage(
        error instanceof Error ? error.message : "Unable to import that spreadsheet.",
      );
      toast.error(
        error instanceof Error ? error.message : "Unable to import that spreadsheet.",
      );
    } finally {
      setIsBusy(false);
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Admin Controls"
        title="Lead management"
        description="Upload, assign, and clean your lead queue."
        actions={
          <>
            <select
              value={uploadTargetUserId}
              onChange={(event) => setUploadTargetUserId(event.target.value)}
              className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">Upload unassigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  Upload to {agent.name}
                </option>
              ))}
            </select>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#3b91c3] px-4 py-3 text-sm font-medium text-white dark:bg-white dark:text-slate-900">
              <FileUp size={16} />
              {isBusy ? "Uploading..." : "Upload CSV / Excel"}
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleSpreadsheetUpload}
              />
            </label>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await deleteLeads(selectedLeadIds);
                  toast.success("Selected leads deleted.");
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Unable to delete the selected leads.",
                  );
                }
              }}
              disabled={!selectedLeadIds.length || isBusy}
            >
              <Trash2 size={16} />
              Delete selected
            </Button>
          </>
        }
      />

      {uploadMessage ? (
        <AlertBanner
          title={uploadTone === "success" ? "Import status" : "Import failed"}
          description={uploadMessage}
          tone={uploadTone === "success" ? "success" : "error"}
        />
      ) : null}

      <div className="grid gap-3 xl:grid-cols-5">
        {highlightedMetrics.map((metric) => (
          <button
            key={metric.id}
            type="button"
            onClick={() =>
              setViewFilter(
                metric.id === "hot_leads"
                  ? "hot"
                  : metric.id === "untouched"
                    ? "untouched"
                    : metric.id === "duplicates"
                      ? "duplicates"
                      : metric.id === "overdue_callbacks" || metric.id === "due_today"
                        ? "callbacks"
                        : metric.id === "risk_stale"
                          ? "stale"
                          : "all",
              )
            }
            className="text-left"
          >
            <MetricCard
              label={metric.label}
              value={metric.value}
              hint={metric.hint}
              className="h-full p-4 text-left"
              valueClassName="mt-3 text-[26px]"
              action={
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${getInsightTone(metric.tone)}`}>
                  View
                </span>
              }
            />
          </button>
        ))}
      </div>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {[
            ["all", "All"],
            ["hot", "Hot"],
            ["untouched", "Untouched"],
            ["callbacks", "Callbacks"],
            ["duplicates", "Duplicates"],
            ["stale", "Stale"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setViewFilter(value as LeadViewFilter)}
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
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.7fr_0.7fr_0.8fr_auto_auto]">
          <label className="relative">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, company, or email"
              className="crm-input py-3 pl-11"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | LeadStatus)}
            className="crm-input"
          >
            <option value="all">All statuses</option>
            {bulkStatuses.map((status) => (
              <option key={status} value={status}>
                {status.replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            className="crm-input"
          >
            <option value="all">All tags</option>
            {Array.from(new Set(leads.flatMap((lead) => lead.tags))).map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
          <select
            value={bulkStatus}
            onChange={(event) => setBulkStatus(event.target.value as LeadStatus)}
            className="crm-input"
          >
            {bulkStatuses.map((status) => (
              <option key={status} value={status}>
                Bulk to {status.replace("_", " ")}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await bulkUpdateLeadStatus(selectedLeadIds, bulkStatus);
                toast.success("Lead statuses updated.");
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Unable to update the selected leads.",
                );
              }
            }}
            disabled={!selectedLeadIds.length || isBusy}
          >
            Update selected
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              setSelectedLeadIds(
                selectedLeadIds.length === filteredLeads.length
                  ? []
                  : filteredLeads.map((lead) => lead.id),
              )
            }
          >
            {selectedLeadIds.length === filteredLeads.length ? "Clear" : "Select all"}
          </Button>
        </div>
      </Card>

      {filteredLeads.length ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="crm-table">
            <thead>
              <tr>
                <th className="px-4 py-4">
                  <input
                    type="checkbox"
                    checked={
                      filteredLeads.length > 0 &&
                      selectedLeadIds.length === filteredLeads.length
                    }
                    onChange={() =>
                      setSelectedLeadIds(
                        selectedLeadIds.length === filteredLeads.length
                          ? []
                          : filteredLeads.map((lead) => lead.id),
                      )
                    }
                  />
                </th>
                <th className="px-4 py-4">Lead</th>
                <th className="px-4 py-4">Interest</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Priority</th>
                <th className="px-4 py-4">Assigned Agent</th>
                <th className="px-4 py-4">Last Contacted</th>
              </tr>
            </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-t border-slate-200/80 dark:border-slate-800"
                >
                  <td className="px-4 py-4 align-top">
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.includes(lead.id)}
                      onChange={() => toggleLead(lead.id)}
                    />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {lead.fullName}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {duplicateLeadIds.has(lead.id) ? (
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                          duplicate
                        </Badge>
                      ) : null}
                      {lead.callbackTime ? (
                        <Badge className="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
                          callback set
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                      {lead.company} - {lead.email}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {lead.tags.slice(0, 3).map((tag) => (
                        <Badge
                          key={tag}
                          className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                      Next step:{" "}
                      {lead.callbackTime
                        ? `Callback on ${formatDateTime(lead.callbackTime)}`
                        : lead.callHistory[0]?.outcomeSummary || "No next action captured"}
                    </p>
                  </td>
                  <td className="px-4 py-4 align-top text-slate-600 dark:text-slate-300">
                    <p>{lead.interest}</p>
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      Score {lead.leadScore}
                    </p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <Badge className={getLeadStatusTone(lead.status)}>
                      {lead.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <Badge className={getPriorityTone(lead.priority)}>{lead.priority}</Badge>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex items-center gap-3">
                      <UserRoundPlus size={16} className="text-slate-400" />
                      <select
                        value={lead.assignedAgentId}
                        onChange={async (event) => {
                          try {
                            await assignLead(lead.id, event.target.value);
                            toast.success("Lead assignment updated.");
                          } catch (error) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Unable to assign this lead.",
                            );
                          }
                        }}
                        className="rounded-md border border-slate-200 bg-white px-4 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                      >
                        <option value="">Unassigned</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-slate-500 dark:text-slate-400">
                    {formatDateTime(lead.lastContacted)}
                  </td>
                </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={Search}
          title={leads.length ? "No leads match this view" : workspaceLoading ? "Loading leads" : "No leads in the workspace"}
          description={
            leads.length
              ? "Adjust the filters or clear the search to see more lead records."
              : workspaceLoading
                ? "The CRM is loading lead records."
                : "Import a CSV or Excel file to start assigning leads."
          }
          action={
            leads.length ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setTagFilter("all");
                  setViewFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
