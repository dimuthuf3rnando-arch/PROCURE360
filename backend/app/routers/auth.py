from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    CurrentUser,
    create_access_token,
    hash_password,
    load_user_by_email,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.common import Message
from app.schemas.user import ChangePasswordRequest, UserOut

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = load_user_by_email(db, payload.email)
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email address or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated. Contact an administrator.",
        )
    token, expires_at = create_access_token(user)
    return TokenResponse(
        access_token=token,
        expires_at=expires_at,
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return UserOut.model_validate(user)


@router.post("/change-password", response_model=Message)
def change_password(
    payload: ChangePasswordRequest,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Your current password is incorrect.")
    db_user = db.get(User, user.id)
    db_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return Message(message="Password updated successfully.")


@router.get("/demo-accounts")
def demo_accounts(db: Session = Depends(get_db)):
    """Convenience endpoint for the local demo login screen (no secrets exposed)."""
    if settings.environment == "production":
        return {"enabled": False, "accounts": []}
    users = db.scalars(
        select(User).where(User.is_active.is_(True)).order_by(User.role, User.full_name)
    ).all()
    return {
        "enabled": True,
        "accounts": [
            {
                "name": user.full_name,
                "email": user.email,
                "role": user.role.value,
                "designation": user.designation,
            }
            for user in users
        ],
    }
