"""Seed master data and a realistic local demo portfolio.

Run from the backend directory:

    python -m app.seed.seed_masters

The script is idempotent. Existing users, lookup values and evaluation-team
members are kept in sync; demo contracts are only created when the contract
table is empty.
"""

from __future__ import annotations

import argparse
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from random import Random

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models.audit import AuditLog, ContractHandoff
from app.models.contract import Contract
from app.models.contractor import Contractor, ContractorRating
from app.models.enums import (
    AuditAction,
    ContractStatus,
    HandoffAction,
    LookupType,
    PeriodUnit,
    UserRole,
)
from app.models.master import EvaluationTeamMember, LookupValue
from app.models.user import User
from app.services.audit import serialize_value

LOOKUPS: dict[LookupType, list[str]] = {
    LookupType.CATEGORY: [
        "Civil Works",
        "Consultancy",
        "M&E",
        "Services",
        "Supply & Materials",
    ],
    LookupType.PRIORITY: ["Low", "Normal", "High", "Urgent"],
    LookupType.PROCUREMENT_METHOD: ["Quotation", "Supply Invitation", "Tender"],
    LookupType.OFFICE_REGION: [
        "CIPC",
        "DGM",
        "Dehiwala",
        "Kalutara",
        "Moratuwa",
        "P&D",
        "Panadura-Horana",
    ],
    LookupType.FUNDS: [
        "O&M",
        "RH",
        "RH/NRW/Rechargeable/O&M",
        "RATE",
        "NRW",
        "E&S - WSP",
        "RECHARGEABLE",
        "E&S",
        "GOSL",
    ],
}

EVALUATION_TEAM = [
    ("Eng. M.M.M. Faaique", "Manager (Dehiwala)"),
    ("Eng. Mr. B.H.H. Liyanage", "Manager (Kaluthara)"),
    ("Eng. Mr. C.S. Welikanna", "Manager (P-H)"),
    ("Ms. S. Wijesinghe", "Payment Accountant"),
    ("Mr. T.M. Nisham", "Accountant (Dehiwala)"),
    ("Mr. P.W.M. Fernando", "Accountant (Kalutara)"),
    ("Ms. P.A.K.N. Dayarathna", "Accountant (P-H)"),
    ("Eng. N.C.K. Nambugoda", "Engineer (O&M) Dehiwala"),
    ("Eng. (Mrs) W.L.P. Shirosmani", "Engineer (O&M) Kalutara"),
    ("Eng. Mr. Sagara Kumarawardhana", "O&M (Engineer) P-H"),
    ("Eng. K.G.L.P. Kumara", "Eng (M&E) Dehiwala"),
    ("Eng. D.O. Dharmalal", "Eng (M&E) Kalutara"),
    ("Eng. J. Kalaiselvan", "CE (M&E)"),
    ("Eng. D.K. Jayawardhana", "CE (Con)"),
    ("Eng. Y.L. Bishrullah", "CE (NRW)"),
    ("Eng. Mrs. W.R.S. Fernando", "CE (P&D)"),
    ("Eng. L.S. Jayasuriya", "Eng (Con)"),
    ("Eng. K.A.M. Prasanthika", "Engineer (P&D)"),
    ("Mr. M.P. Hewagama", "Snr. System Admin"),
    ("Ms. T.M.T.H. Thennakon", "Snr. Chemist"),
]

USERS = [
    {
        "email": "admin@procure360.lk",
        "full_name": "System Administrator",
        "role": UserRole.ADMIN,
        "designation": "ICT / System Administration",
    },
    {
        "email": "manager@procure360.lk",
        "full_name": "Nadeesha Perera",
        "role": UserRole.PC_MANAGER,
        "designation": "Procurement Manager",
    },
    {
        "email": "qs@procure360.lk",
        "full_name": "Ruwan Jayasinghe",
        "role": UserRole.QS,
        "designation": "Quantity Surveyor",
    },
    {
        "email": "engineer@procure360.lk",
        "full_name": "Tharindu Silva",
        "role": UserRole.PC_ENGINEER,
        "designation": "P&C Engineer / Supply Officer",
    },
    {
        # Same person and details as the engineer, with a separate Supply Officer login.
        "email": "supply@procure360.lk",
        "full_name": "Tharindu Silva",
        "role": UserRole.SUPPLY_OFFICER,
        "designation": "P&C Engineer / Supply Officer",
    },
    {
        "email": "viewer@procure360.lk",
        "full_name": "Dilani Fernando",
        "role": UserRole.VIEWER,
        "designation": "Audit Viewer",
    },
]

