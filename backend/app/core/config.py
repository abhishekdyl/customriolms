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

    # Object storage (Cloudflare R2 — S3-compatible)
    R2_ENDPOINT_URL: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_BUCKET_NAME: str = "riosmart-lms-content"

    # Monitoring
    SENTRY_DSN: str = ""

    # CORS — comma-separated origins
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
