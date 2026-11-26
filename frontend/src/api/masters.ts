import { api, queryString } from './client';
import type {
  EvaluationTeamMember,
  LookupGroups,
  LookupType,
  LookupValue,
  MastersBundle,
} from '../types/api';

export interface TeamMemberInput {
  name: string;
  designation?: string | null;
  display_order?: number;
  is_active?: boolean;
}

export interface LookupInput {
  list_type: LookupType;
  value: string;
  sort_order?: number;
}

export const mastersApi = {
  bundle(): Promise<MastersBundle> {
    return api.get<MastersBundle>('/masters/bundle');
  },
  lookups(): Promise<LookupGroups> {
    return api.get<LookupGroups>('/masters/lookups');
  },
  team(includeInactive = false): Promise<EvaluationTeamMember[]> {
    return api.get<EvaluationTeamMember[]>(
      `/masters/evaluation-team${queryString({ include_inactive: includeInactive || undefined })}`,
    );
  },
  allTeam(): Promise<EvaluationTeamMember[]> {
    return api.get<EvaluationTeamMember[]>('/masters/evaluation-team/all');
  },
  createTeamMember(payload: TeamMemberInput): Promise<EvaluationTeamMember> {
    return api.post<EvaluationTeamMember>('/masters/evaluation-team', payload);
  },
  updateTeamMember(id: number, payload: Partial<TeamMemberInput>): Promise<EvaluationTeamMember> {
    return api.patch<EvaluationTeamMember>(`/masters/evaluation-team/${id}`, payload);
  },
  deactivateTeamMember(id: number): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/masters/evaluation-team/${id}`);
  },
  lookupRecords(): Promise<LookupValue[]> {
    return api.get<LookupValue[]>('/masters/lookup-records');
  },
  createLookup(payload: LookupInput): Promise<LookupValue> {
    return api.post<LookupValue>('/masters/lookups', payload);
  },
  updateLookup(id: number, payload: { value?: string; sort_order?: number; is_active?: boolean }): Promise<LookupValue> {
    return api.patch<LookupValue>(`/masters/lookup-records/${id}`, payload);
  },
  deactivateLookup(id: number): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/masters/lookup-records/${id}`);
  },
  lookupTypes(): Promise<Array<{ value: LookupType; label: string }>> {
    return api.get<Array<{ value: LookupType; label: string }>>('/masters/lookup-types');
  },
};
