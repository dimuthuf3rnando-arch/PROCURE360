from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment variables or .env."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "PROCURE360"
    app_version: str = "1.0.0"
    environment: Literal["development", "test", "production"] = "development"
    api_prefix: str = "/api"
    app_port: int = 8000
    debug: bool = False

    # Auth
    secret_key: str = "procure360-dev-secret-change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    demo_password: str = "Procure@123"

    # Database. PostgreSQL in Docker/LAN; SQLite is supported for zero-dependency dev.
    database_url: str = "sqlite:///./procure360.db"
    sql_echo: bool = False
    auto_create_tables: bool = True
    seed_demo_data: bool = True

    # SQLite backups (native Windows deployment)
    backup_enabled: bool = True
    backup_interval_seconds: int = 86400
    backup_retention_days: int = 14

    # LAN / CORS
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8080,http://127.0.0.1:8080"
    )
    cors_origin_regex: str = (
        r"^https?://("
        r"localhost|127\.0\.0\.1|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
        r")(:\d{1,5})?$"
    )

    # Domain
    default_currency: str = "LKR"
    bec_alert_days: int = 0
    completion_watchlist_days: int = 45
    bond_watchlist_days: int = 60
    rating_weight_quality: float = 0.30
    rating_weight_schedule: float = 0.30
    rating_weight_compliance: float = 0.25
    rating_weight_safety: float = 0.15
    rating_objective_weight: float = 0.35

    @field_validator("cors_origins")
    @classmethod
    def _strip_origins(cls, value: str) -> str:
        return ",".join(part.strip() for part in value.split(",") if part.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin for origin in self.cors_origins.split(",") if origin]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def subjective_weights(self) -> dict[str, float]:
        total = (
            self.rating_weight_quality
            + self.rating_weight_schedule
            + self.rating_weight_compliance
            + self.rating_weight_safety
        )
        if total <= 0:
            return {"quality": 0.25, "schedule": 0.25, "compliance": 0.25, "safety": 0.25}
        return {
            "quality": self.rating_weight_quality / total,
            "schedule": self.rating_weight_schedule / total,
            "compliance": self.rating_weight_compliance / total,
            "safety": self.rating_weight_safety / total,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
