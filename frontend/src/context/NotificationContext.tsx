import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { notificationsApi } from '../api/notifications';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import {
  requestSystemPermission,
  showSystemNotification,
  systemPermission,
  type SystemPermission,
} from '../lib/notifications';
import type { AppNotification } from '../types/api';

interface NotificationContextValue {
  items: AppNotification[];
  unread: number;
  permission: SystemPermission;
  loading: boolean;
  refresh: () => void;
  enableAlerts: () => Promise<SystemPermission>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  notify: (title: string, body?: string, tag?: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [permission, setPermission] = useState<SystemPermission>(systemPermission());
  const [loading, setLoading] = useState(false);
  const seen = useRef<Set<number>>(new Set());
  const initialised = useRef(false);

  const load = useCallback(
    async (announce: boolean) => {
      if (!user) return;
      setLoading(true);
      try {
        const [page, count] = await Promise.all([
          notificationsApi.list({ page_size: 8 }),
          notificationsApi.unreadCount(),
        ]);
        const cutoff = Date.now() - 10 * 60 * 1000;
        setItems(
          page.items.filter(
            (item) => !item.is_read || !item.read_at || new Date(item.read_at).getTime() > cutoff,
          ),
        );
        setUnread(count.count);
        if (initialised.current && announce) {
          page.items
            .filter((item) => !seen.current.has(item.id) && !item.is_read)
            .forEach((item) =>
              showSystemNotification(item.title, item.body || undefined, `procure360-${item.id}`),
            );
        }
        page.items.forEach((item) => seen.current.add(item.id));
        initialised.current = true;
      } catch {
        /* polling is best-effort */
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (!user) {
      setItems([]);
      setUnread(0);
      seen.current.clear();
      initialised.current = false;
      return;
    }
    void load(false);
    const interval = window.setInterval(() => void load(true), 20000);
    return () => window.clearInterval(interval);
  }, [user, load]);

  const enableAlerts = useCallback(async () => {
    const next = await requestSystemPermission();
    setPermission(next);
    if (next === 'granted') {
      showSystemNotification('Notifications enabled', 'PROCURE360 will alert you about handoffs and warnings.');
    } else if (next === 'denied') {
      toast.error(
        'Notifications are blocked',
        'Allow notifications for this site in your browser settings, then reload the page.',
      );
    } else if (next === 'unsupported') {
      toast.info(
        'Use HTTPS for notifications',
        'Open https://10.187.233.116:8443 and accept the certificate warning to enable Windows notifications.',
      );
    }
    return next;
  }, [toast]);

  const markRead = useCallback(
    async (id: number) => {
      const wasUnread = items.some((item) => item.id === id && !item.is_read);
      try {
        const updated = await notificationsApi.markRead(id);
        setItems((current) => current.map((item) => (item.id === id ? updated : item)));
        if (wasUnread) setUnread((current) => Math.max(0, current - 1));
      } catch {
        /* ignore */
      }
    },
    [items],
  );

  const markAllRead = useCallback(async () => {
    try {
      await notificationsApi.markAllRead();
      const readAt = new Date().toISOString();
      setItems((current) =>
        current.map((item) => ({ ...item, is_read: true, read_at: item.read_at ?? readAt })),
      );
      setUnread(0);
    } catch {
      /* ignore */
    }
  }, []);

  const notify = useCallback((title: string, body?: string, tag?: string) => {
    showSystemNotification(title, body, tag);
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      items,
      unread,
      permission,
      loading,
      refresh: () => void load(true),
      enableAlerts,
      markRead,
      markAllRead,
      notify,
    }),
    [items, unread, permission, loading, load, enableAlerts, markRead, markAllRead, notify],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationProvider');
  return context;
}
