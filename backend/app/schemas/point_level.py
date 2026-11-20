import uuid

from pydantic import BaseModel, Field, model_validator

from app.services import storage_service


class PointLevelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    min_points: int = Field(ge=0)
    max_points: int | None = Field(default=None, ge=0)  # None = open-ended ("and above") — e.g. the top tier
    color: str = "#778899"
    sort_order: int = 0

    @model_validator(mode="after")
    def _check_range(self):
        if self.max_points is not None and self.max_points < self.min_points:
            raise ValueError("Max points must be greater than or equal to min points")
        return self


class PointLevelOut(BaseModel):
    id: uuid.UUID
    name: str
    min_points: int
    max_points: int | None
    color: str
    sort_order: int
    image_url: str | None = None
    # Not sent to the client (exclude=True) — same file_key/file_url
    # pattern as Course.cover_image_key: the storage key is permanent,
    # the presigned URL is regenerated fresh on every read.
    image_key: str | None = Field(default=None, exclude=True)

    class Config:
        from_attributes = True

    @model_validator(mode="after")
    def _resolve_image_url(self):
        if self.image_key:
            self.image_url = storage_service.presigned_get_url(self.image_key)
        return self
