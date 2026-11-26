export type Role = 'PC_MANAGER' | 'QS' | 'PC_ENGINEER' | 'SUPPLY_OFFICER' | 'ADMIN' | 'VIEWER';

export type ContractStatus =
  | 'DRAFT_PC_MANAGER'
  | 'WITH_QS'
  | 'WITH_PC_ENGINEER'
  | 'WITH_SUPPLY_OFFICER'
  | 'RETURNED_FOR_CORRECTION'
  | 'COMPLETED';

export type PeriodUnit = 'months' | 'days';

export type Action = 'EDIT' | 'FORWARD' | 'RETURN' | 'COMPLETE';

export type LookupType = 'category' | 'priority' | 'procurement_method' | 'office_region' | 'funds';

export interface User {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  designation: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
  user: User;
}

export interface DemoAccount {
  name: string;
  email: string;
  role: Role;
  designation: string | null;
}

export interface DemoAccountsResponse {
  enabled: boolean;
  accounts: DemoAccount[];
}

export interface ValidationWarning {
  code: string;
  message: string;
  fields: string[];
  severity: 'warning' | 'error';
}

export interface ContractFields {
  project_name: string | null;
  request_receiving_date: string | null;
  category: string | null;
  priority: string | null;
  procurement_method: string | null;
  office_region: string | null;
  target_completion: string | null;

  contract_no: string | null;
  contract_name: string | null;
  funds: string | null;
  document_complete_date: string | null;
  signature_sent_date: string | null;
  signature_received_date: string | null;
  doc_evaluation_sent_date: string | null;
  document_evaluation_committee: string | null;
  doc_evaluation_member_ids: number[] | null;
  doc_evaluation_received_date: string | null;
  comments_completed_sent_date: string | null;
  documents_received_from_sign_date: string | null;
  tender_notice_sending_date: string | null;
  qs_remarks: string | null;

  bid_closing_date: string | null;
  bec_member_ids: number[] | null;
  bec_sent_date: string | null;
  bec_due_date: string | null;
  bec_received_date: string | null;
  bid_bond_released: boolean | null;
  bec_recommendation: string | null;
  rpc_held_on: string | null;
  agm_approved_date: string | null;
  contractor_id: number | null;
  awarded_amount_without_vat: number | null;
  awarded_on: string | null;
  agreement_signed_date: string | null;
  tender_docs_sent: boolean | null;
  tender_docs_sent_date: string | null;
  contract_period_value: number | null;
  contract_period_unit: PeriodUnit | null;
  physical_construction_commenced_on: string | null;
  original_intended_completion_date: string | null;
  extension_value: number | null;
  extension_unit: PeriodUnit | null;
  revised_completion_date: string | null;
  p_bond_amount_lkr: number | null;
  p_bond_expiry_date: string | null;
  p_bond_details: string | null;
  pc_remarks: string | null;
  engagement_order_ref: string | null;
  engagement_order_date: string | null;
}

export interface ContractorBrief {
  id: number;
  name: string;
  registration_no: string | null;
  office_region: string | null;
}

export interface EvaluationTeamMember {
  id: number;
  name: string;
  designation: string | null;
  display_order: number;
  is_active: boolean;
}

export interface Contract extends ContractFields {
  id: number;
  status: ContractStatus;
  current_owner_role: Role;
  version: number;
  return_reason: string | null;
  returned_from_role: Role | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_id: number | null;
  updated_by_id: number | null;
  contractor: ContractorBrief | null;
  bec_members: EvaluationTeamMember[];

  warnings: ValidationWarning[];
  editable_fields: string[];
  editable_sections: string[];
  available_actions: Action[];
  assigned_to_me: boolean;
  is_overdue: boolean;
  effective_completion_date: string | null;
  status_label: string;
}

export interface ContractListItem {
  id: number;
  project_name: string | null;
  contract_no: string | null;
  contract_name: string | null;
  category: string | null;
  priority: string | null;
  procurement_method: string | null;
  office_region: string | null;
  funds: string | null;
  status: ContractStatus;
  current_owner_role: Role;
  contractor_id: number | null;
  contractor_name: string | null;
  awarded_amount_without_vat: number | null;
  target_completion: string | null;
  original_intended_completion_date: string | null;
  revised_completion_date: string | null;
  effective_completion_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  is_overdue: boolean;
  assigned_to_me: boolean;
}

