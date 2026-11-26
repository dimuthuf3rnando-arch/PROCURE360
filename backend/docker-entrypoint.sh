#!/bin/sh
set -eu

echo "PROCURE360 · waiting for the database…"
python - <<'PY'
import time
import psycopg

dsn = __import__("os").environ["DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://")
last_error = None
for attempt in range(1, 61):
    try:
        with psycopg.connect(dsn, connect_timeout=3) as connection:
            connection.execute("SELECT 1")
        print(f"Database reachable (attempt {attempt}).")
        break
    except Exception as exc:  # pragma: no cover - container bootstrap
        last_error = exc
        time.sleep(2)
else:
    raise SystemExit(f"Database did not become ready: {last_error}")
PY

echo "PROCURE360 · applying migrations…"
alembic upgrade head

if [ "${SEED_DEMO_DATA:-true}" = "true" ] || [ ! -f /app/.masters-seeded ]; then
  echo "PROCURE360 · seeding master data (idempotent)…"
  python -m app.seed.seed_masters || echo "Seed skipped or already present."
  touch /app/.masters-seeded
fi

echo "PROCURE360 · starting API on :8000"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
