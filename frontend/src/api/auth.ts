import { api } from './client';
import type {
  ChangePasswordInput,
  DemoAccountsResponse,
  LoginResponse,
  User,
} from '../types/api';

export const authApi = {
  login(email: string, password: string): Promise<LoginResponse> {
    return api.post<LoginResponse>('/auth/login', { email, password });
  },
  me(): Promise<User> {
    return api.get<User>('/auth/me');
  },
  demoAccounts(): Promise<DemoAccountsResponse> {
    return api.get<DemoAccountsResponse>('/auth/demo-accounts');
  },
  changePassword(payload: ChangePasswordInput): Promise<{ message: string }> {
    return api.post<{ message: string }>('/auth/change-password', payload);
  },
};
