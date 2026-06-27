import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

/** A sun/moon button that flips the site between light and dark. */
export function ThemeToggle({
  className,
  variant = "ghost",
}: {
  className?: string;
  /** "ghost" for in-app chrome; "onDark" for dark hero/landing surfaces. */
  variant?: "ghost" | "onDark";
}) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={cn(
        "grid size-8 place-items-center rounded-lg transition-colors",
        variant === "onDark"
          ? "border border-white/30 text-[#eaf6f1] hover:bg-white/10"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
