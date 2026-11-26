export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function useDebouncedValue<T>(value: T, delay = 350): T {
  // Kept in a hook file under lib for colocated imports; see src/lib/hooks.ts.
  return value;
}
