import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorState, Spinner } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  getQueue,
  listDoctors,
  queueAction,
  quoteQueue,
  reinstateBooking,
  type QueueAction,
  type ReinstateMode,
} from "@/lib/api";
import type { QueueBoard, QueueEntryView } from "@/lib/schemas";
import { STATUS_LABEL, waitLabel } from "@/lib/queue";
import { todayIsoDate } from "@/lib/time";

// One-tap actions per status (matches the queue lifecycle).
const ACTIONS: Record<string, { action: QueueAction; label: string }[]> = {
  WAITING: [
    { action: "checkin", label: "Check in" },
    { action: "hold", label: "Hold" },
    { action: "no-show", label: "No-show" },
  ],
  ARRIVED: [
    { action: "start", label: "Start" },
    { action: "no-show", label: "No-show" },
  ],
  IN_PROGRESS: [{ action: "complete", label: "Complete" }],
};

function EntryRow({
  entry,
  onAction,
  onReinstate,
  pending,
}: {
  entry: QueueEntryView;
  onAction: (id: string, action: QueueAction) => void;
  onReinstate: (id: string, mode: ReinstateMode) => void;
  pending: boolean;
}) {
  const actions = ACTIONS[entry.status] ?? [];
  const isNoShow = entry.status === "NO_SHOW";
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="w-10 shrink-0 text-center text-lg font-semibold tabular-nums">
        {entry.token}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{entry.patientName}</span>
          {entry.isPriority ? <Badge variant="destructive">Priority</Badge> : null}
          {entry.isWalkIn ? <Badge variant="muted">Walk-in</Badge> : null}
          {entry.onHold ? <Badge variant="outline">On hold</Badge> : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {entry.position > 0
            ? `#${entry.position} in line · ${waitLabel(entry.estimateWaitMinutes)}`
            : STATUS_LABEL[entry.status]}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {actions.map((a) => (
          <Button
            key={a.action}
            size="sm"
            variant={a.action === "no-show" ? "outline" : "default"}
            disabled={pending}
            onClick={() => onAction(entry.id, a.action)}
          >
            {a.label}
          </Button>
        ))}
        {isNoShow ? (
          <>
            <span className="text-xs text-muted-foreground">Reinstate:</span>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onReinstate(entry.id, "back")}
            >
              Back
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onReinstate(entry.id, "priority")}
            >
              Priority
            </Button>
          </>
        ) : null}
      </div>
    </li>
  );
}

function Section({
  title,
  entries,
  onAction,
  onReinstate,
  pending,
  tone,
}: {
  title: string;
  entries: QueueEntryView[];
  onAction: (id: string, action: QueueAction) => void;
  onReinstate: (id: string, mode: ReinstateMode) => void;
  pending: boolean;
  tone?: "muted";
}) {
  if (entries.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle
          className={`text-sm ${tone === "muted" ? "text-muted-foreground" : ""}`}
        >
          {title} ({entries.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-1">
        <ul className="divide-y">
          {entries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              onAction={onAction}
              onReinstate={onReinstate}
              pending={pending}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function DayViewPage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => todayIsoDate());
  const [doctorId, setDoctorId] = useState("");

  const doctorsQuery = useQuery({ queryKey: ["doctors"], queryFn: listDoctors });
  const doctors = doctorsQuery.data ?? [];
  const activeDoctorId = doctorId || doctors[0]?.id || "";

  const queueQuery = useQuery({
    queryKey: ["queue", activeDoctorId, date],
    queryFn: () => getQueue(activeDoctorId, date),
    enabled: activeDoctorId !== "",
    refetchInterval: 10_000,
  });

  // Live wait estimate a new patient would face right now.
  const quoteQuery = useQuery({
    queryKey: ["quote", activeDoctorId, date],
    queryFn: () => quoteQueue(activeDoctorId, date),
    enabled: activeDoctorId !== "",
    refetchInterval: 10_000,
  });

  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: QueueAction }) =>
      queueAction(id, action),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["queue", activeDoctorId, date],
      });
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const onAction = (id: string, action: QueueAction) =>
    mutation.mutate({ id, action });

  const reinstateMutation = useMutation({
    mutationFn: ({ id, mode, reason }: { id: string; mode: ReinstateMode; reason: string }) =>
      reinstateBooking(id, mode, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["queue", activeDoctorId, date],
      });
      toast.success("Reinstated");
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const onReinstate = (id: string, mode: ReinstateMode) => {
    const reason = window.prompt(
      mode === "back"
        ? "Reason for reinstating (fresh token at the back):"
        : "Reason for reinstating with priority:",
    );
    if (reason && reason.trim()) reinstateMutation.mutate({ id, mode, reason: reason.trim() });
  };

  const board: QueueBoard | undefined = queueQuery.data;
  const totalActive = board
    ? board.traveling.length + board.waitingHere.length + board.inProgress.length
    : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Queue</h1>
          <p className="text-muted-foreground">
            Live token queue. Check patients in and move them through the visit.
          </p>
        </div>
        <Button asChild>
          <Link to="/appointments/new">
            <Plus className="size-4" aria-hidden />
            Add to queue
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-auto"
          value={activeDoctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          aria-label="Doctor"
        >
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} — {d.department}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          className="w-auto"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Queue date"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => void queueQuery.refetch()}
          disabled={queueQuery.isFetching}
        >
          <RefreshCw
            className={queueQuery.isFetching ? "size-4 animate-spin" : "size-4"}
            aria-hidden
          />
          Refresh
        </Button>
        {board ? (
          <span className="ml-auto text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{totalActive}</span> in
            queue
            {quoteQuery.data
              ? ` · new patient ${waitLabel(quoteQuery.data.estimateWaitMinutes)}`
              : ""}
          </span>
        ) : null}
      </div>

      {doctors.length === 0 && !doctorsQuery.isLoading ? (
        <EmptyState
          title="No doctors yet"
          description="Add a doctor before opening a queue."
        />
      ) : queueQuery.isLoading ? (
        <Spinner label="Loading queue…" />
      ) : queueQuery.isError ? (
        <ErrorState
          message={(queueQuery.error as Error).message}
          onRetry={() => void queueQuery.refetch()}
        />
      ) : board ? (
        totalActive === 0 &&
        board.done.length === 0 &&
        board.noShow.length === 0 ? (
          <EmptyState
            title="Queue is empty"
            description="No one has joined this doctor's queue for the day yet."
          >
            <Button variant="outline" asChild>
              <Link to="/appointments/new">
                <Plus className="size-4" aria-hidden />
                Add to queue
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <div className="space-y-4">
            <Section title="Traveling" entries={board.traveling} onAction={onAction} onReinstate={onReinstate} pending={mutation.isPending} />
            <Section title="Waiting here" entries={board.waitingHere} onAction={onAction} onReinstate={onReinstate} pending={mutation.isPending} />
            <Section title="With doctor" entries={board.inProgress} onAction={onAction} onReinstate={onReinstate} pending={mutation.isPending} />
            <Section title="Done" entries={board.done} onAction={onAction} onReinstate={onReinstate} pending={mutation.isPending} tone="muted" />
            <Section title="No-shows" entries={board.noShow} onAction={onAction} onReinstate={onReinstate} pending={mutation.isPending} tone="muted" />
          </div>
        )
      ) : null}
    </div>
  );
}
