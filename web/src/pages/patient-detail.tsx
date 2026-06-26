import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { ErrorState, Spinner } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPatientDetail } from "@/lib/api";
import type { PatientAppointment } from "@/lib/schemas";
import { STATUS_LABEL, statusVariant } from "@/lib/queue";
import { formatLongDate } from "@/lib/time";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
        <div className="mt-1 text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function HistoryRow({ appt }: { appt: PatientAppointment }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div>
        <div className="font-medium">
          {formatLongDate(appt.queueDate)} · token #{appt.token}
        </div>
        <div className="text-sm text-muted-foreground">
          {appt.doctorName}
          {appt.department ? ` — ${appt.department}` : ""}
        </div>
      </div>
      <Badge variant={statusVariant(appt.status)}>
        {STATUS_LABEL[appt.status]}
      </Badge>
    </li>
  );
}

export function PatientDetailPage() {
  const { id = "" } = useParams();
  const detailQuery = useQuery({
    queryKey: ["patient", id],
    queryFn: () => getPatientDetail(id),
    enabled: id !== "",
  });

  return (
    <div className="space-y-6">
      <Link
        to="/patients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All patients
      </Link>

      {detailQuery.isLoading ? (
        <Spinner label="Loading patient…" />
      ) : detailQuery.isError ? (
        <ErrorState
          message={(detailQuery.error as Error).message}
          onRetry={() => void detailQuery.refetch()}
        />
      ) : detailQuery.data ? (
        (() => {
          const { patient, summary, history } = detailQuery.data;
          return (
            <>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {patient.name}
                </h1>
                <p className="text-muted-foreground">{patient.phone}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <Stat label="Total visits" value={summary.total} />
                <Stat label="Active" value={summary.active} />
                <Stat label="Completed" value={summary.completed} />
                <Stat label="No-shows" value={summary.noShow} />
                <Stat label="Cancelled" value={summary.cancelled} />
              </div>

              <Card>
                <CardContent className="grid gap-3 pt-6 text-sm sm:grid-cols-2">
                  <div>
                    <div className="text-muted-foreground">First visit</div>
                    <div className="font-medium">
                      {summary.firstVisitAt
                        ? formatLongDate(summary.firstVisitAt)
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Last visit</div>
                    <div className="font-medium">
                      {summary.lastVisitAt
                        ? formatLongDate(summary.lastVisitAt)
                        : "—"}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    History ({history.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {history.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">
                      No appointments yet.
                    </p>
                  ) : (
                    <ul className="divide-y border-t">
                      {history.map((appt) => (
                        <HistoryRow key={appt.id} appt={appt} />
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </>
          );
        })()
      ) : null}
    </div>
  );
}
