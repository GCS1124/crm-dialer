type TooltipEntry = {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
};

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
}

function formatTooltipValue(value: number | string | undefined) {
  if (typeof value === "number") {
    return new Intl.NumberFormat().format(value);
  }

  return value ?? "";
}

export function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-700/70 bg-slate-950/95 px-3 py-2 text-[12px] text-slate-100 shadow-xl shadow-slate-950/30 backdrop-blur">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label ?? "Details"}
      </p>
      <div className="space-y-1">
        {payload.map((entry, index) => {
          const seriesName = entry.name ?? entry.dataKey ?? `Series ${index + 1}`;

          return (
            <div key={`${seriesName}-${index}`} className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color ?? "#e2e8f0" }}
                />
                <span className="truncate font-medium text-slate-200">{seriesName}</span>
              </div>
              <span className="shrink-0 font-semibold text-white">
                {formatTooltipValue(entry.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
