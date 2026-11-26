import { api, queryString } from './client';
import type {
  AuditLog,
  AuditSummary,
  Dashboard,
  Handoff,
  MyWork,
  Page,
} from '../types/api';

export const dashboardApi = {
  get(): Promise<Dashboard> {
    return api.get<Dashboard>('/analytics/dashboard');
  },
  myWork(): Promise<MyWork> {
    return api.get<MyWork>('/analytics/my-work');
  },
};

export interface AuditLogParams {
  contract_id?: number;
  user_id?: number;
  action?: string;
  field_name?: string;
  admin_only?: boolean;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface HandoffParams {
  contract_id?: number;
  action?: string;
  admin_only?: boolean;
  page?: number;
  page_size?: number;
}

export const auditApi = {
  summary(): Promise<AuditSummary> {
    return api.get<AuditSummary>('/audit/summary');
  },
  logs(params: AuditLogParams = {}): Promise<Page<AuditLog>> {
    return api.get<Page<AuditLog>>(
      `/audit/logs${queryString({ ...params, admin_only: params.admin_only || undefined })}`,
    );
  },
  handoffs(params: HandoffParams = {}): Promise<Page<Handoff>> {
    return api.get<Page<Handoff>>(
      `/audit/handoffs${queryString({ ...params, admin_only: params.admin_only || undefined })}`,
    );
  },
};
