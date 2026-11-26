import { api, queryString } from './client';
import type { AppNotification, Page } from '../types/api';

export interface NotificationParams {
  unread_only?: boolean;
  kind?: string;
  page?: number;
  page_size?: number;
}

export const notificationsApi = {
  list(params: NotificationParams = {}): Promise<Page<AppNotification>> {
    return api.get<Page<AppNotification>>(
      `/notifications${queryString(params as unknown as Record<string, string | number | boolean | undefined>)}`,
    );
  },
  unreadCount(): Promise<{ count: number }> {
    return api.get<{ count: number }>('/notifications/unread-count');
  },
  markRead(id: number): Promise<AppNotification> {
    return api.post<AppNotification>(`/notifications/${id}/read`);
  },
  markAllRead(): Promise<{ message: string }> {
    return api.post<{ message: string }>('/notifications/read-all');
  },
};
