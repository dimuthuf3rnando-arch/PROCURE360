from collections import defaultdict
from datetime import date
from statistics import mean
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import NotFoundError, ValidationError
from app.models.contract import Contract
from app.models.contractor import Contractor, ContractorRating
from app.models.enums import ContractStatus
from app.models.user import User
from app.schemas.contractor import (
    ContractorDirectoryItem,
    ContractorMetrics,
    ContractorOut,
    DimensionScores,
    RatingCreate,
    RatingOut,
    ScorecardOut,
)
from app.services.validators import effective_completion_date


def _percent(success: int, total: int) -> float | None:
    if total <= 0:
        return None
    return round((success / total) * 100, 1)


def _mobilization_score(days: float | None) -> float | None:
    if days is None:
        return None
    if days <= 14:
        return 5.0
    if days <= 30:
        return 4.0
    if days <= 45:
        return 3.0
    if days <= 60:
        return 2.0
    return 1.0


def _rating_label(score: float, rating_count: int, completed: int) -> str:
    if rating_count == 0 and completed == 0:
        return "Unrated"
    if score >= 4.5:
        return "Exceptional"
    if score >= 4.0:
        return "Strong"
    if score >= 3.5:
        return "Reliable"
    if score >= 2.5:
        return "Watch"
    return "Needs attention"


def _rating_out(rating: ContractorRating, user_name: str | None = None) -> RatingOut:
    return RatingOut(
        id=rating.id,
        contractor_id=rating.contractor_id,
        contract_id=rating.contract_id,
        contract_no=rating.contract.contract_no if rating.contract else None,
        project_name=rating.contract.project_name if rating.contract else None,
        quality_score=rating.quality_score,
        schedule_score=rating.schedule_score,
        compliance_score=rating.compliance_score,
        safety_score=rating.safety_score,
        weighted_score=float(rating.weighted_score),
        comments=rating.comments,
        rated_by_id=rating.rated_by_id,
        rated_by_name=user_name or (rating.rated_by.full_name if rating.rated_by else None),
        created_at=rating.created_at,
        updated_at=rating.updated_at,
    )


