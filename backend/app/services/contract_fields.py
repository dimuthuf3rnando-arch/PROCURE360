"""Authoritative field metadata for the 41 procurement orders.

Fields marked with the same order number are normalised pieces of a compound
input (for example Order 35: contract_period_value + contract_period_unit).
"""

from app.models.enums import ContractStatus, UserRole

SECTION_FIELDS: dict[UserRole, list[str]] = {
    UserRole.PC_MANAGER: [
        "project_name",
        "request_receiving_date",
        "category",
        "priority",
        "procurement_method",
        "office_region",
        "target_completion",
    ],
    UserRole.QS: [
        "contract_no",
        "contract_name",
        "funds",
        "document_complete_date",
        "signature_sent_date",
        "signature_received_date",
        "doc_evaluation_sent_date",
        "doc_evaluation_member_ids",
        "doc_evaluation_received_date",
        "comments_completed_sent_date",
        "documents_received_from_sign_date",
        "tender_notice_sending_date",
        "qs_remarks",
        # Shared with the next stage: the QS may appoint the evaluation committee.
        "bec_member_ids",
    ],
    UserRole.PC_ENGINEER: [
        "bid_closing_date",
        "bec_member_ids",
        "bec_sent_date",
        "bec_due_date",
        "bec_received_date",
        "bid_bond_released",
        "bec_recommendation",
        "rpc_held_on",
        "agm_approved_date",
        "contractor_id",
        "awarded_amount_without_vat",
        "awarded_on",
        "agreement_signed_date",
        "tender_docs_sent",
        "tender_docs_sent_date",
        "contract_period_value",
        "contract_period_unit",
        "physical_construction_commenced_on",
        "original_intended_completion_date",
        "extension_value",
        "extension_unit",
        "revised_completion_date",
        "p_bond_amount_lkr",
        "p_bond_expiry_date",
        "p_bond_details",
        "pc_remarks",
        "engagement_order_ref",
        "engagement_order_date",
    ],
    # Supply Officer has exactly the same section and field rights as the engineer.
    UserRole.SUPPLY_OFFICER: [
        "bid_closing_date",
        "bec_member_ids",
        "bec_sent_date",
        "bec_due_date",
        "bec_received_date",
        "bid_bond_released",
        "bec_recommendation",
        "rpc_held_on",
        "agm_approved_date",
        "contractor_id",
        "awarded_amount_without_vat",
        "awarded_on",
        "agreement_signed_date",
        "tender_docs_sent",
        "tender_docs_sent_date",
        "contract_period_value",
        "contract_period_unit",
        "physical_construction_commenced_on",
        "original_intended_completion_date",
        "extension_value",
        "extension_unit",
        "revised_completion_date",
        "p_bond_amount_lkr",
        "p_bond_expiry_date",
        "p_bond_details",
        "pc_remarks",
        "engagement_order_ref",
        "engagement_order_date",
    ],
}

SECTION_LABELS = {
    UserRole.PC_MANAGER: "P&C Manager",
    UserRole.QS: "Quantity Surveyor",
    UserRole.PC_ENGINEER: "P&C Engineer / Supply Officer",
    UserRole.SUPPLY_OFFICER: "Supply Officer",
}

SECTION_ORDER_RANGES = {
    UserRole.PC_MANAGER: "Orders 1–7",
    UserRole.QS: "Orders 8–20",
    UserRole.PC_ENGINEER: "Orders 21–41",
    UserRole.SUPPLY_OFFICER: "Orders 21–41",
}

