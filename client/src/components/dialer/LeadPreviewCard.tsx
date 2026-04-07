import type { Lead } from "../../types";
import { formatDateTime, formatPhone, getLeadStatusTone, getPriorityTone } from "../../lib/utils";
import { Badge } from "../shared/Badge";
import { Card } from "../shared/Card";

export function LeadPreviewCard({
  lead,
  embedded = false,
}: {
  lead: Lead;
  embedded?: boolean;
}) {
  const fields: Array<[string, string]> = [
    ["Phone", formatPhone(lead.phone)],
    ["Alternate", lead.altPhone || "--"],
    ["Email", lead.email || "--"],
    ["Company", lead.company || "--"],
    ["Job title", lead.jobTitle || "--"],
    ["Location", lead.location || "--"],
    ["Source", lead.source || "--"],
    ["Interest", lead.interest || "--"],
    ["Assigned", lead.assignedAgentName || "--"],
    ["Last contacted", formatDateTime(lead.lastContacted)],
    ["Callback", formatDateTime(lead.callbackTime)],
    ["Timezone", lead.timezone],
  ];

  const content = (
    <div className="space-y-3">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2.5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={getPriorityTone(lead.priority)}>{lead.priority}</Badge>
              <Badge className={getLeadStatusTone(lead.status)}>
                {lead.status.replace("_", " ")}
              </Badge>
              {lead.tags.slice(0, 2).map((tag) => (
                <Badge
                  key={tag}
                  className="bg-slate-200 px-2 py-1 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  #{tag}
                </Badge>
              ))}
            </div>
            <h3 className="mt-2 truncate text-sm font-semibold text-slate-900 dark:text-white">
              {lead.fullName}
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {lead.company || "No company"} {lead.jobTitle ? `/ ${lead.jobTitle}` : ""}
            </p>
          </div>

          <div className="max-w-[320px] rounded-[14px] border border-slate-200 bg-white px-3 py-2.5 text-[11px] leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Summary
            </p>
            <p className="mt-1">{lead.notes || "No summary note saved yet for this record."}</p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {fields.map(([label, value]) => (
            <div
              key={label}
              className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                {label}
              </p>
              <p className="mt-1 text-[11px] font-medium text-slate-900 dark:text-white">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return <div>{content}</div>;
  }

  return <Card className="overflow-hidden p-0">{content}</Card>;
}
