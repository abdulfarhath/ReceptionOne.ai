import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { SlotPicker } from "@/components/slot-picker";
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
import { ApiError, rescheduleAppointment } from "@/lib/api";
import type { AppointmentView } from "@/lib/schemas";
import { formatTime, istDateOf } from "@/lib/time";

interface RescheduleDialogProps {
  appointment: AppointmentView | null;
  onOpenChange: (open: boolean) => void;
}

export function RescheduleDialog({
  appointment,
  onOpenChange,
}: RescheduleDialogProps) {
  return (
    <Dialog open={appointment !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {appointment ? (
          // key resets the form's state whenever a different appointment opens.
          <RescheduleForm
            key={appointment.id}
            appointment={appointment}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RescheduleForm({
  appointment,
  onDone,
}: {
  appointment: AppointmentView;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => istDateOf(appointment.start));
  const [selected, setSelected] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (iso: string) => rescheduleAppointment(appointment.id, iso),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["slots"] });
      toast.success("Appointment rescheduled");
      onDone();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not reschedule");
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Reschedule appointment</DialogTitle>
        <DialogDescription>
          {appointment.patientName} with {appointment.doctorName} — currently{" "}
          {formatTime(appointment.start)}.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="reschedule-date">New date</Label>
          <Input
            id="reschedule-date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSelected(undefined);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Available times</span>
          <SlotPicker
            doctorId={appointment.doctorId}
            date={date}
            value={selected}
            onSelect={setSelected}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={!selected || mutation.isPending}
          onClick={() => selected && mutation.mutate(selected)}
        >
          {mutation.isPending ? "Saving…" : "Confirm new time"}
        </Button>
      </DialogFooter>
    </>
  );
}
