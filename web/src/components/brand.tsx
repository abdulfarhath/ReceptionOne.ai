// Brand primitives for the live-queue dashboard — the small, repeated pieces
// the redesign is built from: token tiles, KPI tiles, column headers and the
// language chip. Numbers/tokens always render in JetBrains Mono (font-mono).

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type TokenTone = "amber" | "mint" | "neutral" | "onDark" | "rose" | "success";
type TokenSize = "sm" | "md" | "lg";

const TOKEN_TONE: Record<TokenTone, string> = {
  amber: "bg-amber-soft border-amber/30 text-[#7a4f12] dark:text-amber-text",
  mint: "bg-mint border-mint-strong text-teal-deep",
  neutral: "bg-subtle border-line-soft text-muted-foreground",
  onDark: "bg-white/15 border-white/25 text-white",
  rose: "bg-noshow-soft border-line-soft text-noshow",
  success: "bg-mint border-mint-strong text-teal-deep",
};

const TOKEN_SIZE: Record<TokenSize, { box: string; label: string; num: string }> = {
  sm: { box: "size-9 rounded-[9px]", label: "text-[7px]", num: "text-[13px]" },
  md: { box: "size-11 rounded-[11px]", label: "text-[7.5px]", num: "text-[16px]" },
  lg: { box: "size-12 rounded-xl", label: "text-[8px]", num: "text-[18px]" },
};

/** The square token chip (TKN · 04) shown on every queue card. */
export function TokenTile({
  token,
  tone = "neutral",
  size = "md",
  label = "TKN",
  className,
}: {
  token: number;
  tone?: TokenTone;
  size?: TokenSize;
  label?: string;
  className?: string;
}) {
  const s = TOKEN_SIZE[size];
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-center border",
        s.box,
        TOKEN_TONE[tone],
        className,
      )}
    >
      {label ? (
        <span
          className={cn(
            "font-mono font-bold uppercase tracking-[0.04em] opacity-80",
            s.label,
          )}
        >
          {label}
        </span>
      ) : null}
      <span className={cn("font-mono font-bold leading-none", s.num)}>
        {String(token).padStart(2, "0")}
      </span>
    </div>
  );
}

/** A small KPI card: mono uppercase label, display-font value, caption. */
export function KpiTile({
  label,
  value,
  caption,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  caption?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.07em] text-faint">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-display text-2xl font-extrabold leading-tight text-ink",
          valueClassName,
        )}
      >
        {value}
      </div>
      {caption ? (
        <div className="mt-0.5 text-[11px] text-faint">{caption}</div>
      ) : null}
    </div>
  );
}

/** A queue-column header: colour dot, title, count pill, optional helper line. */
export function ColumnHeader({
  dotClassName,
  title,
  count,
  countClassName,
  caption,
  help,
}: {
  dotClassName: string;
  title: string;
  count: number;
  countClassName: string;
  caption?: string;
  help?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <span className={cn("size-2.5 rounded-[3px]", dotClassName)} />
        <h3 className="font-display text-[14.5px] font-extrabold text-ink">{title}</h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-[11px] font-bold",
            countClassName,
          )}
        >
          {count}
        </span>
        {caption ? (
          <span className="ml-auto text-[11px] text-faint">{caption}</span>
        ) : null}
      </div>
      {help ? (
        <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

/** A patient's language as a compact mono chip. */
export function LanguageChip({
  lang,
  active = false,
}: {
  lang: string | null | undefined;
  active?: boolean;
}) {
  if (!lang) return null;
  return (
    <span
      className={cn(
        "rounded-md border px-[7px] py-0.5 font-mono text-[10px] font-bold uppercase",
        active ? "border-teal text-teal-deep" : "border-line text-muted-foreground",
      )}
    >
      {lang}
    </span>
  );
}
