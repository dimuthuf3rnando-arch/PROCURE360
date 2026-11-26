from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from statistics import mean

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models.audit import ContractHandoff
from app.models.contract import Contract
from app.models.contractor import Contractor
from app.models.enums import ContractStatus, HandoffAction, UserRole
from app.models.user import User
from app.schemas.analytics import (
    ActivityItem,
    AlertItem,
    AwardTrendItem,
    BreakdownItem,
    CycleTimeItem,
    DashboardOut,
    DashboardTotals,
    MilestoneDuration,
    MyWorkItem,
    MyWorkOut,
    QueueBucket,
)
from app.services.contract_fields import STATUS_LABELS
from app.services.ratings import build_directory
from app.services.validators import effective_completion_date


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]


def _month_key(value: date) -> str:
    return f"{value.year:04d}-{value.month:02d}"


def _month_label(key: str) -> str:
    year, month = key.split("-")
    return f"{MONTHS[int(month) - 1]} {year[2:]}"


def _status_label(value: str) -> str:
    try:
        return STATUS_LABELS[ContractStatus(value)]
    except ValueError:
        return value.replace("_", " ").title()


def _breakdown(
    contracts: list[Contract], field: str, label_for=None
) -> list[BreakdownItem]:
    totals: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "count": 0})
    for contract in contracts:
        amount = float(contract.awarded_amount_without_vat or 0)
        if amount <= 0:
            continue
        key = getattr(contract, field) or "Unspecified"
        totals[key]["total"] += amount
        totals[key]["count"] += 1
    items = [
        BreakdownItem(
            key=key,
            label=(label_for(key) if label_for else key),
            total_lkr=round(value["total"], 2),
            count=value["count"],
        )
        for key, value in totals.items()
    ]
    return sorted(items, key=lambda item: item.total_lkr, reverse=True)


def _duration_days(start: date | None, end: date | None) -> int | None:
    if not start or not end or end < start:
        return None
    return (end - start).days


def compute_milestones(contracts: list[Contract]) -> list[MilestoneDuration]:
    definitions = [
        ("request_to_tender", "Request → Tender notice", "request_receiving_date", "tender_notice_sending_date"),
        ("tender_to_closing", "Tender notice → Bid closing", "tender_notice_sending_date", "bid_closing_date"),
        ("closing_to_award", "Bid closing → Award", "bid_closing_date", "awarded_on"),
        ("award_to_agreement", "Award → Agreement signed", "awarded_on", "agreement_signed_date"),
        ("award_to_start", "Award → Construction start", "awarded_on", "physical_construction_commenced_on"),
        (
            "start_to_completion",
            "Construction start → Intended completion",
            "physical_construction_commenced_on",
            "original_intended_completion_date",
        ),
    ]
    output: list[MilestoneDuration] = []
    for key, label, start_field, end_field in definitions:
        durations = []
        for contract in contracts:
            value = _duration_days(getattr(contract, start_field), getattr(contract, end_field))
            if value is not None:
                durations.append(value)
        if durations:
            output.append(
                MilestoneDuration(
                    key=key,
                    label=label,
                    avg_days=round(mean(durations), 1),
                    count=len(durations),
                )
            )
    return output


def compute_stage_cycles(
    contracts: list[Contract], handoffs_by_contract: dict[int, list[ContractHandoff]]
) -> list[CycleTimeItem]:
    samples: dict[str, list[float]] = defaultdict(list)
    now = datetime.now(UTC)
    for contract in contracts:
        handoffs = sorted(
            handoffs_by_contract.get(contract.id, []),
            key=lambda handoff: (_aware(handoff.created_at) or now),
        )
        if not handoffs:
            continue
        last = handoffs[-1]
        for index, handoff in enumerate(handoffs[1:], start=1):
            previous = handoffs[index - 1]
            stage = previous.to_status
            start = _aware(previous.created_at)
            end = _aware(handoff.created_at)
            if start and end and end >= start:
                samples[stage].append((end - start).total_seconds() / 86400)
        # Open time in the current stage.
        start = _aware(last.created_at)
        if start and contract.status != ContractStatus.COMPLETED:
            samples[contract.status.value].append(max(0.0, (now - start).total_seconds() / 86400))

    order = [
        ContractStatus.DRAFT_PC_MANAGER.value,
        ContractStatus.WITH_QS.value,
        ContractStatus.WITH_PC_ENGINEER.value,
        ContractStatus.WITH_SUPPLY_OFFICER.value,
        ContractStatus.RETURNED_FOR_CORRECTION.value,
        ContractStatus.COMPLETED.value,
    ]
    output = []
    for status in order:
        values = samples.get(status)
        if values:
            output.append(
                CycleTimeItem(
                    key=status,
                    label=_status_label(status),
                    avg_days=round(mean(values), 1),
                    count=len(values),
                )
            )
    return output


