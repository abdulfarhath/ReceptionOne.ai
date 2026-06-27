import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CalendarClock, Check, MessageCircle, Search, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  ApiError,
  findPatientByPhone,
  getAvailability,
  joinQueue,
  listDoctors,
  quoteQueue,
  scheduledQuote,
} from "@/lib/api";
import type { Availability } from "@/lib/schemas";
import { formatTime, utcMinutesToIstClock } from "@/lib/time";

type Timing = "now" | "scheduled";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
/** A Date as a <input type="datetime-local"> value (browser-local clock). */
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * datetime-local min/max bounding a scheduled pick to today's session. Assumes
 * the staff browser runs in the clinic's timezone (IST); availability windows
 * are UTC-minutes converted to the IST clock.
 */
function scheduledBounds(availability: Availability[]): { min: string; max: string } {
  const now = new Date();
  const today = toLocalInput(now).slice(0, 10);
  const soon = new Date(now.getTime() + 5 * 60_000);
  const windows = availability.filter((w) => w.dayOfWeek === now.getDay());
  if (windows.length === 0) {
    return { min: toLocalInput(soon), max: `${today}T21:00` };
  }
  const startMin = Math.min(...windows.map((w) => w.startMinutes));
  const endMin = Math.max(...windows.map((w) => w.endMinutes));
  const sessionStart = `${today}T${utcMinutesToIstClock(startMin)}`;
  const sessionEnd = `${today}T${utcMinutesToIstClock(endMin)}`;
  const soonStr = toLocalInput(soon);
  return { min: soonStr > sessionStart ? soonStr : sessionStart, max: sessionEnd };
}

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
  scheduled?: boolean;
  aroundTime?: string;
  comeBy?: string;
}

const DEFAULTS: FormValues = {
  phone: "",
  name: "",
  doctorId: "",
  isPriority: false,
  priorityReason: "",
  type: "walkin",
};

const FIELD_LABEL =
  "font-mono text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground";

