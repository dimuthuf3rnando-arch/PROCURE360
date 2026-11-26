from datetime import date

from app.core.errors import ValidationError
from app.models.contract import Contract
from app.models.enums import ContractStatus
from app.schemas.contract import ValidationWarning
from app.services.contract_fields import FIELD_LABELS


def _value(obj, name):
    return getattr(obj, name, None)


def effective_completion_date(contract: Contract) -> date | None:
    return (
        contract.revised_completion_date
        or contract.original_intended_completion_date
        or contract.target_completion
    )


def is_overdue(contract: Contract) -> bool:
    if contract.status == ContractStatus.COMPLETED:
        return False
    completion = effective_completion_date(contract)
    return bool(completion and completion < date.today())


def _add(
    warnings: list[ValidationWarning],
    code: str,
    first: str,
    second: str,
    message: str | None = None,
    severity: str = "warning",
) -> None:
    warnings.append(
        ValidationWarning(
            code=code,
            message=message
            or f"{FIELD_LABELS[first]} must not be earlier than {FIELD_LABELS[second]}.",
            fields=[first, second],
            severity=severity,  # type: ignore[arg-type]
        )
    )


def _check_order(
    warnings: list[ValidationWarning],
    contract: Contract,
    first: str,
    second: str,
    code: str,
) -> None:
    first_value = _value(contract, first)
    second_value = _value(contract, second)
    if first_value and second_value and first_value < second_value:
        _add(warnings, code, first, second)


def compute_warnings(contract: Contract) -> list[ValidationWarning]:
    """Non-blocking data-quality and deadline checks shown in the UI."""
    warnings: list[ValidationWarning] = []
    today = date.today()

    # Record chronology
    _check_order(warnings, contract, "target_completion", "request_receiving_date", "target_before_receipt")
    _check_order(warnings, contract, "document_complete_date", "request_receiving_date", "docs_before_receipt")
    _check_order(warnings, contract, "signature_received_date", "signature_sent_date", "signature_sequence")
    _check_order(
        warnings, contract, "doc_evaluation_received_date", "doc_evaluation_sent_date", "evaluation_sequence"
    )
    _check_order(
        warnings,
        contract,
        "documents_received_from_sign_date",
        "comments_completed_sent_date",
        "doc_return_sequence",
    )
    _check_order(
        warnings,
        contract,
        "tender_notice_sending_date",
        "documents_received_from_sign_date",
        "tender_notice_sequence",
    )
    _check_order(warnings, contract, "bid_closing_date", "tender_notice_sending_date", "bid_before_notice")
    _check_order(warnings, contract, "bec_due_date", "bec_sent_date", "bec_due_before_sent")
    _check_order(warnings, contract, "bec_received_date", "bec_sent_date", "bec_received_before_sent")
    _check_order(warnings, contract, "rpc_held_on", "bid_closing_date", "rpc_before_closing")
    _check_order(warnings, contract, "agm_approved_date", "rpc_held_on", "agm_before_rpc")
    _check_order(warnings, contract, "awarded_on", "agm_approved_date", "award_before_agm")
    _check_order(warnings, contract, "agreement_signed_date", "awarded_on", "agreement_before_award")
    _check_order(warnings, contract, "tender_docs_sent_date", "awarded_on", "docs_sent_before_award")
    _check_order(
        warnings,
        contract,
        "physical_construction_commenced_on",
        "awarded_on",
        "commencement_before_award",
    )
    _check_order(
        warnings,
        contract,
        "original_intended_completion_date",
        "physical_construction_commenced_on",
        "completion_before_commencement",
    )
    _check_order(
        warnings,
        contract,
        "revised_completion_date",
        "original_intended_completion_date",
        "extension_shortens_completion",
    )
    _check_order(warnings, contract, "p_bond_expiry_date", "awarded_on", "bond_before_award")
    _check_order(warnings, contract, "engagement_order_date", "awarded_on", "engagement_before_award")

    if contract.tender_docs_sent and not contract.tender_docs_sent_date:
        warnings.append(
            ValidationWarning(
                code="tender_docs_date_missing",
                message="Tender documents are marked as sent, but no sending date is recorded.",
                fields=["tender_docs_sent", "tender_docs_sent_date"],
            )
        )
    if contract.tender_docs_sent is False and contract.tender_docs_sent_date:
        warnings.append(
            ValidationWarning(
                code="tender_docs_date_without_flag",
                message="A tender-documents sending date is recorded, but the document set is marked not sent.",
                fields=["tender_docs_sent", "tender_docs_sent_date"],
            )
        )
    if contract.contract_period_value and not contract.contract_period_unit:
        warnings.append(
            ValidationWarning(
                code="contract_period_unit_missing",
                message="Contract period has a value but no unit (months or days).",
                fields=["contract_period_value", "contract_period_unit"],
            )
        )
    if contract.extension_value and not contract.extension_unit:
        warnings.append(
            ValidationWarning(
                code="extension_unit_missing",
                message="A time extension value is recorded without a unit (months or days).",
                fields=["extension_value", "extension_unit"],
            )
        )
    if (contract.extension_value or contract.revised_completion_date) and not contract.revised_completion_date:
        warnings.append(
            ValidationWarning(
                code="revised_date_missing",
                message="A time extension is recorded, but the revised completion date is missing.",
                fields=["extension_value", "revised_completion_date"],
            )
        )

    # Deadline alerts
    if contract.status != ContractStatus.COMPLETED:
        if contract.bec_due_date and not contract.bec_received_date and contract.bec_due_date < today:
            warnings.append(
                ValidationWarning(
                    code="bec_overdue",
                    message=f"BEC response is {(today - contract.bec_due_date).days} day(s) overdue.",
                    fields=["bec_due_date", "bec_received_date"],
                    severity="error",
                )
            )
        completion = effective_completion_date(contract)
        if completion and completion < today:
            warnings.append(
                ValidationWarning(
                    code="completion_overdue",
                    message=f"The effective completion date passed {(today - completion).days} day(s) ago.",
                    fields=["revised_completion_date", "original_intended_completion_date", "target_completion"],
                    severity="error",
                )
            )
        if contract.p_bond_expiry_date and contract.p_bond_expiry_date < today:
            warnings.append(
                ValidationWarning(
                    code="bond_expired",
                    message=f"The performance bond expired on {contract.p_bond_expiry_date.isoformat()}.",
                    fields=["p_bond_expiry_date"],
                    severity="error",
                )
            )
        elif contract.p_bond_expiry_date and (contract.p_bond_expiry_date - today).days <= 30:
            warnings.append(
                ValidationWarning(
                    code="bond_expiring",
                    message=(
                        "The performance bond expires in "
                        f"{(contract.p_bond_expiry_date - today).days} day(s)."
                    ),
                    fields=["p_bond_expiry_date"],
                )
            )
    return warnings


def missing_required_fields(contract: Contract, fields: list[str]) -> list[str]:
    missing: list[str] = []
    for field in fields:
        value = getattr(contract, field, None)
        if field == "bec_member_ids":
            value = contract.bec_members
        if field == "doc_evaluation_member_ids":
            value = contract.doc_evaluation_members
        if value is None or value == "" or value == []:
            missing.append(FIELD_LABELS.get(field, field))
    return missing


def ensure_required(contract: Contract, fields: list[str], action_label: str) -> None:
    missing = missing_required_fields(contract, fields)
    if missing:
        raise ValidationError(
            f"{action_label} is blocked until these required fields are completed: "
            + ", ".join(missing),
            details={"missing_fields": missing},
        )
