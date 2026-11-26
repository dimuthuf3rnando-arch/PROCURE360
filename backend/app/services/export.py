from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from typing import Callable

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

from app.models.contract import Contract
from app.services.contract_fields import FIELD_LABELS, FIELD_ORDERS, FIELD_META, SECTION_FIELDS
from app.services.validators import effective_completion_date

INK = "1F2E29"
TEAL = "2E6B57"
TEAL_TINT = "EAF2EE"
CREAM = "FAF8F3"
BORDER = "E7E2D6"


def _fmt_date(value: date | None) -> str:
    return value.strftime("%d %b %Y") if value else ""


def _fmt_amount(value: Decimal | float | None) -> float | str:
    if value is None:
        return ""
    return float(value)


def _fmt_bool(value: bool | None) -> str:
    if value is None:
        return ""
    return "Yes" if value else "No"


def _compound(parts: list[str]) -> str:
    return " · ".join(part for part in parts if part)


EXPORT_COLUMNS: list[tuple[str, str, str, Callable[[Contract], object]]] = [
    ("1", "Project Name", "P&C Manager", lambda c: c.project_name or ""),
    ("2", "Request Receiving Date", "P&C Manager", lambda c: _fmt_date(c.request_receiving_date)),
    ("3", "Category", "P&C Manager", lambda c: c.category or ""),
    ("4", "Priority", "P&C Manager", lambda c: c.priority or ""),
    ("5", "Procurement method", "P&C Manager", lambda c: c.procurement_method or ""),
    ("6", "Office / region", "P&C Manager", lambda c: c.office_region or ""),
    ("7", "Target completion", "P&C Manager", lambda c: _fmt_date(c.target_completion)),
    ("8", "Contract No", "QS", lambda c: c.contract_no or ""),
    ("9", "Contract Name", "QS", lambda c: c.contract_name or ""),
    ("10", "Funds", "QS", lambda c: c.funds or ""),
    ("11", "Document Complete Date", "QS", lambda c: _fmt_date(c.document_complete_date)),
    ("12", "Sending to Signature (AGM/DGM)", "QS", lambda c: _fmt_date(c.signature_sent_date)),
    ("13", "Received from Signature", "QS", lambda c: _fmt_date(c.signature_received_date)),
    ("14", "Document Evaluation Sent", "QS", lambda c: _fmt_date(c.doc_evaluation_sent_date)),
    ("15", "Document Evaluation Committee", "QS", lambda c: c.document_evaluation_committee or ""),
    ("16", "Document Evaluation Received", "QS", lambda c: _fmt_date(c.doc_evaluation_received_date)),
    (
        "17",
        "Documents Comments Completed & Sent to Sign Tender Notice",
        "QS",
        lambda c: _fmt_date(c.comments_completed_sent_date),
    ),
    ("18", "Documents Received from Sign", "QS", lambda c: _fmt_date(c.documents_received_from_sign_date)),
    ("19", "Tender Notice Sending Date", "QS", lambda c: _fmt_date(c.tender_notice_sending_date)),
    ("20", "QS Remarks", "QS", lambda c: c.qs_remarks or ""),
    ("21", "Bid Closing Date", "P&C Engineer", lambda c: _fmt_date(c.bid_closing_date)),
    (
        "22",
        "BEC Members",
        "P&C Engineer",
        lambda c: ", ".join(member.name for member in c.bec_members),
    ),
    ("23", "BEC Sent date", "P&C Engineer", lambda c: _fmt_date(c.bec_sent_date)),
    ("24", "BEC to be received", "P&C Engineer", lambda c: _fmt_date(c.bec_due_date)),
    ("25", "BEC received date", "P&C Engineer", lambda c: _fmt_date(c.bec_received_date)),
    ("26", "Bid Bond Released", "P&C Engineer", lambda c: _fmt_bool(c.bid_bond_released)),
    ("27", "BEC recommendation", "P&C Engineer", lambda c: c.bec_recommendation or ""),
    ("28", "RPC Held on", "P&C Engineer", lambda c: _fmt_date(c.rpc_held_on)),
    ("29", "AGM Approved Date", "P&C Engineer", lambda c: _fmt_date(c.agm_approved_date)),
    ("30", "Contractor", "P&C Engineer", lambda c: c.contractor.name if c.contractor else ""),
    (
        "31",
        "Awarded Amount without VAT (LKR)",
        "P&C Engineer",
        lambda c: _fmt_amount(c.awarded_amount_without_vat),
    ),
    ("32", "Awarded on", "P&C Engineer", lambda c: _fmt_date(c.awarded_on)),
    ("33", "Agreement signed date", "P&C Engineer", lambda c: _fmt_date(c.agreement_signed_date)),
    (
        "34",
        "Complete set of Tender Documents sent after Awarding",
        "P&C Engineer",
        lambda c: _compound(
            [
                _fmt_bool(c.tender_docs_sent),
                f"Sent {_fmt_date(c.tender_docs_sent_date)}" if c.tender_docs_sent_date else "",
            ]
        ),
    ),
    (
        "35",
        "Contract period",
        "P&C Engineer",
        lambda c: _compound(
            [
                f"{c.contract_period_value} {c.contract_period_unit.value}" if c.contract_period_value else "",
            ]
        ),
    ),
    (
        "36",
        "Physical Construction commenced on",
        "P&C Engineer",
        lambda c: _fmt_date(c.physical_construction_commenced_on),
    ),
    (
        "37",
        "Original Intended Completion Date",
        "P&C Engineer",
        lambda c: _fmt_date(c.original_intended_completion_date),
    ),
    (
        "38",
        "Time Extension Granted up to",
        "P&C Engineer",
        lambda c: _compound(
            [
                f"{c.extension_value} {c.extension_unit.value}" if c.extension_value else "",
                f"Revised {_fmt_date(c.revised_completion_date)}" if c.revised_completion_date else "",
            ]
        ),
    ),
    (
        "39",
        "Performance bond",
        "P&C Engineer",
        lambda c: _compound(
            [
                f"LKR {float(c.p_bond_amount_lkr):,.2f}" if c.p_bond_amount_lkr is not None else "",
                f"Expires {_fmt_date(c.p_bond_expiry_date)}" if c.p_bond_expiry_date else "",
                c.p_bond_details or "",
            ]
        ),
    ),
    ("40", "P&C / Contract Remarks", "P&C Engineer", lambda c: c.pc_remarks or ""),
    (
        "41",
        "Engagement order",
        "P&C Engineer",
        lambda c: _compound(
            [
                c.engagement_order_ref or "",
                f"Dated {_fmt_date(c.engagement_order_date)}" if c.engagement_order_date else "",
            ]
        ),
    ),
]

