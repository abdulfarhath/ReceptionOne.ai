import { useState } from "react";
import { Medal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DoctorActivity } from "@/lib/schemas";

type SortKey = "seen" | "noShowsHigh" | "noShowsLow" | "fastest";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "seen", label: "Most seen" },
  { key: "noShowsHigh", label: "Most no-shows" },
  { key: "noShowsLow", label: "Fewest no-shows" },
  { key: "fastest", label: "Fastest consult" },
];

const MEDALS = ["#eab308", "#94a3b8", "#b45309"]; // gold, silver, bronze

function sortDoctors(doctors: DoctorActivity[], key: SortKey): DoctorActivity[] {
  const copy = [...doctors];
  const consult = (d: DoctorActivity) => d.avgConsultMinutes ?? Infinity;
  copy.sort((a, b) => {
    switch (key) {
      case "seen":
        return b.totalDone - a.totalDone;
      case "noShowsHigh":
        return b.noShows - a.noShows;
      case "noShowsLow":
        return a.noShows - b.noShows;
      case "fastest":
        return consult(a) - consult(b);
    }
  });
  return copy;
}

export function Leaderboard({ doctors }: { doctors: DoctorActivity[] }) {
  const [sort, setSort] = useState<SortKey>("seen");
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
              <th className="px-3 py-2 text-right font-medium">Seen</th>
              <th className="px-3 py-2 text-right font-medium">Avg consult</th>
              <th className="px-3 py-2 text-right font-medium">No-shows</th>
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
                  {d.totalDone}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {d.avgConsultMinutes === null ? "—" : `${d.avgConsultMinutes}m`}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    d.noShows > 0 ? "text-rose-600" : "text-muted-foreground",
                  )}
                >
                  {d.noShows}
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
        Seen = consults completed (DONE). Avg consult = mean start→done minutes.
      </p>
    </div>
  );
}
