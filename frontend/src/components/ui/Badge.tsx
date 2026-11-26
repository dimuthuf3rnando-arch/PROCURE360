import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { statusLabel, statusTone, toneClasses, type StatusTone } from '../../lib/format';
import type { ContractStatus } from '../../types/api';

interface BadgeProps {
  tone?: StatusTone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
  icon?: ReactNode;
}

export function Badge({ tone = 'neutral', children, dot = false, className, icon }: BadgeProps) {
  return (
    <span className={cn('chip', toneClasses(tone), className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {icon}
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: ContractStatus | string;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn('chip', toneClasses(statusTone(status)), className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label ?? statusLabel(status)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  if (!priority) return null;
  const normalized = priority.toLowerCase();
  const tone: StatusTone = normalized.includes('urgent') || normalized.includes('high')
    ? 'danger'
    : normalized.includes('medium') || normalized.includes('normal')
      ? 'amber'
      : 'neutral';
  return (
    <Badge tone={tone} className="px-2 py-0.5 text-[10px]">
      {priority}
    </Badge>
  );
}
