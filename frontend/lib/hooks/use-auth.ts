"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { ROLE_HOME } from "@/lib/role-home";
import type { RoleName, TokenResponse, User } from "@/lib/types";

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

/** Google Sign-In for an EXISTING account — the Google counterpart of
 * useLogin. `credential` is the signed ID-token JWT Google Identity
 * Services hands the frontend via GoogleSignInButton; the backend
 * (/auth/google) verifies it against Google's own keys before trusting
 * anything in it. Fails with a clear 404 if no account matches that
 * Google email yet — the button's caller should point them at
 * useGoogleRegister in that case (see GoogleSignInButton). */
export function useGoogleLogin() {
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (credential: string) => api.post<TokenResponse>("/api/v1/auth/google", { credential }),
    onSuccess: (data) => {
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      qc.clear();
      if (data.must_change_password) router.push("/change-password");
      else router.push(data.role ? ROLE_HOME[data.role] : "/dashboard");
    },
  });
}

/** Google Sign-In for a BRAND NEW org — the Google counterpart of
 * useRegister. Google has no concept of "organization name", so the
 * caller (RegisterPage) still collects that one field and passes it
 * alongside the credential. */
export function useGoogleRegister() {
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { credential: string; org_name: string }) =>
      api.post<TokenResponse>("/api/v1/auth/google/register", body),
    onSuccess: (data) => {
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      qc.clear();
      router.push("/teams");
    },
  });
}

/** Step 1 of forgot-password — always "succeeds" from the caller's point
 * of view (the backend intentionally responds the same way whether or
 * not the email exists, so there's nothing to branch on besides a real
 * network/server error). The caller just shows a fixed confirmation
 * message on success. */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => api.post<{ detail: string }>("/api/v1/auth/forgot-password", { email }),
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

/** Edit your own profile — see UpdateProfileRequest on the backend for the
 * full field set (firstname/lastname/username/city/country/timezone/
 * companyname). `name` here is a convenience for callers that still just
 * collect one "Full name" field — split client-side the same way the
 * backend splits it at creation time (first word vs. the rest). */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: { name: string } | Partial<Pick<User, "firstname" | "lastname" | "username" | "city" | "country" | "timezone" | "companyname">>,
    ) => {
      if ("name" in body) {
        const parts = body.name.trim().split(/\s+/);
        const firstname = parts[0] ?? "";
        const lastname = parts.slice(1).join(" ");
        return api.patch<User>("/api/v1/auth/me", { firstname, lastname });
      }
      return api.patch<User>("/api/v1/auth/me", body);
    },
    // Everything that shows the name (sidebar, Home greeting) reads this cache entry.
    onSuccess: (me) => qc.setQueryData(["me"], me),
  });
}

/** Upload/replace your own avatar — stored via the content-addressed
 * `files` table ledger (component="user", filearea="avatar"). */
export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.upload<User>("/api/v1/auth/me/avatar", form);
    },
    onSuccess: (me) => qc.setQueryData(["me"], me),
  });
}

/** Org Admin's "Login as" — switches this browser tab into the target
 * user's own session (see users.py's login_as_user). The admin's own
 * tokens are stashed under a separate "impersonator_*" key so
 * useReturnToAdmin can restore them without a fresh login; nested
 * impersonation (logging in as someone else while already viewing as
 * someone) is refused client-side so that stash is never overwritten. */
export function useLoginAs() {
  const router = useRouter();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => {
      if (localStorage.getItem("impersonator_access_token")) {
        return Promise.reject(new ApiError("Return to admin first before logging in as someone else", 400));
      }
      return api.post<TokenResponse>(`/api/v1/users/${userId}/login-as`);
    },
    onSuccess: (data) => {
      const adminToken = localStorage.getItem("access_token");
      const adminRefresh = localStorage.getItem("refresh_token");
      if (adminToken) localStorage.setItem("impersonator_access_token", adminToken);
      if (adminRefresh) localStorage.setItem("impersonator_refresh_token", adminRefresh);
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      qc.clear();
      router.push(data.role ? ROLE_HOME[data.role as RoleName] : "/dashboard");
    },
  });
}

/** Switches back from an impersonated session to the admin's own —
 * the "Return to admin" button in ImpersonationBanner. Best-effort logs
 * out the impersonated session server-side first, same as a normal
 * logout, then restores the stashed admin tokens. */
export function useReturnToAdmin() {
  const router = useRouter();
  const qc = useQueryClient();
  return () => {
    const adminToken = localStorage.getItem("impersonator_access_token");
    const adminRefresh = localStorage.getItem("impersonator_refresh_token");
    if (!adminToken) return;
    api.post("/api/v1/auth/logout").catch(() => {});
    localStorage.setItem("access_token", adminToken);
    if (adminRefresh) localStorage.setItem("refresh_token", adminRefresh);
    localStorage.removeItem("impersonator_access_token");
    localStorage.removeItem("impersonator_refresh_token");
    qc.clear();
    router.push("/users");
  };
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
