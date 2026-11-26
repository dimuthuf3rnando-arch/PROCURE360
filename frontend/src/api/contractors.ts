import { api, queryString } from './client';
import type {
  Contractor,
  ContractorDetail,
  ContractorDirectoryItem,
  Rating,
  RatingInput,
  Scorecard,
} from '../types/api';

export interface ContractorListParams {
  q?: string;
  include_inactive?: boolean;
  sort?: 'score' | 'name' | 'volume' | 'contracts' | 'on_time';
  direction?: 'asc' | 'desc';
}

export interface ContractorInput {
  name: string;
  registration_no?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  office_region?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export const contractorsApi = {
  list(params: ContractorListParams = {}): Promise<ContractorDirectoryItem[]> {
    return api.get<ContractorDirectoryItem[]>(
      `/contractors${queryString({
        ...params,
        include_inactive: params.include_inactive || undefined,
      })}`,
    );
  },
  get(id: number): Promise<ContractorDetail> {
    return api.get<ContractorDetail>(`/contractors/${id}`);
  },
  create(payload: ContractorInput): Promise<Contractor> {
    return api.post<Contractor>('/contractors', payload);
  },
  update(id: number, payload: Partial<ContractorInput>): Promise<Contractor> {
    return api.patch<Contractor>(`/contractors/${id}`, payload);
  },
  deactivate(id: number): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/contractors/${id}`);
  },
  scorecard(id: number): Promise<Scorecard> {
    return api.get<Scorecard>(`/contractors/${id}/scorecard`);
  },
  rate(id: number, payload: RatingInput): Promise<Rating> {
    return api.post<Rating>(`/contractors/${id}/ratings`, payload);
  },
  removeRating(id: number, ratingId: number): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/contractors/${id}/ratings/${ratingId}`);
  },
};
