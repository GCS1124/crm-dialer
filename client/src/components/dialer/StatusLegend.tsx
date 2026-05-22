const attendanceLegendItems = [
  { label: "On time", tone: "bg-emerald-500" },
  { label: "Late", tone: "bg-orange-500" },
  { label: "On break", tone: "bg-amber-500" },
  { label: "Absent", tone: "bg-rose-500" },
  { label: "Weekend / upcoming", tone: "bg-slate-400 dark:bg-slate-600" },
];

const callLegendItems = [
  { label: "Interested", tone: "bg-emerald-500" },
  { label: "Not interested", tone: "bg-blue-500" },
  { label: "Completed", tone: "bg-violet-500" },
  { label: "Failed / missed", tone: "bg-rose-500" },
];

function LegendRow({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; tone: string }>;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {title}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-600 dark:border-slate-800 dark:text-slate-300"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${item.tone}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatusLegend() {
  return (
    <div className="space-y-4 rounded-[18px] border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950">
      <LegendRow title="Attendance legend" items={attendanceLegendItems} />
      <LegendRow title="Call outcome legend" items={callLegendItems} />
    </div>
  );
}
