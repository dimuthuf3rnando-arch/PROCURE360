export type Theme = 'light' | 'dark';

interface ThemeSwitchOptions {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  button: HTMLElement | null;
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Animated light/dark switch matching the reference app: a circular clip-path
 * reveal from the toggle button via the View Transitions API, with a CSS fade
 * fallback for browsers that do not support it.
 */
export function switchThemeWithAnimation({
  theme,
  setTheme,
  button,
  onBusyChange,
}: ThemeSwitchOptions): void {
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion) {
    setTheme(next);
    return;
  }

  if (!button || typeof document.startViewTransition !== 'function') {
    onBusyChange?.(true);
    document.documentElement.classList.add('theme-fade');
    setTheme(next);
    window.setTimeout(() => {
      document.documentElement.classList.remove('theme-fade');
      onBusyChange?.(false);
    }, 460);
    return;
  }

  const rect = button.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius =
    Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 24;

  onBusyChange?.(true);
  document.documentElement.classList.add('theme-switching');
  document.documentElement.style.setProperty('--theme-x', `${x}px`);
  document.documentElement.style.setProperty('--theme-y', `${y}px`);
  document.documentElement.style.setProperty('--theme-r', `${radius}px`);

  let transition: { ready: Promise<void>; finished: Promise<void> } | undefined;
  try {
    transition = document.startViewTransition(() => {
      document.documentElement.classList.toggle('dark', next === 'dark');
      document.documentElement.style.colorScheme = next;
    });
  } catch {
    document.documentElement.classList.remove('theme-switching');
    onBusyChange?.(false);
    setTheme(next);
    return;
  }

  transition.ready.catch(() => {});
  const guard = window.setTimeout(() => {
    document.documentElement.classList.remove('theme-switching');
    onBusyChange?.(false);
  }, 1400);

  transition.finished.finally(() => {
    window.clearTimeout(guard);
    document.documentElement.classList.remove('theme-switching');
    setTheme(next);
    onBusyChange?.(false);
  });
}
