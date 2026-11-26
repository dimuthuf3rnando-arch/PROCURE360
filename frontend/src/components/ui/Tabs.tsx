import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  variant?: 'underline' | 'pill';
  className?: string;
}

export function Tabs({ items, value, onChange, variant = 'underline', className }: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label="View sections"
      className={cn(
        variant === 'underline'
          ? 'flex gap-1 overflow-x-auto border-b border-line no-scrollbar'
          : 'inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 whitespace-nowrap text-[12.5px] font-medium transition-all duration-200',
              variant === 'underline'
                ? cn(
                    '-mb-px border-b-2 px-3.5 py-3',
                    active
                      ? 'border-forest text-forest'
                      : 'border-transparent text-muted hover:border-line-strong hover:text-ink',
                  )
                : cn(
                    'rounded-lg px-3 py-1.5',
                    active
                      ? 'bg-surface text-ink shadow-sm animate-fade-in'
                      : 'text-muted hover:text-ink',
                  ),
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular',
                  active ? 'bg-forest-tint text-forest' : 'bg-surface text-muted',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
