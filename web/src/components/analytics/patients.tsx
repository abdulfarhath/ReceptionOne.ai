import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { Analytics } from "@/lib/schemas";
import { CHART, DONUT } from "./theme";

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid var(--border, #e2e8f0)",
  background: "var(--popover, #fff)",
  color: "var(--popover-foreground, #0f172a)",
};

function patientFormatter(value: unknown, name: unknown): [string, string] {
  const v = typeof value === "number" ? value : Number(value) || 0;
  return [`${v} patient${v === 1 ? "" : "s"}`, String(name)];
}

export function PatientDonut({
  patients,
}: {
  patients: Analytics["patients"];
}) {
  const data = [
    { name: "Returning", value: patients.returningPatients },
    { name: "New", value: patients.newPatients },
  ];
  const hasData = patients.totalPatients > 0;

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
      <div className="relative h-48">
        {hasData ? (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={76}
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                >
                  {data.map((d, i) => (
                    <Cell key={d.name} fill={DONUT[i]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={patientFormatter} />
                <Legend
                  verticalAlign="bottom"
                  height={24}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-x-0 top-[38%] -translate-y-1/2 text-center">
              <div className="text-2xl font-semibold leading-none tabular-nums">
                {patients.returningPct}%
              </div>
              <div className="text-[11px] text-muted-foreground">returning</div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No patient data yet.
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Total patients" value={patients.totalPatients} />
        <Stat label="Returning" value={patients.returningPatients} accent={CHART.completed} />
        <Stat label="New" value={patients.newPatients} accent={CHART.booked} />
        <Stat label="Retention" value={`${patients.retentionPct}%`} />
      </dl>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="rounded-md border p-2.5">
      <dd className="flex items-center gap-1.5 text-xl font-semibold tabular-nums">
        {accent ? (
          <span
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: accent }}
            aria-hidden
          />
        ) : null}
        {value}
      </dd>
      <dt className="mt-0.5 text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}
