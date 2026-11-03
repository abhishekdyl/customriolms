"""
Course import/export — two different ways to get a fully-configured
course (modules, quiz questions, restrictions, groups, completion
rules — same restrictions, same grading, same pass marks as the
original) somewhere else:

- duplicate_course: same org, one click, FULL fidelity — including the
  real file content (a module's video/doc, a SCORM package, the cover
  image), copied via storage_service.copy_file_refs with no re-upload,
  since it's guaranteed to be the same storage backend. This is what
  "copy this course into a new category" means.
- export_course_snapshot / import_course_snapshot: a portable JSON file,
  for moving a course to a different org or environment (e.g. staging).
  Structural fidelity only — it deliberately does NOT carry real file
  bytes (a module's video/doc/SCORM package, the cover image, a question
  image), since the target environment's storage may not even be the
  same backend; those need re-attaching after import. Cross-org
  references (category, badges, skills, certificate template,
  prerequisite courses) also aren't carried — matching them safely
  across orgs (duplicate names, missing entities) isn't something this
  can guess at reliably, so the importing admin reconfigures them.
  Anything dropped or needing attention comes back as a warning.
"""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.course import Course
from app.models.course_group import CourseGroup
from app.models.module import Module, ModuleQuizQuestion, ModuleType, QuestionType
from app.models.user import User
from app.services import storage_service
from app.services.course_service import _MODULE_COMPONENT, get_course_or_404

EXPORT_FORMAT = "riosmart-course-export-v1"