CONTRACTORS = [
    {
        "name": "Lanka Water Infrastructure (Pvt) Ltd",
        "registration_no": "WP/CS/2018/0421",
        "contact_person": "Chaminda Ranasinghe",
        "phone": "+94 11 234 5678",
        "email": "contracts@lankawater.lk",
        "address": "128 Galle Road, Dehiwala",
        "office_region": "Dehiwala",
    },
    {
        "name": "Ruhunu Construction & Engineering (Pvt) Ltd",
        "registration_no": "SP/CS/2015/0188",
        "contact_person": "Sanjaya Weerakoon",
        "phone": "+94 91 222 4455",
        "email": "projects@ruhunuce.lk",
        "address": "45 Main Street, Kalutara",
        "office_region": "Kalutara",
    },
    {
        "name": "AquaTech Engineering Solutions (Pvt) Ltd",
        "registration_no": "WP/CS/2020/0774",
        "contact_person": "Fathima Rizwan",
        "phone": "+94 11 289 3344",
        "email": "tenders@aquatech.lk",
        "address": "7 Temple Lane, Colombo 05",
        "office_region": "CIPC",
    },
    {
        "name": "Samagi Civil Works (Pvt) Ltd",
        "registration_no": "WP/CS/2016/0312",
        "contact_person": "Roshan de Silva",
        "phone": "+94 38 229 1122",
        "email": "info@samagicivil.lk",
        "address": "203 Horana Road, Panadura",
        "office_region": "Panadura-Horana",
    },
    {
        "name": "Metro Pipeline Contractors (Pvt) Ltd",
        "registration_no": "WP/CS/2012/0096",
        "contact_person": "Mohan Rajapaksa",
        "phone": "+94 11 264 8877",
        "email": "office@metropipeline.lk",
        "address": "61 Station Road, Moratuwa",
        "office_region": "Moratuwa",
    },
    {
        "name": "Ceylon M&E Services (Pvt) Ltd",
        "registration_no": "WP/ME/2019/0165",
        "contact_person": "Anushka Gunasekara",
        "phone": "+94 11 271 9900",
        "email": "service@ceylonme.lk",
        "address": "19 Industrial Estate, Dehiwala",
        "office_region": "Dehiwala",
    },
    {
        "name": "Nawaloka Environmental Services (Pvt) Ltd",
        "registration_no": "WP/EN/2017/0219",
        "contact_person": "Priyanga Silva",
        "phone": "+94 11 255 7788",
        "email": "env@nawaloka.lk",
        "address": "5 Marine Drive, Colombo 03",
        "office_region": "DGM",
    },
    {
        "name": "HydroCare Consultancy (Pvt) Ltd",
        "registration_no": "WP/CN/2014/0072",
        "contact_person": "Dr. Malini Senanayake",
        "phone": "+94 11 268 4400",
        "email": "consult@hydrocare.lk",
        "address": "77 Park Avenue, Colombo 07",
        "office_region": "P&D",
    },
    {
        "name": "Southern Water Systems (Pvt) Ltd",
        "registration_no": "SP/CS/2021/0644",
        "contact_person": "Lasantha Perera",
        "phone": "+94 91 224 7788",
        "email": "works@southernwater.lk",
        "address": "22 Nagoda Road, Kalutara",
        "office_region": "Kalutara",
    },
    {
        "name": "Precision Valve & Meter Co. (Pvt) Ltd",
        "registration_no": "WP/SU/2010/0033",
        "contact_person": "Dinesh Karunaratne",
        "phone": "+94 11 233 1144",
        "email": "sales@precisionvalve.lk",
        "address": "9 Nawala Road, Colombo 05",
        "office_region": "CIPC",
    },
    {
        "name": "Kalu Ganga Builders (Pvt) Ltd",
        "registration_no": "SP/CS/2013/0251",
        "contact_person": "Upul Chandrasena",
        "phone": "+94 34 227 3311",
        "email": "info@kalugangabuilders.lk",
        "address": "118 Kalutara North",
        "office_region": "Kalutara",
    },
    {
        "name": "Moratuwa Engineering Works (Pvt) Ltd",
        "registration_no": "WP/ME/2018/0499",
        "contact_person": "Thilina Abeysekara",
        "phone": "+94 11 265 3322",
        "email": "works@moratuwaengineering.lk",
        "address": "14 New Galle Road, Moratuwa",
        "office_region": "Moratuwa",
    },
]


def upsert_users(db: Session) -> dict[str, User]:
    password_hash = hash_password(settings.demo_password)
    users: dict[str, User] = {}
    for data in USERS:
        user = db.scalar(select(User).where(User.email == data["email"]))
        if user is None:
            user = User(
                email=data["email"],
                full_name=data["full_name"],
                role=data["role"],
                designation=data["designation"],
                hashed_password=password_hash,
                is_active=True,
            )
            db.add(user)
        else:
            user.full_name = data["full_name"]
            user.role = data["role"]
            user.designation = data["designation"]
            user.is_active = True
        users[data["role"].value] = user
        users[data["email"]] = user
    db.flush()
    return users


