import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Plus, Search, Send, Users } from "lucide-react";

import { BroadcastComposeDialog } from "@/components/broadcast-compose-dialog";
import { EmptyState, ErrorState, Spinner } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getBroadcastStats, listBroadcasts } from "@/lib/api";
import {
  categoryLabel,
  CATEGORY_OPTIONS,
  priorityVariant,
  statusVariant,
} from "@/lib/broadcasts";
import type {
  Broadcast,
  BroadcastCategory,
  BroadcastStatus,
} from "@/lib/schemas";
import { formatLongDate, formatTime } from "@/lib/time";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function whenLabel(b: Broadcast): string {
  if (b.status === "SENT" && b.sentAt) {
    return `${formatLongDate(b.sentAt)} · ${formatTime(b.sentAt)}`;
  }
  if (b.scheduledAt) {
    return `Scheduled · ${formatLongDate(b.scheduledAt)} · ${formatTime(b.scheduledAt)}`;
  }
  return "—";
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 px-[15px] py-[13px]">
        <div className="flex size-[38px] items-center justify-center rounded-[10px] bg-nav-active text-teal">
          {icon}
        </div>
        <div>
          <div className="font-display text-[22px] font-extrabold leading-none text-ink">
            {value.toLocaleString()}
          </div>
          <div className="mt-1 text-[11.5px] text-faint">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function BroadcastsPage() {
  const [composeOpen, setComposeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"" | BroadcastCategory>("");
  const [status, setStatus] = useState<"" | BroadcastStatus>("");
  const debouncedSearch = useDebounced(search, 250);

  const statsQuery = useQuery({
    queryKey: ["broadcast-stats"],
    queryFn: getBroadcastStats,
  });
  const listQuery = useQuery({
    queryKey: ["broadcasts", debouncedSearch, category, status],
    queryFn: () =>
      listBroadcasts({
        search: debouncedSearch,
        ...(category ? { category } : {}),
        ...(status ? { status } : {}),
      }),
  });

  const broadcasts = listQuery.data ?? [];
  const stats = statsQuery.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-extrabold tracking-tight text-ink">
            Broadcasts
          </h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            Announcements, camps and reminders — sent only to consented patients.
          </p>
        </div>
        <Button variant="accent" onClick={() => setComposeOpen(true)}>
          <Plus className="size-4" aria-hidden />
          New broadcast
        </Button>
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={<Send className="size-4" aria-hidden />}
          label="Broadcasts sent"
          value={stats?.totalSent ?? 0}
        />
        <StatCard
          icon={<Users className="size-4" aria-hidden />}
          label="Patients reached"
          value={stats?.totalReached ?? 0}
        />
        <StatCard
          icon={<Megaphone className="size-4" aria-hidden />}
          label="Scheduled"
          value={stats?.scheduled ?? 0}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            placeholder="Search title or message…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search broadcasts"
          />
        </div>
        <Select
          className="w-auto"
          value={category}
          onChange={(e) => setCategory(e.target.value as "" | BroadcastCategory)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select
          className="w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | BroadcastStatus)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="SENT">Sent</option>
          <option value="SCHEDULED">Scheduled</option>
        </Select>
      </div>

      {/* History */}
      {listQuery.isLoading ? (
        <Spinner label="Loading broadcasts…" />
      ) : listQuery.isError ? (
        <ErrorState
          message={(listQuery.error as Error).message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : broadcasts.length === 0 ? (
        <EmptyState
          title={debouncedSearch || category || status ? "No matches" : "No broadcasts yet"}
          description={
            debouncedSearch || category || status
              ? "Try clearing the filters."
              : "Create your first broadcast to reach patients."
          }
        >
          <Button variant="outline" onClick={() => setComposeOpen(true)}>
            <Plus className="size-4" aria-hidden />
            New broadcast
          </Button>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-line-soft bg-subtle text-left">
              <tr className="font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-faint">
                <th className="px-4 py-[11px] font-bold">Broadcast</th>
                <th className="px-4 py-[11px] font-bold">Category</th>
                <th className="px-4 py-[11px] font-bold">Priority</th>
                <th className="px-4 py-[11px] text-right font-bold">Reached</th>
                <th className="px-4 py-[11px] font-bold">When</th>
              </tr>
            </thead>
            <tbody>
              {broadcasts.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-line-soft align-top last:border-0 hover:bg-subtle"
                >
                  <td className="max-w-sm px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{b.title}</span>
                      <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {b.body}
                    </div>
                    <div className="mt-0.5 text-[11px] text-faint">
                      by {b.createdByName}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{categoryLabel(b.category)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={priorityVariant(b.priority)}>
                      {b.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-teal-deep tabular-nums">
                    {b.status === "SENT" ? b.recipientCount : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {whenLabel(b)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BroadcastComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />
    </div>
  );
}
