"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { ROLE_HOME } from "@/lib/role-home";
import type { TokenResponse, User } from "@/lib/types";

export function useLogin() {
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<TokenResponse>("/api/v1/auth/login", body),
    onSuccess: (data) => {
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      // Drop anything cached for a previous account in this tab, so the
      // new login never briefly sees the last user's profile or role.
      qc.clear();
      if (data.must_change_password) {
        // Admin-created accounts start on a shared default password —
        // send them straight to set their own before anything else,
        // rather than letting them into the app first.
        router.push("/change-password");
      } else {
        // Each role has its own home: learner -> /learn, super admin -> /organizations, ...
        router.push(data.role ? ROLE_HOME[data.role] : "/dashboard");
      }
    },
  });
}

export function useRegister() {
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { org_name: string; name: string; email: string; password: string }) =>
      api.post<TokenResponse>("/api/v1/auth/register", body),
    onSuccess: (data) => {
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      qc.clear();
      router.push("/teams"); // register always creates an Org Admin
    },
  });
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<User>("/api/v1/auth/me"),
    retry: false,
  });
}

export function useLogout() {
  const router = useRouter();
  const qc = useQueryClient();
  return () => {
    // Best-effort: tell the backend to revoke this session so the token
    // can't be reused even if someone got hold of it. Don't block the
    // UI on it — if the network call fails, still log the user out
    // locally, since that's what they asked for.
    api.post("/api/v1/auth/logout").catch(() => {});
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    qc.clear();
    router.push("/login");
  };
}

/**
 * `redirectAfter` is true for the forced first-login page (send them to their
 * home when done) and false when changing it from Profile (stay put).
 */
export function useChangePassword({ redirectAfter = true }: { redirectAfter?: boolean } = {}) {
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      api.post("/api/v1/auth/change-password", body),
    onSuccess: async () => {
      // Refresh the cached profile (must_change_password is now false) and
      // use its role to land on the right home instead of assuming Org Admin.
      const me = await api.get<User>("/api/v1/auth/me");
      qc.setQueryData(["me"], me);
      if (redirectAfter) router.push(ROLE_HOME[me.role]);
    },
  });
}

/** Edit your own profile (name only — see UpdateProfileRequest on the backend). */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) => api.patch<User>("/api/v1/auth/me", body),
    // Everything that shows the name (sidebar, Home greeting) reads this cache entry.
    onSuccess: (me) => qc.setQueryData(["me"], me),
  });
}

/** Ends every session on every device, including this one. */
export function useLogoutAll() {
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/api/v1/auth/logout-all"),
    onSuccess: () => {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      qc.clear();
      router.push("/login");
    },
  });
}
