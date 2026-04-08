import { BadgeCheck, CalendarDays, PhoneCall, StickyNote } from "lucide-react";

import type { Lead } from "../../types";
import { cn, formatDateTime } from "../../lib/utils";
import { Card } from "../shared/Card";

const icons = {
  call: PhoneCall,
  note: StickyNote,
  callback: CalendarDays,
  status: BadgeCheck,
  appointment: CalendarDays,
  sale: BadgeCheck,
};

export function ActivityTimeline({
  lead,
  embedded = false,
}: {
  lead: Lead;
  embedded?: boolean;
}) {
  const content = (
    <div className="space-y-4">
      <div className="space-y-3">
        {lead.activities.map((activity) => {
          const Icon = icons[activity.type];

          return (
            <div key={activity.id} className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-surface-50 text-surface-700 dark:bg-slate-800 dark:text-slate-200">
                <Icon size={16} />
              </div>
              <div className="min-w-0 flex-1 rounded-[18px] border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{activity.title}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {formatDateTime(activity.createdAt)}
                  </p>
                </div>
                <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
                  {activity.description}
                </p>
                <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                  {activity.actorName}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (embedded) {
    return <div className="px-5 py-4">{content}</div>;
  }

  return <Card className={cn("space-y-5")}>{content}</Card>;
}