def get_dashboard(db: Session) -> DashboardOut:
    today = date.today()
    now = datetime.now(UTC)
    contracts = list(
        db.scalars(select(Contract).options(selectinload(Contract.contractor))).all()
    )
    handoff_rows = db.execute(
        select(ContractHandoff, User.full_name)
        .outerjoin(User, ContractHandoff.acted_by_id == User.id)
        .order_by(ContractHandoff.created_at.desc())
    ).all()
    handoffs_by_contract: dict[int, list[ContractHandoff]] = defaultdict(list)
    for handoff, _ in handoff_rows:
        handoffs_by_contract[handoff.contract_id].append(handoff)
    for values in handoffs_by_contract.values():
        values.sort(key=lambda handoff: _aware(handoff.created_at) or now)

    active = [contract for contract in contracts if contract.status != ContractStatus.COMPLETED]
    completed = [contract for contract in contracts if contract.status == ContractStatus.COMPLETED]
    awarded_values = [
        float(contract.awarded_amount_without_vat)
        for contract in contracts
        if contract.awarded_amount_without_vat is not None
    ]
    total_awarded = round(sum(awarded_values), 2)
    average_awarded = round(mean(awarded_values), 2) if awarded_values else 0.0

    bec_overdue_contracts = [
        contract
        for contract in active
        if contract.bec_due_date
        and not contract.bec_received_date
        and contract.bec_due_date < today
    ]
    due_soon_contracts = [
        contract
        for contract in active
        if effective_completion_date(contract)
        and 0 <= (effective_completion_date(contract) - today).days <= settings.completion_watchlist_days
    ]
    expiring_bonds = [
        contract
        for contract in active
        if contract.p_bond_expiry_date
        and 0 <= (contract.p_bond_expiry_date - today).days <= settings.bond_watchlist_days
    ]

    on_time_results: list[bool] = []
    for contract in completed:
        actual = contract.completed_at.date() if contract.completed_at else None
        target = effective_completion_date(contract)
        if actual and target:
            on_time_results.append(actual <= target)

    # Stage queue age is measured from the latest handoff.
    queue_contracts: dict[str, list[Contract]] = defaultdict(list)
    for contract in active:
        queue_contracts[contract.status.value].append(contract)

    queues: list[QueueBucket] = []
    for status in [
        ContractStatus.DRAFT_PC_MANAGER,
        ContractStatus.WITH_QS,
        ContractStatus.WITH_PC_ENGINEER,
        ContractStatus.WITH_SUPPLY_OFFICER,
        ContractStatus.RETURNED_FOR_CORRECTION,
    ]:
        bucket = queue_contracts.get(status.value, [])
        ages = []
        for contract in bucket:
            stage_handoffs = handoffs_by_contract.get(contract.id, [])
            start = (
                _aware(stage_handoffs[-1].created_at)
                if stage_handoffs
                else _aware(contract.created_at)
            )
            if start:
                ages.append(max(0.0, (now - start).total_seconds() / 86400))
        roles = {contract.current_owner_role.value for contract in bucket}
        queues.append(
            QueueBucket(
                status=status.value,
                label=STATUS_LABELS[status],
                owner_role=roles.pop() if len(roles) == 1 else ("MIXED" if roles else ""),
                count=len(bucket),
                avg_age_days=round(mean(ages), 1) if ages else None,
                oldest_age_days=round(max(ages), 1) if ages else None,
            )
        )

    # Award trend (last 12 months)
    trend_keys = []
    cursor = today.replace(day=1)
    for _ in range(12):
        trend_keys.append(_month_key(cursor))
        if cursor.month == 1:
            cursor = cursor.replace(year=cursor.year - 1, month=12)
        else:
            cursor = cursor.replace(month=cursor.month - 1)
    trend_keys.reverse()
    trend_totals = {key: {"total": 0.0, "count": 0} for key in trend_keys}
    for contract in contracts:
        if not contract.awarded_on or contract.awarded_amount_without_vat is None:
            continue
        key = _month_key(contract.awarded_on)
        if key in trend_totals:
            trend_totals[key]["total"] += float(contract.awarded_amount_without_vat)
            trend_totals[key]["count"] += 1
    award_trend = [
        AwardTrendItem(
            month=key,
            label=_month_label(key),
            total_lkr=round(trend_totals[key]["total"], 2),
            count=trend_totals[key]["count"],
        )
        for key in trend_keys
    ]

    bec_alerts = sorted(
        [
            AlertItem(
                contract_id=contract.id,
                contract_no=contract.contract_no,
                project_name=contract.project_name,
                contractor_name=contract.contractor.name if contract.contractor else None,
                status=contract.status.value,
                stage_label=_status_label(contract.status.value),
                date=contract.bec_due_date,
                days_delta=(contract.bec_due_date - today).days if contract.bec_due_date else None,
                date_label="BEC due",
                amount_lkr=float(contract.awarded_amount_without_vat)
                if contract.awarded_amount_without_vat is not None
                else None,
                severity="error",
            )
            for contract in bec_overdue_contracts
        ],
        key=lambda item: item.date or today,
    )

    completion_alerts = []
    for contract in active:
        completion = effective_completion_date(contract)
        if not completion:
            continue
        days = (completion - today).days
        if days > settings.completion_watchlist_days:
            continue
        completion_alerts.append(
            AlertItem(
                contract_id=contract.id,
                contract_no=contract.contract_no,
                project_name=contract.project_name,
                contractor_name=contract.contractor.name if contract.contractor else None,
                status=contract.status.value,
                stage_label=_status_label(contract.status.value),
                date=completion,
                days_delta=days,
                date_label="Effective completion",
                amount_lkr=float(contract.awarded_amount_without_vat)
                if contract.awarded_amount_without_vat is not None
                else None,
                severity="error" if days < 0 else "warning",
            )
        )
    completion_alerts.sort(key=lambda item: item.date or today)

    bond_alerts = []
    for contract in active:
        expiry = contract.p_bond_expiry_date
        if not expiry:
            continue
        days = (expiry - today).days
        if days > settings.bond_watchlist_days:
            continue
        bond_alerts.append(
            AlertItem(
                contract_id=contract.id,
                contract_no=contract.contract_no,
                project_name=contract.project_name,
                contractor_name=contract.contractor.name if contract.contractor else None,
                status=contract.status.value,
                stage_label=_status_label(contract.status.value),
                date=expiry,
                days_delta=days,
                date_label="Performance bond expiry",
                amount_lkr=float(contract.p_bond_amount_lkr)
                if contract.p_bond_amount_lkr is not None
                else None,
                severity="error" if days < 0 else "warning",
            )
        )
    bond_alerts.sort(key=lambda item: item.date or today)

    activity = []
    for handoff, acted_by_name in handoff_rows[:10]:
        contract = next((c for c in contracts if c.id == handoff.contract_id), None)
        activity.append(
            ActivityItem(
                id=handoff.id,
                contract_id=handoff.contract_id,
                contract_no=contract.contract_no if contract else None,
                project_name=contract.project_name if contract else None,
                action=handoff.action,
                from_role=handoff.from_role,
                to_role=handoff.to_role,
                acted_by_name=acted_by_name,
                reason=handoff.reason,
                created_at=_aware(handoff.created_at) or now,
            )
        )

    completed_durations = [
        (contract.completed_at - contract.created_at).total_seconds() / 86400
        for contract in completed
        if contract.completed_at and contract.created_at
    ]

    totals = DashboardTotals(
        total_contracts=len(contracts),
        active_contracts=len(active),
        completed_contracts=len(completed),
        total_awarded_lkr=total_awarded,
        average_awarded_lkr=average_awarded,
        awaiting_action=len(active),
        overdue_bec=len(bec_overdue_contracts),
        due_soon=len(due_soon_contracts),
        expiring_bonds=len(expiring_bonds),
        completion_rate=round((len(completed) / len(contracts)) * 100, 1) if contracts else 0.0,
        avg_cycle_days=round(mean(completed_durations), 1) if completed_durations else None,
        on_time_rate=round((sum(on_time_results) / len(on_time_results)) * 100, 1)
        if on_time_results
        else None,
    )

    financials = {
        "office_region": _breakdown(contracts, "office_region"),
        "category": _breakdown(contracts, "category"),
        "procurement_method": _breakdown(contracts, "procurement_method"),
        "funds": _breakdown(contracts, "funds"),
    }

    directory = build_directory(db)
    contractor_lookup = {item.id: item for item in directory}

    return DashboardOut(
        generated_at=now,
        totals=totals,
        queues=queues,
        financials=financials,
        cycle_times=compute_stage_cycles(contracts, handoffs_by_contract),
        milestone_durations=compute_milestones(contracts),
        award_trend=award_trend,
        alerts={
            "bec_overdue": bec_alerts[:20],
            "upcoming_completion": completion_alerts[:20],
            "bond_expiry": bond_alerts[:20],
        },
        recent_activity=activity,
        top_contractors=directory[:5],
    )


