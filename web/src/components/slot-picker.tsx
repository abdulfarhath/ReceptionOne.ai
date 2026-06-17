import { useQuery } from "@tanstack/react-query";

import { ErrorState, Spinner } from "@/components/states";
import { getSlots } from "@/lib/api";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

interface SlotPickerProps {
  doctorId: string | undefined;
  date: string;
  value: string | undefined;
  onSelect: (iso: string) => void;
}

/** A grid of selectable available-slot buttons for a doctor on a given day. */
export function SlotPicker({ doctorId, date, value, onSelect }: SlotPickerProps) {
  const query = useQuery({
    queryKey: ["slots", doctorId, date],
    queryFn: () => getSlots(doctorId as string, date),
    enabled: Boolean(doctorId),
  });

  if (!doctorId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a doctor to see available times.
      </p>
    );
  }
  if (query.isLoading) return <Spinner label="Loading available times…" />;
  if (query.isError) {
    return (
      <ErrorState
        message={(query.error as Error).message}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const slots = query.data ?? [];
  if (slots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No open slots on this day. Try another date.
      </p>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Available times"
      className="grid grid-cols-3 gap-2 sm:grid-cols-4"
    >
      {slots.map((iso) => {
        const selected = iso === value;
        return (
          <button
            key={iso}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onSelect(iso)}
            className={cn(
              "rounded-md border px-2 py-2 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {formatTime(iso)}
          </button>
        );
      })}
    </div>
  );
}
