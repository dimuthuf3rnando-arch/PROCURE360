from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import UserRole
from app.schemas.common import APIModel


class UserBase(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    role: UserRole
    designation: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    email: EmailStr | None = None
    role: UserRole | None = None
    designation: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserOut(APIModel):
    id: int
    full_name: str
    email: EmailStr
    role: UserRole
    designation: str | None
    phone: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("email", mode="before")
    @classmethod
    def _email_to_str(cls, value):
        return str(value) if value is not None else value


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)