def public_stats(db: Session) -> dict:
    total = db.query(Contract).count()
    completed = db.query(Contract).filter(Contract.status == ContractStatus.COMPLETED).count()
    awarded = db.query(Contract).with_entities(Contract.awarded_amount_without_vat).all()
    total_awarded = sum(float(value[0]) for value in awarded if value[0] is not None)
    contractors = db.query(Contractor).count()
    return {
        "total_contracts": total,
        "total_awarded_lkr": round(total_awarded, 2),
        "completed_contracts": completed,
        "contractors": contractors,
    }


def _my_work_item(contract: Contract, handoff: ContractHandoff | None = None) -> MyWorkItem:
    status = contract.status.value if isinstance(contract.status, ContractStatus) else str(contract.status)
    owner = contract.current_owner_role
    amount = getattr(contract, "awarded_amount_without_vat", None)
    return MyWorkItem(
        contract_id=contract.id,
        contract_no=contract.contract_no,
        project_name=contract.project_name,
        status=status,
        status_label=STATUS_LABELS.get(contract.status, status.replace("_", " ").title()),
        owner_role=owner.value if owner else None,
        amount_lkr=float(amount) if amount is not None else None,
        updated_at=contract.updated_at,
        action=handoff.action if handoff else None,
        reason=handoff.reason if handoff else None,
        to_role=handoff.to_role if handoff else None,
    )


