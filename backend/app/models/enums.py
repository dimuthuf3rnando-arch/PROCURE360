from enum import StrEnum


class UserRole(StrEnum):
    PC_MANAGER = "PC_MANAGER"
    QS = "QS"
    PC_ENGINEER = "PC_ENGINEER"
    SUPPLY_OFFICER = "SUPPLY_OFFICER"
    ADMIN = "ADMIN"
    VIEWER = "VIEWER"


class ContractStatus(StrEnum):
    DRAFT_PC_MANAGER = "DRAFT_PC_MANAGER"
    WITH_QS = "WITH_QS"
    WITH_PC_ENGINEER = "WITH_PC_ENGINEER"
    WITH_SUPPLY_OFFICER = "WITH_SUPPLY_OFFICER"
    RETURNED_FOR_CORRECTION = "RETURNED_FOR_CORRECTION"
    COMPLETED = "COMPLETED"


class HandoffAction(StrEnum):
    CREATED = "CREATED"
    FORWARD = "FORWARD"
    RETURN_TO_PREVIOUS = "RETURN_TO_PREVIOUS"
    COMPLETE = "COMPLETE"
    ADMIN_OVERRIDE = "ADMIN_OVERRIDE"


class AuditAction(StrEnum):
    CREATE = "CREATE"
    FIELD_UPDATE = "FIELD_UPDATE"
    TRANSITION = "TRANSITION"
    RETURN = "RETURN"
    COMPLETE = "COMPLETE"
    ADMIN_OVERRIDE = "ADMIN_OVERRIDE"


class PeriodUnit(StrEnum):
    MONTHS = "months"
    DAYS = "days"


class LookupType(StrEnum):
    CATEGORY = "category"
    PRIORITY = "priority"
    PROCUREMENT_METHOD = "procurement_method"
    OFFICE_REGION = "office_region"
    FUNDS = "funds"


LOOKUP_LABELS = {
    LookupType.CATEGORY: "Category",
    LookupType.PRIORITY: "Priority",
    LookupType.PROCUREMENT_METHOD: "Procurement method",
    LookupType.OFFICE_REGION: "Office / region",
    LookupType.FUNDS: "Funds",
}