# ---------- Duplicate (same org, full fidelity) ----------
async def duplicate_course(db: AsyncSession, course: Course, *, title: str | None, category_id: uuid.UUID | None, user: User) -> Course:
    """Deep-copies `course` into a brand-new course in the SAME org — see
    this module's docstring. Deliberately NOT copied, because they
    belong to a specific RUN of the course, not its design: assignment
    (assigned_team_ids/assigned_user_ids — the copy starts unassigned),
    group MEMBERSHIP (the groups themselves are copied, empty), due-date
    overrides, and every learner's own progress/attempts/certificates.
    The new course always starts a draft with a fresh opens_at (now) and
    no closes_at — same "review before it goes live" convention as
    create_course — so the admin can check it over before assigning
    anyone to it."""
    new_title = (title or "").strip() or f"{course.title} (Copy)"
    new_category_id = category_id if category_id is not None else course.category_id

    new_course = Course(
        org_id=course.org_id, title=new_title, category_id=new_category_id,
        description=course.description, duration_label=course.duration_label,
        opens_at=datetime.now(timezone.utc), closes_at=None,
        # Same org, so these ids are still valid — and the whole point is
        # "same restriction rules", so they're kept, not reset.
        prerequisite_course_ids=list(course.prerequisite_course_ids or []),
        certificate_enabled=course.certificate_enabled,
        certificate_template_id=course.certificate_template_id,
        certificate_name=course.certificate_name,
        certificate_org_name=course.certificate_org_name,
        badge_ids=list(course.badge_ids or []),
        completion_mode=course.completion_mode,
        sequential_unlock=course.sequential_unlock,
        pass_mark=course.pass_mark,
        published=False,
    )
    db.add(new_course)
    await db.flush()  # need new_course.id for every child row below

    if course.cover_image_key:
        await storage_service.copy_file_refs(
            db, component="course", filearea="cover", from_itemid=course.id, to_itemid=new_course.id,
            org_id=course.org_id, user=user,
        )
        new_course.cover_image_key = course.cover_image_key

    # Groups — structure (name) only, never membership (see docstring).
    # Built before modules so a "group" restriction can be remapped below.
    group_id_map: dict[uuid.UUID, uuid.UUID] = {}
    for g in course.groups or []:
        new_group = CourseGroup(org_id=course.org_id, course_id=new_course.id, name=g.name)
        db.add(new_group)
        await db.flush()
        group_id_map[g.id] = new_group.id

    # Modules, in position order, so module_score/completion_module_ids
    # refs (which point at OTHER modules on this same course) can be
    # remapped old-id -> new-id once every module has a new id.
    module_id_map: dict[uuid.UUID, uuid.UUID] = {}
    new_modules: dict[uuid.UUID, Module] = {}
    ordered = sorted(course.modules, key=lambda m: m.position)
    for m in ordered:
        new_module = Module(
            course_id=new_course.id, title=m.title, type=m.type, position=m.position,
            required=m.required, threshold=m.threshold, weight=m.weight,
            retake_enabled=m.retake_enabled, retake_limit=m.retake_limit,
            file_name=m.file_name, file_size_label=m.file_size_label,
            instructions=m.instructions,
            scorm_launch_path=m.scorm_launch_path, scorm_version=m.scorm_version,
            scorm_completion_view=m.scorm_completion_view, scorm_completion_passed=m.scorm_completion_passed,
            scorm_completion_completed=m.scorm_completion_completed, scorm_completion_graded=m.scorm_completion_graded,
            video_question_min_correct=m.video_question_min_correct,
            skill_ids=list(m.skill_ids or []), badge_ids=list(m.badge_ids or []),
            certificate_enabled=m.certificate_enabled, certificate_template_id=m.certificate_template_id,
            certificate_name=m.certificate_name,
            published=m.published,
            restrictions=[],  # remapped in the second pass below
        )
        db.add(new_module)
        await db.flush()
        module_id_map[m.id] = new_module.id
        new_modules[m.id] = new_module

        # Real file content — content-addressed copy, no re-upload (see
        # storage_service.copy_file_refs). A SCORM package can be many
        # `files` rows (one per file in the zip); this copies all of
        # them in one call, keyed by the module's own itemid.
        if m.type == ModuleType.SCORM and m.scorm_launch_path:
            await storage_service.copy_file_refs(
                db, component="mod_scorm", filearea="package", from_itemid=m.id, to_itemid=new_module.id,
                org_id=course.org_id, user=user,
            )
        elif m.file_key:
            component = _MODULE_COMPONENT.get(m.type)
            if component:
                await storage_service.copy_file_refs(
                    db, component=component, filearea="content", from_itemid=m.id, to_itemid=new_module.id,
                    org_id=course.org_id, user=user,
                )
        new_module.file_key = m.file_key  # same key either way — copy_file_refs only adds the ref row

        # Quiz questions — options_json/image_key copied verbatim. A
        # question image is an independent, never-replaced upload slot
        # (see storage_service.store_file's docstring on question
        # images), not ref-counted per owner, so there's nothing to
        # re-register — just the key string.
        for q in m.questions:
            db.add(ModuleQuizQuestion(
                module_id=new_module.id, position=q.position, type=q.type, text=q.text, image_key=q.image_key,
                options_json=list(q.options_json or []), correct_option_id=q.correct_option_id,
                accepted_answers=list(q.accepted_answers or []),
                trigger_time_sec=q.trigger_time_sec, timer_seconds=q.timer_seconds, points=q.points,
            ))

    # Second pass — remap restrictions (module_score.module_id,
    # group.group_id) now that every module/group has its new id.
    for m in ordered:
        remapped = []
        for r in (m.restrictions or []):
            r = dict(r)
            if r.get("type") == "module_score":
                old = r.get("module_id")
                old_uuid = old if isinstance(old, uuid.UUID) else uuid.UUID(str(old))
                new_id = module_id_map.get(old_uuid)
                if new_id is None:
                    continue  # defensive — shouldn't happen, every module on the course was just copied
                r["module_id"] = str(new_id)
            elif r.get("type") == "group":
                old = r.get("group_id")
                old_uuid = old if isinstance(old, uuid.UUID) else uuid.UUID(str(old))
                new_id = group_id_map.get(old_uuid)
                if new_id is None:
                    continue
                r["group_id"] = str(new_id)
            remapped.append(r)
        new_modules[m.id].restrictions = remapped

    new_course.completion_module_ids = [
        module_id_map[mid] for mid in (course.completion_module_ids or []) if mid in module_id_map
    ]

    await db.commit()
    return await get_course_or_404(db, new_course.id, course.org_id)


