import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";

import { EmptyState, ErrorState, Spinner } from "@/components/states";
import { listPatients } from "@/lib/api";
import { formatLongDate } from "@/lib/time";

/** Debounce a fast-changing value so we don't refetch on every keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function shortDate(iso: string | null): string {
  return iso ? formatLongDate(iso).replace(/^\w+,\s/, "").replace(/\s\d{4}$/, "") : "—";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const GRID =
  "grid grid-cols-[1.7fr_1.1fr_0.6fr_0.6fr_0.7fr_1fr] gap-2.5 items-center";

export function PatientsPage() {
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 250);
  const patientsQuery = useQuery({
    queryKey: ["patients", q],
    queryFn: () => listPatients(q),
    refetchOnWindowFocus: true,
  });

  const patients = patientsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-extrabold tracking-tight text-ink">
            Patients
          </h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            {patients.length > 0
              ? `${patients.length} patient${patients.length === 1 ? "" : "s"} · search by name or phone`
              : "Search by name or phone"}
          </p>
        </div>
        <div className="relative w-[280px] max-w-full">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-[15px] -translate-y-1/2 text-faint"
            aria-hidden
          />
          <input
            className="h-[38px] w-full rounded-[10px] border-[1.3px] border-line bg-card pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-teal"
            placeholder="Search patients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search patients"
          />
        </div>
      </div>

      {patientsQuery.isLoading ? (
        <Spinner label="Loading patients…" />
      ) : patientsQuery.isError ? (
        <ErrorState
          message={(patientsQuery.error as Error).message}
          onRetry={() => void patientsQuery.refetch()}
        />
      ) : patients.length === 0 ? (
        <EmptyState
          title={q ? "No matches" : "No patients yet"}
          description={
            q
              ? "No patients match your search."
              : "Patients appear here once they book — via WhatsApp or the dashboard."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          <div
            className={`${GRID} border-b border-line-soft bg-subtle px-4 py-[11px] font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-faint`}
          >
            <span>Patient</span>
            <span>Phone</span>
            <span className="text-right">Visits</span>
            <span className="text-right">Done</span>
            <span className="text-right">No-show</span>
            <span>Last visit</span>
          </div>
          {patients.map((p) => (
            <Link
              key={p.id}
              to={`/app/patients/${p.id}`}
              className={`${GRID} border-b border-line-soft px-4 py-3 transition-colors last:border-0 hover:bg-subtle`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-paper text-[12px] font-bold text-muted-foreground">
                  {initials(p.name)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-ink">
                    {p.name}
                  </div>
                  {p.consentAt ? (
                    <div className="font-mono text-[10px] text-success">
                      consented
                    </div>
                  ) : (
                    <div className="font-mono text-[10px] text-faint">
                      no consent
                    </div>
                  )}
                </div>
              </div>
              <span className="truncate font-mono text-[12px] text-muted-foreground">
                {p.phone}
              </span>
              <span className="text-right font-mono text-[13px] font-bold text-ink">
                {p.total}
              </span>
              <span className="text-right font-mono text-[13px] text-success">
                {p.completed}
              </span>
              <span
                className={`text-right font-mono text-[13px] ${
                  p.noShow > 0 ? "text-noshow" : "text-faint"
                }`}
              >
                {p.noShow}
              </span>
              <span className="text-[12px] text-faint">
                {shortDate(p.lastVisitAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
