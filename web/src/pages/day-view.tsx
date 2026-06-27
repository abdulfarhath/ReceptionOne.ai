import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronDown, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ColumnHeader, TokenTile } from "@/components/brand";
import { EmptyState, ErrorState, Spinner } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { waitLabel } from "@/lib/queue";
import { cn } from "@/lib/utils";
import { addDaysIso, formatDayLabel, formatTime, todayIsoDate } from "@/lib/time";

// The one primary action for each lifecycle state, plus quieter secondary ones.
const PRIMARY: Record<string, { action: QueueAction; label: string }> = {
  WAITING: { action: "checkin", label: "Check in" },
  ARRIVED: { action: "start", label: "Start visit" },
};
const SECONDARY: Record<string, { action: QueueAction; label: string }[]> = {
  WAITING: [
    { action: "hold", label: "Hold" },
    { action: "no-show", label: "No-show" },
  ],
  ARRIVED: [{ action: "no-show", label: "No-show" }],
};

function CardActions({
  entry,
  onAction,
  pending,
}: {
  entry: QueueEntryView;
  onAction: (id: string, action: QueueAction) => void;
  pending: boolean;
}) {
  const primary = PRIMARY[entry.status];
  const secondary = SECONDARY[entry.status] ?? [];
  return (
    <div className="flex w-full items-center gap-1.5">
      {primary ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onAction(entry.id, primary.action)}
          className={
            primary.action === "start"
              ? "flex-1 rounded-lg bg-teal px-3 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
              : "flex-1 rounded-lg border-[1.4px] border-mint-strong bg-card px-3 py-2 text-[12.5px] font-semibold text-teal-deep disabled:opacity-50"
          }
        >
          {primary.label}
        </button>
      ) : null}
      {secondary.map((a) => (
        <button
          key={a.action}
          type="button"
          disabled={pending}
          onClick={() => onAction(entry.id, a.action)}
          className={cn(
            "rounded-lg px-2.5 py-2 text-[12px] font-medium disabled:opacity-50",
            a.action === "no-show"
              ? "text-noshow hover:bg-noshow-soft"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

/** A calm patient card for the Coming-later and Waiting columns. */
function QueueCard({
  entry,
  tone,
  next,
  onAction,
  pending,
}: {
  entry: QueueEntryView;
  tone: "amber" | "mint";
  next?: boolean;
  onAction: (id: string, action: QueueAction) => void;
  pending: boolean;
}) {
  return (
    <div
      className={
        next
          ? "rounded-xl border-[1.5px] border-teal bg-card p-3 shadow-[0_8px_20px_-16px_rgba(14,124,107,0.6)]"
          : "rounded-xl border border-line bg-card p-3"
      }
    >
      {next ? (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-teal px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-white">
          Next up
        </div>
      ) : null}
      <div className="flex items-start gap-3">
        <TokenTile token={entry.token} tone={tone} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold text-ink">
            {entry.patientName}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-faint">
            {entry.patientPhone}
          </div>
          {entry.isPriority || entry.onHold || entry.isWalkIn ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {entry.isPriority ? <Badge variant="priority">★ Priority</Badge> : null}
              {entry.onHold ? <Badge variant="done">On hold</Badge> : null}
              {entry.isWalkIn ? <Badge variant="done">Walk-in</Badge> : null}
            </div>
          ) : null}
        </div>
        <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-faint">
          {waitLabel(entry.estimateWaitMinutes)}
        </span>
      </div>
      <div className="mt-2.5 border-t border-dashed border-line-soft pt-2.5">
        <CardActions entry={entry} onAction={onAction} pending={pending} />
      </div>
    </div>
  );
}

function elapsedLabel(startedAt: string | null, now: number): string {
  if (!startedAt) return "00:00";
  const secs = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** The emphasised teal card for whoever is with the doctor right now. */
function InProgressCard({
  entry,
  now,
  onAction,
  pending,
}: {
  entry: QueueEntryView;
  now: number;
  onAction: (id: string, action: QueueAction) => void;
  pending: boolean;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-teal to-teal-deep p-4 text-[#eaf6f1] shadow-[0_16px_32px_-20px_rgba(10,67,57,0.9)]">
      <div className="flex items-start gap-3">
        <TokenTile token={entry.token} tone="onDark" size="lg" label="TKN" />
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold text-white">{entry.patientName}</div>
          <div className="mt-0.5 font-mono text-[11px] text-[#9fd0c3]">
            {entry.patientPhone}
          </div>
        </div>
      </div>
      <div className="mt-[13px] flex items-center gap-3 border-t border-white/15 pt-3">
        <div className="flex-1">
          <div className="font-mono text-[10px] tracking-[0.04em] text-[#9fd0c3]">
            TIME ELAPSED
          </div>
          <div className="font-mono text-[17px] font-bold text-white">
            {elapsedLabel(entry.startedAt, now)}
          </div>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => onAction(entry.id, "complete")}
          className="rounded-[9px] bg-white px-[18px] py-[9px] text-[13px] font-semibold text-[#0a4339] disabled:opacity-50"
        >
          Complete visit ✓
        </button>
      </div>
    </div>
  );
}

/** A one-line "where everyone is" overview that doubles as a key for the board. */
function FlowLegend({
  board,
  newPatientWait,
}: {
  board: QueueBoard;
  newPatientWait: number | null;
}) {
  const steps = [
    ...(board.upcoming.length > 0
      ? [{ dot: "bg-[#9aaaa5]", label: "Scheduled", n: board.upcoming.length }]
      : []),
    { dot: "bg-amber", label: "Coming later", n: board.traveling.length },
    { dot: "bg-teal", label: "Waiting", n: board.waitingHere.length },
    { dot: "bg-teal-deep", label: "In consultation", n: board.inProgress.length },
    { dot: "bg-success", label: "Done", n: board.done.length },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-card px-4 py-3">
      {steps.map((s, i) => (
        <span key={s.label} className="inline-flex items-center gap-2">
          {i > 0 ? <span className="mr-1 text-faint">→</span> : null}
          <span className={cn("size-2 rounded-full", s.dot)} />
          <span className="text-[13px] font-medium text-ink">{s.label}</span>
          <span className="font-mono text-[12.5px] font-bold text-muted-foreground">
            {s.n}
          </span>
        </span>
      ))}
      {newPatientWait !== null ? (
        <span className="ml-auto inline-flex items-center gap-2 rounded-lg bg-amber-soft px-3 py-1.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-amber-text">
            New patient wait
          </span>
          <span className="font-display text-[15px] font-extrabold text-amber-text">
            ~{newPatientWait} min
          </span>
        </span>
      ) : null}
    </div>
  );
}

/** Scheduled ("come at my own time") tokens that haven't joined the line yet. */
function UpcomingSection({ board }: { board: QueueBoard }) {
  if (board.upcoming.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-card px-[15px] py-[13px]">
      <ColumnHeader
        dotClassName="bg-[#9aaaa5]"
        title="Upcoming (scheduled)"
        count={board.upcoming.length}
        countClassName="bg-subtle text-ink-soft"
        help="Booked for a chosen time — they join the live queue automatically near their slot."
      />
      <div className="flex flex-wrap gap-2.5">
        {board.upcoming.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-2.5 rounded-xl border border-line bg-subtle p-2.5"
          >
            <TokenTile token={e.token} tone="neutral" size="sm" label="" />
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold text-ink">
                {e.patientName}
              </div>
              <div className="font-mono text-[11px] text-faint">
                {e.targetTime ? `~${formatTime(e.targetTime)}` : "—"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DoneNoShowStrip({
  board,
  onReinstate,
  pending,
}: {
  board: QueueBoard;
  onReinstate: (id: string, mode: ReinstateMode) => void;
  pending: boolean;
}) {
  const doneShown = board.done.slice(0, 10);
  const doneRest = board.done.length - doneShown.length;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.7fr_1fr]">
      <div className="rounded-xl border border-line bg-card px-[15px] py-[13px]">
        <ColumnHeader
          dotClassName="bg-success"
          title="Done today"
          count={board.done.length}
          countClassName="bg-success-soft text-success"
        />
        {board.done.length === 0 ? (
          <p className="text-[11.5px] text-faint">No visits completed yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {doneShown.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-line-soft bg-subtle px-2.5 py-1 text-[11.5px] text-ink-soft"
              >
                <span className="font-mono font-bold text-success">
                  {String(e.token).padStart(2, "0")}
                </span>
                {e.patientName}
              </span>
            ))}
            {doneRest > 0 ? (
              <span className="inline-flex items-center rounded-full border border-line-soft bg-subtle px-[11px] py-1 text-[11.5px] text-faint">
                +{doneRest} more
              </span>
            ) : null}
          </div>
        )}
      </div>
      <div className="rounded-xl border border-line bg-card px-[15px] py-[13px]">
        <ColumnHeader
          dotClassName="bg-destructive"
          title="No-shows"
          count={board.noShow.length}
          countClassName="bg-noshow-soft text-noshow"
        />
        {board.noShow.length === 0 ? (
          <p className="text-[11.5px] text-faint">None today.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {board.noShow.map((e) => (
              <div key={e.id} className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line-soft bg-noshow-soft px-2.5 py-1 text-[11.5px] text-ink-soft">
                  <span className="font-mono font-bold text-noshow">
                    {String(e.token).padStart(2, "0")}
                  </span>
                  {e.patientName}
                </span>
                <div className="ml-auto flex gap-1">
                  <button
                    type="button"
                    title="Re-add to the back of the queue"
                    disabled={pending}
                    onClick={() => onReinstate(e.id, "back")}
                    className="rounded-md border border-line px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground hover:text-teal-deep disabled:opacity-50"
                  >
                    Re-add
                  </button>
                  <button
                    type="button"
                    title="Re-add with priority"
                    disabled={pending}
                    onClick={() => onReinstate(e.id, "priority")}
                    className="rounded-md border border-mint-strong px-2 py-0.5 text-[10.5px] font-semibold text-teal-deep disabled:opacity-50"
                  >
                    + Priority
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A labelled, scannable column of patient cards. */
function QueueColumn({
  dotClassName,
  title,
  countClassName,
  help,
  emptyText,
  children,
  count,
}: {
  dotClassName: string;
  title: string;
  countClassName: string;
  help: string;
  emptyText: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <ColumnHeader
        dotClassName={dotClassName}
        title={title}
        count={count}
        countClassName={countClassName}
        help={help}
      />
      {count === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-card/40 px-3 py-6 text-center text-[12px] text-faint">
          {emptyText}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">{children}</div>
      )}
    </div>
  );
}

export function DayViewPage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => todayIsoDate());
  const [doctorId, setDoctorId] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // Tick every second so the "in consultation" elapsed timer stays live.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const doctorsQuery = useQuery({ queryKey: ["doctors"], queryFn: listDoctors });
  const doctors = doctorsQuery.data ?? [];
  const activeDoctorId = doctorId || doctors[0]?.id || "";
  const isToday = date === todayIsoDate();

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
    mutationFn: ({
      id,
      mode,
      reason,
    }: {
      id: string;
      mode: ReinstateMode;
      reason: string;
    }) => reinstateBooking(id, mode, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["queue", activeDoctorId, date],
      });
      toast.success("Re-added to the queue");
    },
    onError: (err) => toast.error((err as Error).message),
  });
  const onReinstate = (id: string, mode: ReinstateMode) => {
    const reason = window.prompt(
      mode === "back"
        ? "Reason for re-adding (fresh token at the back):"
        : "Reason for re-adding with priority:",
    );
    if (reason && reason.trim())
      reinstateMutation.mutate({ id, mode, reason: reason.trim() });
  };

  const board: QueueBoard | undefined = queueQuery.data;
  const totalActive = board
    ? board.traveling.length + board.waitingHere.length + board.inProgress.length
    : 0;
  const pending = mutation.isPending || reinstateMutation.isPending;

  return (
    <div className="space-y-4">
      {/* Title + primary CTA */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-extrabold tracking-tight text-ink">
            Live Queue
          </h1>
          <div className="mt-1 flex items-center gap-2.5">
            <span className="text-[13.5px] text-muted-foreground">
              {formatDayLabel(date)}
            </span>
            {isToday ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-nav-active px-2.5 py-[3px] font-mono text-[11px] font-bold text-teal">
                <span className="size-1.5 animate-[r1pulse_1.8s_infinite] rounded-full bg-[#1f8a5b]" />
                LIVE
              </span>
            ) : null}
          </div>
        </div>
        <Button variant="accent" asChild>
          <Link to="/app/appointments/new">
            <Plus className="size-4" aria-hidden />
            New booking
          </Link>
        </Button>
      </div>

      {/* Control row */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative inline-flex h-[38px] items-center gap-2 rounded-[10px] border-[1.3px] border-line bg-card pl-[13px] pr-9 text-[13.5px] font-semibold text-ink">
          <span className="size-[7px] rounded-full bg-teal" />
          <select
            value={activeDoctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            aria-label="Doctor"
            className="cursor-pointer appearance-none bg-transparent pr-1 outline-none [&>option]:bg-popover [&>option]:text-popover-foreground"
          >
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.department}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 size-3.5 text-faint" />
        </div>

        <div className="inline-flex h-[38px] items-center overflow-hidden rounded-[10px] border-[1.3px] border-line bg-card text-[13px] text-ink">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => setDate(addDaysIso(date, -1))}
            className="grid h-full w-[34px] place-items-center border-r border-line-soft text-faint hover:text-teal-deep"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setDate(todayIsoDate())}
            className="px-[13px] font-semibold"
          >
            {isToday ? "Today" : formatDayLabel(date).split(",")[0]}
          </button>
          <button
            type="button"
            aria-label="Next day"
            onClick={() => setDate(addDaysIso(date, 1))}
            className="grid h-full w-[34px] place-items-center border-l border-line-soft text-faint hover:text-teal-deep"
          >
            ›
          </button>
        </div>

        <button
          type="button"
          onClick={() => void queueQuery.refetch()}
          disabled={queueQuery.isFetching}
          className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] text-faint hover:text-teal-deep disabled:opacity-50"
        >
          <RefreshCw
            className={queueQuery.isFetching ? "size-3 animate-spin" : "size-3"}
            aria-hidden
          />
          auto-refresh · 10s
        </button>
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
              <Link to="/app/appointments/new">
                <Plus className="size-4" aria-hidden />
                Add to queue
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <>
            {/* At-a-glance: where everyone is, left → right through the visit */}
            <FlowLegend
              board={board}
              newPatientWait={quoteQuery.data?.estimateWaitMinutes ?? null}
            />

            <UpcomingSection board={board} />

            {/* 3-column board, in the order a patient moves through it */}
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
              <QueueColumn
                dotClassName="bg-amber"
                title="Coming later"
                count={board.traveling.length}
                countClassName="bg-amber-soft text-amber-text"
                help="Booked but not here yet. Check them in when they arrive."
                emptyText="No one booked for later."
              >
                {board.traveling.map((e) => (
                  <QueueCard
                    key={e.id}
                    entry={e}
                    tone="amber"
                    onAction={onAction}
                    pending={pending}
                  />
                ))}
              </QueueColumn>

              <QueueColumn
                dotClassName="bg-teal"
                title="Waiting"
                count={board.waitingHere.length}
                countClassName="bg-mint text-teal-deep"
                help="Checked in and in line. Start the visit for whoever's next."
                emptyText="No one in the waiting room."
              >
                {board.waitingHere.map((e, i) => (
                  <QueueCard
                    key={e.id}
                    entry={e}
                    tone="mint"
                    next={i === 0}
                    onAction={onAction}
                    pending={pending}
                  />
                ))}
              </QueueColumn>

              <QueueColumn
                dotClassName="bg-teal-deep"
                title="In consultation"
                count={board.inProgress.length}
                countClassName="bg-teal-deep text-white"
                help="With the doctor right now. Complete when the visit ends."
                emptyText="No visit in progress."
              >
                {board.inProgress.map((e) => (
                  <InProgressCard
                    key={e.id}
                    entry={e}
                    now={now}
                    onAction={onAction}
                    pending={pending}
                  />
                ))}
              </QueueColumn>
            </div>

            {/* Finished / didn't show */}
            <DoneNoShowStrip
              board={board}
              onReinstate={onReinstate}
              pending={pending}
            />
          </>
        )
      ) : null}
    </div>
  );
}
