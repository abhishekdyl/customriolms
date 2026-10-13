"""
SUPERSEDED — module endpoints live under /api/v1/courses/{course_id}/modules/*
in courses.py, not here. Modules only ever exist inside a course, so
nesting them keeps org-scoping automatic (checked once via the parent
course) instead of needing its own ownership check on every module route.

Left in place so the file map in docs/project-structure.md still resolves.
"""
from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/modules", tags=["modules"])
