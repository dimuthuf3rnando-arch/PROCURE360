import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { showSystemNotification } from '../lib/notifications';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

interface ToastContextValue {
  toast: ToastApi;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let sequence = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, description?: string) => {
      const id = ++sequence;
      setItems((current) => [...current.slice(-3), { id, kind, title, description }]);
      window.setTimeout(() => dismiss(id), kind === 'error' ? 7500 : 4800);
    },
    [dismiss],
  );

  const toast: ToastApi = {
    success: (title, description) => push('success', title, description),
    error: (title, description) => {
      push('error', title, description);
      showSystemNotification(title, description, `procure360-error-${Date.now()}`);
    },
    info: (title, description) => {
      push('info', title, description);
      showSystemNotification(title, description, `procure360-info-${Date.now()}`);
    },
  };

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-[72px] z-[120] flex w-[min(92vw,380px)] flex-col gap-2.5 no-print"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onClose={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const palette =
    item.kind === 'success'
      ? 'border-forest-soft bg-surface text-ink'
      : item.kind === 'error'
        ? 'border-danger bg-surface text-ink'
        : 'border-line bg-surface text-ink';
  const icon =
    item.kind === 'success' ? (
      <CheckCircle2 size={18} className="text-forest" />
    ) : item.kind === 'error' ? (
      <TriangleAlert size={18} className="text-danger" />
    ) : (
      <Info size={18} className="text-info" />
    );

  return (
    <div
      className={cn(
        'pointer-events-auto flex gap-3 rounded-2xl border p-3.5 shadow-lift animate-slide-in-right',
        palette,
      )}
      role="status"
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-md p-0.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