def upsert_lookups(db: Session) -> None:
    for list_type, values in LOOKUPS.items():
        for index, value in enumerate(values):
            record = db.scalar(
                select(LookupValue).where(
                    LookupValue.list_type == list_type.value, LookupValue.value == value
                )
            )
            if record is None:
                db.add(
                    LookupValue(
                        list_type=list_type.value,
                        value=value,
                        sort_order=index,
                        is_active=True,
                    )
                )
            else:
                record.sort_order = index
                record.is_active = True
    db.flush()


def upsert_evaluation_team(db: Session) -> list[EvaluationTeamMember]:
    members: list[EvaluationTeamMember] = []
    for index, (name, designation) in enumerate(EVALUATION_TEAM, start=1):
        member = db.scalar(
            select(EvaluationTeamMember).where(
                EvaluationTeamMember.name == name,
                EvaluationTeamMember.designation == designation,
            )
        )
        if member is None:
            member = EvaluationTeamMember(
                name=name,
                designation=designation,
                display_order=index,
                is_active=True,
            )
            db.add(member)
        else:
            member.display_order = index
            member.is_active = True
        members.append(member)
    db.flush()
    return members


def upsert_contractors(db: Session) -> list[Contractor]:
    contractors: list[Contractor] = []
    for data in CONTRACTORS:
        contractor = db.scalar(select(Contractor).where(Contractor.name == data["name"]))
        if contractor is None:
            contractor = Contractor(**data, is_active=True)
            db.add(contractor)
        else:
            for field, value in data.items():
                setattr(contractor, field, value)
            contractor.is_active = True
        contractors.append(contractor)
    db.flush()
    return contractors


def build_dates(request_days_ago: int) -> dict[str, date]:
    today = date.today()
    request = today - timedelta(days=request_days_ago)

    def plus(offset: int) -> date:
        return request + timedelta(days=offset)

    closing = plus(63)
    awarded = plus(93)
    commencement = plus(105)
    original = commencement + timedelta(days=182)
    return {
        "request": request,
        "target": plus(240),
        "document_complete": plus(8),
        "signature_sent": plus(12),
        "signature_received": plus(18),
        "evaluation_sent": plus(22),
        "evaluation_received": plus(30),
        "comments_sent": plus(35),
        "documents_received": plus(40),
        "tender_notice": plus(42),
        "bid_closing": closing,
        "bec_sent": closing + timedelta(days=2),
        "bec_due": closing + timedelta(days=12),
        "bec_received": closing + timedelta(days=14),
        "rpc": closing + timedelta(days=20),
        "agm": closing + timedelta(days=26),
        "awarded": awarded,
        "agreement": awarded + timedelta(days=6),
        "docs_sent": awarded + timedelta(days=8),
        "commencement": commencement,
        "original_completion": original,
        "bond_expiry": commencement + timedelta(days=365),
        "engagement": awarded + timedelta(days=15),
    }


