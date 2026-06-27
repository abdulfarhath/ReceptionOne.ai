import { useSyncExternalStore } from "react";

// A tiny global theme store so every ThemeToggle (sidebar, landing, login) stays
// in sync. The `.dark` class on <html> drives Tailwind's dark variant; the
// choice is persisted to localStorage and mirrored by a no-flash script in
// index.html so the first paint already matches.
export type Theme = "light" | "dark";
const STORAGE_KEY = "theme";

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function current(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore storage failures (private mode) */
  }
}

const listeners = new Set<() => void>();
function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Read + toggle the active theme. */
export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, current, () => "light" as Theme);
  const setTheme = (t: Theme) => {
    apply(t);
    emit();
  };
  return { theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark"), setTheme };
}

/** Resolve the initial theme (used only as a fallback; index.html sets it first). */
export function initialTheme(): Theme {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  }
  return systemPrefersDark() ? "dark" : "light";
}
