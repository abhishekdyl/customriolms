"use client";
import { ProfileFieldsPage } from "@/components/shell/profile-fields-page";

/** Super Admin's own "your profile" page — unprefixed because Super
 * Admin isn't a member of any customer org (see lib/role-home's
 * profilePath). The parent layout's AuthGuard already restricts this
 * whole platform-level shell to Super Admin. Every other role gets the
 * same content under their own org prefix at
 * app/[org]/(dashboard)/profile. */
export default function SuperAdminProfilePage() {
  return <ProfileFieldsPage />;
}