DEMO_CONTRACTS = [
    {
        "project_name": "M&E Instrumentation Upgrade — CIPC",
        "category": "M&E",
        "priority": "High",
        "method": "Supply Invitation",
        "office": "CIPC",
        "funds": "E&S - WSP",
        "stage": "DRAFT_PC_MANAGER",
        "request_days_ago": 8,
        "stage_days": 3,
    },
    {
        "project_name": "Emergency Valve Replacement — Dehiwala",
        "category": "Supply & Materials",
        "priority": "Urgent",
        "method": "Quotation",
        "office": "Dehiwala",
        "funds": "O&M",
        "stage": "DRAFT_PC_MANAGER",
        "request_days_ago": 4,
        "stage_days": 2,
    },
    {
        "project_name": "Consultancy for NRW Baseline Study — Kalutara",
        "category": "Consultancy",
        "priority": "Normal",
        "method": "Quotation",
        "office": "Kalutara",
        "funds": "NRW",
        "stage": "WITH_QS",
        "request_days_ago": 42,
        "stage_days": 7,
        "contractor_index": 7,
        "amount": 7_850_000,
    },
    {
        "project_name": "Consultancy for SCADA Master Plan",
        "category": "Consultancy",
        "priority": "Normal",
        "method": "Supply Invitation",
        "office": "CIPC",
        "funds": "E&S",
        "stage": "WITH_QS",
        "request_days_ago": 56,
        "stage_days": 13,
        "contractor_index": 8,
        "amount": 14_750_000,
    },
    {
        "project_name": "Pipe Laying — Panadura Coastal Belt",
        "category": "Civil Works",
        "priority": "High",
        "method": "Tender",
        "office": "Panadura-Horana",
        "funds": "RECHARGEABLE",
        "stage": "WITH_QS",
        "request_days_ago": 72,
        "stage_days": 21,
        "contractor_index": 3,
        "amount": 143_200_000,
    },
    {
        "project_name": "SCADA Cybersecurity Review",
        "category": "Services",
        "priority": "Low",
        "method": "Quotation",
        "office": "CIPC",
        "funds": "E&S",
        "stage": "WITH_QS",
        "request_days_ago": 26,
        "stage_days": 4,
        "contractor_index": 8,
        "amount": 4_100_000,
    },
    {
        "project_name": "Civil Works for Pipeline Replacement — Moratuwa North",
        "category": "Civil Works",
        "priority": "High",
        "method": "Tender",
        "office": "Moratuwa",
        "funds": "O&M",
        "stage": "WITH_PC_ENGINEER",
        "request_days_ago": 162,
        "stage_days": 9,
        "contractor_index": 3,
        "amount": 82_400_000,
        "override": {"original_completion": "today_plus_35", "bond_expiry": "today_plus_25"},
    },
    {
        "project_name": "Supply of Ductile Iron Pipes — Moratuwa",
        "category": "Supply & Materials",
        "priority": "High",
        "method": "Tender",
        "office": "Moratuwa",
        "funds": "O&M",
        "stage": "WITH_PC_ENGINEER",
        "request_days_ago": 148,
        "stage_days": 16,
        "partial_engineer": True,
        "override": {
            "bid_closing": "today_minus_20",
            "bec_sent": "today_minus_18",
            "bec_due": "today_minus_8",
            "bec_received": None,
        },
    },
    {
        "project_name": "Water Quality Testing Services — 2026",
        "category": "Services",
        "priority": "Normal",
        "method": "Quotation",
        "office": "P&D",
        "funds": "RATE",
        "stage": "WITH_PC_ENGINEER",
        "request_days_ago": 121,
        "stage_days": 5,
        "contractor_index": 6,
        "amount": 5_200_000,
        "override": {"bond_expiry": "today_minus_2"},
    },
    {
        "project_name": "Supply & Installation of Bulk Meters — CIPC",
        "category": "Supply & Materials",
        "priority": "Urgent",
        "method": "Tender",
        "office": "CIPC",
        "funds": "RATE",
        "stage": "WITH_PC_ENGINEER",
        "request_days_ago": 139,
        "stage_days": 26,
        "contractor_index": 9,
        "amount": 38_900_000,
        "override": {"original_completion": "today_plus_18"},
    },
    {
        "project_name": "Pump Set Overhaul — DGM",
        "category": "M&E",
        "priority": "Normal",
        "method": "Supply Invitation",
        "office": "DGM",
        "funds": "RH/NRW/Rechargeable/O&M",
        "stage": "WITH_PC_ENGINEER",
        "request_days_ago": 92,
        "stage_days": 3,
        "partial_engineer": True,
        "override": {
            "bid_closing": "today_minus_20",
            "bec_sent": "today_minus_18",
            "bec_due": "today_plus_4",
            "bec_received": None,
        },
    },
    {
        "project_name": "Pipeline Extension — Horana Industrial Zone",
        "category": "Civil Works",
        "priority": "High",
        "method": "Tender",
        "office": "Panadura-Horana",
        "funds": "GOSL",
        "stage": "RETURNED_FOR_CORRECTION",
        "request_days_ago": 184,
        "stage_days": 3,
        "contractor_index": 4,
        "amount": 96_300_000,
        "return_reason": (
            "BEC recommendation and contractor award details are inconsistent with the award letter. "
            "Please reconcile the awarded amount and agreement date before returning to the P&C Engineer."
        ),
        "override": {"original_completion": "today_minus_10"},
    },
    {
        "project_name": "Supply and Installation of Water Meters — Dehiwala Zone",
        "category": "Supply & Materials",
        "priority": "High",
        "method": "Tender",
        "office": "Dehiwala",
        "funds": "NRW",
        "stage": "COMPLETED",
        "request_days_ago": 300,
        "completed_days_ago": 40,
        "contractor_index": 9,
        "amount": 48_750_000,
        "rating": (5, 4, 5, 4, "Reliable meter installation across the zone. Minor snag list closed promptly."),
    },
    {
        "project_name": "Rehabilitation of Pump House No. 3 — Panadura",
        "category": "Civil Works",
        "priority": "High",
        "method": "Tender",
        "office": "Panadura-Horana",
        "funds": "GOSL",
        "stage": "COMPLETED",
        "request_days_ago": 342,
        "completed_days_ago": 35,
        "contractor_index": 0,
        "amount": 126_000_000,
        "extension_days": 60,
        "rating": (4, 4, 5, 4, "Strong site supervision. Completion within the extended period."),
    },
    {
        "project_name": "Emergency Valve Replacement — Kesbewa",
        "category": "Supply & Materials",
        "priority": "Urgent",
        "method": "Quotation",
        "office": "Dehiwala",
        "funds": "O&M",
        "stage": "COMPLETED",
        "request_days_ago": 264,
        "completed_days_ago": 21,
        "contractor_index": 4,
        "amount": 3_450_000,
        "rating": (5, 5, 5, 4, "Mobilised within 48 hours and completed the emergency scope without service interruption."),
    },
    {
        "project_name": "Construction of Ground Reservoir — Kalutara East",
        "category": "Civil Works",
        "priority": "High",
        "method": "Tender",
        "office": "Kalutara",
        "funds": "RH",
        "stage": "COMPLETED",
        "request_days_ago": 430,
        "completed_days_ago": 30,
        "contractor_index": 1,
        "amount": 210_500_000,
        "extension_days": 60,
        "rating": (2, 2, 3, 3, "Repeated delays beyond the extended completion date. Additional supervision was required."),
    },
    {
        "project_name": "Leak Detection Survey — Dehiwala & Kalutara",
        "category": "Services",
        "priority": "Normal",
        "method": "Quotation",
        "office": "DGM",
        "funds": "NRW",
        "stage": "COMPLETED",
        "request_days_ago": 280,
        "completed_days_ago": 55,
        "contractor_index": 6,
        "amount": 8_900_000,
        "rating": (4, 5, 4, 4, "Survey coverage and leak reports were delivered ahead of schedule."),
    },
    {
        "project_name": "Consultancy for Asset Register",
        "category": "Consultancy",
        "priority": "Low",
        "method": "Quotation",
        "office": "P&D",
        "funds": "E&S - WSP",
        "stage": "COMPLETED",
        "request_days_ago": 310,
        "completed_days_ago": 65,
        "contractor_index": 7,
        "amount": 6_300_000,
        "rating": (4, 4, 5, 5, "Well-structured asset register with useful data-quality controls."),
    },
]


