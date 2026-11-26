import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  className?: string;
}

function pageList(page: number, pages: number): Array<number | 'gap'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const values = new Set<number>([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((value) => values.add(value));
  if (page >= pages - 2) [pages - 3, pages - 2, pages - 1].forEach((value) => values.add(value));
  const sorted = [...values].filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b);
  const output: Array<number | 'gap'> = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) output.push('gap');
    output.push(value);
  });
  return output;
}

export function Pagination({ page, pages, total, pageSize, onChange, className }: PaginationProps) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className={cn('flex flex-col items-center justify-between gap-3 sm:flex-row', className)}>
      <p className="text-[11.5px] text-muted">
        Showing <span className="font-semibold text-ink-soft">{start}–{end}</span> of{' '}
        <span className="font-semibold text-ink-soft">{total.toLocaleString()}</span> records
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft size={15} />
        </button>
        {pageList(page, pages).map((value, index) =>
          value === 'gap' ? (
            <span key={`gap-${index}`} className="px-1 text-xs text-muted">
              …
            </span>
          ) : (
            <button
              key={value}
              type="button"
              onClick={() => onChange(value)}
              className={cn(
                'flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition-all',
                value === page
                  ? 'border-forest bg-forest text-white'
                  : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:bg-surface-2',
              )}
              aria-current={value === page ? 'page' : undefined}
            >
              {value}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