def get_my_work(db: Session, user: User) -> MyWorkOut:
    """Contracts this user is currently entering plus their latest handoffs."""
    # "Received data": records currently routed to this user's section.
    if user.role in (UserRole.PC_MANAGER, UserRole.QS, UserRole.PC_ENGINEER, UserRole.SUPPLY_OFFICER):
        received_conditions = [Contract.current_owner_role == user.role]
    else:
        # Administrators and viewers oversee the whole register.
        received_conditions = []
    received_query = select(Contract).where(Contract.status != ContractStatus.COMPLETED)
    if received_conditions:
        received_query = received_query.where(or_(*received_conditions))
    received_query = received_query.order_by(Contract.updated_at.desc()).limit(20)
    received = db.scalars(received_query).all()

    cutoff = datetime.now(UTC) - timedelta(days=90)
    recent_rows = db.execute(
        select(ContractHandoff, Contract)
        .join(Contract, ContractHandoff.contract_id == Contract.id)
        .where(
            ContractHandoff.acted_by_id == user.id,
            ContractHandoff.action.in_(
                [
                    HandoffAction.FORWARD.value,
                    HandoffAction.RETURN_TO_PREVIOUS.value,
                    HandoffAction.COMPLETE.value,
                    HandoffAction.ADMIN_OVERRIDE.value,
                ]
            ),
            ContractHandoff.created_at >= cutoff,
        )
        .order_by(ContractHandoff.created_at.desc())
        .limit(15)
    ).all()

    return MyWorkOut(
        ongoing=[_my_work_item(contract) for contract in received],
        recent=[_my_work_item(contract, handoff) for handoff, contract in recent_rows],
    )

    return MyWorkOut(
        ongoing=[_my_work_item(contract) for contract in ongoing],
        recent=[_my_work_item(contract, handoff) for handoff, contract in recent_rows],
    )