STATUS_LABELS_EXPORT = {
    "DRAFT_PC_MANAGER": "Draft — P&C Manager",
    "WITH_QS": "With QS",
    "WITH_PC_ENGINEER": "With P&C Engineer",
    "WITH_SUPPLY_OFFICER": "With Supply Officer",
    "RETURNED_FOR_CORRECTION": "Returned for correction",
    "COMPLETED": "Completed",
}


def build_contracts_workbook(contracts: list[Contract]) -> BytesIO:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Contract register"

    thin = Side(style="thin", color=BORDER)
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    header_fill = PatternFill("solid", fgColor=INK)
    section_fills = {
        "P&C Manager": PatternFill("solid", fgColor="DCEBE4"),
        "QS": PatternFill("solid", fgColor="F0E7D5"),
        "P&C Engineer": PatternFill("solid", fgColor="E3E8EF"),
    }
    meta_headers = [
        "Record ID",
        "Workflow stage",
        "Current owner",
        "Version",
        "Created",
        "Last updated",
        "Completed on",
        "Effective completion",
    ]
    all_headers = meta_headers + [f"{order:0>2} · {label}" for order, label, _, _ in EXPORT_COLUMNS]

    sheet.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(all_headers))
    title_cell = sheet.cell(row=1, column=1, value="PROCURE360 — Procurement Contract Register")
    title_cell.font = Font(name="Georgia", size=18, bold=True, color="FFFFFF")
    title_cell.fill = PatternFill("solid", fgColor=TEAL)
    title_cell.alignment = Alignment(vertical="center", indent=1)
    sheet.row_dimensions[1].height = 36

    sheet.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(all_headers))
    meta_cell = sheet.cell(
        row=2,
        column=1,
        value=f"Exported {datetime.now().strftime('%d %b %Y, %H:%M')} · {len(contracts)} record(s) · Amounts in LKR",
    )
    meta_cell.font = Font(size=10, color="5C665F")
    meta_cell.fill = PatternFill("solid", fgColor=CREAM)
    meta_cell.alignment = Alignment(vertical="center", indent=1)
    sheet.row_dimensions[2].height = 22

    header_row = 3
    for index, header in enumerate(all_headers, start=1):
        cell = sheet.cell(row=header_row, column=index, value=header)
        cell.font = Font(bold=True, color="FFFFFF", size=9)
        cell.fill = header_fill
        cell.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
        cell.border = border
    sheet.row_dimensions[header_row].height = 44

    for row_offset, contract in enumerate(contracts, start=header_row + 1):
        values = [
            f"P360-{contract.id:05d}",
            STATUS_LABELS_EXPORT.get(contract.status.value, contract.status.value),
            contract.current_owner_role.value.replace("_", " ").title(),
            contract.version,
            _fmt_date(contract.created_at.date()) if contract.created_at else "",
            _fmt_date(contract.updated_at.date()) if contract.updated_at else "",
            _fmt_date(contract.completed_at.date()) if contract.completed_at else "",
            _fmt_date(effective_completion_date(contract)),
        ]
        values.extend(formatter(contract) for _, _, _, formatter in EXPORT_COLUMNS)
        for column, value in enumerate(values, start=1):
            cell = sheet.cell(row=row_offset, column=column, value=value)
            cell.border = border
            cell.alignment = Alignment(vertical="top", wrap_text=column > len(meta_headers))
            cell.font = Font(size=9)
            if row_offset % 2 == 0:
                cell.fill = PatternFill("solid", fgColor="FBF9F4")
            if column <= len(meta_headers):
                cell.fill = PatternFill("solid", fgColor="F4F1E9")
            if column == 4:
                cell.alignment = Alignment(horizontal="center", vertical="top")
        sheet.row_dimensions[row_offset].height = 30

        # Section tint on the header bands (row 3) is applied below as a second pass.
    for column, (order, label, section, _) in enumerate(EXPORT_COLUMNS, start=len(meta_headers) + 1):
        sheet.cell(row=header_row, column=column).fill = PatternFill(
            "solid", fgColor={"P&C Manager": "2E6B57", "QS": "7A6136", "P&C Engineer": "3A506B"}[section]
        )

    widths = [12, 22, 19, 8, 13, 13, 13, 16] + [
        22 if order not in {"20", "27", "39", "40"} else 36 for order, _, _, _ in EXPORT_COLUMNS
    ]
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width
    sheet.freeze_panes = "D4"
    sheet.auto_filter.ref = f"A3:{get_column_letter(len(all_headers))}{header_row + max(len(contracts), 1)}"

    if contracts:
        table = Table(
            displayName="ContractRegister",
            ref=f"A3:{get_column_letter(len(all_headers))}{header_row + len(contracts)}",
        )
        table.tableStyleInfo = TableStyleInfo(
            name="TableStyleMedium2",
            showRowStripes=False,
            showFirstColumn=False,
            showLastColumn=False,
        )
        sheet.add_table(table)

    # Field guide
    guide = workbook.create_sheet("Field guide")
    guide.merge_cells("A1:D1")
    guide["A1"] = "41 normalized procurement inputs"
    guide["A1"].font = Font(size=16, bold=True, color="FFFFFF")
    guide["A1"].fill = PatternFill("solid", fgColor=TEAL)
    guide["A1"].alignment = Alignment(vertical="center", indent=1)
    guide.row_dimensions[1].height = 32
    for column, title in enumerate(["Order", "Field (API name)", "Input label", "Section"], start=1):
        cell = guide.cell(row=3, column=column, value=title)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor=INK)
    row = 4
    section_lookup = {}
    for role, fields in SECTION_FIELDS.items():
        for field in fields:
            section_lookup[field] = role.value.replace("PC_MANAGER", "P&C Manager").replace(
                "PC_ENGINEER", "P&C Engineer"
            ).replace("SUPPLY_OFFICER", "Supply Officer").replace("QS", "QS")
    for field, (order, label, kind, option_source) in FIELD_META.items():
        guide.cell(row=row, column=1, value=order)
        guide.cell(row=row, column=2, value=field)
        guide.cell(row=row, column=3, value=label)
        guide.cell(row=row, column=4, value=section_lookup.get(field, ""))
        for column in range(1, 5):
            guide.cell(row=row, column=column).border = border
            guide.cell(row=row, column=column).font = Font(size=10)
        row += 1
    for index, width in enumerate([8, 34, 72, 22], start=1):
        guide.column_dimensions[get_column_letter(index)].width = width
    guide.freeze_panes = "A4"

    stream = BytesIO()
    workbook.save(stream)
    stream.seek(0)
    return stream
