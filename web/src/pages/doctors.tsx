import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { AvailabilityDialog } from "@/components/availability-dialog";
import { DoctorFormDialog } from "@/components/doctor-form-dialog";
import { EmptyState, ErrorState, Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listDoctors } from "@/lib/api";
import type { Doctor } from "@/lib/schemas";

export function DoctorsPage() {
  const doctorsQuery = useQuery({
    queryKey: ["doctors"],
    queryFn: listDoctors,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [hoursFor, setHoursFor] = useState<Doctor | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(doctor: Doctor) {
    setEditing(doctor);
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Doctors &amp; availability
          </h1>
          <p className="text-muted-foreground">
            Manage doctors and their weekly hours.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          Add doctor
        </Button>
      </div>

      {doctorsQuery.isLoading ? (
        <Spinner label="Loading doctors…" />
      ) : doctorsQuery.isError ? (
        <ErrorState
          message={(doctorsQuery.error as Error).message}
          onRetry={() => void doctorsQuery.refetch()}
        />
      ) : (doctorsQuery.data ?? []).length === 0 ? (
        <EmptyState
          title="No doctors yet"
          description="Add your first doctor to start taking appointments."
        >
          <Button onClick={openCreate} variant="outline">
            <Plus className="size-4" aria-hidden />
            Add doctor
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(doctorsQuery.data ?? []).map((doctor) => (
            <Card key={doctor.id}>
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between">
                  <span>{doctor.name}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {doctor.department}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {doctor.slotDurationMinutes}-minute slots
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(doctor)}
                  >
                    Edit details
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setHoursFor(doctor)}
                  >
                    Edit hours
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DoctorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        doctor={editing}
      />
      <AvailabilityDialog
        doctor={hoursFor}
        onOpenChange={(open) => {
          if (!open) setHoursFor(null);
        }}
      />
    </div>
  );
}
