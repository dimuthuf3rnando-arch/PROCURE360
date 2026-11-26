import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="font-serif text-[22px] font-semibold leading-tight text-ink">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function InfoRow({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-5 py-2.5', className)}>
      <span className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">{label}</span>
      <span className="text-right text-[12.5px] font-medium text-ink">{value}</span>
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="mt-1 truncate text-[13px] font-medium text-ink">{children}</dd>
    </div>
  );
}
