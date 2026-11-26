import { cn } from '../../lib/utils';
import { initials } from '../../lib/format';

const palettes = [
  'bg-forest-tint text-forest',
  'bg-amber-tint text-amber',
  'bg-info-tint text-info',
  'bg-gold-soft text-gold',
  'bg-surface-3 text-ink-soft',
];

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) % 997;
  }
  return result;
}

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClass = {
    xs: 'h-6 w-6 text-[9px]',
    sm: 'h-8 w-8 text-[10.5px]',
    md: 'h-10 w-10 text-xs',
    lg: 'h-14 w-14 text-base',
  }[size];
  const palette = palettes[hash(name || '?') % palettes.length];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide',
        sizeClass,
        palette,
        className,
      )}
      title={name ?? undefined}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
