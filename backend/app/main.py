import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.database import Base, engine
from app.core.errors import AppError
from app.models import Contract, ContractHandoff, Contractor, ContractorRating, EvaluationTeamMember, LookupValue, User, AuditLog, Notification  # noqa: F401
from app.routers import analytics, audit, auth, contracts, contractors, health, masters, notifications, users
from app.services.sqlite_backup import start_backup_thread

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger("procure360")

# The native Windows bundle serves the Vite build from this folder. During
# development the folder is absent, so Vite keeps handling the frontend.
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables ensured (auto_create_tables=%s)", settings.auto_create_tables)
    backup_stop = start_backup_thread()
    try:
        yield
    finally:
        if backup_stop is not None:
            backup_stop.set()


app = FastAPI(
    title="PROCURE360 API",
    description=(
        "LAN procurement register with a three-section sequential handoff workflow, "
        "optimistic locking, field-level audit, analytics and contractor ratings."
    ),
    version=settings.app_version,
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=f"{settings.api_prefix}/redoc",
    openapi_url=f"{settings.api_prefix}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.message,
            "code": exc.code,
            "details": exc.details,
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    errors = []
    for error in exc.errors():
        errors.append(
            {
                "field": ".".join(str(part) for part in error.get("loc", []) if part != "body"),
                "message": error.get("msg", "Invalid value"),
                "type": error.get("type"),
            }
        )
    message = "Some fields are invalid. " + "; ".join(
        f"{error['field']}: {error['message']}" if error["field"] else error["message"] for error in errors[:4]
    )
    return JSONResponse(
        status_code=422,
        content={"detail": message, "code": "validation_error", "details": {"errors": errors}},
    )


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    logger.warning("Database integrity error: %s", exc)
    return JSONResponse(
        status_code=409,
        content={
            "detail": "That change conflicts with an existing record. Reload and try again.",
            "code": "integrity_error",
            "details": None,
        },
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An unexpected server error occurred. Please try again or contact the administrator.",
            "code": "internal_error",
            "details": None,
        },
    )


for api_router in (
    auth.router,
    users.router,
    masters.router,
    contracts.router,
    contractors.router,
    analytics.router,
    audit.router,
    notifications.router,
    health.router,
):
    app.include_router(api_router, prefix=settings.api_prefix)


if (FRONTEND_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


@app.get("/", include_in_schema=False)
def root():
    index = FRONTEND_DIST / "index.html"
    if index.is_file():
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "docs": f"{settings.api_prefix}/docs",
        "status": "running",
    }


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str):
    """Serve static files and fall back to index.html for React Router paths."""
    index = FRONTEND_DIST / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")

    target = (FRONTEND_DIST / full_path).resolve()
    try:
        target.relative_to(FRONTEND_DIST.resolve())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    if target.is_file():
        return FileResponse(target)
    return FileResponse(index, headers={"Cache-Control": "no-cache"})
