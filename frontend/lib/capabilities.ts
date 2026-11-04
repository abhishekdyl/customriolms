/** Mirrors backend/app/services/permission_service.py's has_capability.
 *
 * `capabilities` undefined/null on AppUser means "every capability" (Super
 * Admin / Org Admin never carry a restricted set); otherwise it's the exact
 * set Team Lead or a custom role was granted. Any page that hid an
 * org-admin-only action behind a hardcoded `role === "org_admin"` check
 * would never show it to a custom role either, even when that role was
 * explicitly granted the matching capability — this is the shared helper
 * every such check should go through instead, so a custom role can do
 * exactly what its capabilities say and nothing the UI forgot to unlock.
 *
 * UI-side convenience only — the real enforcement is always server-side
 * (every capability-gated endpoint uses require_capability). */

type CapabilityCarrier = { capabilities?: string[] | null } | null | undefined;

export function hasCapability(user: CapabilityCarrier, capability: string): boolean {
  if (!user) return false;
  const caps = user.capabilities;
  return caps === null || caps === undefined || caps.includes(capability);
}

/** True if the user has at least one of the given capabilities. */
export function hasAnyCapability(user: CapabilityCarrier, capabilities: string[]): boolean {
  return capabilities.some((c) => hasCapability(user, c));
}
