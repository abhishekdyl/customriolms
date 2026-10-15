import uuid

from pydantic import BaseModel, Field, field_validator

from app.models.profile_field import ProfileFieldType

_SHORTNAME_RE = r"^[a-z0-9_]+$"


class ProfileFieldCreate(BaseModel):
    shortname: str = Field(min_length=1, max_length=100, pattern=_SHORTNAME_RE)
    name: str = Field(min_length=1, max_length=200)
    field_type: ProfileFieldType
    options: list[str] = []
    required: bool = False
    sortorder: int = 0

    @field_validator("options")
    @classmethod
    def _validate_options(cls, v: list[str], info) -> list[str]:
        field_type = info.data.get("field_type")
        if field_type in (ProfileFieldType.RADIO, ProfileFieldType.SELECT) and not v:
            raise ValueError("radio/select fields need at least one option")
        return [o.strip() for o in v if o.strip()]


class ProfileFieldUpdate(BaseModel):
    """Deliberately excludes `shortname` and `field_type` — both are the
    identity of the field (shortname is the JSON key every stored value
    and form submission keys off; changing field_type would silently
    reinterpret every existing value, e.g. free text as a radio choice).
    An Org Admin who wants a different type/key deletes and recreates it."""
    name: str | None = Field(default=None, min_length=1, max_length=200)
    options: list[str] | None = None
    required: bool | None = None
    sortorder: int | None = None


class ProfileFieldOut(BaseModel):
    id: uuid.UUID
    shortname: str
    name: str
    field_type: ProfileFieldType
    options: list[str]
    required: bool
    sortorder: int

    class Config:
        from_attributes = True


class ProfileFieldValueOut(ProfileFieldOut):
    """A field definition plus one particular user's current value for
    it — what both the Org Admin's "view this user" screen and the
    user's own profile-edit form render from."""
    value: str | None = None


class ProfileFieldValuesUpdate(BaseModel):
    """Bulk-set the caller's own custom field values in one call — keyed
    by shortname (not field_id), since that's the stable, human-typeable
    identifier the frontend form was built from. Unknown shortnames are
    ignored rather than erroring, so a field an admin just deleted can't
    break an in-flight save."""
    values: dict[str, str | None] = {}