# field -> (order, label, kind, option source)
FIELD_META: dict[str, tuple[str, str, str, str | None]] = {
    # P&C Manager
    "project_name": ("1", "Project Name", "text", None),
    "request_receiving_date": ("2", "Request Receiving Date", "date", None),
    "category": ("3", "Category", "select", "category"),
    "priority": ("4", "Priority", "select", "priority"),
    "procurement_method": ("5", "Procurement method", "select", "procurement_method"),
    "office_region": ("6", "Office / region", "select", "office_region"),
    "target_completion": ("7", "Target completion", "date", None),
    # QS
    "contract_no": ("8", "Contract No", "text", None),
    "contract_name": ("9", "Contract Name", "text", None),
    "funds": ("10", "Funds", "select", "funds"),
    "document_complete_date": ("11", "Document Complete Date", "date", None),
    "signature_sent_date": ("12", "Sending to Signature (AGM/DGM)", "date", None),
    "signature_received_date": ("13", "Received from Signature", "date", None),
    "doc_evaluation_sent_date": ("14", "Document Evaluation Sent", "date", None),
    "doc_evaluation_member_ids": (
        "15",
        "Document Evaluation Committee",
        "team_multiselect",
        None,
    ),
    "doc_evaluation_received_date": ("16", "Document Evaluation Received", "date", None),
    "comments_completed_sent_date": (
        "17",
        "Documents Comments Completed & Sent to Sign Tender Notice & Calling Approval (AGM/DGM)",
        "date",
        None,
    ),
    "documents_received_from_sign_date": ("18", "Documents Received from Sign", "date", None),
    "tender_notice_sending_date": ("19", "Tender Notice Sending Date", "date", None),
    "qs_remarks": ("20", "QS Remarks", "textarea", None),
    # P&C Engineer
    "bid_closing_date": ("21", "Bid Closing Date", "date", None),
    "bec_member_ids": ("22", "BEC Members", "team_multiselect", None),
    "bec_sent_date": ("23", "BEC Sent date", "date", None),
    "bec_due_date": ("24", "BEC to be received", "date", None),
    "bec_received_date": ("25", "BEC received date", "date", None),
    "bid_bond_released": ("26", "Bid Bond Released", "boolean", None),
    "bec_recommendation": ("27", "BEC recommendation", "textarea", None),
    "rpc_held_on": ("28", "RPC Held on", "date", None),
    "agm_approved_date": ("29", "AGM Approved Date", "date", None),
    "contractor_id": ("30", "Contractor", "contractor", None),
    "awarded_amount_without_vat": ("31", "Awarded Amount without VAT (LKR)", "currency", None),
    "awarded_on": ("32", "Awarded on", "date", None),
    "agreement_signed_date": ("33", "Agreement signed date", "date", None),
    "tender_docs_sent": (
        "34",
        "Complete set of Tender Documents sent to Relevant Staffs & Contractor after Awarding",
        "boolean",
        None,
    ),
    "tender_docs_sent_date": ("34", "Tender Documents Sent Date", "date", None),
    "contract_period_value": ("35", "Contract period", "number", None),
    "contract_period_unit": ("35", "Contract period unit", "period_unit", None),
    "physical_construction_commenced_on": ("36", "Physical Construction commenced on", "date", None),
    "original_intended_completion_date": ("37", "Original Intended Completion Date", "date", None),
    "extension_value": ("38", "Time Extension Granted up to — value", "number", None),
    "extension_unit": ("38", "Time Extension Granted up to — unit", "period_unit", None),
    "revised_completion_date": ("38", "Revised Completion Date", "date", None),
    "p_bond_amount_lkr": ("39", "Performance Bond Amount (LKR)", "currency", None),
    "p_bond_expiry_date": ("39", "Performance Bond Expiry Date", "date", None),
    "p_bond_details": ("39", "Performance Bond Details", "textarea", None),
    "pc_remarks": ("40", "P&C / Contract Remarks", "textarea", None),
    "engagement_order_ref": ("41", "Engagement Order Reference", "text", None),
    "engagement_order_date": ("41", "Engagement Order Date", "date", None),
}

FIELD_LABELS = {field: meta[1] for field, meta in FIELD_META.items()}
FIELD_ORDERS = {field: meta[0] for field, meta in FIELD_META.items()}
ALL_CONTRACT_FIELDS = list(FIELD_META.keys())

