import { useEffect, useRef, useState } from 'react';

export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useAnimatedNumber(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const previous = useRef(0);

  useEffect(() => {
    const from = previous.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previous.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

export function useCountUp(target: number, duration = 900, decimals = 0): string {
  const [value, setValue] = useState(0);
  const previous = useRef(0);

  useEffect(() => {
    const from = previous.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previous.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · PROCURE360` : 'PROCURE360 · Procurement Register';
    return () => {
      document.title = 'PROCURE360 · Procurement Register';
    };
  }, [title]);
}

export function useClickOutside<T extends HTMLElement>(
  onOutside: () => void,
): React.RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOutside]);
  return ref;
}
