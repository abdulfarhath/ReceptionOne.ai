import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ErrorState, Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ApiError, getAvailability, replaceAvailability } from "@/lib/api";
import type { Availability, Doctor } from "@/lib/schemas";
import {
  dayName,
  istClockToUtcMinutes,
  utcMinutesToIstClock,
} from "@/lib/time";

interface Row {
  dayOfWeek: number;
  start: string; // HH:MM (IST)
  end: string; // HH:MM (IST)
}

function clockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

function toRows(availability: Availability[]): Row[] {
  return availability.map((a) => ({
    dayOfWeek: a.dayOfWeek,
    start: utcMinutesToIstClock(a.startMinutes),
    end: utcMinutesToIstClock(a.endMinutes),
  }));
}

interface AvailabilityDialogProps {
  doctor: Doctor | null;
  onOpenChange: (open: boolean) => void;
}

export function AvailabilityDialog({
  doctor,
  onOpenChange,
}: AvailabilityDialogProps) {
  const open = doctor !== null;
  const query = useQuery({
    queryKey: ["availability", doctor?.id],
    queryFn: () => getAvailability(doctor!.id),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Weekly hours{doctor ? ` — ${doctor.name}` : ""}
          </DialogTitle>
          <DialogDescription>
            Times are in clinic local time (Asia/Kolkata).
          </DialogDescription>
        </DialogHeader>

        {!doctor || query.isLoading ? (
          <Spinner label="Loading hours…" />
        ) : query.isError ? (
          <ErrorState
            message={(query.error as Error).message}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <AvailabilityEditor
            key={doctor.id}
            doctorId={doctor.id}
            initial={toRows(query.data ?? [])}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AvailabilityEditor({
  doctorId,
  initial,
  onDone,
}: {
  doctorId: string;
  initial: Row[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>(initial);

  const mutation = useMutation({
    mutationFn: () => {
      const windows = rows.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        startMinutes: istClockToUtcMinutes(r.start),
        endMinutes: istClockToUtcMinutes(r.end),
      }));
      return replaceAvailability(doctorId, windows);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
      void queryClient.invalidateQueries({ queryKey: ["slots"] });
      toast.success("Hours updated");
      onDone();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not save hours");
    },
  });

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function save() {
    for (const r of rows) {
      if (clockToMinutes(r.end) <= clockToMinutes(r.start)) {
        toast.error(
          `On ${dayName(r.dayOfWeek)}, the end time must be after the start.`,
        );
        return;
      }
    }
    mutation.mutate();
  }

  return (
    <>
      <div className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hours set. Add a window to make this doctor bookable.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row, index) => (
              <li key={index} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`day-${index}`} className="text-xs">
                    Day
                  </Label>
                  <Select
                    id={`day-${index}`}
                    className="w-36"
                    value={row.dayOfWeek}
                    onChange={(e) =>
                      updateRow(index, { dayOfWeek: Number(e.target.value) })
                    }
                  >
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <option key={d} value={d}>
                        {dayName(d)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`start-${index}`} className="text-xs">
                    From
                  </Label>
                  <Input
                    id={`start-${index}`}
                    type="time"
                    className="w-32"
                    value={row.start}
                    onChange={(e) => updateRow(index, { start: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`end-${index}`} className="text-xs">
                    To
                  </Label>
                  <Input
                    id={`end-${index}`}
                    type="time"
                    className="w-32"
                    value={row.end}
                    onChange={(e) => updateRow(index, { end: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${dayName(row.dayOfWeek)} window`}
                  onClick={() =>
                    setRows((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { dayOfWeek: 1, start: "09:00", end: "17:00" },
            ])
          }
        >
          <Plus className="size-4" aria-hidden />
          Add window
        </Button>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save hours"}
        </Button>
      </DialogFooter>
    </>
  );
}
