from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.teams import router as teams_router
from app.api.v1.users import router as users_router
from app.api.v1.categories import router as categories_router
from app.api.v1.courses import router as courses_router
from app.api.v1.skills import router as skills_router
from app.api.v1.badges import router as badges_router
from app.api.v1.certificates import router as certificates_router
from app.api.v1.orgs import router as orgs_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.learn import router as learn_router
from app.api.v1.question_banks import router as question_banks_router
from app.api.v1.files import router as files_router
from app.api.v1.profile_fields import router as profile_fields_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(teams_router)
api_router.include_router(users_router)
api_router.include_router(categories_router)
api_router.include_router(courses_router)
api_router.include_router(skills_router)
api_router.include_router(badges_router)
api_router.include_router(certificates_router)
api_router.include_router(orgs_router)
api_router.include_router(notifications_router)
api_router.include_router(learn_router)
api_router.include_router(question_banks_router)
api_router.include_router(files_router)
api_router.include_router(profile_fields_router)

# As each module is built, its router is added here — main.py never
# changes again after this point, which keeps that file stable.