def resolve_override(value: str | None) -> date | None:
    if value is None:
        return None
    today = date.today()
    if value == "today_plus_35":
        return today + timedelta(days=35)
    if value == "today_plus_25":
        return today + timedelta(days=25)
    if value == "today_plus_18":
        return today + timedelta(days=18)
    if value == "today_minus_20":
        return today - timedelta(days=20)
    if value == "today_minus_18":
        return today - timedelta(days=18)
    if value == "today_minus_8":
        return today - timedelta(days=8)
    if value == "today_minus_2":
        return today - timedelta(days=2)
    if value == "today_minus_10":
        return today - timedelta(days=10)
    if value == "today_plus_4":
        return today + timedelta(days=4)
    return date.fromisoformat(value)


def add_audit(
    db: Session,
    contract_id: int,
    user_id: int | None,
    action: AuditAction,
    field_name: str | None,
    old_value,
    new_value,
    reason: str | None,
    changed_at: datetime,
    admin_override: bool = False,
) -> None:
    db.add(
        AuditLog(
            contract_id=contract_id,
            user_id=user_id,
            action=action.value,
            field_name=field_name,
            old_value=serialize_value(old_value),
            new_value=serialize_value(new_value),
            reason=reason,
            is_admin_override=admin_override,
            changed_at=changed_at,
        )
    )


