"use client";
import { useMyOrg } from "@/lib/hooks/use-orgs";

export function useOrgNameForShare() {
  const { data } = useMyOrg(true);
  return data?.name ?? "Riosmart LMS";
}