# ---------- Export / Import (portable JSON, structural only) ----------
def export_course_snapshot(course: Course) -> dict:
    """See this module's docstring for exactly what is and isn't
    carried. Local `ref` strings (not real ids — the importing org's ids
    will be different) are how a module_score/group restriction and
    completion_module_refs point at another module/group within this
    same export."""
    ordered = sorted(course.modules, key=lambda m: m.position)
    module_ref = {m.id: f"m{i}" for i, m in enumerate(ordered)}
    group_ref = {g.id: f"g{i}" for i, g in enumerate(course.groups or [])}

    def _export_restriction(r: dict) -> dict | None:
        r = dict(r)
        if r.get("type") == "module_score":
            old = r.get("module_id")
            old_uuid = old if isinstance(old, uuid.UUID) else uuid.UUID(str(old))
            ref = module_ref.get(old_uuid)
            if ref is None:
                return None
            del r["module_id"]
            r["module_ref"] = ref
        elif r.get("type") == "group":
            old = r.get("group_id")
            old_uuid = old if isinstance(old, uuid.UUID) else uuid.UUID(str(old))
            ref = group_ref.get(old_uuid)
            if ref is None:
                return None
            del r["group_id"]
            r["group_ref"] = ref
        return r

    modules_out = []
    for m in ordered:
        content_note = None
        if m.type == ModuleType.SCORM and m.scorm_launch_path:
            content_note = "SCORM package not included — re-upload after import"
        elif m.file_key:
            content_note = "File not included — re-upload after import"
        modules_out.append({
            "ref": module_ref[m.id],
            "title": m.title, "type": m.type.value, "position": m.position,
            "required": m.required, "threshold": m.threshold, "weight": m.weight,
            "retake_enabled": m.retake_enabled, "retake_limit": m.retake_limit,
            "instructions": m.instructions, "scorm_version": m.scorm_version,
            "scorm_completion_view": m.scorm_completion_view, "scorm_completion_passed": m.scorm_completion_passed,
            "scorm_completion_completed": m.scorm_completion_completed, "scorm_completion_graded": m.scorm_completion_graded,
            "video_question_min_correct": m.video_question_min_correct,
            "published": m.published,
            "certificate_enabled": m.certificate_enabled, "certificate_name": m.certificate_name,
            "content_note": content_note,
            "restrictions": [rr for r in (m.restrictions or []) if (rr := _export_restriction(r)) is not None],
            "questions": [
                {
                    "position": q.position, "type": q.type.value, "text": q.text,
                    "has_image": bool(q.image_key),  # image bytes not exported — see module docstring
                    "options": [
                        {"id": o.get("id"), "text": o.get("text"), "has_image": bool(o.get("image_key"))}
                        for o in (q.options_json or [])
                    ],
                    "correct_option_id": q.correct_option_id, "accepted_answers": list(q.accepted_answers or []),
                    "trigger_time_sec": q.trigger_time_sec, "timer_seconds": q.timer_seconds, "points": q.points,
                }
                for q in m.questions
            ],
        })

    return {
        "format": EXPORT_FORMAT,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "course": {
            "title": course.title, "description": course.description, "duration_label": course.duration_label,
            "category_name": course.category.name if course.category else None,
            "certificate_enabled": course.certificate_enabled, "certificate_name": course.certificate_name,
            "certificate_org_name": course.certificate_org_name,
            "completion_mode": course.completion_mode, "sequential_unlock": course.sequential_unlock,
            "pass_mark": course.pass_mark,
            "completion_module_refs": [module_ref[mid] for mid in (course.completion_module_ids or []) if mid in module_ref],
            "groups": [{"ref": group_ref[g.id], "name": g.name} for g in (course.groups or [])],
            "modules": modules_out,
        },
    }


