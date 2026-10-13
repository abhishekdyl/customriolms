from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    """Every model inherits this. Row-Level Security policies for org_id
    are applied via migrations, not here — see alembic/versions."""
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
