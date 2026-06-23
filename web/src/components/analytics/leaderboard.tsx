import { useState } from "react";
import { Medal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DoctorUtilization } from "@/lib/schemas";

type SortKey = "booked" | "utilization" | "noShowsHigh" | "noShowsLow";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "booked", label: "Most booked" },
  { key: "utilization", label: "Utilization" },
  { key: "noShowsHigh", label: "Most no-shows" },
  { key: "noShowsLow", label: "Fewest no-shows" },
];

const MEDALS = ["#eab308", "#94a3b8", "#b45309"]; // gold, silver, bronze

function sortDoctors(
  doctors: DoctorUtilization[],
  key: SortKey,
): DoctorUtilization[] {
  const copy = [...doctors];
  copy.sort((a, b) => {
    switch (key) {
      case "booked":
        return b.totalBooked - a.totalBooked;
      case "utilization":
        return b.utilizationPct - a.utilizationPct;
      case "noShowsHigh":
        return b.estNoShows - a.estNoShows;
      case "noShowsLow":
        return a.estNoShows - b.estNoShows;
    }
  });
  return copy;
}

export function Leaderboard({ doctors }: { doctors: DoctorUtilization[] }) {
  const [sort, setSort] = useState<SortKey>("booked");
  const ranked = sortDoctors(doctors, sort);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {SORTS.map((s) => (
          <Button
            key={s.key}
            size="sm"
            variant={s.key === sort ? "default" : "outline"}
            onClick={() => setSort(s.key)}
          >
            {s.label}
          </Button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="w-12 px-3 py-2 text-center font-medium">#</th>
              <th className="px-3 py-2 font-medium">Doctor</th>
              <th className="px-3 py-2 text-right font-medium">Booked</th>
              <th className="px-3 py-2 text-right font-medium">Util %</th>
              <th className="px-3 py-2 text-right font-medium">Est. no-shows</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((d, i) => (
              <tr key={d.id} className="border-b last:border-0">
                <td className="px-3 py-2 text-center">
                  {i < 3 ? (
                    <Medal
                      className="mx-auto size-4"
                      style={{ color: MEDALS[i] }}
                      aria-label={`Rank ${i + 1}`}
                    />
                  ) : (
                    <span className="text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium leading-tight">{d.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.department}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {d.totalBooked}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {d.utilizationPct}%
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    d.estNoShows > 0 ? "text-rose-600" : "text-muted-foreground",
                  )}
                >
                  {d.estNoShows}
                </td>
              </tr>
            ))}
            {ranked.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No doctors to rank.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Est. no-shows = past appointments left booked (never completed or
        cancelled) — a derived estimate, not a tracked status.
      </p>
    </div>
  );
}