PERMITTED_EDIT_ROLES = {
    UserRole.PC_MANAGER,
    UserRole.QS,
    UserRole.PC_ENGINEER,
    UserRole.SUPPLY_OFFICER,
}

STATUS_LABELS = {
    ContractStatus.DRAFT_PC_MANAGER: "Draft — P&C Manager",
    ContractStatus.WITH_QS: "With QS",
    ContractStatus.WITH_PC_ENGINEER: "With P&C Engineer",
    ContractStatus.WITH_SUPPLY_OFFICER: "With Supply Officer",
    ContractStatus.RETURNED_FOR_CORRECTION: "Returned for correction",
    ContractStatus.COMPLETED: "Completed",
}

STATUS_OWNER_ROLE = {
    ContractStatus.DRAFT_PC_MANAGER: UserRole.PC_MANAGER,
    ContractStatus.WITH_QS: UserRole.QS,
    ContractStatus.WITH_PC_ENGINEER: UserRole.PC_ENGINEER,
    ContractStatus.WITH_SUPPLY_OFFICER: UserRole.SUPPLY_OFFICER,
    ContractStatus.COMPLETED: UserRole.PC_ENGINEER,
}

NEXT_STAGE: dict[UserRole, tuple[ContractStatus, UserRole]] = {
    UserRole.PC_MANAGER: (ContractStatus.WITH_QS, UserRole.QS),
    UserRole.QS: (ContractStatus.WITH_PC_ENGINEER, UserRole.PC_ENGINEER),
    UserRole.PC_ENGINEER: (ContractStatus.COMPLETED, UserRole.PC_ENGINEER),
    UserRole.SUPPLY_OFFICER: (ContractStatus.COMPLETED, UserRole.SUPPLY_OFFICER),
}

# The QS chooses which of the two equivalent next sections receives the file.
QS_FORWARD_TARGETS: dict[UserRole, tuple[ContractStatus, UserRole]] = {
    UserRole.PC_ENGINEER: (ContractStatus.WITH_PC_ENGINEER, UserRole.PC_ENGINEER),
    UserRole.SUPPLY_OFFICER: (ContractStatus.WITH_SUPPLY_OFFICER, UserRole.SUPPLY_OFFICER),
}

PREVIOUS_ROLE: dict[UserRole, UserRole] = {
    UserRole.QS: UserRole.PC_MANAGER,
    UserRole.PC_ENGINEER: UserRole.QS,
    UserRole.SUPPLY_OFFICER: UserRole.QS,
}

REQUIRED_FOR_CREATE = SECTION_FIELDS[UserRole.PC_MANAGER]

REQUIRED_TO_FORWARD: dict[UserRole, list[str]] = {
    UserRole.PC_MANAGER: SECTION_FIELDS[UserRole.PC_MANAGER],
    UserRole.QS: ["contract_no", "contract_name", "funds"],
    UserRole.PC_ENGINEER: [
        "bid_closing_date",
        "bec_member_ids",
        "contractor_id",
        "awarded_amount_without_vat",
        "awarded_on",
        "agreement_signed_date",
        "physical_construction_commenced_on",
        "original_intended_completion_date",
    ],
    UserRole.SUPPLY_OFFICER: [
        "bid_closing_date",
        "bec_member_ids",
        "contractor_id",
        "awarded_amount_without_vat",
        "awarded_on",
        "agreement_signed_date",
        "physical_construction_commenced_on",
        "original_intended_completion_date",
    ],
}

REQUIRED_TO_COMPLETE = [
    "bec_member_ids",
    "contractor_id",
    "awarded_amount_without_vat",
    "awarded_on",
    "agreement_signed_date",
    "physical_construction_commenced_on",
    "original_intended_completion_date",
]

DATE_FIELDS = {
    field for field, meta in FIELD_META.items() if meta[2] == "date"
}
