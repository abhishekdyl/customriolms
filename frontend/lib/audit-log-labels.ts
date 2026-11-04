/** Shared between the org-wide Audit Log page and a course's own Activity
 * tab (ActivityPanel) — one label per action string so both read the same
 * "Course created" / "Module updated" wording instead of the raw
 * dot-namespaced action code. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "course.created": "Course created",
  "course.updated": "Course updated",
  "course.published": "Course published",
  "course.unpublished": "Course unpublished",
  "course.deleted": "Course deleted",
  "course.duplicated": "Course duplicated",
  "course.imported": "Course imported",
  "course.modules_reordered": "Modules reordered",
  "module.created": "Module added",
  "module.updated": "Module updated",
  "module.deleted": "Module deleted",
  "module.file_uploaded": "Module file replaced",
  "module.file_removed": "Module file removed",
  "module.scorm_uploaded": "SCORM package replaced",
  "user.role_changed": "Role changed",
};
