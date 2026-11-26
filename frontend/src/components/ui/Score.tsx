import { cn } from '../../lib/utils';

export function ScoreRing({
  score,
  size = 84,
  strokeWidth = 7,
  label,
  sublabel,
  className,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  className?: string;
}) {
  const safeScore = Math.max(0, Math.min(5, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safeScore / 5) * circumference;
  const color = safeScore >= 4.2 ? 'var(--forest)' : safeScore >= 3.5 ? 'var(--gold)' : safeScore >= 2.8 ? 'var(--amber)' : 'var(--danger)';

  return (
    <div className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-xl font-semibold leading-none text-ink tabular">{safeScore.toFixed(1)}</span>
        {label && <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>}
        {sublabel && <span className="text-[9px] text-muted">{sublabel}</span>}
      </div>
    </div>
  );
}

export function PercentRing({
  percent,
  size = 118,
  strokeWidth = 8,
  label,
  sublabel,
  tone = 'forest',
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  tone?: 'forest' | 'amber' | 'danger' | 'info';
}) {
  const safe = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;
  const color = {
    forest: 'var(--forest)',
    amber: 'var(--amber)',
    danger: 'var(--danger)',
    info: 'var(--info)',
  }[tone];

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-[26px] font-semibold leading-none text-ink tabular">{Math.round(safe)}%</span>
        {label && <span className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-muted">{label}</span>}
        {sublabel && <span className="mt-0.5 text-[9px] text-muted">{sublabel}</span>}
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'forest',
  className,
  height = 'h-1.5',
  animate = true,
}: {
  value: number;
  max?: number;
  tone?: 'forest' | 'amber' | 'danger' | 'info' | 'gold';
  className?: string;
  height?: string;
  animate?: boolean;
}) {
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const color = {
    forest: 'bg-forest',
    amber: 'bg-amber',
    danger: 'bg-danger',
    info: 'bg-info',
    gold: 'bg-gold',
  }[tone];
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-surface-3', height, className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-smooth', color, animate && 'animate-grow-bar origin-left')}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