def seed_demo_contracts(
    db: Session,
    users: dict[str, User],
    members: list[EvaluationTeamMember],
    contractors: list[Contractor],
) -> None:
    if not settings.seed_demo_data:
        print("Demo contracts disabled by SEED_DEMO_DATA=false.")
        return
    existing = db.scalar(select(Contract.id).limit(1))
    if existing:
        print("Contracts already exist — skipping demo portfolio.")
        return

    rng = Random(360)
    manager = users[UserRole.PC_MANAGER.value]
    qs = users[UserRole.QS.value]
    engineer = users[UserRole.PC_ENGINEER.value]
    now = datetime.now(UTC)
    today = date.today()

    for index, data in enumerate(DEMO_CONTRACTS, start=1):
        stage = data["stage"]
        dates = build_dates(data["request_days_ago"])
        overrides = data.get("override", {})
        for field, raw in overrides.items():
            target = "bond_expiry" if field == "bond_expiry" else field
            dates[target] = resolve_override(raw) if isinstance(raw, str) else raw

        has_qs = stage != "DRAFT_PC_MANAGER"
        has_engineer = stage in {
            "WITH_PC_ENGINEER",
            "RETURNED_FOR_CORRECTION",
            "COMPLETED",
        }
        partial_engineer = bool(data.get("partial_engineer"))
        is_completed = stage == "COMPLETED"
        is_returned = stage == "RETURNED_FOR_CORRECTION"
        completed_at = None
        if is_completed:
            completed_at = now - timedelta(days=data["completed_days_ago"])

        stage_days = data.get("stage_days", 5)
        if is_completed:
            last = completed_at
            forward_qs = last - timedelta(days=25)
            created = forward_qs - timedelta(days=15)
            forward_engineer = last - timedelta(days=10)
            handoff_times = [created, forward_qs, forward_engineer, last]
            actions = [
                HandoffAction.CREATED,
                HandoffAction.FORWARD,
                HandoffAction.FORWARD,
                HandoffAction.COMPLETE,
            ]
            statuses = [
                ContractStatus.DRAFT_PC_MANAGER,
                ContractStatus.WITH_QS,
                ContractStatus.WITH_PC_ENGINEER,
                ContractStatus.COMPLETED,
            ]
        elif stage == "DRAFT_PC_MANAGER":
            last = now - timedelta(days=stage_days)
            created = last
            handoff_times = [created]
            actions = [HandoffAction.CREATED]
            statuses = [ContractStatus.DRAFT_PC_MANAGER]
        elif stage == "WITH_QS":
            last = now - timedelta(days=stage_days)
            created = last - timedelta(days=10)
            handoff_times = [created, last]
            actions = [HandoffAction.CREATED, HandoffAction.FORWARD]
            statuses = [ContractStatus.DRAFT_PC_MANAGER, ContractStatus.WITH_QS]
        elif stage == "WITH_PC_ENGINEER":
            last = now - timedelta(days=stage_days)
            forward_qs = last - timedelta(days=12)
            created = forward_qs - timedelta(days=8)
            handoff_times = [created, forward_qs, last]
            actions = [HandoffAction.CREATED, HandoffAction.FORWARD, HandoffAction.FORWARD]
            statuses = [
                ContractStatus.DRAFT_PC_MANAGER,
                ContractStatus.WITH_QS,
                ContractStatus.WITH_PC_ENGINEER,
            ]
        else:  # returned
            last = now - timedelta(days=stage_days)
            forward_engineer = last - timedelta(days=5)
            forward_qs = forward_engineer - timedelta(days=12)
            created = forward_qs - timedelta(days=8)
            handoff_times = [created, forward_qs, forward_engineer, last]
            actions = [
                HandoffAction.CREATED,
                HandoffAction.FORWARD,
                HandoffAction.FORWARD,
                HandoffAction.RETURN_TO_PREVIOUS,
            ]
            statuses = [
                ContractStatus.DRAFT_PC_MANAGER,
                ContractStatus.WITH_QS,
                ContractStatus.WITH_PC_ENGINEER,
                ContractStatus.RETURNED_FOR_CORRECTION,
            ]

        current_owner = {
            "DRAFT_PC_MANAGER": UserRole.PC_MANAGER,
            "WITH_QS": UserRole.QS,
            "WITH_PC_ENGINEER": UserRole.PC_ENGINEER,
            "RETURNED_FOR_CORRECTION": UserRole.QS,
            "COMPLETED": UserRole.PC_ENGINEER,
        }[stage]

        contract = Contract(
            status=ContractStatus(stage),
            current_owner_role=current_owner,
            version=len(handoff_times),
            project_name=data["project_name"],
            request_receiving_date=dates["request"],
            category=data["category"],
            priority=data["priority"],
            procurement_method=data["method"],
            office_region=data["office"],
            target_completion=dates["target"],
            created_by_id=manager.id,
            updated_by_id=engineer.id if has_engineer else (qs.id if has_qs else manager.id),
            created_at=handoff_times[0],
            updated_at=handoff_times[-1],
            completed_at=completed_at,
        )

        if is_returned:
            contract.return_reason = data["return_reason"]
            contract.returned_from_role = UserRole.PC_ENGINEER

        if has_qs:
            contract.contract_no = f"P360/{dates['request'].year}/{index:03d}"
            contract.contract_name = data["project_name"]
            contract.funds = data["funds"]
            contract.document_complete_date = dates["document_complete"]
            contract.signature_sent_date = dates["signature_sent"]
            contract.signature_received_date = dates["signature_received"]
            contract.doc_evaluation_sent_date = dates["evaluation_sent"]
            contract.document_evaluation_committee = (
                "DGM (Commercial), Quantity Surveyor, P&C Engineer"
            )
            contract.doc_evaluation_received_date = dates["evaluation_received"]
            contract.comments_completed_sent_date = dates["comments_sent"]
            contract.documents_received_from_sign_date = dates["documents_received"]
            contract.tender_notice_sending_date = dates["tender_notice"]
            contract.qs_remarks = (
                "Documents verified against the procurement file. Tender notice prepared for approval."
            )

        if has_engineer:
            contract.bid_closing_date = dates["bid_closing"]
            contract.bec_sent_date = dates["bec_sent"]
            contract.bec_due_date = dates["bec_due"]
            contract.bec_received_date = dates["bec_received"]
            contract.bid_bond_released = True
            contract.bec_recommendation = (
                "Evaluation completed on the responsive bids. Lowest substantially responsive bidder "
                "recommended for award, subject to RPC and AGM approval."
            )
            contract.rpc_held_on = dates["rpc"]
            contract.agm_approved_date = dates["agm"]
            contract.pc_remarks = "BEC report and award documentation verified against the procurement file."

            if not partial_engineer:
                contractor_index = data.get("contractor_index", 0)
                contractor = contractors[contractor_index]
                amount = Decimal(str(data["amount"]))
                contract.contractor_id = contractor.id
                contract.awarded_amount_without_vat = amount
                contract.awarded_on = dates["awarded"]
                contract.agreement_signed_date = dates["agreement"]
                contract.tender_docs_sent = True
                contract.tender_docs_sent_date = dates["docs_sent"]
                contract.contract_period_value = 6
                contract.contract_period_unit = PeriodUnit.MONTHS
                contract.physical_construction_commenced_on = dates["commencement"]
                contract.original_intended_completion_date = dates["original_completion"]
                contract.p_bond_amount_lkr = (amount * Decimal("0.05")).quantize(Decimal("0.01"))
                contract.p_bond_expiry_date = dates["bond_expiry"]
                contract.p_bond_details = (
                    f"Bank guarantee {contractor.registration_no}/BG/{dates['awarded'].year} "
                    "issued by Commercial Bank of Ceylon."
                )
                contract.engagement_order_ref = f"EO/{dates['awarded'].year}/{index:03d}"
                contract.engagement_order_date = dates["engagement"]
                if data.get("extension_days"):
                    extension_value = int(data["extension_days"])
                    contract.extension_value = extension_value
                    contract.extension_unit = PeriodUnit.DAYS
                    contract.revised_completion_date = dates["original_completion"] + timedelta(
                        days=extension_value
                    )
                contract.pc_remarks = (
                    "Award documentation, agreement and performance bond verified. "
                    "Contractor mobilised and works commenced."
                )

            member_count = 4 if index % 2 else 5
            start = (index * 2) % max(1, len(members) - member_count)
            contract.bec_members = members[start : start + member_count]

        db.add(contract)
        db.flush()

        # Handoffs
        actor_by_stage = [manager, qs, engineer, engineer]
        for handoff_index, (handoff_time, action, target_status) in enumerate(
            zip(handoff_times, actions, statuses), start=1
        ):
            if action == HandoffAction.CREATED:
                from_role = None
                to_role = UserRole.PC_MANAGER
                actor = manager
                reason = "Contract record opened by P&C Manager."
            elif action == HandoffAction.RETURN_TO_PREVIOUS:
                from_role = UserRole.PC_ENGINEER
                to_role = UserRole.QS
                actor = engineer
                reason = data.get("return_reason")
            elif action == HandoffAction.COMPLETE:
                from_role = UserRole.PC_ENGINEER
                to_role = UserRole.PC_ENGINEER
                actor = engineer
                reason = "Works completed and handover documentation accepted."
            elif handoff_index == 2:
                from_role = UserRole.PC_MANAGER
                to_role = UserRole.QS
                actor = manager
                reason = "Orders 1–7 complete; forwarded to QS."
            else:
                from_role = UserRole.QS
                to_role = UserRole.PC_ENGINEER
                actor = qs
                reason = "Orders 8–20 complete; forwarded to P&C Engineer."

            db.add(
                ContractHandoff(
                    contract_id=contract.id,
                    from_status=statuses[handoff_index - 2].value if handoff_index > 1 else None,
                    to_status=target_status.value,
                    action=action.value,
                    from_role=from_role.value if from_role else None,
                    to_role=to_role.value,
                    acted_by_id=actor.id,
                    reason=reason,
                    is_admin_override=False,
                    version_after=handoff_index,
                    created_at=handoff_time,
                )
            )
            add_audit(
                db,
                contract.id,
                actor.id,
                AuditAction.TRANSITION
                if action in {HandoffAction.FORWARD, HandoffAction.CREATED}
                else (AuditAction.RETURN if action == HandoffAction.RETURN_TO_PREVIOUS else AuditAction.COMPLETE),
                "status",
                statuses[handoff_index - 2].value if handoff_index > 1 else None,
                target_status.value,
                reason,
                handoff_time,
            )

        # Field-level audit samples
        add_audit(
            db,
            contract.id,
            manager.id,
            AuditAction.CREATE,
            "project_name",
            None,
            contract.project_name,
            "Contract record opened.",
            handoff_times[0],
        )
        if has_qs:
            qs_at = handoff_times[1]
            add_audit(
                db,
                contract.id,
                qs.id,
                AuditAction.FIELD_UPDATE,
                "contract_no",
                None,
                contract.contract_no,
                "Contract number assigned.",
                qs_at,
            )
            add_audit(
                db,
                contract.id,
                qs.id,
                AuditAction.FIELD_UPDATE,
                "funds",
                None,
                contract.funds,
                "Funding source confirmed.",
                qs_at,
            )
        if has_engineer and not partial_engineer:
            engineer_at = handoff_times[2] if stage != "WITH_PC_ENGINEER" else handoff_times[-1]
            add_audit(
                db,
                contract.id,
                engineer.id,
                AuditAction.FIELD_UPDATE,
                "awarded_amount_without_vat",
                None,
                contract.awarded_amount_without_vat,
                "Award amount confirmed against AGM approval.",
                engineer_at,
            )
            add_audit(
                db,
                contract.id,
                engineer.id,
                AuditAction.FIELD_UPDATE,
                "contractor_id",
                None,
                contract.contractor.name if contract.contractor else None,
                "Contractor linked after award.",
                engineer_at,
            )

    # Ratings for the completed portfolio
    completed = db.scalars(
        select(Contract).where(Contract.status == ContractStatus.COMPLETED)
    ).all()
    for contract in completed:
        data = next(
            (item for item in DEMO_CONTRACTS if item["project_name"] == contract.project_name), None
        )
        if not data or "rating" not in data:
            continue
        quality, schedule, compliance, safety, comments = data["rating"]
        db.add(
            ContractorRating(
                contractor_id=contract.contractor_id,
                contract_id=contract.id,
                quality_score=quality,
                schedule_score=schedule,
                compliance_score=compliance,
                safety_score=safety,
                comments=comments,
                rated_by_id=engineer.id,
                created_at=(contract.completed_at or now) + timedelta(days=4),
                updated_at=(contract.completed_at or now) + timedelta(days=4),
            )
        )

    # A general rating not tied to a single contract.
    lanka = contractors[0]
    db.add(
        ContractorRating(
            contractor_id=lanka.id,
            contract_id=None,
            quality_score=4,
            schedule_score=4,
            compliance_score=5,
            safety_score=4,
            comments="Consistent documentation and responsive site management across packages.",
            rated_by_id=manager.id,
            created_at=now - timedelta(days=20),
            updated_at=now - timedelta(days=20),
        )
    )
    db.flush()


