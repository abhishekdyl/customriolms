from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    All config comes from environment variables — never hardcoded.
    This is what makes Railway → Plesk → anywhere a config change,
    not a code change.
    """
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Riosmart LMS"
    ENV: str = "development"  # development | staging | production
    DEBUG: bool = True

    # Postgres (Neon, self-hosted, or any Postgres — just a connection string)
    DATABASE_URL: str = "postgresql+asyncpg://riosmart:riosmart@localhost:5432/riosmart_lms"

    # Redis (Upstash, self-hosted, or any Redis)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Auth
    JWT_SECRET: str = "change-me-in-env"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours — auto-logout after this
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    MAX_CONCURRENT_SESSIONS: int = 3  # oldest session is evicted past this

    # AI
    ANTHROPIC_API_KEY: str = ""

    # Object storage — Cloudflare R2 (S3-compatible) when configured, else
    # local disk is the fallback so the app works out of the box with
    # nothing to set up. Leave R2_ENDPOINT_URL empty to use local storage;
    # set it (plus the two keys below) to switch to R2/S3 instead — see
    # storage_service.py for the backend selection.
    R2_ENDPOINT_URL: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "riosmart-lms-content"

    # Local disk storage (the fallback backend). Empty means "compute the
    # default" — <repo root>/riolmsdata, a sibling of backend/ and
    # frontend/, not inside either — see storage_service.py's _local_root().
    # Only used while R2_ENDPOINT_URL is unset.
    STORAGE_ROOT: str = ""
    # Base URL this backend is actually reachable at — used only by the
    # local storage backend to build a file's URL (served via
    # GET /api/v1/files/{key}, app/api/v1/files.py). R2 doesn't need this;
    # it hands back a real presigned R2 URL instead.
    PUBLIC_API_BASE_URL: str = "http://localhost:8000"

    # Monitoring
    SENTRY_DSN: str = ""

    # CORS — comma-separated origins
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
