import { api, queryString } from './client';
import type { Role, User } from '../types/api';

export interface UserInput {
  full_name: string;
  email: string;
  role: Role;
  designation?: string | null;
  phone?: string | null;
  is_active?: boolean;
}

export interface UserCreateInput extends UserInput {
  password: string;
}

export interface UserUpdateInput extends Partial<UserInput> {
  password?: string;
}

export const usersApi = {
  list(includeInactive = true): Promise<User[]> {
    return api.get<User[]>(`/users${queryString({ include_inactive: includeInactive })}`);
  },
  create(payload: UserCreateInput): Promise<User> {
    return api.post<User>('/users', payload);
  },
  update(id: number, payload: UserUpdateInput): Promise<User> {
    return api.patch<User>(`/users/${id}`, payload);
  },
  deactivate(id: number): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/users/${id}`);
  },
};
