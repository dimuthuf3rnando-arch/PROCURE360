"""Create the first administrator on an empty PROCURE360 install.

Run after migrations and seed:
    python -m app.seed.bootstrap_admin --email admin@example.com --password '<strong-password>'

Or pipe the password on standard input so it never appears in the command line:
    echo '<strong-password>' | python -m app.seed.bootstrap_admin \
        --email admin@example.com --password-stdin

This is intentionally an offline command: with an empty register there is no
account that could use the authenticated /api/users endpoint yet.
"""
import argparse
import sys

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.enums import UserRole
from app.models.user import User

_EMAIL_ADAPTER = TypeAdapter(EmailStr)


def normalize_email(value: str) -> str:
    """Validate and normalize an email address before it reaches the database."""
    try:
        return str(_EMAIL_ADAPTER.validate_python(value.strip())).lower()
    except ValidationError as exc:
        raise ValueError(
            "Enter a valid email address with a normal domain (avoid .local/.test)."
        ) from exc


def bootstrap_admin(email: str, password: str, full_name: str) -> bool:
    normalized = normalize_email(email)
    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.email == normalized))
        if existing is not None:
            print(f"An account already exists for {normalized}; no change made.")
            return False
        db.add(
            User(
                email=normalized,
                full_name=full_name.strip() or "System Administrator",
                hashed_password=hash_password(password),
                role=UserRole.ADMIN,
                designation="System Administrator",
                is_active=True,
            )
        )
        db.commit()
        print(f"Administrator created: {normalized}")
        return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the first PROCURE360 administrator.")
    parser.add_argument("--email", required=True, help="Administrator email address")
    parser.add_argument("--password", help="Administrator password")
    parser.add_argument(
        "--password-stdin",
        action="store_true",
        help="Read the administrator password from standard input instead of --password",
    )
    parser.add_argument("--name", default="System Administrator", help="Display name")
    args = parser.parse_args()

    if bool(args.password) == bool(args.password_stdin):
        parser.error("Provide exactly one of --password or --password-stdin.")

    password = args.password
    if args.password_stdin:
        password = sys.stdin.readline().rstrip("\r\n")
    if not password:
        parser.error("The administrator password is empty.")
    if len(password) < 8:
        parser.error("Use a password of at least 8 characters.")

    try:
        bootstrap_admin(args.email, password, args.name)
    except ValueError as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()
