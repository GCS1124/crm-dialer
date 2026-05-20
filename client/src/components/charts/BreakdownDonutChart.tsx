import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { ChartDatum } from "../../types";
import { ChartTooltip } from "./ChartTooltip";

const colors = ["#22d3ee", "#14b8a6", "#f59e0b", "#818cf8", "#fb7185", "#38bdf8"];

export function BreakdownDonutChart({ data }: { data: ChartDatum[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(15,23,42,0.05)" }} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={72}
            outerRadius={104}
            paddingAngle={4}
          >
            {data.map((entry, index) => (
              <Cell key={entry.label} fill={colors[index % colors.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
