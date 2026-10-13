"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import { ROLE_HOME } from "@/lib/role-home";

// Entry point after login / register / password change: send each role to its own home.
export default function RootPage() {
  const router = useRouter();
  const { data: user, isError } = useCurrentUser();

  useEffect(() => {
    if (!localStorage.getItem("access_token") || isError) {
      router.replace("/login");
      return;
    }
    if (user) router.replace(user.must_change_password ? "/change-password" : ROLE_HOME[user.role]);
  }, [user, isError, router]);

  return null;
}
