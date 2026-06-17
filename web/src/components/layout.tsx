import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-secondary text-secondary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )
      }
    >
      {label}
    </NavLink>
  );
}

/** Authenticated app shell: header, nav, and main content area. */
export function Layout({ children }: { children: ReactNode }) {
  const { staff, isAdmin } = useAuth();
  const logout = useLogout();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold">receptionone.ai</span>
          <nav className="flex items-center gap-1" aria-label="Primary">
            <NavItem to="/" label="Appointments" />
            <NavItem to="/appointments/new" label="New" />
            {isAdmin ? <NavItem to="/doctors" label="Doctors" /> : null}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {staff ? (
              <span className="hidden text-muted-foreground sm:inline">
                {staff.name}
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
