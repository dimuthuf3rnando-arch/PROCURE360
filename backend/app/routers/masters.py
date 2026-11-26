from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import ForbiddenError, NotFoundError, ValidationError
from app.core.security import CurrentUser, require_roles
from app.models.enums import LOOKUP_LABELS, LookupType, UserRole
from app.models.master import EvaluationTeamMember, LookupValue
from app.models.user import User
from app.schemas.common import Message
from app.schemas.master import (
    EvaluationTeamMemberCreate,
    EvaluationTeamMemberOut,
    EvaluationTeamMemberUpdate,
    LookupCreate,
    LookupGroupsOut,
    LookupUpdate,
    LookupValueOut,
    MastersBundle,
)

router = APIRouter(prefix="/masters", tags=["Masters"])
AdminUser = Depends(require_roles(UserRole.ADMIN))


def _groups(db: Session, include_inactive: bool = False) -> LookupGroupsOut:
    stmt = select(LookupValue).order_by(LookupValue.list_type, LookupValue.sort_order, LookupValue.value)
    if not include_inactive:
        stmt = stmt.where(LookupValue.is_active.is_(True))
    grouped: dict[str, list[str]] = {lookup.value: [] for lookup in LookupType}
    for record in db.scalars(stmt).all():
        if record.list_type in grouped:
            grouped[record.list_type].append(record.value)
    return LookupGroupsOut(**grouped)


@router.get("/lookups", response_model=LookupGroupsOut)
def get_lookups(_: CurrentUser, db: Session = Depends(get_db)):
    return _groups(db)


@router.get("/evaluation-team", response_model=list[EvaluationTeamMemberOut])
def evaluation_team(
    _: CurrentUser,
    db: Session = Depends(get_db),
    include_inactive: bool = Query(False),
):
    stmt = select(EvaluationTeamMember).order_by(
        EvaluationTeamMember.display_order, EvaluationTeamMember.name
    )
    if not include_inactive:
        stmt = stmt.where(EvaluationTeamMember.is_active.is_(True))
    return [EvaluationTeamMemberOut.model_validate(member) for member in db.scalars(stmt).all()]


@router.get("/bundle", response_model=MastersBundle)
def bundle(_: CurrentUser, db: Session = Depends(get_db)):
    members = db.scalars(
        select(EvaluationTeamMember)
        .where(EvaluationTeamMember.is_active.is_(True))
        .order_by(EvaluationTeamMember.display_order, EvaluationTeamMember.name)
    ).all()
    records = db.scalars(
        select(LookupValue).order_by(LookupValue.list_type, LookupValue.sort_order, LookupValue.value)
    ).all()
    return MastersBundle(
        lookups=_groups(db),
        evaluation_team=[EvaluationTeamMemberOut.model_validate(member) for member in members],
        lookup_records=[LookupValueOut.model_validate(record) for record in records],
        generated_at=datetime.now(UTC),
    )


# ── Admin: evaluation team ──────────────────────────────────────────────────
@router.get("/evaluation-team/all", response_model=list[EvaluationTeamMemberOut])
def evaluation_team_all(_: User = AdminUser, db: Session = Depends(get_db)):
    members = db.scalars(
        select(EvaluationTeamMember).order_by(
            EvaluationTeamMember.display_order, EvaluationTeamMember.name
        )
    ).all()
    return [EvaluationTeamMemberOut.model_validate(member) for member in members]


@router.post("/evaluation-team", response_model=EvaluationTeamMemberOut, status_code=201)
def create_team_member(
    payload: EvaluationTeamMemberCreate,
    _: User = AdminUser,
    db: Session = Depends(get_db),
):
    member = EvaluationTeamMember(
        name=" ".join(payload.name.split()),
        designation=" ".join(payload.designation.split()) if payload.designation else None,
        display_order=payload.display_order,
        is_active=payload.is_active,
    )
    db.add(member)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValidationError("This staff member already exists in the evaluation team.") from exc
    db.refresh(member)
    return EvaluationTeamMemberOut.model_validate(member)


@router.patch("/evaluation-team/{member_id}", response_model=EvaluationTeamMemberOut)
def update_team_member(
    member_id: int,
    payload: EvaluationTeamMemberUpdate,
    _: User = AdminUser,
    db: Session = Depends(get_db),
):
    member = db.get(EvaluationTeamMember, member_id)
    if member is None:
        raise NotFoundError("Evaluation team member not found.")
    values = payload.model_dump(exclude_unset=True)
    if "name" in values and values["name"]:
        values["name"] = " ".join(values["name"].split())
    if "designation" in values and values["designation"]:
        values["designation"] = " ".join(values["designation"].split())
    for field, value in values.items():
        setattr(member, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValidationError("This staff member already exists in the evaluation team.") from exc
    db.refresh(member)
    return EvaluationTeamMemberOut.model_validate(member)


@router.delete("/evaluation-team/{member_id}", response_model=Message)
def deactivate_team_member(
    member_id: int,
    _: User = AdminUser,
    db: Session = Depends(get_db),
):
    member = db.get(EvaluationTeamMember, member_id)
    if member is None:
        raise NotFoundError("Evaluation team member not found.")
    member.is_active = False
    db.commit()
    return Message(message=f"{member.name} has been deactivated.")


# ── Admin: dropdown lookup values ────────────────────────────────────────────
@router.get("/lookup-records", response_model=list[LookupValueOut])
def lookup_records(_: User = AdminUser, db: Session = Depends(get_db)):
    records = db.scalars(
        select(LookupValue).order_by(LookupValue.list_type, LookupValue.sort_order, LookupValue.value)
    ).all()
    return [LookupValueOut.model_validate(record) for record in records]


@router.post("/lookups", response_model=LookupValueOut, status_code=201)
def create_lookup(
    payload: LookupCreate,
    _: User = AdminUser,
    db: Session = Depends(get_db),
):
    duplicate = db.scalar(
        select(LookupValue).where(
            LookupValue.list_type == payload.list_type.value,
            LookupValue.value == payload.value.strip(),
        )
    )
    if duplicate:
        raise ValidationError("That option already exists in this dropdown.")
    record = LookupValue(
        list_type=payload.list_type.value,
        value=payload.value.strip(),
        sort_order=payload.sort_order,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return LookupValueOut.model_validate(record)


@router.patch("/lookup-records/{record_id}", response_model=LookupValueOut)
def update_lookup(
    record_id: int,
    payload: LookupUpdate,
    _: User = AdminUser,
    db: Session = Depends(get_db),
):
    record = db.get(LookupValue, record_id)
    if record is None:
        raise NotFoundError("Lookup value not found.")
    values = payload.model_dump(exclude_unset=True)
    for field, value in values.items():
        setattr(record, field, value.strip() if isinstance(value, str) else value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValidationError("That option already exists in this dropdown.") from exc
    db.refresh(record)
    return LookupValueOut.model_validate(record)


@router.delete("/lookup-records/{record_id}", response_model=Message)
def deactivate_lookup(
    record_id: int,
    _: User = AdminUser,
    db: Session = Depends(get_db),
):
    record = db.get(LookupValue, record_id)
    if record is None:
        raise NotFoundError("Lookup value not found.")
    record.is_active = False
    db.commit()
    return Message(message=f"'{record.value}' deactivated.")


@router.get("/lookup-types")
def lookup_types(_: CurrentUser):
    return [
        {"value": lookup.value, "label": LOOKUP_LABELS[lookup]}
        for lookup in LookupType
    ]
