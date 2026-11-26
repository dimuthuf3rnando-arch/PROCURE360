export type SystemPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function systemNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    'Notification' in window
  );
}

export function systemPermission(): SystemPermission {
  if (!systemNotificationSupported()) return 'unsupported';
  return Notification.permission as SystemPermission;
}

export async function requestSystemPermission(): Promise<SystemPermission> {
  if (!systemNotificationSupported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result as SystemPermission;
  } catch {
    return 'denied';
  }
}

export function showSystemNotification(title: string, body?: string, tag?: string): boolean {
  if (!systemNotificationSupported() || Notification.permission !== 'granted') return false;
  try {
    new Notification(title, {
      body: body || undefined,
      tag: tag || 'procure360',
      icon: '/favicon.svg',
    });
    return true;
  } catch (error) {
    // Some browsers reject optional icon paths. Retry without extras.
    try {
      new Notification(title, { body: body || undefined, tag: tag || 'procure360' });
      return true;
    } catch (retryError) {
      console.warn('[notifications] Windows notification failed:', error, retryError);
      return false;
    }
  }
}