export function NewAppointmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const doctorsQuery = useQuery({ queryKey: ["doctors"], queryFn: listDoctors });

  const [searching, setSearching] = useState(false);
  const [foundName, setFoundName] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [timing, setTiming] = useState<Timing>("now");
  const [targetLocal, setTargetLocal] = useState<string>("");

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

  const quoteQuery = useQuery({
    queryKey: ["quote", doctorId],
    queryFn: () => quoteQueue(doctorId),
    enabled: doctorId !== "" && timing === "now",
    refetchInterval: 10_000,
  });

  const availabilityQuery = useQuery({
    queryKey: ["availability", doctorId],
    queryFn: () => getAvailability(doctorId),
    enabled: doctorId !== "",
  });
  const bounds = scheduledBounds(availabilityQuery.data ?? []);

  // Live window for the chosen scheduled time.
  const targetIso = targetLocal ? new Date(targetLocal).toISOString() : "";
  const schedQuoteQuery = useQuery({
    queryKey: ["scheduled-quote", doctorId, targetIso],
    queryFn: () => scheduledQuote(doctorId, targetIso),
    enabled: doctorId !== "" && timing === "scheduled" && targetIso !== "",
  });

  // Default the picker to the earliest valid time whenever it opens / doctor changes.
  useEffect(() => {
    if (timing === "scheduled" && !targetLocal) setTargetLocal(bounds.min);
  }, [timing, targetLocal, bounds.min]);

  const phone = watch("phone");
  useEffect(() => {
    setFoundName(null);
  }, [phone]);

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
        ...(timing === "scheduled"
          ? { targetTime: new Date(targetLocal).toISOString() }
          : { isWalkIn: values.type === "walkin" }),
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
        isWalkIn: timing === "now" && values.type === "walkin",
        name: values.name.trim(),
        doctorName: doctor?.name ?? "the doctor",
        ...(res.priorityWarning ? { priorityWarning: res.priorityWarning } : {}),
        ...(res.scheduled ? { scheduled: true } : {}),
        ...(res.aroundTime ? { aroundTime: res.aroundTime } : {}),
        ...(res.comeBy ? { comeBy: res.comeBy } : {}),
      });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not join the queue"),
  });

  function addAnother() {
    reset(DEFAULTS);
    setFoundName(null);
    setResult(null);
    setTiming("now");
    setTargetLocal("");
  }

  const doctors = doctorsQuery.data ?? [];
  const activeDoctor = doctors.find((d) => d.id === doctorId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[26px] font-extrabold tracking-tight text-ink">
          New booking
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Find the patient, pick a doctor, and issue a token for today's queue.
        </p>
      </div>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.25fr_0.9fr]">
          {/* FORM */}
          <div className="space-y-5 rounded-[13px] border border-line bg-card p-[22px]">
            <div className="space-y-1.5">
              <Label htmlFor="phone" className={FIELD_LABEL}>
                Patient phone
              </Label>
              <div className="flex gap-2">
                <Input
                  id="phone"
                  className="font-mono"
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
              ) : foundName ? (
                <p className="flex items-center gap-1.5 text-[12.5px] text-faint">
                  <Check className="size-3.5 text-success" aria-hidden />
                  Returning patient ·{" "}
                  <strong className="font-semibold text-ink">{foundName}</strong>
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name" className={FIELD_LABEL}>
                Patient name
              </Label>
              <Input
                id="name"
                aria-invalid={Boolean(errors.name)}
                {...register("name")}
              />
              {errors.name ? (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doctor" className={FIELD_LABEL}>
                Doctor
              </Label>
              <Select
                id="doctor"
                aria-invalid={Boolean(errors.doctorId)}
                {...register("doctorId")}
              >
                <option value="">Select a doctor…</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.department}
                  </option>
                ))}
              </Select>
              {errors.doctorId ? (
                <p className="text-sm text-destructive">{errors.doctorId.message}</p>
              ) : null}
            </div>

            {/* When? come now (immediate token) vs pick a scheduled time. */}
            <div className="space-y-2">
              <Label className={FIELD_LABEL}>When will they come?</Label>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setTiming("now")}
                  className={`flex items-start gap-2.5 rounded-[11px] border-[1.4px] px-[14px] py-[13px] text-left transition-colors ${
                    timing === "now"
                      ? "border-teal bg-subtle"
                      : "border-line hover:border-mint-strong"
                  }`}
                >
                  <Zap className="size-[18px] shrink-0 text-teal-deep" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">Come now</span>
                    <span className="mt-1 block text-[11.5px] text-faint">
                      Immediate token in today's live queue
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setTiming("scheduled")}
                  className={`flex items-start gap-2.5 rounded-[11px] border-[1.4px] px-[14px] py-[13px] text-left transition-colors ${
                    timing === "scheduled"
                      ? "border-teal bg-subtle"
                      : "border-line hover:border-mint-strong"
                  }`}
                >
                  <CalendarClock className="size-[18px] shrink-0 text-teal-deep" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">Pick a time</span>
                    <span className="mt-1 block text-[11.5px] text-faint">
                      A scheduled token — a time window, not a slot
                    </span>
                  </span>
                </button>
              </div>
            </div>

            {timing === "now" ? (
              <div className="space-y-2">
                <Label className={FIELD_LABEL}>Type</Label>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <label className="relative cursor-pointer rounded-[11px] border-[1.4px] border-line px-[14px] py-[13px] transition-colors has-[:checked]:border-teal has-[:checked]:bg-subtle">
                    <input
                      type="radio"
                      value="walkin"
                      className="peer sr-only"
                      {...register("type")}
                    />
                    <Zap className="size-[18px] text-muted-foreground peer-checked:text-teal-deep" />
                    <div className="mt-2 text-sm font-semibold text-ink">Walk-in</div>
                    <div className="mt-1.5 text-[11.5px] text-faint">
                      Here now →{" "}
                      <span className="font-mono text-teal-deep">ARRIVED</span>
                    </div>
                  </label>
                  <label className="relative cursor-pointer rounded-[11px] border-[1.4px] border-line px-[14px] py-[13px] transition-colors has-[:checked]:border-teal has-[:checked]:bg-subtle">
                    <input
                      type="radio"
                      value="booking"
                      className="peer sr-only"
                      {...register("type")}
                    />
                    <CalendarClock className="size-[18px] text-muted-foreground peer-checked:text-teal-deep" />
                    <div className="mt-2 text-sm font-semibold text-ink">Booking</div>
                    <div className="mt-1.5 text-[11.5px] text-[#5c746f]">
                      Coming later →{" "}
                      <span className="font-mono text-teal-deep">WAITING</span>
                    </div>
                  </label>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="targetTime" className={FIELD_LABEL}>
                  Preferred time (today)
                </Label>
                <input
                  id="targetTime"
                  type="datetime-local"
                  value={targetLocal}
                  min={bounds.min}
                  max={bounds.max}
                  onChange={(e) => setTargetLocal(e.target.value)}
                  className="h-[44px] w-full rounded-[10px] border-[1.4px] border-line bg-card px-[13px] font-mono text-[14px] text-ink outline-none focus:border-teal"
                />
                <p className="text-[11.5px] text-faint">
                  They keep a token, not a reserved slot — they'll join the live
                  queue around this time and get an honest window.
                </p>
              </div>
            )}

            <div className="space-y-2 border-t border-line-soft pt-[18px]">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span>
                  <span className="text-sm font-semibold text-ink">
                    Mark as priority
                  </span>
                  <span className="mt-px block text-[11.5px] text-faint">
                    Moves ahead of non-priority tokens
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="size-5 accent-[#0e7c6b]"
                  {...register("isPriority")}
                />
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
          </div>

          {/* QUOTE + CONFIRMATION */}
          <div className="flex flex-col gap-3.5 lg:sticky lg:top-6">
            <div className="rounded-[13px] border-[1.4px] border-mint-strong bg-subtle p-[18px]">
              <div className="mb-3.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.07em] text-teal">
                {timing === "scheduled" ? "Time window" : "Live estimate"}
              </div>
              {timing === "scheduled" ? (
                <>
                  <EstimateRow
                    label="Come around"
                    value={
                      schedQuoteQuery.data
                        ? formatTime(schedQuoteQuery.data.aroundTime)
                        : "—"
                    }
                    valueClassName="text-teal-deep"
                  />
                  <EstimateRow
                    label="Please arrive by"
                    value={
                      schedQuoteQuery.data
                        ? formatTime(schedQuoteQuery.data.comeBy)
                        : "—"
                    }
                    divider
                  />
                  <EstimateRow
                    label="Window"
                    value={
                      schedQuoteQuery.data
                        ? `~${schedQuoteQuery.data.windowMinMinutes}–${schedQuoteQuery.data.windowMaxMinutes} min`
                        : "—"
                    }
                    divider
                  />
                  {schedQuoteQuery.data?.likelySeenBy ? (
                    <p className="mt-2 rounded-md bg-amber-soft px-2 py-1.5 text-[11.5px] text-amber-text">
                      Busy around then — likely seen by ~
                      {formatTime(schedQuoteQuery.data.likelySeenBy)}.
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <EstimateRow
                    label="People ahead"
                    value={
                      doctorId && quoteQuery.data
                        ? String(quoteQuery.data.peopleAhead)
                        : "—"
                    }
                  />
                  <EstimateRow
                    label="Estimated wait"
                    value={
                      doctorId && quoteQuery.data
                        ? `~${quoteQuery.data.estimateMinMinutes}–${quoteQuery.data.estimateMaxMinutes} min`
                        : "—"
                    }
                    divider
                  />
                  <EstimateRow
                    label="Suggested arrival"
                    value={
                      doctorId && quoteQuery.data
                        ? formatTime(quoteQuery.data.suggestedArrival)
                        : "—"
                    }
                    valueClassName="text-teal-deep"
                    divider
                  />
                </>
              )}
              <Button type="submit" className="mt-3.5 w-full" disabled={mutation.isPending}>
                {mutation.isPending
                  ? "Adding…"
                  : timing === "scheduled"
                    ? "Schedule token"
                    : "Add to queue"}
              </Button>
            </div>

            {result ? (
              <div className="rounded-[13px] border border-line bg-card p-[18px] text-center">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-[11px] py-1 font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-success">
                  <Check className="size-3" aria-hidden />
                  {result.scheduled ? "Scheduled" : "Token issued"}
                </div>
                {result.scheduled && result.aroundTime ? (
                  <div className="my-3.5 font-display text-[34px] font-extrabold leading-none text-teal-deep">
                    ~{formatTime(result.aroundTime)}
                  </div>
                ) : (
                  <div className="my-3.5 font-display text-[40px] font-extrabold leading-none text-teal-deep">
                    {result.estimateMinMinutes}–{result.estimateMaxMinutes}
                    <span className="text-lg"> min</span>
                  </div>
                )}
                <div className="text-[13px] text-muted-foreground">
                  {result.scheduled && result.comeBy ? (
                    <>
                      Arrive by{" "}
                      <strong className="font-bold text-ink">
                        {formatTime(result.comeBy)}
                      </strong>{" "}
                      for {result.doctorName}
                    </>
                  ) : result.isWalkIn ? (
                    <>
                      Checked in for{" "}
                      <strong className="font-bold text-ink">
                        {result.doctorName}
                      </strong>
                    </>
                  ) : (
                    <>
                      Arrive around{" "}
                      <strong className="font-bold text-ink">
                        {formatTime(result.suggestedArrival)}
                      </strong>
                    </>
                  )}
                </div>
                {result.priorityWarning ? (
                  <p className="mt-2 rounded-md bg-amber-soft px-2 py-1.5 text-[11.5px] text-amber-text">
                    {result.priorityWarning}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center justify-center gap-1.5 border-t border-line-soft pt-3 text-[12px] text-success">
                  <MessageCircle className="size-3.5" aria-hidden />
                  Confirmation sent on WhatsApp
                </div>
                <div className="mt-3 flex justify-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={addAnother}>
                    Add another
                  </Button>
                  <Button type="button" size="sm" onClick={() => navigate("/app")}>
                    View queue
                  </Button>
                </div>
              </div>
            ) : (
              <p className="px-1 text-[11.5px] text-faint">
                {activeDoctor
                  ? `Issuing a token for ${activeDoctor.name}'s queue.`
                  : "Pick a doctor to see a live wait estimate."}
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function EstimateRow({
  label,
  value,
  valueClassName,
  divider,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  divider?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-[7px] ${
        divider ? "border-t border-dashed border-[#c6dcd5]" : ""
      }`}
    >
      <span className="text-[13.5px] text-ink-soft">{label}</span>
      <span
        className={`font-mono text-[15px] font-bold ${valueClassName ?? "text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}
