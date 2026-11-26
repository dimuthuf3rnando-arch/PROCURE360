import type { ContractFields, LookupGroups, PeriodUnit } from '../types/api';

export type WorkflowRole = 'PC_MANAGER' | 'QS' | 'PC_ENGINEER' | 'SUPPLY_OFFICER';

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'date'
  | 'select'
  | 'currency'
  | 'number'
  | 'boolean'
  | 'period_unit'
  | 'team_multiselect'
  | 'contractor';

export interface FieldMeta {
  key: keyof ContractFields;
  order: string;
  label: string;
  kind: FieldKind;
  optionsKey?: keyof LookupGroups;
  hint?: string;
  wide?: boolean;
}

export interface FieldGroup {
  title: string;
  caption: string;
  fields: FieldMeta[];
}

export interface SectionDef {
  role: WorkflowRole;
  label: string;
  shortLabel: string;
  range: string;
  title: string;
  description: string;
  groups: FieldGroup[];
}

const managerFields: FieldMeta[] = [
  { key: 'project_name', order: '1', label: 'Project Name', kind: 'text', wide: true },
  { key: 'request_receiving_date', order: '2', label: 'Request Receiving Date', kind: 'date' },
  { key: 'category', order: '3', label: 'Category', kind: 'select', optionsKey: 'category' },
  { key: 'priority', order: '4', label: 'Priority', kind: 'select', optionsKey: 'priority' },
  {
    key: 'procurement_method',
    order: '5',
    label: 'Procurement Method',
    kind: 'select',
    optionsKey: 'procurement_method',
  },
  { key: 'office_region', order: '6', label: 'Office / Region', kind: 'select', optionsKey: 'office_region' },
  { key: 'target_completion', order: '7', label: 'Target Completion', kind: 'date' },
];

const qsFields: FieldMeta[] = [
  { key: 'contract_no', order: '8', label: 'Contract No', kind: 'text', hint: 'Unique across the register.' },
  { key: 'contract_name', order: '9', label: 'Contract Name', kind: 'text', wide: true },
  { key: 'funds', order: '10', label: 'Funds', kind: 'select', optionsKey: 'funds' },
  { key: 'document_complete_date', order: '11', label: 'Document Complete Date', kind: 'date' },
  { key: 'signature_sent_date', order: '12', label: 'Sending to Signature (AGM/DGM)', kind: 'date' },
  { key: 'signature_received_date', order: '13', label: 'Received from Signature', kind: 'date' },
  { key: 'doc_evaluation_sent_date', order: '14', label: 'Document Evaluation Sent', kind: 'date' },
  {
    key: 'doc_evaluation_member_ids',
    order: '15',
    label: 'Document Evaluation Committee',
    kind: 'team_multiselect',
    hint: 'Choose the staff who evaluate the tender documents.',
    wide: true,
  },
  { key: 'doc_evaluation_received_date', order: '16', label: 'Document Evaluation Received', kind: 'date' },
  {
    key: 'comments_completed_sent_date',
    order: '17',
    label: 'Comments Completed & Sent — Tender Notice Approval',
    kind: 'date',
    hint: 'Documents comments completed and sent to sign the tender notice & calling approval (AGM/DGM).',
    wide: true,
  },
  { key: 'documents_received_from_sign_date', order: '18', label: 'Documents Received from Sign', kind: 'date' },
  { key: 'tender_notice_sending_date', order: '19', label: 'Tender Notice Sending Date', kind: 'date' },
  { key: 'qs_remarks', order: '20', label: 'QS Remarks', kind: 'textarea', wide: true },
];