def seed(reset_demo: bool = False) -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        # An empty install seeds only system configuration (dropdowns and the
        # evaluation team). Demo users, contractors and contracts are opt-in.
        if settings.seed_demo_data:
            users = upsert_users(db)
            contractors = upsert_contractors(db)
        else:
            users = {}
            contractors = []
            print("Demo users, contractors and contracts disabled by SEED_DEMO_DATA=false.")
        upsert_lookups(db)
        members = upsert_evaluation_team(db)
        db.commit()

        if reset_demo:
            from sqlalchemy import delete

            db.execute(delete(ContractorRating))
            db.execute(delete(AuditLog))
            db.execute(delete(ContractHandoff))
            from app.models.contract import contract_bec_members

            db.execute(delete(contract_bec_members))
            db.execute(delete(Contract))
            db.commit()
            print("Existing contracts and ratings removed (reset-demo).")

        seed_demo_contracts(db, users, members, contractors)
        db.commit()

        counts = {
            "users": len(db.scalars(select(User)).all()),
            "lookup values": len(db.scalars(select(LookupValue)).all()),
            "evaluation team": len(db.scalars(select(EvaluationTeamMember)).all()),
            "contractors": len(db.scalars(select(Contractor)).all()),
            "contracts": len(db.scalars(select(Contract)).all()),
            "ratings": len(db.scalars(select(ContractorRating)).all()),
        }
    print("\nPROCURE360 seed complete")
    for label, value in counts.items():
        print(f"  {label:<18} {value}")
    if settings.seed_demo_data:
        print("\nDemo accounts (password: " + settings.demo_password + ")")
        for data in USERS:
            print(f"  {data['role'].value:<12} {data['email']}")
    else:
        print("\nNo users created. Run: python -m app.seed.bootstrap_admin --email <admin-email> --password <password>")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed PROCURE360 master data and demo records.")
    parser.add_argument(
        "--reset-demo",
        action="store_true",
        help="Delete all contracts, handoffs, audits and ratings before reseeding the demo portfolio.",
    )
    parser.add_argument(
        "--no-demo",
        action="store_true",
        help="Seed only dropdowns and the evaluation team; no users, contractors or contracts.",
    )
    args = parser.parse_args()
    if args.no_demo:
        settings.seed_demo_data = False
    seed(reset_demo=args.reset_demo)
