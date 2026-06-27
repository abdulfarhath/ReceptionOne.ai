import type { ComponentType, ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  ListOrdered,
  LogOut,
  Megaphone,
  Plus,
  Stethoscope,
  Users,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type NavEntry = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

const NAV: NavEntry[] = [
  { to: "/app", label: "Live Queue", icon: ListOrdered },
  { to: "/app/appointments/new", label: "New booking", icon: Plus },
  { to: "/app/patients", label: "Patients", icon: Users },
  { to: "/app/broadcasts", label: "Broadcasts", icon: Megaphone },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/app/doctors", label: "Doctors", icon: Stethoscope, adminOnly: true },
];

/** The amber-dot brandmark used in the sidebar and on auth screens. */
export function Brandmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 font-mono text-[13px] font-bold text-teal-deep",
        className,
      )}
    >
      <span className="size-[9px] rounded-full bg-amber shadow-[0_0_0_4px_rgba(237,162,59,0.18)]" />
      receptionone.ai
    </span>
  );
}

function NavItem({ to, label, icon: Icon }: NavEntry) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          "flex items-center gap-[11px] rounded-[9px] px-[11px] py-[9px] text-[13.5px] transition-colors",
          isActive
            ? "bg-nav-active font-semibold text-teal-deep"
            : "font-medium text-muted-foreground hover:bg-nav-active/60 hover:text-teal-deep",
        )
      }
    >
      <Icon className="size-[18px] shrink-0" />
      {label}
    </NavLink>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Authenticated app shell: a fixed left sidebar + scrollable content area. */
export function Layout({ children }: { children: ReactNode }) {
  const { staff, isAdmin } = useAuth();
  const logout = useLogout();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-panel px-[14px] py-[18px]">
        <div className="px-2 pb-4 pt-1">
          <Brandmark />
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Primary">
          {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 border-t border-line-soft pt-4">
          <div className="grid size-[30px] place-items-center rounded-full bg-teal-deep font-mono text-[11px] font-bold text-[#dff6ee]">
            {staff ? initialsOf(staff.name) : "—"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-ink">
              {staff?.name ?? "Staff"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {staff?.role === "ADMIN" ? "Admin" : "Receptionist"}
            </div>
          </div>
          <ThemeToggle />
          <button
            type="button"
            aria-label="Sign out"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="text-faint transition-colors hover:text-teal-deep disabled:opacity-50"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-6 lg:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
