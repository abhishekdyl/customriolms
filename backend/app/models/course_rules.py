"""
SUPERSEDED — not a separate table. What this file was meant to hold
(whether a course awards a certificate, with which template/name)
turned out to be a handful of columns, not a one-to-many relationship
worth its own table. That config now lives directly on Course:
certificate_enabled, certificate_template_id, certificate_name,
certificate_org_name, badge_ids — see app/models/course.py.

Left in place (rather than deleted) so anyone following
docs/project-structure.md's file map isn't left wondering where it went.
"""
