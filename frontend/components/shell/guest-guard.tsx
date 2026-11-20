"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import { roleHome } from "@/lib/role-home";

/**
 * The reverse of AuthGuard (components/shell/auth-guard.tsx) — keeps
 * someone who's already logged in (a saved token that /auth/me accepts)
 * off the public login/register pages in the same browser tab or a new
 * one, sending them to their own role's home instead of letting them
 * log in or register again on top of an existing session. They have to
 * log out first to see these pages again.
 *
 * A stale/expired/missing token is not a match here — isError (token
 * rejected) and "no token at all" both fall through to the normal
 * form, same as today.
 */
export function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checkedToken, setCheckedToken] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  // Only actually call /auth/me once we know there's a token to check —
  // calling it with none 401s, and the api-client's global 401 handler
  // reads any 401 as "go to /login", which is exactly the bug this was
  // causing: a logged-out visitor landing on /register got bounced to
  // /login before ever seeing the form.
  const { data: user, isError, isFetched } = useCurrentUser(checkedToken && hasToken);

  useEffect(() => {
    setHasToken(!!localStorage.getItem("access_token"));
    setCheckedToken(true);
  }, []);

  useEffect(() => {
    if (user) router.replace(roleHome(user.role, user.org_slug));
  }, [user, router]);

  if (!checkedToken) return null;
  if (!hasToken) return <>{children}</>;
  // A token exists — hold the form back until we know whether it's
  // actually still valid, so a logged-in visitor never sees it flash
  // on screen before being redirected away.
  if (!isFetched) return null;
  if (isError) return <>{children}</>;
  if (user) return null;
  return <>{children}</>;
}
