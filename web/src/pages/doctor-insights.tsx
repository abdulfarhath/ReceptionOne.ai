import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import { ErrorState, Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAvailability, getDoctorInsights } from "@/lib/api";
import type { DoctorDayDemand } from "@/lib/schemas";
import { dayName, minutesToIstLabel, todayIsoDate } from "@/lib/time";

/** Shift a "YYYY-MM" string by `delta` months. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map((n) => Number.parseInt(n, 10));
  const idx = (y ?? 0) * 12 + (m ?? 1) - 1 + delta;
  const year = Math.floor(idx / 12);
  const mon = (idx % 12) + 1;
  return `${year}-${String(mon).padStart(2, "0")}`;
}

const monthLabelFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
function monthLabel(month: string): string {
  return monthLabelFmt.format(new Date(`${month}-15T00:00:00Z`));
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
        <div className="mt-1 text-sm text-muted-foreground">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

/** A dependency-free bar chart of tokens joined per day (done segment shaded). */
const CHART_HEIGHT = 150; // px — the plot area the bars are scaled against

function DemandChart({ perDay }: { perDay: DoctorDayDemand[] }) {
  const max = Math.max(1, ...perDay.map((d) => d.joined));
  // Pixel heights (percentages don't resolve inside an auto-height flex column).
  const px = (n: number) => (Math.max(0, n) / max) * CHART_HEIGHT;
  const hasData = perDay.some((d) => d.joined > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-success" /> Done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" /> Other (no-show / cancelled / active)
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex min-w-[640px] items-end gap-1">
          {perDay.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-t bg-muted/40"
                style={{ height: CHART_HEIGHT }}
                title={`${d.date}: ${d.joined} joined, ${d.done} done${
                  d.noShow ? `, ${d.noShow} no-show` : ""
                }${d.cancelled ? `, ${d.cancelled} cancelled` : ""}`}
              >
                <div
                  className="w-full bg-primary"
                  style={{ height: px(d.joined - d.done) }}
                />
                <div
                  className="w-full bg-success"
                  style={{ height: px(d.done) }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {Number(d.date.slice(-2))}
              </span>
            </div>
          ))}
        </div>
      </div>
      {!hasData ? (
        <p className="text-sm text-muted-foreground">
          No tokens recorded for this month.
        </p>
      ) : null}
    </div>
  );
}

export function DoctorInsightsPage() {
  const { id = "" } = useParams();
  const [month, setMonth] = useState(() => todayIsoDate().slice(0, 7));

  const insightsQuery = useQuery({
    queryKey: ["doctor-insights", id, month],
    queryFn: () => getDoctorInsights(id, month),
    enabled: id !== "",
  });
  const availabilityQuery = useQuery({
    queryKey: ["doctor-availability", id],
    queryFn: () => getAvailability(id),
    enabled: id !== "",
  });

  return (
    <div className="space-y-6">
      <Link
        to="/app/doctors"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Doctors
      </Link>

      {insightsQuery.isLoading ? (
        <Spinner label="Loading insights…" />
      ) : insightsQuery.isError ? (
        <ErrorState
          message={(insightsQuery.error as Error).message}
          onRetry={() => void insightsQuery.refetch()}
        />
      ) : insightsQuery.data ? (
        (() => {
          const { doctor, summary } = insightsQuery.data;
          return (
            <>
              <div>
                <h1 className="font-display text-[26px] font-extrabold tracking-tight text-ink">
                  {doctor.name}
                </h1>
                <p className="mt-1 text-[13.5px] text-muted-foreground">
                  {doctor.department} · demand &amp; session hours
                </p>
              </div>

              {/* Session hours (when the queue is open) */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Session hours</CardTitle>
                </CardHeader>
                <CardContent>
                  {(availabilityQuery.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No session hours set.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {(availabilityQuery.data ?? []).map((w) => (
                        <li key={w.id}>
                          {dayName(w.dayOfWeek)}: {minutesToIstLabel(w.startMinutes)}
                          –{minutesToIstLabel(w.endMinutes)}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Monthly demand */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-extrabold text-ink">
                  Demand
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMonth((m) => shiftMonth(m, -1))}
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </Button>
                  <span className="min-w-32 text-center text-sm font-medium">
                    {monthLabel(month)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMonth((m) => shiftMonth(m, 1))}
                    aria-label="Next month"
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Tokens this month" value={summary.totalJoined} />
                <Stat label="Seen (done)" value={summary.totalDone} />
                <Stat label="No-shows" value={summary.totalNoShow} />
                <Stat
                  label="Busiest day"
                  value={summary.busiestDate ? `${summary.busiestCount}` : "—"}
                  hint={
                    summary.busiestDate
                      ? `on the ${Number(summary.busiestDate.slice(-2))}`
                      : undefined
                  }
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Tokens per day · avg {summary.averagePerDay}/day
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DemandChart perDay={summary.perDay} />
                </CardContent>
              </Card>
            </>
          );
        })()
      ) : null}
    </div>
  );
}
