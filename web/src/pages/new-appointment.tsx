import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Search, Users } from "lucide-react";
import { toast } from "sonner";

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
  findPatientByPhone,
  joinQueue,
  listDoctors,
  quoteQueue,
} from "@/lib/api";
import { formatTime } from "@/lib/time";

const E164 = /^\+[1-9]\d{6,14}$/;

const schema = z
  .object({
    phone: z.string().regex(E164, "Use international format, e.g. +919876543210"),
    name: z.string().trim().min(1, "Patient name is required"),
    doctorId: z.string().min(1, "Choose a doctor"),
    isPriority: z.boolean().optional(),
    priorityReason: z.string().optional(),
    type: z.enum(["walkin", "booking"]),
  })
  .refine((d) => !d.isPriority || Boolean(d.priorityReason?.trim()), {
    message: "A reason is required for priority",
    path: ["priorityReason"],
  });
type FormValues = z.infer<typeof schema>;

interface BookingResult {
  estimateMinMinutes: number;
  estimateMaxMinutes: number;
  suggestedArrival: string;
  isWalkIn: boolean;
  name: string;
  doctorName: string;
  priorityWarning?: string;
}

const DEFAULTS: FormValues = {
  phone: "",
  name: "",
  doctorId: "",
  isPriority: false,
  priorityReason: "",
  type: "walkin",
};

export function NewAppointmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const doctorsQuery = useQuery({ queryKey: ["doctors"], queryFn: listDoctors });

  const [searching, setSearching] = useState(false);
  const [foundName, setFoundName] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    trigger,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  const doctorId = watch("doctorId");
  const isPriority = watch("isPriority");

  // Live wait estimate for the chosen doctor's queue today.
  const quoteQuery = useQuery({
    queryKey: ["quote", doctorId],
    queryFn: () => quoteQueue(doctorId),
    enabled: doctorId !== "",
    refetchInterval: 10_000,
  });

  const phone = watch("phone");
  useEffect(() => setFoundName(null), [phone]);

  async function runLookup() {
    if (!(await trigger("phone"))) return;
    setSearching(true);
    try {
      const patient = await findPatientByPhone(getValues("phone"));
      if (patient) {
        setValue("name", patient.name, { shouldValidate: true });
        setFoundName(patient.name);
      } else {
        setFoundName(null);
        toast.message("New patient — enter their name to register them.");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lookup failed");
    } finally {
      setSearching(false);
    }
  }

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      joinQueue({
        doctorId: values.doctorId,
        patientName: values.name.trim(),
        patientPhone: values.phone,
        isWalkIn: values.type === "walkin",
        ...(values.isPriority
          ? { isPriority: true, priorityReason: values.priorityReason?.trim() }
          : {}),
      }),
    onSuccess: (res, values) => {
      void queryClient.invalidateQueries({ queryKey: ["queue"] });
      const doctor = (doctorsQuery.data ?? []).find((d) => d.id === values.doctorId);
      setResult({
        estimateMinMinutes: res.estimateMinMinutes,
        estimateMaxMinutes: res.estimateMaxMinutes,
        suggestedArrival: res.suggestedArrival,
        isWalkIn: values.type === "walkin",
        name: values.name.trim(),
        doctorName: doctor?.name ?? "the doctor",
        ...(res.priorityWarning ? { priorityWarning: res.priorityWarning } : {}),
      });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not join the queue"),
  });

  function addAnother() {
    reset(DEFAULTS);
    setFoundName(null);
    setResult(null);
  }

  // --- Result panel: an honest wait RANGE + (for later bookings) arrival ----
  if (result) {
    return (
      <div className="mx-auto max-w-md space-y-6 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" aria-hidden />
        <div>
          <div className="text-sm text-muted-foreground">Estimated wait</div>
          <div className="text-5xl font-bold tabular-nums leading-none">
            {result.estimateMinMinutes}–{result.estimateMaxMinutes}
            <span className="text-2xl font-medium"> min</span>
          </div>
        </div>
        {result.priorityWarning ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            {result.priorityWarning}
          </div>
        ) : null}
        <Card>
          <CardContent className="space-y-2 pt-6 text-left text-sm">
            <Row label="Patient" value={result.name} />
            <Row label="Doctor" value={result.doctorName} />
            <Row
              label="Status"
              value={result.isWalkIn ? "Checked in — waiting here" : "Booked — coming later"}
            />
            <div className="mt-2 rounded-md bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">Tell the patient</div>
              <div className="font-medium">
                {result.isWalkIn
                  ? `About a ${result.estimateMinMinutes}–${result.estimateMaxMinutes} min wait.`
                  : `About ${result.estimateMinMinutes}–${result.estimateMaxMinutes} min — please arrive by ${formatTime(result.suggestedArrival)}.`}
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={addAnother}>
            Add another
          </Button>
          <Button onClick={() => navigate("/")}>View queue</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New booking</h1>
        <p className="text-muted-foreground">
          Find the patient, pick a doctor, and issue a token for today's queue.
        </p>
      </div>

      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="space-y-6"
        noValidate
      >
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

            <div className="space-y-1.5">
              <Label htmlFor="name">Patient name</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="name"
                  aria-invalid={Boolean(errors.name)}
                  {...register("name")}
                />
                {foundName ? <Badge variant="success">Existing</Badge> : null}
              </div>
              {errors.name ? (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Doctor &amp; queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                <p className="text-sm text-destructive">{errors.doctorId.message}</p>
              ) : null}
            </div>

            {/* Type: walk-in (auto ARRIVED) vs booking (WAITING) */}
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" value="walkin" className="mt-0.5" {...register("type")} />
                  <span>
                    <span className="font-medium">Walk-in (here now)</span>
                    <span className="block text-xs text-muted-foreground">
                      Checked in immediately — waiting at the clinic.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="radio" value="booking" className="mt-0.5" {...register("type")} />
                  <span>
                    <span className="font-medium">Booking (coming later)</span>
                    <span className="block text-xs text-muted-foreground">
                      Holds a token; arrives near their turn.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" {...register("isPriority")} />
                Priority
              </label>
              {isPriority ? (
                <div className="space-y-1.5">
                  <Input
                    placeholder="Reason for priority (required)"
                    aria-invalid={Boolean(errors.priorityReason)}
                    {...register("priorityReason")}
                  />
                  {errors.priorityReason ? (
                    <p className="text-sm text-destructive">
                      {errors.priorityReason.message}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {doctorId && quoteQuery.data ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md bg-muted/40 p-3 text-sm">
                <span className="flex items-center gap-1.5">
                  <Users className="size-4 text-muted-foreground" aria-hidden />
                  {quoteQuery.data.peopleAhead} ahead
                </span>
                <span>
                  Est. wait{" "}
                  <span className="font-medium">
                    {quoteQuery.data.estimateMinMinutes}–
                    {quoteQuery.data.estimateMaxMinutes} min
                  </span>
                </span>
                <span>
                  Suggested arrival{" "}
                  <span className="font-medium">
                    {formatTime(quoteQuery.data.suggestedArrival)}
                  </span>
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/")}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Issue token"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