const engineerFields: FieldMeta[] = [
  { key: 'bid_closing_date', order: '21', label: 'Bid Closing Date', kind: 'date' },
  { key: 'bec_member_ids', order: '22', label: 'BEC Members', kind: 'team_multiselect', wide: true },
  { key: 'bec_sent_date', order: '23', label: 'BEC Sent Date', kind: 'date' },
  { key: 'bec_due_date', order: '24', label: 'BEC to be Received', kind: 'date' },
  { key: 'bec_received_date', order: '25', label: 'BEC Received Date', kind: 'date' },
  { key: 'bid_bond_released', order: '26', label: 'Bid Bond Released', kind: 'boolean' },
  { key: 'bec_recommendation', order: '27', label: 'BEC Recommendation', kind: 'textarea', wide: true },
  { key: 'rpc_held_on', order: '28', label: 'RPC Held On', kind: 'date' },
  { key: 'agm_approved_date', order: '29', label: 'AGM Approved Date', kind: 'date' },
  { key: 'contractor_id', order: '30', label: 'Contractor', kind: 'contractor', wide: true },
  {
    key: 'awarded_amount_without_vat',
    order: '31',
    label: 'Awarded Amount without VAT (LKR)',
    kind: 'currency',
  },
  { key: 'awarded_on', order: '32', label: 'Awarded On', kind: 'date' },
  { key: 'agreement_signed_date', order: '33', label: 'Agreement Signed Date', kind: 'date' },
  {
    key: 'tender_docs_sent',
    order: '34',
    label: 'Tender Documents Sent after Award',
    kind: 'boolean',
    hint: 'Complete set sent to relevant staff and the contractor.',
  },
  { key: 'tender_docs_sent_date', order: '34', label: 'Tender Documents Sent Date', kind: 'date' },
  { key: 'contract_period_value', order: '35', label: 'Contract Period', kind: 'number' },
  { key: 'contract_period_unit', order: '35', label: 'Contract Period Unit', kind: 'period_unit' },
  { key: 'physical_construction_commenced_on', order: '36', label: 'Physical Construction Commenced On', kind: 'date' },
  { key: 'original_intended_completion_date', order: '37', label: 'Original Intended Completion Date', kind: 'date' },
  { key: 'extension_value', order: '38', label: 'Time Extension — Value', kind: 'number' },
  { key: 'extension_unit', order: '38', label: 'Time Extension — Unit', kind: 'period_unit' },
  { key: 'revised_completion_date', order: '38', label: 'Revised Completion Date', kind: 'date' },
  { key: 'p_bond_amount_lkr', order: '39', label: 'Performance Bond Amount (LKR)', kind: 'currency' },
  { key: 'p_bond_expiry_date', order: '39', label: 'Performance Bond Expiry Date', kind: 'date' },
  { key: 'p_bond_details', order: '39', label: 'Performance Bond Details', kind: 'textarea', wide: true },
  { key: 'pc_remarks', order: '40', label: 'P&C / Contract Remarks', kind: 'textarea', wide: true },
  { key: 'engagement_order_ref', order: '41', label: 'Engagement Order Reference', kind: 'text' },
  { key: 'engagement_order_date', order: '41', label: 'Engagement Order Date', kind: 'date' },
];

export const SECTIONS: SectionDef[] = [
  {
    role: 'PC_MANAGER',
    label: 'P&C Manager',
    shortLabel: 'P&C',
    range: 'Orders 1–7',
    title: 'Initiation & routing',
    description:
      'The request brief that opens the file. Project identity, category, procurement route, region and target dates.',
    groups: [
      {
        title: 'Project brief',
        caption: 'Orders 1–7',
        fields: managerFields,
      },
    ],
  },
  {
    role: 'QS',
    label: 'Quantity Surveyor',
    shortLabel: 'QS',
    range: 'Orders 8–20',
    title: 'Contract formation',
    description:
      'Contract identity, funds and the full documentation chain through signatures, evaluation and tender notice.',
    groups: [
      {
        title: 'Contract identity & funds',
        caption: 'Orders 8–10',
        fields: qsFields.filter((field) => ['8', '9', '10'].includes(field.order)),
      },
      {
        title: 'Documentation sequence',
        caption: 'Orders 11–19',
        fields: qsFields.filter((field) => Number(field.order) >= 11 && Number(field.order) <= 19),
      },
      {
        title: 'BEC team',
        caption: 'Order 22 · shared',
        fields: [
          {
            key: 'bec_member_ids',
            order: '22',
            label: 'BEC Members',
            kind: 'team_multiselect',
            hint: 'Choose the bid evaluation committee. Once saved, the selection is shown here for reference.',
            wide: true,
          },
        ],
      },
      {
        title: 'Remarks',
        caption: 'Order 20',
        fields: qsFields.filter((field) => field.order === '20'),
      },
    ],
  },
  {
    role: 'PC_ENGINEER',
    label: 'P&C Engineer / Supply Officer',
    shortLabel: 'Engineer',
    range: 'Orders 21–41',
    title: 'Tender, award & delivery',
    description:
      'BEC evaluation, award and agreement, contract period, construction milestones, performance bond and engagement order.',
    groups: [
      {
        title: 'Tender & BEC',
        caption: 'Orders 21–29',
        fields: engineerFields.filter((field) => Number(field.order) <= 29),
      },
      {
        title: 'Award & agreement',
        caption: 'Orders 30–33',
        fields: engineerFields.filter((field) => Number(field.order) >= 30 && Number(field.order) <= 33),
      },
      {
        title: 'Documents & contract period',
        caption: 'Orders 34–35',
        fields: engineerFields.filter((field) => ['34', '35'].includes(field.order)),
      },
      {
        title: 'Construction & completion',
        caption: 'Orders 36–38',
        fields: engineerFields.filter((field) => ['36', '37', '38'].includes(field.order)),
      },
      {
        title: 'Performance bond',
        caption: 'Order 39',
        fields: engineerFields.filter((field) => field.order === '39'),
      },
      {
        title: 'Remarks & engagement',
        caption: 'Orders 40–41',
        fields: engineerFields.filter((field) => ['40', '41'].includes(field.order)),
      },
    ],
  },
];

