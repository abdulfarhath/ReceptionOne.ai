import { Card, CardContent } from "@/components/ui/card";
import type { DoctorUtilization } from "@/lib/schemas";
import { CHART } from "./theme";

/** SVG circular gauge for a 0–100 percentage. */
function Gauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const size = 84;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;
  const color =
    v >= 80
      ? CHART.completed
      : v >= 50
        ? CHART.booked
        : v > 0
          ? CHART.accent
          : CHART.cancelled;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 text-foreground"
      role="img"
      aria-label={`${v} percent utilization`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={CHART.grid}
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="46%"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="currentColor"
        className="text-base font-semibold"
      >
        {v}%
      </text>
      <text
        x="50%"
        y="64%"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={CHART.axis}
        style={{ fontSize: 9 }}
      >
        util
      </text>
    </svg>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <div className="text-base font-semibold tabular-nums leading-none">
        {value}
      </div>
      <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

export function UtilizationCards({ doctors }: { doctors: DoctorUtilization[] }) {
  if (doctors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No doctors to report on.</p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {doctors.map((d) => (
        <Card key={d.id}>
          <CardContent className="flex items-center gap-3 p-3">
            <Gauge value={d.utilizationPct} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium leading-tight">{d.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {d.department}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <Metric label="Booked today" value={d.bookedToday} />
                <Metric label="Slots today" value={d.capacityToday} />
                <Metric label="Open today" value={d.openToday} />
                <Metric label="Open this week" value={d.openThisWeek} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
