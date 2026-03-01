import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { capitalize } from "@/lib/utils";

interface SeverityCount {
  severity: string;
  count: number;
}

interface Props {
  data: SeverityCount[];
  height?: number;
}

const COLORS: Record<string, string> = {
  critical: "hsl(0 84% 60%)",
  high:     "hsl(25 95% 53%)",
  medium:   "hsl(48 96% 47%)",
  low:      "hsl(215 16% 47%)",
};

function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
}) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="rounded-md border border-border bg-overlay px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{capitalize(name)}</p>
      <p className="text-muted-foreground">{value} alerts</p>
    </div>
  );
}

export function SeverityDonut({ data, height = 180 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={72}
          dataKey="count"
          nameKey="severity"
          paddingAngle={3}
          strokeWidth={0}
        >
          {data.map((entry) => (
            <Cell
              key={entry.severity}
              fill={COLORS[entry.severity] ?? "#64748b"}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => (
            <span className="text-xs text-muted-foreground">{capitalize(value)}</span>
          )}
          iconType="circle"
          iconSize={8}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
