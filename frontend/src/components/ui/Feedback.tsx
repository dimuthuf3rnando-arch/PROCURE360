import { Loader2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin text-forest', className)} />;
}

export function PageLoader({ label = 'Preparing your workspace…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-tint">
        <span className="absolute inset-0 animate-pulse-soft rounded-2xl bg-forest-soft" />
        <Spinner size={22} />
      </div>
      <p className="text-[12.5px] font-medium text-muted">{label}</p>
    </div>
  );
}

export function LoadingCards({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card p-5">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-4 h-7 w-32" />
          <div className="skeleton mt-3 h-2.5 w-full" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <div className="skeleton h-3 w-40" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-6 border-b border-line px-5 py-4 last:border-0">
          <div className="skeleton h-9 w-9 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-2.5 w-1/5" />
          </div>
          <div className="skeleton hidden h-6 w-24 sm:block" />
          <div className="skeleton h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center', className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">
        <Icon size={24} strokeWidth={1.6} />
      </div>
      <h3 className="font-serif text-xl font-semibold text-ink">{title}</h3>
      {description && <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'We could not load this view',
  description,
  onRetry,
  action,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <span className="font-serif text-2xl">!</span>
      </div>
      <h3 className="font-serif text-xl font-semibold text-ink">{title}</h3>
      {description && <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-muted">{description}</p>}
      <div className="mt-5 flex gap-2">
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn btn-secondary">
            Try again
          </button>
        )}
        {action}
      </div>
    </div>
  );
}
