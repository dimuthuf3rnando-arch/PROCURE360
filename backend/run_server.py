"""Start PROCURE360 (API + built web app) on the configured LAN port."""

import os

import uvicorn

from app.core.config import settings


def main() -> None:
    port = int(os.environ.get("PORT") or os.environ.get("APP_PORT") or settings.app_port)
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        proxy_headers=True,
        forwarded_allow_ips="*",
        log_level="info",
    )


if __name__ == "__main__":
    main()
