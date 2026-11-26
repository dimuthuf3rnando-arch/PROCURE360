from datetime import date
from io import BytesIO

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import CurrentUser
from app.schemas.audit import AuditLogOut, HandoffOut
from app.schemas.common import Page
from app.schemas.contract import (
    CompleteRequest,
    ContractActionResponse,
    ContractCreate,
    ContractListItem,
    ContractOut,
    ContractUpdate,
    ForwardRequest,
    ReturnRequest,
)
from app.services.contracts import (
    create_contract,
    get_contract_or_404,
    list_contract_audit,
    list_contracts,
    list_handoffs,
    serialize_contract,
    serialize_list_item,
    update_contract,
)
from app.services.export import build_contracts_workbook
from app.services.workflow import perform_transition

router = APIRouter(prefix="/contracts", tags=["Contracts"])


def _page_params(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    return page, page_size


@router.get("", response_model=Page[ContractListItem])
def index(
    user: CurrentUser,
    db: Session = Depends(get_db),
    q: str | None = Query(None, max_length=200),
    status: str | None = Query(None),
    owner_role: str | None = Query(None),
    category: str | None = None,
    office_region: str | None = None,
    procurement_method: str | None = None,
    priority: str | None = None,
    funds: str | None = None,
    contractor_id: int | None = None,
    mine: bool = False,
    received_from: date | None = None,
    received_to: date | None = None,
    sort: str = "updated_at",
    direction: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    rows, total = list_contracts(
        db,
        user,
        q=q,
        status=status,
        owner_role=owner_role,
        category=category,
        office_region=office_region,
        procurement_method=procurement_method,
        priority=priority,
        funds=funds,
        contractor_id=contractor_id,
        mine=mine,
        received_from=received_from,
        received_to=received_to,
        sort=sort,
        direction=direction,
        page=page,
        page_size=page_size,
    )
    pages = (total + page_size - 1) // page_size if total else 0
    return Page[ContractListItem](
        items=[serialize_list_item(contract, user) for contract in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.get("/export")
def export_contracts(
    user: CurrentUser,
    db: Session = Depends(get_db),
    q: str | None = None,
    status: str | None = None,
    owner_role: str | None = None,
    category: str | None = None,
    office_region: str | None = None,
    procurement_method: str | None = None,
    priority: str | None = None,
    funds: str | None = None,
    contractor_id: int | None = None,
    mine: bool = False,
):
    collected = []
    page = 1
    while True:
        rows, total = list_contracts(
            db,
            user,
            q=q,
            status=status,
            owner_role=owner_role,
            category=category,
            office_region=office_region,
            procurement_method=procurement_method,
            priority=priority,
            funds=funds,
            contractor_id=contractor_id,
            mine=mine,
            page=page,
            page_size=100,
            sort="updated_at",
            direction="desc",
        )
        collected.extend(rows)
        if not rows or len(collected) >= total or page > 100:
            break
        page += 1
    stream: BytesIO = build_contracts_workbook(collected)
    filename = f"PROCURE360_contracts_{date.today().isoformat()}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("", response_model=ContractOut, status_code=201)
def create(
    payload: ContractCreate,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    contract = create_contract(db, user, payload)
    return serialize_contract(contract, user)


@router.get("/{contract_id}", response_model=ContractOut)
def detail(contract_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    contract = get_contract_or_404(db, contract_id)
    return serialize_contract(contract, user)


@router.patch("/{contract_id}", response_model=ContractOut)
def update(
    contract_id: int,
    payload: ContractUpdate,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    contract = update_contract(db, contract_id, user, payload)
    return serialize_contract(contract, user)


@router.post("/{contract_id}/forward", response_model=ContractActionResponse)
def forward(
    contract_id: int,
    payload: ForwardRequest,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    contract, message = perform_transition(
        db,
        contract_id,
        user,
        action="forward",
        expected_version=payload.version,
        reason=payload.reason,
        admin_override=payload.admin_override,
        override_reason=payload.override_reason,
        target_role=payload.target_role,
    )
    return ContractActionResponse(contract=serialize_contract(contract, user), message=message)


@router.post("/{contract_id}/return", response_model=ContractActionResponse)
def return_for_correction(
    contract_id: int,
    payload: ReturnRequest,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    contract, message = perform_transition(
        db,
        contract_id,
        user,
        action="return",
        expected_version=payload.version,
        reason=payload.reason,
        admin_override=payload.admin_override,
        override_reason=payload.override_reason,
    )
    return ContractActionResponse(contract=serialize_contract(contract, user), message=message)


@router.post("/{contract_id}/complete", response_model=ContractActionResponse)
def complete(
    contract_id: int,
    payload: CompleteRequest,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    contract, message = perform_transition(
        db,
        contract_id,
        user,
        action="complete",
        expected_version=payload.version,
        reason=payload.reason,
        admin_override=payload.admin_override,
        override_reason=payload.override_reason,
    )
    return ContractActionResponse(contract=serialize_contract(contract, user), message=message)


@router.get("/{contract_id}/handoffs", response_model=list[HandoffOut])
def handoffs(contract_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    get_contract_or_404(db, contract_id)
    return [HandoffOut(**item) for item in list_handoffs(db, contract_id)]


@router.get("/{contract_id}/audit", response_model=list[AuditLogOut])
def audit(contract_id: int, user: CurrentUser, db: Session = Depends(get_db)):
    contract = get_contract_or_404(db, contract_id)
    rows = list_contract_audit(db, contract_id)
    return [
        AuditLogOut(
            **row,
            contract_no=contract.contract_no,
            project_name=contract.project_name,
        )
        for row in rows
    ]
