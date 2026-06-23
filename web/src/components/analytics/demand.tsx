import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import type { Analytics, DemandPoint } from "@/lib/schemas";
import { CHART, hourLabel, WEEKDAY_LABELS, WEEKDAY_ORDER } from "./theme";

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid var(--border, #e2e8f0)",
  background: "var(--popover, #fff)",
  color: "var(--popover-foreground, #0f172a)",
};

// Recharts types the tooltip value broadly; coerce to a number for the label.
function bookingsFormatter(value: unknown): [string, string] {
  const v = typeof value === "number" ? value : Number(value) || 0;
  return [`${v} booking${v === 1 ? "" : "s"}`, "Visits"];
}

type Range = "daily" | "weekly" | "monthly";
const RANGES: { key: Range; label: string; axis: string }[] = [
  { key: "daily", label: "30 days", axis: "Day" },
  { key: "weekly", label: "12 weeks", axis: "Week" },
  { key: "monthly", label: "12 months", axis: "Month" },
];

export function DemandTrendChart({ demand }: { demand: Analytics["demand"] }) {
  const [range, setRange] = useState<Range>("monthly");
  const data: DemandPoint[] = demand[range];
  const active = RANGES.find((r) => r.key === range)!;
  // Avoid crowding the x-axis on the 30-day series.
  const interval = range === "daily" ? 4 : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Bookings over time — completed + booked visits per {active.axis.toLowerCase()}.
        </p>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.key}
              size="sm"
              variant={r.key === range ? "default" : "outline"}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
            <XAxis
              dataKey="label"
              interval={interval}
              tick={{ fontSize: 11, fill: CHART.axis }}
              tickLine={false}
              angle={range === "daily" ? -35 : 0}
              textAnchor={range === "daily" ? "end" : "middle"}
              height={range === "daily" ? 50 : 30}
            >
              <Label value={active.axis} position="insideBottom" offset={-2} fontSize={11} fill={CHART.axis} />
            </XAxis>
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} width={36}>
              <Label value="Bookings" angle={-90} position="insideLeft" fontSize={11} fill={CHART.axis} />
            </YAxis>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={bookingsFormatter}
            />
            <Line
              type="monotone"
              dataKey="bookings"
              name="Visits"
              stroke={CHART.booked}
              strokeWidth={2}
              dot={range === "monthly" ? { r: 3 } : false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** A compact bar chart that highlights the busiest bar in accent colour. */
function BusyBars({
  data,
  axisLabel,
  highlightMax,
}: {
  data: { name: string; bookings: number }[];
  axisLabel: string;
  highlightMax: boolean;
}) {
  const max = Math.max(0, ...data.map((d) => d.bookings));
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 22, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: CHART.axis }}
            tickLine={false}
            interval={0}
          >
            <Label value={axisLabel} position="insideBottom" offset={-2} fontSize={11} fill={CHART.axis} />
          </XAxis>
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART.axis }} tickLine={false} width={28} />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.15)" }}
            contentStyle={tooltipStyle}
            formatter={bookingsFormatter}
          />
          <Bar dataKey="bookings" name="Visits" radius={[3, 3, 0, 0]}>
            {data.map((d) => (
              <Cell
                key={d.name}
                fill={
                  highlightMax && d.bookings === max && max > 0
                    ? CHART.accent
                    : CHART.booked
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BusiestHours({ demand }: { demand: Analytics["demand"] }) {
  const data = demand.hourly.map((h) => ({
    name: hourLabel(h.hour),
    bookings: h.bookings,
  }));
  return <BusyBars data={data} axisLabel="Hour of day" highlightMax />;
}

export function BusiestWeekdays({ demand }: { demand: Analytics["demand"] }) {
  const byWeekday = new Map(demand.weekday.map((w) => [w.weekday, w.bookings]));
  const data = WEEKDAY_ORDER.map((wd) => ({
    name: WEEKDAY_LABELS[wd]!,
    bookings: byWeekday.get(wd) ?? 0,
  }));
  return <BusyBars data={data} axisLabel="Weekday" highlightMax />;
}
