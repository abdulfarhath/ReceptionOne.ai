import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, Users } from "lucide-react";

import { EmptyState, ErrorState, Spinner } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  return iso ? formatLongDate(iso).replace(/^\w+,\s/, "") : "—";
}

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
        <p className="text-muted-foreground">
          Patient directory and appointment history.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          className="pl-9"
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search patients"
        />
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
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Patient</th>
                <th className="px-4 py-2 text-center font-medium">Total</th>
                <th className="px-4 py-2 text-center font-medium">Active</th>
                <th className="px-4 py-2 text-center font-medium">Completed</th>
                <th className="px-4 py-2 text-center font-medium">Cancelled</th>
                <th className="px-4 py-2 font-medium">Last visit</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr
                  key={p.id}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/patients/${p.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {p.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {p.phone}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {p.total}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {p.active > 0 ? (
                      <Badge variant="default">{p.active}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {p.completed}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">
                    {p.cancelled}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {shortDate(p.lastVisitAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!patientsQuery.isLoading && patients.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" aria-hidden />
          {patients.length} patient{patients.length === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}
