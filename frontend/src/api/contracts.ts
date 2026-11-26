import { api, queryString } from './client';
import type {
  AuditLog,
  Contract,
  ContractActionResponse,
  ContractFields,
  ContractListItem,
  Handoff,
  Page,
  PublicStats,
} from '../types/api';

export interface ContractListParams {
  q?: string;
  status?: string;
  owner_role?: string;
  category?: string;
  office_region?: string;
  procurement_method?: string;
  priority?: string;
  funds?: string;
  contractor_id?: number;
  mine?: boolean;
  received_from?: string;
  received_to?: string;
  sort?: string;
  direction?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

export interface ContractCreateInput extends Partial<ContractFields> {
  admin_override?: boolean;
  override_reason?: string | null;
}

export interface ContractUpdateInput extends Partial<ContractFields> {
  version: number;
  reason?: string | null;
  admin_override?: boolean;
  override_reason?: string | null;
}

export interface TransitionInput {
  version: number;
  reason?: string | null;
  admin_override?: boolean;
  override_reason?: string | null;
  /** QS only: 'PC_ENGINEER' or 'SUPPLY_OFFICER'. */
  target_role?: 'PC_ENGINEER' | 'SUPPLY_OFFICER' | null;
}

export const contractsApi = {
  list(params: ContractListParams = {}): Promise<Page<ContractListItem>> {
    return api.get<Page<ContractListItem>>(`/contracts${queryString({ ...params, mine: params.mine || undefined })}`);
  },
  get(id: number): Promise<Contract> {
    return api.get<Contract>(`/contracts/${id}`);
  },
  create(payload: ContractCreateInput): Promise<Contract> {
    return api.post<Contract>('/contracts', payload);
  },
  update(id: number, payload: ContractUpdateInput): Promise<Contract> {
    return api.patch<Contract>(`/contracts/${id}`, payload);
  },
  forward(id: number, payload: TransitionInput): Promise<ContractActionResponse> {
    return api.post<ContractActionResponse>(`/contracts/${id}/forward`, payload);
  },
  returnForCorrection(id: number, payload: TransitionInput): Promise<ContractActionResponse> {
    return api.post<ContractActionResponse>(`/contracts/${id}/return`, payload);
  },
  complete(id: number, payload: TransitionInput): Promise<ContractActionResponse> {
    return api.post<ContractActionResponse>(`/contracts/${id}/complete`, payload);
  },
  handoffs(id: number): Promise<Handoff[]> {
    return api.get<Handoff[]>(`/contracts/${id}/handoffs`);
  },
  audit(id: number): Promise<AuditLog[]> {
    return api.get<AuditLog[]>(`/contracts/${id}/audit`);
  },
  export(params: ContractListParams = {}): Promise<void> {
    return api.download(
      `/contracts/export${queryString({ ...params, mine: params.mine || undefined })}`,
      'PROCURE360_contracts.xlsx',
    );
  },
  publicStats(): Promise<PublicStats> {
    return api.get<PublicStats>('/public/stats');
  },
};
