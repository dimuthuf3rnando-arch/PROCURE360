import { cn } from '../../lib/utils';
import type { AppNotification } from '../../types/api';

interface NotificationItemProps {
  item: AppNotification;
  onOpen: (item: AppNotification) => void;
}

export function NotificationItem({ item, onOpen }: NotificationItemProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        'flex w-full flex-col gap-1 border-b border-line px-4 py-3 text-left transition-colors hover:bg-surface-2',
        !item.is_read && 'bg-forest-tint',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-semibold text-ink">{item.title}</span>
        {!item.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-forest" />}
      </span>
      {item.body && <span className="line-clamp-2 text-[10.5px] leading-snug text-muted">{item.body}</span>}
      <span className="text-[9.5px] text-muted">{new Date(item.created_at).toLocaleString()}</span>
    </button>
  );
}