async def import_course_snapshot(
    db: AsyncSession, snapshot: dict, *, org_id: uuid.UUID, category_id: uuid.UUID | None, user: User,
) -> tuple[Course, list[str]]:
    """Recreates a course from export_course_snapshot's output, in
    org_id. Returns (new_course, warnings) — see this module's docstring
    for what's always a warning (file content) vs what's conditional
    (a category/restriction that didn't resolve here)."""
    if not isinstance(snapshot, dict) or snapshot.get("format") != EXPORT_FORMAT:
        raise HTTPException(status_code=400, detail="This doesn't look like a course export file")
    data = snapshot.get("course") or {}
    warnings: list[str] = []

    resolved_category_id = category_id
    if resolved_category_id is None and data.get("category_name"):
        cat = (await db.execute(
            select(Category).where(Category.org_id == org_id, Category.name == data["category_name"])
        )).scalar_one_or_none()
        if cat:
            resolved_category_id = cat.id
        else:
            warnings.append(f"Category \"{data['category_name']}\" doesn't exist here — left uncategorized.")

    new_course = Course(
        org_id=org_id, title=(data.get("title") or "Imported course").strip() or "Imported course",
        category_id=resolved_category_id, description=data.get("description"),
        duration_label=data.get("duration_label") or "",
        opens_at=datetime.now(timezone.utc), closes_at=None,
        certificate_enabled=data.get("certificate_enabled", True),
        certificate_name=data.get("certificate_name"), certificate_org_name=data.get("certificate_org_name"),
        completion_mode=data.get("completion_mode") or "all",
        sequential_unlock=bool(data.get("sequential_unlock")),
        pass_mark=data.get("pass_mark") if data.get("pass_mark") is not None else 50,
        published=False,
    )
    db.add(new_course)
    await db.flush()

    group_ref_map: dict[str, uuid.UUID] = {}
    for g in data.get("groups") or []:
        new_group = CourseGroup(org_id=org_id, course_id=new_course.id, name=g.get("name") or "Group")
        db.add(new_group)
        await db.flush()
        if g.get("ref"):
            group_ref_map[g["ref"]] = new_group.id

    module_ref_map: dict[str, uuid.UUID] = {}
    new_modules: dict[str, Module] = {}
    for m in data.get("modules") or []:
        try:
            mtype = ModuleType(m.get("type"))
        except ValueError:
            warnings.append(f"Skipped a module with an unrecognized type (\"{m.get('type')}\").")
            continue
        new_module = Module(
            course_id=new_course.id, title=m.get("title") or "Untitled module", type=mtype,
            position=m.get("position") or 0, required=m.get("required", True), threshold=m.get("threshold", 90),
            weight=m.get("weight", 1), retake_enabled=bool(m.get("retake_enabled")), retake_limit=m.get("retake_limit"),
            instructions=m.get("instructions"), scorm_version=m.get("scorm_version"),
            scorm_completion_view=bool(m.get("scorm_completion_view")),
            scorm_completion_passed=bool(m.get("scorm_completion_passed")),
            scorm_completion_completed=m.get("scorm_completion_completed", True),
            scorm_completion_graded=bool(m.get("scorm_completion_graded")),
            video_question_min_correct=m.get("video_question_min_correct"),
            certificate_enabled=bool(m.get("certificate_enabled")), certificate_name=m.get("certificate_name"),
            published=False,  # re-reviewed before going live — content/files still need re-attaching anyway
            restrictions=[],
        )
        db.add(new_module)
        await db.flush()
        if m.get("ref"):
            module_ref_map[m["ref"]] = new_module.id
            new_modules[m["ref"]] = new_module
        if m.get("content_note"):
            warnings.append(f"\"{new_module.title}\": {m['content_note']}.")

        for q in m.get("questions") or []:
            try:
                qtype = QuestionType(q.get("type"))
            except ValueError:
                continue
            options = [
                {"id": o.get("id") or uuid.uuid4().hex[:8], "text": o.get("text"), "image_key": None}
                for o in (q.get("options") or [])
            ]
            db.add(ModuleQuizQuestion(
                module_id=new_module.id, position=q.get("position", 0), type=qtype, text=q.get("text"),
                options_json=options, correct_option_id=q.get("correct_option_id"),
                accepted_answers=list(q.get("accepted_answers") or []),
                trigger_time_sec=q.get("trigger_time_sec"), timer_seconds=q.get("timer_seconds"),
                points=q.get("points", 1),
            ))
            if q.get("has_image") or any(o.get("has_image") for o in (q.get("options") or [])):
                warnings.append(f"\"{new_module.title}\": a question image wasn't carried over — re-add it.")

    # Second pass — restrictions, now every ref in this import resolves.
    for m in data.get("modules") or []:
        new_module = new_modules.get(m.get("ref"))
        if new_module is None:
            continue
        restrictions = []
        for r in m.get("restrictions") or []:
            r = dict(r)
            if r.get("type") == "module_score":
                target = module_ref_map.get(r.pop("module_ref", None))
                if target is None:
                    warnings.append(f"\"{new_module.title}\": dropped a restriction referencing a module that wasn't imported.")
                    continue
                r["module_id"] = str(target)
            elif r.get("type") == "group":
                target = group_ref_map.get(r.pop("group_ref", None))
                if target is None:
                    warnings.append(f"\"{new_module.title}\": dropped a group restriction — the group wasn't imported.")
                    continue
                r["group_id"] = str(target)
            restrictions.append(r)
        new_module.restrictions = restrictions

    new_course.completion_module_ids = [
        module_ref_map[ref] for ref in (data.get("completion_module_refs") or []) if ref in module_ref_map
    ]

    await db.commit()
    new_course_final = await get_course_or_404(db, new_course.id, org_id)
    return new_course_final, warnings