export interface ContractActionResponse {
  message: string;
  contract: Contract;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface AppNotification {
  id: number;
  user_id: number;
  contract_id: number | null;
  actor_id: number | null;
  actor_name: string | null;
  contract_no: string | null;
  project_name: string | null;
  kind: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface MyWorkItem {
  contract_id: number;
  contract_no: string | null;
  project_name: string | null;
  status: ContractStatus;
  status_label: string;
  owner_role: Role | null;
  amount_lkr: number | null;
  updated_at: string;
  action: string | null;
  reason: string | null;
  to_role: string | null;
}

export interface MyWork {
  ongoing: MyWorkItem[];
  recent: MyWorkItem[];
}

export interface Handoff {
  id: number;
  contract_id: number;
  from_status: string | null;
  to_status: string;
  action: string;
  from_role: string | null;
  to_role: string | null;
  acted_by_id: number | null;
  acted_by_name: string | null;
  reason: string | null;
  is_admin_override: boolean;
  version_after: number;
  created_at: string;
  duration_in_previous_stage_hours: number | null;
}

export interface AuditLog {
  id: number;
  contract_id: number;
  contract_no: string | null;
  project_name: string | null;
  user_id: number | null;
  user_name: string | null;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  is_admin_override: boolean;
  changed_at: string;
}

export interface AuditSummary {
  total_changes: number;
  total_handoffs: number;
  override_count: number;
  return_count: number;
}

export interface QueueBucket {
  status: string;
  label: string;
  owner_role: string;
  count: number;
  avg_age_days: number | null;
  oldest_age_days: number | null;
}

export interface BreakdownItem {
  key: string;
  label: string;
  total_lkr: number;
  count: number;
}

export interface CycleTimeItem {
  key: string;
  label: string;
  avg_days: number;
  count: number;
}

export interface MilestoneDuration {
  key: string;
  label: string;
  avg_days: number;
  count: number;
}

export interface AwardTrendItem {
  month: string;
  label: string;
  total_lkr: number;
  count: number;
}

export interface AlertItem {
  contract_id: number;
  contract_no: string | null;
  project_name: string | null;
  contractor_name: string | null;
  status: string;
  stage_label: string;
  date: string | null;
  days_delta: number | null;
  date_label: string;
  amount_lkr: number | null;
  severity: string;
}

export interface ActivityItem {
  id: number;
  contract_id: number;
  contract_no: string | null;
  project_name: string | null;
  action: string;
  from_role: string | null;
  to_role: string | null;
  acted_by_name: string | null;
  reason: string | null;
  created_at: string;
}

export interface DashboardTotals {
  total_contracts: number;
  active_contracts: number;
  completed_contracts: number;
  total_awarded_lkr: number;
  average_awarded_lkr: number;
  awaiting_action: number;
  overdue_bec: number;
  due_soon: number;
  expiring_bonds: number;
  completion_rate: number;
  avg_cycle_days: number | null;
  on_time_rate: number | null;
}

export interface Dashboard {
  generated_at: string;
  totals: DashboardTotals;
  queues: QueueBucket[];
  financials: Record<'office_region' | 'category' | 'procurement_method' | 'funds', BreakdownItem[]>;
  cycle_times: CycleTimeItem[];
  milestone_durations: MilestoneDuration[];
  award_trend: AwardTrendItem[];
  alerts: {
    bec_overdue: AlertItem[];
    upcoming_completion: AlertItem[];
    bond_expiry: AlertItem[];
  };
  recent_activity: ActivityItem[];
  top_contractors: ContractorDirectoryItem[];
}

export interface PublicStats {
  total_contracts: number;
  total_awarded_lkr: number;
  completed_contracts: number;
  contractors: number;
}

export interface Contractor {
  id: number;
  name: string;
  registration_no: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  office_region: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContractorDirectoryItem {
  id: number;
  name: string;
  registration_no: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  office_region: string | null;
  is_active: boolean;
  composite_score: number;
  rating_label: string;
  rating_count: number;
  contract_count: number;
  completed_count: number;
  total_awarded_lkr: number;
  on_time_extended_rate: number | null;
  average_mobilization_days: number | null;
}

export interface Rating {
  id: number;
  contractor_id: number;
  contract_id: number | null;
  contract_no: string | null;
  project_name: string | null;
  quality_score: number;
  schedule_score: number;
  compliance_score: number;
  safety_score: number;
  weighted_score: number;
  comments: string | null;
  rated_by_id: number | null;
  rated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DimensionScores {
  quality: number | null;
  schedule: number | null;
  compliance: number | null;
  safety: number | null;
}

export interface ContractorMetrics {
  total_contracts: number;
  completed_contracts: number;
  active_contracts: number;
  total_awarded_lkr: number;
  average_awarded_lkr: number;
  on_time_original_rate: number | null;
  on_time_extended_rate: number | null;
  average_mobilization_days: number | null;
  mobilization_score: number | null;
  schedule_score_original: number | null;
  schedule_score_extended: number | null;
}

export interface Scorecard {
  contractor: Contractor;
  composite_score: number;
  subjective_score: number | null;
  objective_score: number | null;
  rating_label: string;
  rating_count: number;
  dimensions: DimensionScores;
  metrics: ContractorMetrics;
  recent_ratings: Rating[];
}

export interface ContractorDetail {
  scorecard: Scorecard;
  contracts: ContractListItem[];
  ratings: Rating[];
}

export interface LookupValue {
  id: number;
  list_type: LookupType;
  value: string;
  sort_order: number;
  is_active: boolean;
}

export interface LookupGroups {
  category: string[];
  priority: string[];
  procurement_method: string[];
  office_region: string[];
  funds: string[];
}

export interface MastersBundle {
  lookups: LookupGroups;
  evaluation_team: EvaluationTeamMember[];
  lookup_records: LookupValue[];
  generated_at: string;
}

export interface RatingInput {
  contract_id?: number | null;
  quality_score: number;
  schedule_score: number;
  compliance_score: number;
  safety_score: number;
  comments?: string | null;
}

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
}
