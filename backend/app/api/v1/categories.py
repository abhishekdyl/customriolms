import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.category import Category
from app.models.user import RoleName, User
from app.schemas.category import CategoryCreate, CategoryOut, CategoryUpdate
from app.services.category_service import delete_category, list_categories_with_counts

router = APIRouter(prefix="/api/v1/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut], dependencies=[Depends(require_role(RoleName.ORG_ADMIN, RoleName.TEAM_LEAD))])
async def list_categories(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = await list_categories_with_counts(db, current_user.org_id)
    return [CategoryOut(id=c.id, name=c.name, color=c.color, course_count=count) for c, count in rows]


@router.post("", response_model=CategoryOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def create_category(body: CategoryCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    category = Category(org_id=current_user.org_id, name=body.name, color=body.color)
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return CategoryOut(id=category.id, name=category.name, color=category.color, course_count=0)


@router.patch("/{category_id}", response_model=CategoryOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def rename_category(category_id: uuid.UUID, body: CategoryUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    category = await _get_or_404(db, category_id, current_user.org_id)
    category.name = body.name
    category.color = body.color
    await db.commit()
    return CategoryOut(id=category.id, name=category.name, color=category.color)


@router.delete("/{category_id}", status_code=204, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def remove_category(category_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    category = await _get_or_404(db, category_id, current_user.org_id)
    await delete_category(db, category)  # reassigns its courses to Uncategorized — see the service


async def _get_or_404(db: AsyncSession, category_id: uuid.UUID, org_id: uuid.UUID) -> Category:
    result = await db.execute(select(Category).where(Category.id == category_id, Category.org_id == org_id))
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    return category
