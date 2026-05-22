const legendItems = [
  { label: "On time", tone: "bg-emerald-500" },
  { label: "Late", tone: "bg-orange-500" },
  { label: "On break", tone: "bg-amber-500" },
  { label: "Absent", tone: "bg-rose-500" },
  { label: "Weekend", tone: "bg-slate-400 dark:bg-slate-600" },
  { label: "Interested", tone: "bg-emerald-500" },
  { label: "Not interested", tone: "bg-blue-500" },
  { label: "Completed", tone: "bg-violet-500" },
  { label: "Failed", tone: "bg-rose-500" },
];

function LegendChip({
  label,
  tone,
}: {
  label: string;
  tone: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
      <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
      {label}
    </span>
  );
}

export function StatusLegend() {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 shadow-[0_14px_40px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center gap-2">
        {legendItems.map((item) => (
          <LegendChip key={item.label} label={item.label} tone={item.tone} />
        ))}
      </div>
    </div>
  );
}
