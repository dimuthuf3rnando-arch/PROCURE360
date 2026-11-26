from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.schemas.analytics import PublicStats
from app.services.analytics import public_stats

router = APIRouter(tags=["System"])


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "database": "postgresql" if not settings.is_sqlite else "sqlite",
    }


@router.get("/public/stats", response_model=PublicStats)
def public_stats_endpoint(db: Session = Depends(get_db)):
    return public_stats(db)
