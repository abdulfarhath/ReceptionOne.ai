import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import { setUnauthorizedHandler } from "@/lib/api";
import { AUTH_QUERY_KEY } from "@/hooks/use-auth";

/**
 * App-wide providers: TanStack Query + Router + toasts. A 401 from anywhere in
 * the API clears the cached auth state, which makes protected routes redirect
 * to login.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      }),
  );

  useEffect(() => {
    setUnauthorizedHandler(() =>
      queryClient.setQueryData(AUTH_QUERY_KEY, null),
    );
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
