import unicodedata

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import NotFoundError, ValidationError
from app.core.security import CurrentUser, require_roles
from app.models.contractor import Contractor
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.common import Message
from app.schemas.contractor import (
    ContractorCreate,
    ContractorDetailOut,
    ContractorDirectoryItem,
    ContractorOut,
    ContractorUpdate,
    RatingCreate,
    RatingOut,
    ScorecardOut,
)
from app.services.contracts import serialize_list_item
from app.services.ratings import (
    build_directory,
    contractor_detail,
    delete_rating,
    upsert_rating,
)

router = APIRouter(prefix="/contractors", tags=["Contractors"])
Editor = Depends(
    require_roles(UserRole.PC_ENGINEER, UserRole.SUPPLY_OFFICER, UserRole.ADMIN)
)
Admin = Depends(require_roles(UserRole.ADMIN))


def _name_key(value: str) -> str:
    return "".join(
        character
        for character in value.lower()
        if character.isalnum() or unicodedata.category(character).startswith("M")
    )


def _duplicate_contractor(
    db: Session, name: str, *, exclude_id: int | None = None
) -> Contractor | None:
    key = _name_key(name)
    if not key:
        return None
    for contractor in db.scalars(select(Contractor)).all():
        if exclude_id is not None and contractor.id == exclude_id:
            continue
        if _name_key(contractor.name) == key:
            return contractor
    return None


def _duplicate_error(contractor: Contractor) -> ValidationError:
    return ValidationError(
        f'A contractor named "{contractor.name}" already exists.',
        details={
            "existing_id": contractor.id,
            "existing_name": contractor.name,
            "inactive": not contractor.is_active,
        },
    )


@router.get("", response_model=list[ContractorDirectoryItem])
def index(
    user: CurrentUser,
    db: Session = Depends(get_db),
    q: str | None = Query(None, max_length=200),
    include_inactive: bool = False,
    sort: str = Query("score", pattern="^(score|name|volume|contracts|on_time)$"),
    direction: str = Query("desc", pattern="^(asc|desc)$"),
):
    items = build_directory(db)
    if not include_inactive:
        items = [item for item in items if item.is_active]
    if q:
        needle = q.strip().lower()
        items = [
            item
            for item in items
            if needle in item.name.lower()
            or needle in (item.registration_no or "").lower()
            or needle in (item.office_region or "").lower()
            or needle in (item.contact_person or "").lower()
        ]
    keys = {
        "score": lambda item: item.composite_score,
        "name": lambda item: item.name.lower(),
        "volume": lambda item: item.total_awarded_lkr,
        "contracts": lambda item: item.contract_count,
        "on_time": lambda item: item.on_time_extended_rate if item.on_time_extended_rate is not None else -1,
    }
    items.sort(key=keys[sort], reverse=direction == "desc")
    return items


@router.post("", response_model=ContractorOut, status_code=201)
def create(
    payload: ContractorCreate,
    _: User = Editor,
    db: Session = Depends(get_db),
):
    contractor = Contractor(**payload.model_dump())
    contractor.name = contractor.name.strip()
    if len(contractor.name) < 2:
        raise ValidationError(
            "Contractor name must be at least 2 characters.",
            details={"field": "name"},
        )
    duplicate = _duplicate_contractor(db, contractor.name)
    if duplicate is not None:
        raise _duplicate_error(duplicate)
    db.add(contractor)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValidationError("A contractor with that name already exists.") from exc
    db.refresh(contractor)
    return ContractorOut.model_validate(contractor)


@router.get("/{contractor_id}", response_model=ContractorDetailOut)
def detail(contractor_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    scorecard, contracts, ratings = contractor_detail(db, contractor_id)
    return ContractorDetailOut(
        scorecard=scorecard,
        contracts=[serialize_list_item(contract, user) for contract in contracts],
        ratings=ratings,
    )


@router.patch("/{contractor_id}", response_model=ContractorOut)
def update(
    contractor_id: int,
    payload: ContractorUpdate,
    _: User = Editor,
    db: Session = Depends(get_db),
):
    contractor = db.get(Contractor, contractor_id)
    if contractor is None:
        raise NotFoundError("Contractor not found.")
    values = payload.model_dump(exclude_unset=True)
    if "name" in values:
        values["name"] = (values["name"] or "").strip()
        if len(values["name"]) < 2:
            raise ValidationError(
                "Contractor name must be at least 2 characters.",
                details={"field": "name"},
            )
        duplicate = _duplicate_contractor(db, values["name"], exclude_id=contractor.id)
        if duplicate is not None:
            raise _duplicate_error(duplicate)
    for field, value in values.items():
        setattr(contractor, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValidationError("A contractor with that name already exists.") from exc
    db.refresh(contractor)
    return ContractorOut.model_validate(contractor)


@router.delete("/{contractor_id}", response_model=Message)
def deactivate(contractor_id: int, _: User = Admin, db: Session = Depends(get_db)):
    contractor = db.get(Contractor, contractor_id)
    if contractor is None:
        raise NotFoundError("Contractor not found.")
    contractor.is_active = False
    db.commit()
    return Message(message=f"{contractor.name} has been deactivated.")


@router.get("/{contractor_id}/scorecard", response_model=ScorecardOut)
def scorecard(contractor_id: int, _: CurrentUser, db: Session = Depends(get_db)):
    scorecard_data, _, _ = contractor_detail(db, contractor_id)
    return scorecard_data


@router.post("/{contractor_id}/ratings", response_model=RatingOut, status_code=201)
def rate(
    contractor_id: int,
    payload: RatingCreate,
    user: User = Editor,
    db: Session = Depends(get_db),
):
    return upsert_rating(db, contractor_id, user, payload)


@router.delete("/{contractor_id}/ratings/{rating_id}", response_model=Message)
def remove_rating(
    contractor_id: int,
    rating_id: int,
    _: User = Admin,
    db: Session = Depends(get_db),
):
    delete_rating(db, contractor_id, rating_id)
    return Message(message="Rating removed.")
