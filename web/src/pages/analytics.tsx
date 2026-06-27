import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import {
  BusiestHours,
  BusiestWeekdays,
  DemandTrendChart,
} from "@/components/analytics/demand";
import { DemandHeatmap } from "@/components/analytics/heatmap";
import { Leaderboard } from "@/components/analytics/leaderboard";
import { PatientDonut } from "@/components/analytics/patients";
import { UtilizationCards } from "@/components/analytics/utilization";
import { ErrorState, Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAnalytics } from "@/lib/api";
import { formatLongDate } from "@/lib/time";

function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`shadow-soft ${className ?? ""}`}>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-extrabold text-ink">
          {title}
        </CardTitle>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AnalyticsPage() {
  const query = useQuery({
    queryKey: ["analytics"],
    queryFn: getAnalytics,
    refetchOnWindowFocus: true,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold tracking-tight text-ink">
            Analytics
          </h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            Operational view across all doctors.
            {query.data ? ` As of ${formatLongDate(query.data.generatedAt)}.` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw
            className={query.isFetching ? "size-4 animate-spin" : "size-4"}
            aria-hidden
          />
          Refresh
        </Button>
      </div>

      {query.isLoading ? (
        <Spinner label="Crunching the numbers…" />
      ) : query.isError ? (
        <ErrorState
          message={(query.error as Error).message}
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        <div className="space-y-5">
          {/* 1. Doctor activity */}
          <section className="space-y-3">
            <h2 className="font-display text-lg font-extrabold text-ink">
              Doctor activity (today)
            </h2>
            <UtilizationCards doctors={query.data.doctors} />
          </section>

          {/* 2. Demand analytics */}
          <Section
            title="Demand trends"
            description="Visit volume over time. Toggle the range to compare day, week, and month."
          >
            <DemandTrendChart demand={query.data.demand} />
          </Section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section
              title="Busiest hours"
              description="Total visits by hour of day (08:00–20:00). Peak in amber."
            >
              <BusiestHours demand={query.data.demand} />
            </Section>
            <Section
              title="Busiest weekdays"
              description="Total visits by weekday. Peak in amber."
            >
              <BusiestWeekdays demand={query.data.demand} />
            </Section>
          </div>

          {/* 3. Heatmap */}
          <Section
            title="Demand heatmap"
            description="Bookings by hour × weekday — darker means busier."
          >
            <DemandHeatmap heatmap={query.data.heatmap} />
          </Section>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* 4. Patient insights */}
            <Section
              title="New vs returning patients"
              description="Share of patients who have booked more than once."
            >
              <PatientDonut patients={query.data.patients} />
            </Section>

            {/* 5. Leaderboard */}
            <Section
              title="Doctor leaderboard"
              description="Rank by visits seen, no-shows, or consult speed."
            >
              <Leaderboard doctors={query.data.doctors} />
            </Section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
