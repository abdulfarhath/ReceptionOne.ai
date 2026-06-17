import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getMe, login as apiLogin, logout as apiLogout } from "@/lib/api";
import type { StaffProfile } from "@/lib/schemas";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

// DEV-ONLY login bypass, gated by env so it is OFF by default and ON only when
// VITE_AUTH_BYPASS=true is set in web/.env. Pair with AUTH_BYPASS=true on the API.
// Never enable this in a deployed build.
const BYPASS_AUTH = import.meta.env.VITE_AUTH_BYPASS === "true";
const BYPASS_STAFF: StaffProfile = {
  id: "dev-bypass",
  email: "dev@receptionone.ai",
  name: "Dev User",
  role: "ADMIN",
  active: true,
};

export function useAuth() {
  const query = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: getMe,
    staleTime: 60_000,
    retry: false,
    enabled: !BYPASS_AUTH,
  });

  if (BYPASS_AUTH) {
    return {
      staff: BYPASS_STAFF,
      isLoading: false,
      isAuthenticated: true,
      isAdmin: true,
    };
  }

  return {
    staff: query.data ?? null,
    isLoading: query.isLoading,
    isAuthenticated: Boolean(query.data),
    isAdmin: query.data?.role === "ADMIN",
  };
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      apiLogin(email, password),
    onSuccess: (staff) => {
      queryClient.setQueryData(AUTH_QUERY_KEY, staff);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiLogout,
    onSuccess: () => {
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.clear();
    },
  });
}
