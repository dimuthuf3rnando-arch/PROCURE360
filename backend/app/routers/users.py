from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import NotFoundError, ValidationError
from app.core.security import CurrentUser, hash_password, require_roles
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.common import Message
from app.schemas.user import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["Users"])
AdminUser = Depends(require_roles(UserRole.ADMIN))


@router.get("", response_model=list[UserOut])
def list_users(
    _: User = AdminUser,
    db: Session = Depends(get_db),
    include_inactive: bool = Query(True),
):
    stmt = select(User).order_by(User.role, User.full_name)
    if not include_inactive:
        stmt = stmt.where(User.is_active.is_(True))
    return [UserOut.model_validate(user) for user in db.scalars(stmt).all()]


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    _: User = AdminUser,
    db: Session = Depends(get_db),
):
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise ValidationError("A user with this email address already exists.")
    user = User(
        full_name=payload.full_name.strip(),
        email=email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        designation=payload.designation,
        phone=payload.phone,
        is_active=payload.is_active,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValidationError("A user with this email address already exists.") from exc
    db.refresh(user)
    return UserOut.model_validate(user)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    current: User = AdminUser,
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found.")
    values = payload.model_dump(exclude_unset=True)
    password = values.pop("password", None)
    if "email" in values:
        email = str(values["email"]).lower()
        duplicate = db.scalar(select(User).where(User.email == email, User.id != user_id))
        if duplicate:
            raise ValidationError("A user with this email address already exists.")
        values["email"] = email
    if values.get("is_active") is False and user.id == current.id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    if values.get("role") and user.id == current.id and values["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="You cannot remove your own administrator role.")
    if password:
        user.hashed_password = hash_password(password)
    for field, value in values.items():
        setattr(user, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValidationError("That change conflicts with an existing user.") from exc
    db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/{user_id}", response_model=Message)
def deactivate_user(
    user_id: int,
    current: User = AdminUser,
    db: Session = Depends(get_db),
):
    if user_id == current.id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found.")
    user.is_active = False
    db.commit()
    return Message(message=f"{user.full_name} has been deactivated.")
