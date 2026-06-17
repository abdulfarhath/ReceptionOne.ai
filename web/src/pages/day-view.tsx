import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { RescheduleDialog } from "@/components/reschedule-dialog";
import { EmptyState, ErrorState, Spinner } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  ApiError,
  cancelAppointment,
  listAppointments,
  listDoctors,
} from "@/lib/api";
import type { AppointmentStatus, AppointmentView } from "@/lib/schemas";
import {
  addDaysIso,
  formatDayLabel,
  formatTime,
  istDateOf,
  todayIsoDate,
} from "@/lib/time";
import { cn } from "@/lib/utils";

const UPCOMING_DAYS = 14;

type ViewMode = "upcoming" | "day";

function statusBadge(status: AppointmentStatus) {
  switch (status) {
    case "BOOKED":
      return <Badge variant="success">Booked</Badge>;
    case "COMPLETED":
      return <Badge variant="secondary">Completed</Badge>;
    case "CANCELLED":
      return <Badge variant="muted">Cancelled</Badge>;
  }
}

const JUST_BOOKED_MS = 60_000;
function isJustBooked(appt: AppointmentView): boolean {
  return (
    appt.status === "BOOKED" &&
    Date.now() - new Date(appt.createdAt).getTime() < JUST_BOOKED_MS
  );
}

interface Group {
  key: string;
  heading: string;
  subheading: string;
  items: AppointmentView[];
}

export function DayViewPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialDate = searchParams.get("date");

  // Land on a specific day when arriving from a booking link; otherwise Upcoming.
  const [mode, setMode] = useState<ViewMode>(initialDate ? "day" : "upcoming");
  const [date, setDate] = useState(initialDate ?? todayIsoDate());
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [toReschedule, setToReschedule] = useState<AppointmentView | null>(null);
  const [toCancel, setToCancel] = useState<AppointmentView | null>(null);

  const today = useMemo(() => todayIsoDate(), []);
  const rangeEnd = useMemo(() => addDaysIso(today, UPCOMING_DAYS - 1), [today]);
  const doctorId = doctorFilter === "all" ? undefined : doctorFilter;

  const doctorsQuery = useQuery({ queryKey: ["doctors"], queryFn: listDoctors });
  const appointmentsQuery = useQuery({
    queryKey: [
      "appointments",
      mode,
      mode === "day" ? date : `${today}..${rangeEnd}`,
      doctorFilter,
    ],
    queryFn: () =>
      mode === "day"
        ? listAppointments(date, doctorId)
        : listAppointments(today, doctorId, rangeEnd),
    // Poll so bookings made elsewhere (e.g. WhatsApp) appear without reloading.
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelAppointment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["slots"] });
      toast.success("Appointment cancelled");
      setToCancel(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not cancel");
    },
  });

  // Day mode groups by doctor; Upcoming groups by date (rows then show the doctor).
  const groups = useMemo<Group[]>(() => {
    const data = appointmentsQuery.data ?? [];
    const map = new Map<string, Group>();
    if (mode === "day") {
      for (const item of data) {
        const g = map.get(item.doctorId);
        if (g) g.items.push(item);
        else
          map.set(item.doctorId, {
            key: item.doctorId,
            heading: item.doctorName,
            subheading: item.department,
            items: [item],
          });
      }
      return [...map.values()].sort((a, b) =>
        a.heading.localeCompare(b.heading),
      );
    }
    for (const item of data) {
      const day = istDateOf(item.start);
      const g = map.get(day);
      if (g) g.items.push(item);
      else
        map.set(day, {
          key: day,
          heading: formatDayLabel(day),
          subheading: `${data.filter((a) => istDateOf(a.start) === day).length} appointment(s)`,
          items: [item],
        });
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [appointmentsQuery.data, mode]);

  const showDoctorPerRow = mode === "upcoming";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Appointments</h1>
          <p className="text-muted-foreground">
            {mode === "day"
              ? formatDayLabel(date)
              : `Next ${UPCOMING_DAYS} days`}
          </p>
        </div>
        <Button asChild>
          <Link to="/appointments/new">
            <Plus className="size-4" aria-hidden />
            New appointment
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <span className="text-sm font-medium">View</span>
          <div className="flex gap-1 rounded-md border p-1">
            <Button
              variant={mode === "upcoming" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("upcoming")}
            >
              Upcoming
            </Button>
            <Button
              variant={mode === "day" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("day")}
            >
              By day
            </Button>
          </div>
        </div>

        {mode === "day" ? (
          <div className="space-y-1.5">
            <Label htmlFor="day">Date</Label>
            <Input
              id="day"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayIsoDate())}
              className="w-48"
            />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="doctor-filter">Doctor</Label>
          <Select
            id="doctor-filter"
            value={doctorFilter}
            onChange={(e) => setDoctorFilter(e.target.value)}
            className="w-56"
          >
            <option value="all">All doctors</option>
            {(doctorsQuery.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {appointmentsQuery.isPending ? (
        <Spinner label="Loading appointments…" />
      ) : appointmentsQuery.isError ? (
        <ErrorState
          message={(appointmentsQuery.error as Error).message}
          onRetry={() => void appointmentsQuery.refetch()}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title={
            mode === "day"
              ? "No appointments for this day"
              : "No upcoming appointments"
          }
          description="Book a new appointment to get started."
        >
          <Button asChild variant="outline">
            <Link to="/appointments/new">
              <Plus className="size-4" aria-hidden />
              New appointment
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <Card key={group.key}>
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between">
                  <span>{group.heading}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {group.subheading}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {group.items.map((appt) => {
                    const cancelled = appt.status === "CANCELLED";
                    const justBooked = isJustBooked(appt);
                    return (
                      <li
                        key={appt.id}
                        className={cn(
                          "flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0",
                          justBooked &&
                            "-mx-3 rounded-md bg-emerald-50 px-3 dark:bg-emerald-950/30",
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <span
                            className={cn(
                              "w-20 font-medium tabular-nums",
                              cancelled &&
                                "text-muted-foreground line-through",
                            )}
                          >
                            {formatTime(appt.start)}
                          </span>
                          <div>
                            <p className="font-medium">{appt.patientName}</p>
                            <p className="text-sm text-muted-foreground">
                              {appt.patientPhone}
                              {showDoctorPerRow ? ` · ${appt.doctorName}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {justBooked ? <Badge>New</Badge> : null}
                          {statusBadge(appt.status)}
                          {appt.status === "BOOKED" ? (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setToReschedule(appt)}
                              >
                                Reschedule
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setToCancel(appt)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RescheduleDialog
        appointment={toReschedule}
        onOpenChange={(open) => {
          if (!open) setToReschedule(null);
        }}
      />
      <ConfirmDialog
        open={toCancel !== null}
        onOpenChange={(open) => {
          if (!open) setToCancel(null);
        }}
        title="Cancel this appointment?"
        description={
          toCancel
            ? `${toCancel.patientName} at ${formatTime(toCancel.start)} with ${toCancel.doctorName}. This frees the slot.`
            : undefined
        }
        confirmLabel="Cancel appointment"
        cancelLabel="Keep it"
        destructive
        loading={cancelMutation.isPending}
        onConfirm={() => toCancel && cancelMutation.mutate(toCancel.id)}
      />
    </div>
  );
}
