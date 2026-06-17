import { Navigate, Outlet } from "react-router-dom";

import { Layout } from "@/components/layout";
import { Spinner } from "@/components/states";
import { useAuth } from "@/hooks/use-auth";

/** Gate for authenticated staff. Renders the app shell around child routes. */
export function RequireAuth() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

/** Gate for ADMIN-only routes. Sits inside RequireAuth. */
export function RequireAdmin() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
