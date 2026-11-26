from typing import Any


class AppError(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        code: str = "app_error",
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code
        self.details = details


class NotFoundError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(404, message, code="not_found")


class ForbiddenError(AppError):
    def __init__(self, message: str, *, code: str = "forbidden") -> None:
        super().__init__(403, message, code=code)


class ValidationError(AppError):
    def __init__(self, message: str, *, details: Any = None) -> None:
        super().__init__(422, message, code="validation_error", details=details)


class StaleVersionError(AppError):
    def __init__(self, current_version: int | None = None) -> None:
        detail = (
            f"This record was updated by someone else. The current version is {current_version}. "
            "Reload the latest record before saving again."
            if current_version is not None
            else "This record was updated by someone else. Reload the latest record before saving again."
        )
        super().__init__(
            409,
            detail,
            code="stale_version",
            details={"current_version": current_version},
        )