export const SECTION_BY_ROLE: Record<WorkflowRole, SectionDef> = {
  PC_MANAGER: SECTIONS[0],
  QS: SECTIONS[1],
  PC_ENGINEER: SECTIONS[2],
  // Supply Officer works the same Orders 21–41 section as the engineer.
  SUPPLY_OFFICER: SECTIONS[2],
};

export const ALL_FIELDS: FieldMeta[] = SECTIONS.flatMap((section) =>
  section.groups.flatMap((group) => group.fields),
);

export const FIELD_META: Record<string, FieldMeta> = Object.fromEntries(
  ALL_FIELDS.map((field) => [field.key, field]),
);

export const FIELD_LABEL: Record<string, string> = Object.fromEntries(
  ALL_FIELDS.map((field) => [field.key, field.label]),
);

export function fieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function sectionForRole(role: WorkflowRole): SectionDef {
  return SECTION_BY_ROLE[role];
}

export function fieldsForRole(role: WorkflowRole): string[] {
  return SECTION_BY_ROLE[role].groups.flatMap((group) => group.fields.map((field) => field.key as string));
}

export const CREATE_REQUIRED = fieldsForRole('PC_MANAGER');

export const FORWARD_REQUIRED: Record<WorkflowRole, string[]> = {
  PC_MANAGER: fieldsForRole('PC_MANAGER'),
  QS: ['contract_no', 'contract_name', 'funds'],
  PC_ENGINEER: [
    'bid_closing_date',
    'bec_member_ids',
    'contractor_id',
    'awarded_amount_without_vat',
    'awarded_on',
    'agreement_signed_date',
    'physical_construction_commenced_on',
    'original_intended_completion_date',
  ],
  SUPPLY_OFFICER: [
    'bid_closing_date',
    'bec_member_ids',
    'contractor_id',
    'awarded_amount_without_vat',
    'awarded_on',
    'agreement_signed_date',
    'physical_construction_commenced_on',
    'original_intended_completion_date',
  ],
};

export const COMPLETE_REQUIRED = FORWARD_REQUIRED.PC_ENGINEER;

export const PERIOD_UNITS: Array<{ value: PeriodUnit; label: string }> = [
  { value: 'months', label: 'Months' },
  { value: 'days', label: 'Days' },
];

export const ROLE_ORDER: WorkflowRole[] = ['PC_MANAGER', 'QS', 'PC_ENGINEER'];

export const STATUS_TO_ROLE: Record<string, WorkflowRole | null> = {
  DRAFT_PC_MANAGER: 'PC_MANAGER',
  WITH_QS: 'QS',
  WITH_PC_ENGINEER: 'PC_ENGINEER',
  WITH_SUPPLY_OFFICER: 'SUPPLY_OFFICER',
  RETURNED_FOR_CORRECTION: null,
  COMPLETED: null,
};

export const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT_PC_MANAGER', label: 'Draft · P&C Manager' },
  { value: 'WITH_QS', label: 'With QS' },
  { value: 'WITH_PC_ENGINEER', label: 'With P&C Engineer' },
  { value: 'WITH_SUPPLY_OFFICER', label: 'With Supply Officer' },
  { value: 'RETURNED_FOR_CORRECTION', label: 'Returned for correction' },
  { value: 'COMPLETED', label: 'Completed' },
];

export const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'PC_MANAGER', label: 'P&C Manager' },
  { value: 'QS', label: 'Quantity Surveyor' },
  { value: 'PC_ENGINEER', label: 'P&C Engineer' },
  { value: 'SUPPLY_OFFICER', label: 'Supply Officer' },
  { value: 'VIEWER', label: 'Viewer' },
  { value: 'ADMIN', label: 'Administrator' },
];

export const USER_ROLE_OPTIONS = [
  { value: 'PC_MANAGER', label: 'P&C Manager' },
  { value: 'QS', label: 'Quantity Surveyor' },
  { value: 'PC_ENGINEER', label: 'P&C Engineer' },
  { value: 'SUPPLY_OFFICER', label: 'Supply Officer' },
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'VIEWER', label: 'Viewer' },
];

export const isRequired = (fields: string[], field: string): boolean => fields.includes(field);
