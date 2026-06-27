import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-white",
        outline: "text-foreground",
        success: "border-transparent bg-success text-white",
        muted: "border-transparent bg-muted text-muted-foreground",
        // Live-queue status pills — mono, uppercase, pill-shaped.
        traveling:
          "border-transparent rounded-full bg-amber-soft text-amber-text font-mono text-[10.5px] font-bold uppercase tracking-wide",
        arrived:
          "border-transparent rounded-full bg-mint text-teal-deep font-mono text-[10.5px] font-bold uppercase tracking-wide",
        inProgress:
          "border-transparent rounded-full bg-teal text-white font-mono text-[10.5px] font-bold uppercase tracking-wide",
        done: "border-transparent rounded-full bg-muted text-ink-soft font-mono text-[10.5px] font-bold uppercase tracking-wide",
        noShow:
          "border-transparent rounded-full bg-noshow-soft text-noshow font-mono text-[10.5px] font-bold uppercase tracking-wide",
        priority:
          "border-transparent rounded-full bg-amber-soft text-amber-text font-mono text-[10.5px] font-bold uppercase tracking-wide",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