def build_scorecard(
    contractor: Contractor,
    contracts: list[Contract],
    ratings: list[ContractorRating],
    rating_names: dict[int, str] | None = None,
) -> ScorecardOut:
    completed = [contract for contract in contracts if contract.status == ContractStatus.COMPLETED]
    total_awarded = sum(
        float(contract.awarded_amount_without_vat)
        for contract in contracts
        if contract.awarded_amount_without_vat is not None
    )
    average_awarded = total_awarded / len([c for c in contracts if c.awarded_amount_without_vat]) if any(
        c.awarded_amount_without_vat is not None for c in contracts
    ) else 0

    original_results: list[bool] = []
    extended_results: list[bool] = []
    mobilization_days: list[int] = []
    for contract in completed:
        actual = contract.completed_at.date() if contract.completed_at else None
        if actual and contract.original_intended_completion_date:
            original_results.append(actual <= contract.original_intended_completion_date)
        extended_target = effective_completion_date(contract)
        if actual and extended_target:
            extended_results.append(actual <= extended_target)
        if contract.awarded_on and contract.physical_construction_commenced_on:
            mobilization_days.append(
                (contract.physical_construction_commenced_on - contract.awarded_on).days
            )

    on_time_original_rate = _percent(sum(original_results), len(original_results))
    on_time_extended_rate = _percent(sum(extended_results), len(extended_results))
    average_mobilization = round(mean(mobilization_days), 1) if mobilization_days else None
    mobile_score = _mobilization_score(average_mobilization)
    schedule_original_score = (
        round((on_time_original_rate / 100) * 5, 2) if on_time_original_rate is not None else None
    )
    schedule_extended_score = (
        round((on_time_extended_rate / 100) * 5, 2) if on_time_extended_rate is not None else None
    )

    objective_parts = [
        score
        for score in (schedule_original_score, schedule_extended_score, mobile_score)
        if score is not None
    ]
    objective_score = round(mean(objective_parts), 2) if objective_parts else None

    weights = settings.subjective_weights
    rating_source = [rating for rating in ratings if rating.contract_id is not None]
    if not rating_source:
        rating_source = ratings
    dimension_scores = DimensionScores(
        quality=round(mean([r.quality_score for r in rating_source]), 2) if rating_source else None,
        schedule=round(mean([r.schedule_score for r in rating_source]), 2) if rating_source else None,
        compliance=round(mean([r.compliance_score for r in rating_source]), 2) if rating_source else None,
        safety=round(mean([r.safety_score for r in rating_source]), 2) if rating_source else None,
    )
    subjective_score = None
    if rating_source:
        subjective_score = round(
            mean([r.quality_score for r in rating_source]) * weights["quality"]
            + mean([r.schedule_score for r in rating_source]) * weights["schedule"]
            + mean([r.compliance_score for r in rating_source]) * weights["compliance"]
            + mean([r.safety_score for r in rating_source]) * weights["safety"],
            2,
        )

    objective_weight = settings.rating_objective_weight
    if subjective_score is not None and objective_score is not None:
        composite = round(
            subjective_score * (1 - objective_weight) + objective_score * objective_weight, 2
        )
    elif subjective_score is not None:
        composite = subjective_score
    elif objective_score is not None:
        composite = objective_score
    else:
        composite = 0.0

    recent_ratings = sorted(ratings, key=lambda r: r.created_at, reverse=True)[:5]
    rating_names = rating_names or {}

    metrics = ContractorMetrics(
        total_contracts=len(contracts),
        completed_contracts=len(completed),
        active_contracts=len([c for c in contracts if c.status != ContractStatus.COMPLETED]),
        total_awarded_lkr=round(total_awarded, 2),
        average_awarded_lkr=round(average_awarded, 2),
        on_time_original_rate=on_time_original_rate,
        on_time_extended_rate=on_time_extended_rate,
        average_mobilization_days=average_mobilization,
        mobilization_score=mobile_score,
        schedule_score_original=schedule_original_score,
        schedule_score_extended=schedule_extended_score,
    )

    return ScorecardOut(
        contractor=ContractorOut.model_validate(contractor),
        composite_score=composite,
        subjective_score=subjective_score,
        objective_score=objective_score,
        rating_label=_rating_label(composite, len(rating_source), len(completed)),
        rating_count=len(rating_source),
        dimensions=dimension_scores,
        metrics=metrics,
        recent_ratings=[
            _rating_out(rating, rating_names.get(rating.rated_by_id or 0)) for rating in recent_ratings
        ],
    )


def _directory_item(scorecard: ScorecardOut) -> ContractorDirectoryItem:
    contractor = scorecard.contractor
    metrics = scorecard.metrics
    return ContractorDirectoryItem(
        id=contractor.id,
        name=contractor.name,
        registration_no=contractor.registration_no,
        contact_person=contractor.contact_person,
        phone=contractor.phone,
        email=contractor.email,
        office_region=contractor.office_region,
        is_active=contractor.is_active,
        composite_score=scorecard.composite_score,
        rating_label=scorecard.rating_label,
        rating_count=scorecard.rating_count,
        contract_count=metrics.total_contracts,
        completed_count=metrics.completed_contracts,
        total_awarded_lkr=metrics.total_awarded_lkr,
        on_time_extended_rate=metrics.on_time_extended_rate,
        average_mobilization_days=metrics.average_mobilization_days,
    )


