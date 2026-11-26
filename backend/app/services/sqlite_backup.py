"""Daily online backups for the native Windows SQLite deployment."""

from __future__ import annotations

import logging
import sqlite3
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger("procure360.backup")

_CHECK_INTERVAL_SECONDS = 3600


def _database_path() -> Path | None:
    prefix = "sqlite:///"
    if not settings.database_url.startswith(prefix):
        return None
    raw = settings.database_url[len(prefix) :].split("?", 1)[0]
    if not raw or raw == ":memory:" or raw.startswith("file::memory:"):
        return None
    path = Path(raw)
    if not path.is_absolute():
        path = Path.cwd() / path
    return path.resolve()


def _backup_once(db_path: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    target = backup_dir / f"procure360-{stamp}.db"
    source = sqlite3.connect(str(db_path), timeout=30)
    destination = sqlite3.connect(str(target))
    try:
        source.backup(destination)
    finally:
        destination.close()
        source.close()
    return target


def _latest_backup(backup_dir: Path) -> datetime | None:
    latest: datetime | None = None
    for path in backup_dir.glob("procure360-*.db"):
        try:
            modified = datetime.fromtimestamp(path.stat().st_mtime, UTC)
        except OSError:
            continue
        if latest is None or modified > latest:
            latest = modified
    return latest


def _prune(backup_dir: Path, retention_days: int) -> None:
    cutoff = datetime.now(UTC) - timedelta(days=max(1, retention_days))
    for path in backup_dir.glob("procure360-*.db"):
        try:
            if datetime.fromtimestamp(path.stat().st_mtime, UTC) < cutoff:
                path.unlink()
        except OSError:
            logger.warning("Could not remove old backup %s", path, exc_info=True)


def _run(stop: threading.Event) -> None:
    db_path = _database_path()
    if db_path is None:
        logger.info("SQLite backups disabled: database is not a file.")
        return
    backup_dir = db_path.parent / "backups"
    interval = max(3600, settings.backup_interval_seconds)

    while not stop.is_set():
        try:
            latest = _latest_backup(backup_dir)
            due = latest is None or (datetime.now(UTC) - latest).total_seconds() >= interval
            if due and db_path.exists():
                target = _backup_once(db_path, backup_dir)
                _prune(backup_dir, settings.backup_retention_days)
                logger.info("SQLite backup written to %s", target)
        except Exception:
            logger.exception("SQLite backup failed")
        if stop.wait(_CHECK_INTERVAL_SECONDS):
            break


def start_backup_thread() -> threading.Event | None:
    """Start the backup loop in production; return the stop event."""
    if (
        settings.environment != "production"
        or not settings.is_sqlite
        or not settings.backup_enabled
    ):
        return None
    stop = threading.Event()
    thread = threading.Thread(target=_run, args=(stop,), name="procure360-backup", daemon=True)
    thread.start()
    return stop
