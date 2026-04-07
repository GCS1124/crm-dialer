import { FileUp, Search, Trash2, UserRoundPlus } from "lucide-react";
import { useState, type ChangeEvent } from "react";

import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { PageHeader } from "../components/shared/PageHeader";
import { useAppState } from "../hooks/useAppState";
import { parseLeadFile } from "../lib/csv";
import { formatDateTime, getLeadStatusTone, getPriorityTone } from "../lib/utils";
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

export function LeadManagementPage() {
  const { leads, users, uploadLeads, assignLead, bulkUpdateLeadStatus, deleteLeads } =
    useAppState();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>("follow_up");
  const [uploadTargetUserId, setUploadTargetUserId] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const agents = users.filter((user) => user.role === "agent");
  const filteredLeads = leads.filter((lead) => {
    const query = search.toLowerCase();
    const matchesSearch =
      lead.fullName.toLowerCase().includes(query) ||
      lead.company.toLowerCase().includes(query) ||
      lead.email.toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" ? true : lead.status === statusFilter;
    return matchesSearch && matchesStatus;
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
      setUploadMessage(
        `Imported ${result.added} leads. ${result.duplicates} duplicates skipped. ${parsed.invalidRows + result.invalidRows} invalid rows ignored.`,
      );
    } catch (error) {
      setUploadMessage(
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
        description="Upload CSV or Excel files, assign owners, update lead status in bulk, and keep queue quality clean."
        actions={
          <>
            <select
              value={uploadTargetUserId}
              onChange={(event) => setUploadTargetUserId(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">Upload unassigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  Upload to {agent.name}
                </option>
              ))}
            </select>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white dark:bg-white dark:text-slate-900">
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
              onClick={() => void deleteLeads(selectedLeadIds)}
              disabled={!selectedLeadIds.length || isBusy}
            >
              <Trash2 size={16} />
              Delete selected
            </Button>
          </>
        }
      />

      {uploadMessage ? (
        <Card className="border border-emerald-300/60 bg-emerald-50/80 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-300">
          {uploadMessage}
        </Card>
      ) : null}

      <Card className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.7fr_0.8fr_auto_auto]">
          <label className="relative">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, company, or email"
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | LeadStatus)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="all">All statuses</option>
            {bulkStatuses.map((status) => (
              <option key={status} value={status}>
                {status.replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            value={bulkStatus}
            onChange={(event) => setBulkStatus(event.target.value as LeadStatus)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
          >
            {bulkStatuses.map((status) => (
              <option key={status} value={status}>
                Bulk to {status.replace("_", " ")}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={() => void bulkUpdateLeadStatus(selectedLeadIds, bulkStatus)}
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

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
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
                    <p className="mt-1 text-slate-500 dark:text-slate-400">
                      {lead.company} - {lead.email}
                    </p>
                  </td>
                  <td className="px-4 py-4 align-top text-slate-600 dark:text-slate-300">
                    {lead.interest}
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
                        onChange={(event) => void assignLead(lead.id, event.target.value)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
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
    </div>
  );
}