def build_directory(db: Session, contractor_ids: Iterable[int] | None = None) -> list[ContractorDirectoryItem]:
    contractor_stmt = select(Contractor).order_by(Contractor.name)
    if contractor_ids is not None:
        contractor_stmt = contractor_stmt.where(Contractor.id.in_(list(contractor_ids)))
    contractors = list(db.scalars(contractor_stmt).all())
    ids = [contractor.id for contractor in contractors]
    if not ids:
        return []

    contracts_by_contractor: dict[int, list[Contract]] = defaultdict(list)
    for contract in db.scalars(select(Contract).where(Contract.contractor_id.in_(ids))).all():
        contracts_by_contractor[contract.contractor_id].append(contract)

    ratings_by_contractor: dict[int, list[ContractorRating]] = defaultdict(list)
    rating_names: dict[int, str] = {}
    rating_rows = db.execute(
        select(ContractorRating, User.full_name)
        .outerjoin(User, ContractorRating.rated_by_id == User.id)
        .where(ContractorRating.contractor_id.in_(ids))
    ).all()
    for rating, user_name in rating_rows:
        ratings_by_contractor[rating.contractor_id].append(rating)
        if rating.rated_by_id and user_name:
            rating_names[rating.rated_by_id] = user_name

    items: list[ContractorDirectoryItem] = []
    for contractor in contractors:
        scorecard = build_scorecard(
            contractor,
            contracts_by_contractor[contractor.id],
            ratings_by_contractor[contractor.id],
            rating_names,
        )
        items.append(_directory_item(scorecard))
    return sorted(items, key=lambda item: (-item.composite_score, item.name))


def contractor_detail(db: Session, contractor_id: int) -> tuple[ScorecardOut, list[Contract], list[RatingOut]]:
    contractor = db.get(Contractor, contractor_id)
    if contractor is None:
        raise NotFoundError(f"Contractor #{contractor_id} was not found.")
    contracts = list(
        db.scalars(
            select(Contract)
            .where(Contract.contractor_id == contractor_id)
            .order_by(Contract.updated_at.desc())
        ).all()
    )
    rows = db.execute(
        select(ContractorRating, User.full_name, Contract)
        .outerjoin(User, ContractorRating.rated_by_id == User.id)
        .outerjoin(Contract, ContractorRating.contract_id == Contract.id)
        .where(ContractorRating.contractor_id == contractor_id)
        .order_by(ContractorRating.created_at.desc())
    ).all()
    ratings = [row[0] for row in rows]
    rating_names = {row[0].rated_by_id: row[1] for row in rows if row[0].rated_by_id and row[1]}
    # Attach contract data for response mapping.
    for rating, _, contract in rows:
        rating.contract = contract
    scorecard = build_scorecard(contractor, contracts, ratings, rating_names)
    rating_out = [
        _rating_out(rating, rating_names.get(rating.rated_by_id or 0))
        for rating, _, _ in rows
    ]
    return scorecard, contracts, rating_out


def upsert_rating(
    db: Session, contractor_id: int, user: User, payload: RatingCreate
) -> RatingOut:
    contractor = db.get(Contractor, contractor_id)
    if contractor is None:
        raise NotFoundError(f"Contractor #{contractor_id} was not found.")

    contract: Contract | None = None
    if payload.contract_id is not None:
        contract = db.get(Contract, payload.contract_id)
        if contract is None:
            raise ValidationError("The selected contract does not exist.", details={"field": "contract_id"})
        if contract.contractor_id != contractor_id:
            raise ValidationError("The selected contract is not linked to this contractor.")

    existing = None
    if payload.contract_id is not None:
        existing = db.scalar(
            select(ContractorRating).where(
                ContractorRating.contractor_id == contractor_id,
                ContractorRating.contract_id == payload.contract_id,
            )
        )
    if existing:
        existing.quality_score = payload.quality_score
        existing.schedule_score = payload.schedule_score
        existing.compliance_score = payload.compliance_score
        existing.safety_score = payload.safety_score
        existing.comments = payload.comments
        existing.rated_by_id = user.id
        rating = existing
    else:
        rating = ContractorRating(
            contractor_id=contractor_id,
            contract_id=payload.contract_id,
            quality_score=payload.quality_score,
            schedule_score=payload.schedule_score,
            compliance_score=payload.compliance_score,
            safety_score=payload.safety_score,
            comments=payload.comments,
            rated_by_id=user.id,
        )
        db.add(rating)
    db.commit()
    db.refresh(rating)
    rating.contract = contract
    rating.rated_by = user
    return _rating_out(rating, user.full_name)


def delete_rating(db: Session, contractor_id: int, rating_id: int) -> None:
    rating = db.get(ContractorRating, rating_id)
    if rating is None or rating.contractor_id != contractor_id:
        raise NotFoundError("Rating was not found for this contractor.")
    db.delete(rating)
    db.commit()
