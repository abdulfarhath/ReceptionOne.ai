import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, createDoctor, updateDoctor } from "@/lib/api";
import type { Doctor } from "@/lib/schemas";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional().nullable(),
  department: z.string().min(1, "Department is required"),
  slotDurationMinutes: z.coerce
    .number()
    .int("Whole minutes only")
    .positive("Must be greater than zero")
    .max(480, "Keep it under 8 hours"),
});
type FormValues = z.input<typeof schema>;

interface DoctorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctor: Doctor | null;
}

export function DoctorFormDialog({
  open,
  onOpenChange,
  doctor,
}: DoctorFormDialogProps) {
  const queryClient = useQueryClient();
  const editing = doctor !== null;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", department: "", slotDurationMinutes: 30 },
  });

  useEffect(() => {
    if (open) {
      reset(
        doctor
          ? {
              name: doctor.name,
              phone: doctor.phone ?? "",
              department: doctor.department,
              slotDurationMinutes: doctor.slotDurationMinutes,
            }
          : { name: "", phone: "", department: "", slotDurationMinutes: 30 },
      );
    }
  }, [open, doctor, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        name: String(values.name),
        phone: values.phone ? (() => {
          let c = String(values.phone).replace(/[\s\(\)-]/g, "");
          if (c.length === 10 && /^\d+$/.test(c)) return `+91${c}`;
          return c;
        })() : null,
        department: String(values.department),
        slotDurationMinutes: Number(values.slotDurationMinutes),
      };
      return editing ? updateDoctor(doctor.id, payload) : createDoctor(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["doctors"] });
      toast.success(editing ? "Doctor updated" : "Doctor added");
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit doctor" : "Add doctor"}</DialogTitle>
        </DialogHeader>
        <form
          id="doctor-form"
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="doctor-name">Name</Label>
            <Input
              id="doctor-name"
              aria-invalid={Boolean(errors.name)}
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name.message as string}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doctor-phone">Phone Number (Optional)</Label>
            <Input
              id="doctor-phone"
              type="tel"
              placeholder="+1234567890"
              aria-invalid={Boolean(errors.phone)}
              {...register("phone")}
            />
            {errors.phone ? (
              <p className="text-sm text-destructive">{errors.phone.message as string}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doctor-dept">Department</Label>
            <Input
              id="doctor-dept"
              aria-invalid={Boolean(errors.department)}
              {...register("department")}
            />
            {errors.department ? (
              <p className="text-sm text-destructive">
                {errors.department.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doctor-slot">Slot length (minutes)</Label>
            <Input
              id="doctor-slot"
              type="number"
              min={1}
              aria-invalid={Boolean(errors.slotDurationMinutes)}
              {...register("slotDurationMinutes")}
            />
            {errors.slotDurationMinutes ? (
              <p className="text-sm text-destructive">
                {errors.slotDurationMinutes.message}
              </p>
            ) : null}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="doctor-form" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : editing ? "Save changes" : "Add doctor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
