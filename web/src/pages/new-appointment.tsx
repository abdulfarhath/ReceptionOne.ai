import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { SlotPicker } from "@/components/slot-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  ApiError,
  bookAppointment,
  createPatient,
  findPatientByPhone,
  listDoctors,
} from "@/lib/api";
import type { Patient } from "@/lib/schemas";
import { istDateOf, todayIsoDate } from "@/lib/time";

const E164 = /^\+[1-9]\d{6,14}$/;

const schema = z.object({
  phone: z.string().regex(E164, "Use international format, e.g. +919876543210"),
  name: z.string().optional(),
  consent: z.boolean().optional(),
  doctorId: z.string().min(1, "Choose a doctor"),
  start: z.string().min(1, "Choose an available time"),
});
type FormValues = z.infer<typeof schema>;

export function NewAppointmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const doctorsQuery = useQuery({ queryKey: ["doctors"], queryFn: listDoctors });

  const [date, setDate] = useState(todayIsoDate);
  // undefined = not looked up yet, null = looked up and new, Patient = existing.
  const [foundPatient, setFoundPatient] = useState<Patient | null | undefined>(
    undefined,
  );
  const [searching, setSearching] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    watch,
    getValues,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { phone: "", name: "", consent: false, doctorId: "", start: "" },
  });

  const doctorId = watch("doctorId");
  const phone = watch("phone");
  const start = watch("start");

  // Changing doctor or date invalidates the chosen slot.
  useEffect(() => {
    setValue("start", "");
  }, [doctorId, date, setValue]);

  // Editing the phone after a lookup clears the resolved patient.
  useEffect(() => {
    setFoundPatient(undefined);
  }, [phone]);

  async function runLookup() {
    const ok = await trigger("phone");
    if (!ok) return;
    setSearching(true);
    try {
      const patient = await findPatientByPhone(getValues("phone"));
      setFoundPatient(patient);
      if (patient) {
        setValue("name", patient.name);
        clearErrors(["name", "consent"]);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lookup failed");
    } finally {
      setSearching(false);
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      let patient = await findPatientByPhone(values.phone);
      if (!patient) {
        let invalid = false;
        if (!values.name || values.name.trim().length === 0) {
          setError("name", { message: "Name is required for a new patient" });
          invalid = true;
        }
        if (values.consent !== true) {
          setError("consent", {
            message: "Consent is required before messaging the patient",
          });
          invalid = true;
        }
        if (invalid) return;
        patient = await createPatient({
          phone: values.phone,
          name: (values.name ?? "").trim(),
          consent: true,
        });
      }
      const appt = await bookAppointment({
        doctorId: values.doctorId,
        patientId: patient.id,
        start: values.start,
      });
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      await queryClient.invalidateQueries({ queryKey: ["slots"] });
      toast.success("Appointment booked");
      navigate(`/?date=${istDateOf(appt.start)}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not book the appointment",
      );
    }
  });

  const showNewPatientFields = foundPatient === undefined || foundPatient === null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New appointment</h1>
        <p className="text-muted-foreground">
          Find the patient by phone, choose a doctor and an open time.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Patient</CardTitle>
            <CardDescription>
              Patients are identified by phone number.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone (E.164)</Label>
              <div className="flex gap-2">
                <Input
                  id="phone"
                  placeholder="+919876543210"
                  inputMode="tel"
                  aria-invalid={Boolean(errors.phone)}
                  {...register("phone")}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={runLookup}
                  disabled={searching}
                >
                  <Search className="size-4" aria-hidden />
                  {searching ? "Finding…" : "Find"}
                </Button>
              </div>
              {errors.phone ? (
                <p className="text-sm text-destructive">{errors.phone.message}</p>
              ) : null}
            </div>

            {foundPatient ? (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="success">Existing patient</Badge>
                <span className="font-medium">{foundPatient.name}</span>
              </div>
            ) : null}

            {showNewPatientFields ? (
              <>
                {foundPatient === null ? (
                  <p className="text-sm text-muted-foreground">
                    No patient with that phone — add their details to register them.
                  </p>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="name">Patient name</Label>
                  <Input
                    id="name"
                    aria-invalid={Boolean(errors.name)}
                    {...register("name")}
                  />
                  {errors.name ? (
                    <p className="text-sm text-destructive">
                      {errors.name.message}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-start gap-2">
                  <input
                    id="consent"
                    type="checkbox"
                    className="mt-1 size-4 rounded border-input"
                    {...register("consent")}
                  />
                  <Label htmlFor="consent" className="font-normal">
                    The patient consents to receive appointment messages.
                  </Label>
                </div>
                {errors.consent ? (
                  <p className="text-sm text-destructive">
                    {errors.consent.message}
                  </p>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Doctor &amp; time</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="doctor">Doctor</Label>
                <Select
                  id="doctor"
                  aria-invalid={Boolean(errors.doctorId)}
                  {...register("doctorId")}
                >
                  <option value="">Select a doctor…</option>
                  {(doctorsQuery.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.department}
                    </option>
                  ))}
                </Select>
                {errors.doctorId ? (
                  <p className="text-sm text-destructive">
                    {errors.doctorId.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="appt-date">Date</Label>
                <Input
                  id="appt-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value || todayIsoDate())}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium">Available times</span>
              <SlotPicker
                doctorId={doctorId || undefined}
                date={date}
                value={start || undefined}
                onSelect={(iso) =>
                  setValue("start", iso, { shouldValidate: true })
                }
              />
              {errors.start ? (
                <p className="text-sm text-destructive">{errors.start.message}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/")}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Booking…" : "Book appointment"}
          </Button>
        </div>
      </form>
    </div>
  );
}
