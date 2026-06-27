import type { Analytics } from "@/lib/schemas";
import { hourLabel, WEEKDAY_LABELS, WEEKDAY_ORDER } from "./theme";

// Teal scale matched to CHART.booked (#0E7C6B = rgb(14,124,107)).
function cellColor(bookings: number, max: number): string {
  if (bookings <= 0 || max <= 0) return "transparent";
  const alpha = 0.12 + 0.88 * (bookings / max);
  return `rgba(14, 124, 107, ${alpha.toFixed(3)})`;
}

export function DemandHeatmap({ heatmap }: { heatmap: Analytics["heatmap"] }) {
  const { hours, cells, max } = heatmap;
  const byKey = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, c.bookings]));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="min-w-[420px]">
          {/* Header: weekday labels */}
          <div
            className="grid gap-1 text-center text-[11px] text-muted-foreground"
            style={{ gridTemplateColumns: "3rem repeat(7, minmax(0, 1fr))" }}
          >
            <div aria-hidden />
            {WEEKDAY_ORDER.map((wd) => (
              <div key={wd} className="font-medium">
                {WEEKDAY_LABELS[wd]}
              </div>
            ))}
          </div>
          {/* Rows: one per hour */}
          {hours.map((hour) => (
            <div
              key={hour}
              className="mt-1 grid items-center gap-1"
              style={{ gridTemplateColumns: "3rem repeat(7, minmax(0, 1fr))" }}
            >
              <div className="text-right text-[11px] tabular-nums text-muted-foreground">
                {hourLabel(hour)}
              </div>
              {WEEKDAY_ORDER.map((wd) => {
                const n = byKey.get(`${wd}:${hour}`) ?? 0;
                return (
                  <div
                    key={wd}
                    className="flex h-6 items-center justify-center rounded-sm border border-border/50 text-[10px] tabular-nums"
                    style={{
                      backgroundColor: cellColor(n, max),
                      color: n / Math.max(max, 1) > 0.55 ? "#fff" : "#0b2722",
                    }}
                    title={`${WEEKDAY_LABELS[wd]} ${hourLabel(hour)} — ${n} booking${
                      n === 1 ? "" : "s"
                    }`}
                  >
                    {n > 0 ? n : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
        <span>Less</span>
        <div
          className="h-2.5 w-28 rounded-sm border border-border/50"
          style={{
            background: "linear-gradient(to right, rgba(14,124,107,0.12), rgba(14,124,107,1))",
          }}
          aria-hidden
        />
        <span>More</span>
        <span className="ml-1">(max {max}/hr)</span>
      </div>
    </div>
  );
}
