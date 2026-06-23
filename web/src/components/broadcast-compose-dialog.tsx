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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, createBroadcast } from "@/lib/api";
import {
  CATEGORY_OPTIONS,
  PRIORITY_OPTIONS,
} from "@/lib/broadcasts";
import {
  broadcastCategorySchema,
  broadcastPrioritySchema,
} from "@/lib/schemas";

const schema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(120),
    body: z.string().trim().min(1, "Message is required").max(2000),
    category: broadcastCategorySchema,
    priority: broadcastPrioritySchema,
    mode: z.enum(["now", "schedule"]),
    scheduledAt: z.string().optional(),
  })
  .refine((d) => d.mode === "now" || Boolean(d.scheduledAt), {
    message: "Pick a date and time",
    path: ["scheduledAt"],
  })
  .refine(
    (d) =>
      d.mode === "now" ||
      !d.scheduledAt ||
      new Date(d.scheduledAt).getTime() > Date.now(),
    { message: "Schedule must be in the future", path: ["scheduledAt"] },
  );
type FormValues = z.infer<typeof schema>;

const DEFAULTS: FormValues = {
  title: "",
  body: "",
  category: "MARKETING",
  priority: "NORMAL",
  mode: "now",
  scheduledAt: "",
};

export function BroadcastComposeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });

  useEffect(() => {
    if (open) reset(DEFAULTS);
  }, [open, reset]);

  const mode = watch("mode");
  const body = watch("body") ?? "";

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createBroadcast({
        title: values.title,
        body: values.body,
        category: values.category,
        priority: values.priority,
        scheduledAt:
          values.mode === "schedule" && values.scheduledAt
            ? new Date(values.scheduledAt).toISOString()
            : null,
      }),
    onSuccess: (broadcast) => {
      void queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      void queryClient.invalidateQueries({ queryKey: ["broadcast-stats"] });
      toast.success(
        broadcast.status === "SENT"
          ? `Sent to ${broadcast.recipientCount} patient${broadcast.recipientCount === 1 ? "" : "s"}`
          : "Broadcast scheduled",
      );
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not send"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New broadcast</DialogTitle>
          <DialogDescription>
            Sent to all patients who have consented to messaging.
          </DialogDescription>
        </DialogHeader>
        <form
          id="broadcast-form"
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="bc-title">Title</Label>
            <Input
              id="bc-title"
              placeholder="Free Health Checkup Camp"
              aria-invalid={Boolean(errors.title)}
              {...register("title")}
            />
            {errors.title ? (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bc-body">Message</Label>
            <Textarea
              id="bc-body"
              rows={4}
              maxLength={2000}
              placeholder="Join us this Sunday, 10 AM–4 PM. Walk-ins welcome."
              aria-invalid={Boolean(errors.body)}
              {...register("body")}
            />
            <div className="flex justify-between">
              {errors.body ? (
                <p className="text-sm text-destructive">{errors.body.message}</p>
              ) : (
                <span />
              )}
              <span className="text-xs text-muted-foreground">{body.length}/2000</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bc-category">Category</Label>
              <Select id="bc-category" {...register("category")}>
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bc-priority">Priority</Label>
              <Select id="bc-priority" {...register("priority")}>
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Delivery</Label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" value="now" {...register("mode")} />
                Send now
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" value="schedule" {...register("mode")} />
                Schedule
              </label>
            </div>
            {mode === "schedule" ? (
              <div className="space-y-1.5">
                <Input
                  type="datetime-local"
                  aria-invalid={Boolean(errors.scheduledAt)}
                  {...register("scheduledAt")}
                />
                {errors.scheduledAt ? (
                  <p className="text-sm text-destructive">
                    {errors.scheduledAt.message}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="broadcast-form" disabled={mutation.isPending}>
            {mutation.isPending
              ? "Sending…"
              : mode === "schedule"
                ? "Schedule"
                : "Send now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
