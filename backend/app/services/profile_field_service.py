import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile_field import ProfileFieldType, UserInfoData, UserInfoField
from app.schemas.profile_field import ProfileFieldCreate, ProfileFieldUpdate


async def list_fields(db: AsyncSession, org_id: uuid.UUID) -> list[UserInfoField]:
    result = await db.execute(
        select(UserInfoField).where(UserInfoField.org_id == org_id).order_by(UserInfoField.sortorder, UserInfoField.created_at)
    )
    return result.scalars().all()


async def get_field_or_404(db: AsyncSession, field_id: uuid.UUID, org_id: uuid.UUID) -> UserInfoField:
    result = await db.execute(select(UserInfoField).where(UserInfoField.id == field_id, UserInfoField.org_id == org_id))
    field = result.scalar_one_or_none()
    if field is None:
        raise HTTPException(status_code=404, detail="Custom field not found")
    return field


async def create_field(db: AsyncSession, org_id: uuid.UUID, body: ProfileFieldCreate) -> UserInfoField:
    existing = await db.execute(
        select(UserInfoField.id).where(UserInfoField.org_id == org_id, UserInfoField.shortname == body.shortname)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"A field with shortname \"{body.shortname}\" already exists")

    field = UserInfoField(
        org_id=org_id, shortname=body.shortname, name=body.name, field_type=body.field_type,
        options=body.options, required=body.required, sortorder=body.sortorder,
    )
    db.add(field)
    await db.commit()
    await db.refresh(field)
    return field


async def update_field(db: AsyncSession, field: UserInfoField, body: ProfileFieldUpdate) -> UserInfoField:
    data = body.model_dump(exclude_unset=True)
    if "options" in data and field.field_type in (ProfileFieldType.RADIO, ProfileFieldType.SELECT) and not data["options"]:
        raise HTTPException(status_code=400, detail="radio/select fields need at least one option")
    for key, value in data.items():
        setattr(field, key, value)
    await db.commit()
    await db.refresh(field)
    return field


async def delete_field(db: AsyncSession, field: UserInfoField) -> None:
    await db.delete(field)  # cascades to every UserInfoData row for it
    await db.commit()


async def get_values_for_user(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID) -> list[dict]:
    """Every field defined for this org, each with this particular
    user's current value (None if never filled in) — the shape both the
    user's own profile-edit form and an admin's "view this learner"
    screen render from."""
    fields = await list_fields(db, org_id)
    if not fields:
        return []
    rows = (await db.execute(
        select(UserInfoData).where(UserInfoData.user_id == user_id, UserInfoData.field_id.in_([f.id for f in fields]))
    )).scalars().all()
    value_by_field = {r.field_id: r.value for r in rows}
    return [
        {
            "id": f.id, "shortname": f.shortname, "name": f.name, "field_type": f.field_type,
            "options": f.options, "required": f.required, "sortorder": f.sortorder,
            "value": value_by_field.get(f.id),
        }
        for f in fields
    ]


async def set_values_for_user(
    db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, values_by_shortname: dict[str, str | None],
    commit: bool = True,
) -> None:
    """Upserts each given shortname's value. Unknown shortnames (a field
    that doesn't exist, or belongs to a different org) are silently
    skipped — see ProfileFieldValuesUpdate's docstring for why.

    commit=False lets a caller that's writing many users in one request
    (the bulk CSV importer) batch every row's values into its own single
    transaction instead of committing after each one."""
    if not values_by_shortname:
        return
    fields = (await db.execute(
        select(UserInfoField).where(UserInfoField.org_id == org_id, UserInfoField.shortname.in_(values_by_shortname.keys()))
    )).scalars().all()
    if not fields:
        return
    field_ids = [f.id for f in fields]
    existing_rows = (await db.execute(
        select(UserInfoData).where(UserInfoData.user_id == user_id, UserInfoData.field_id.in_(field_ids))
    )).scalars().all()
    existing_by_field = {r.field_id: r for r in existing_rows}

    for f in fields:
        new_value = values_by_shortname.get(f.shortname)
        row = existing_by_field.get(f.id)
        if row is None:
            db.add(UserInfoData(field_id=f.id, user_id=user_id, value=new_value))
        else:
            row.value = new_value
    if commit:
        await db.commit()
