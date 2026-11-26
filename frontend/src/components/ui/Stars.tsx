import { Star } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Stars({
  value,
  size = 13,
  className,
  showValue = false,
}: {
  value: number;
  size?: number;
  className?: string;
  showValue?: boolean;
}) {
  const normalized = Math.max(0, Math.min(5, value));
  return (
    <span className={cn('inline-flex items-center gap-1', className)} title={`${normalized.toFixed(1)} out of 5`}>
      <span className="inline-flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((index) => {
          const fill = Math.max(0, Math.min(1, normalized - (index - 1)));
          return (
            <span key={index} className="relative inline-block" style={{ width: size, height: size }}>
              <Star size={size} className="absolute inset-0 text-line-strong" strokeWidth={1.5} />
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={size} className="text-gold" fill="currentColor" strokeWidth={1.5} />
              </span>
            </span>
          );
        })}
      </span>
      {showValue && <span className="text-[11px] font-semibold text-ink-soft tabular">{normalized.toFixed(1)}</span>}
    </span>
  );
}

export function StarInput({
  value,
  onChange,
  size = 26,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1" role="radiogroup" aria-label="Score out of five">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          role="radio"
          aria-checked={value === score}
          aria-label={`${score} out of 5`}
          disabled={disabled}
          onClick={() => onChange(score)}
          className={cn(
            'rounded-md p-0.5 transition-transform duration-150 hover:scale-110 disabled:cursor-not-allowed',
            value >= score ? 'text-gold' : 'text-line-strong hover:text-gold',
          )}
        >
          <Star size={size} fill={value >= score ? 'currentColor' : 'none'} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}
