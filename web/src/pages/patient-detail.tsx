import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";

import { TokenTile } from "@/components/brand";
import { ErrorState, Spinner } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { getPatientDetail } from "@/lib/api";
import type { AppointmentStatus, PatientAppointment } from "@/lib/schemas";
import { STATUS_PILL_LABEL, statusVariant } from "@/lib/queue";
import { formatLongDate } from "@/lib/time";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function tokenTone(status: AppointmentStatus) {
  switch (status) {
    case "IN_PROGRESS":
    case "ARRIVED":
      return "mint" as const;
    case "NO_SHOW":
      return "rose" as const;
    default:
      return "neutral" as const;
  }
}

function shortDate(iso: string): string {
  return formatLongDate(iso).replace(/^\w+,\s/, "").replace(/\s\d{4}$/, "");
}

function Stat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number | string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[10px] border border-line px-[13px] py-[11px]">
      <div className={`font-display text-[21px] font-extrabold ${valueClassName ?? "text-ink"}`}>
        {value}
      </div>
      <div className="text-[11px] text-faint">{label}</div>
    </div>
  );
}

function HistoryRow({ appt }: { appt: PatientAppointment }) {
  return (
    <div className="flex items-center gap-[11px]">
      <TokenTile token={appt.token} tone={tokenTone(appt.status)} size="sm" label="" />
      <div className="flex-1">
        <div className="text-[12.5px] font-semibold text-ink">
          {shortDate(appt.queueDate)} · {appt.doctorName}
        </div>
      </div>
      <Badge variant={statusVariant(appt.status)}>
        {STATUS_PILL_LABEL[appt.status]}
      </Badge>
    </div>
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
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        to="/app/patients"
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
          const lang = (patient as { language?: string }).language;
          return (
            <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-soft">
              {/* Gradient header */}
              <div className="bg-[radial-gradient(420px_200px_at_100%_-20%,rgba(237,162,59,0.16),transparent_60%),linear-gradient(160deg,#0A4339,#062B24)] p-5 text-[#eaf6f1]">
                <div className="flex items-center gap-[13px]">
                  <div className="grid size-[46px] place-items-center rounded-full border border-white/25 bg-white/[0.14] text-base font-bold text-white">
                    {initials(patient.name)}
                  </div>
                  <div>
                    <div className="font-display text-[19px] font-extrabold text-white">
                      {patient.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[11.5px] text-[#9fd0c3]">
                      {patient.phone}
                      {lang ? ` · ${lang.toUpperCase()}` : ""}
                    </div>
                  </div>
                </div>
                {patient.consentAt ? (
                  <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-[11px] py-1 text-[11px] text-[#bfe5da]">
                    <Check className="size-3" aria-hidden />
                    Consented {shortDate(patient.consentAt)}
                  </div>
                ) : (
                  <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-[11px] py-1 text-[11px] text-[#e7c9a0]">
                    No messaging consent
                  </div>
                )}
              </div>

              <div className="p-[18px]">
                <div className="mb-[18px] grid grid-cols-2 gap-2.5">
                  <Stat label="Total visits" value={summary.total} />
                  <Stat
                    label="Completed"
                    value={summary.completed}
                    valueClassName="text-success"
                  />
                  <Stat
                    label="No-shows"
                    value={summary.noShow}
                    valueClassName="text-noshow"
                  />
                  <Stat
                    label="Cancelled"
                    value={summary.cancelled}
                    valueClassName="text-muted-foreground"
                  />
                </div>

                <div className="mb-[11px] font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
                  Token history
                </div>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No appointments yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-[9px]">
                    {history.map((appt) => (
                      <HistoryRow key={appt.id} appt={appt} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()
      ) : null}
    </div>
  );
}
