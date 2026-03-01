import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TimeSeriesPoint } from "@/types";
import { formatDateTime } from "@/lib/utils";

interface Props {
  data: TimeSeriesPoint[];
  height?: number;
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-overlay px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-semibold text-foreground">{payload[0].value} events</p>
    </div>
  );
}

export function EventVolumeChart({ data, height = 200 }: Props) {
  const formatted = data.map((d) => ({
    ...d,
    label: formatDateTime(d.timestamp),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formatted} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="evGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="hsl(217 91% 60%)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(222 14% 20%)"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fill: "hsl(218 14% 58%)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "hsl(218 14% 58%)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="hsl(217 91% 60%)"
          strokeWidth={2}
          fill="url(#evGradient)"
          dot={false}
          activeDot={{ r: 4, fill: "hsl(217 91% 60%)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
