import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  warning?: boolean;
  order?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  required,
  hint,
  error,
  warning,
  order,
  children,
  className,
  action,
}: FormFieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="field-label mb-0">
          {order && (
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-normal text-muted">
              {order}
            </span>
          )}
          <span>{label}</span>
          {required && <span className="text-danger" aria-hidden>*</span>}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="mt-1.5 text-[11.5px] font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className={cn('field-hint', warning && 'font-medium text-amber')}>{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    if (rest.type === 'date') {
      return <DateInput invalid={invalid} className={className} {...rest} />;
    }
    return <input ref={ref} aria-invalid={invalid || undefined} className={cn('field-input', className)} {...rest} />;
  },
);

function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Themed date picker. Keeps the native input's onChange(event.target.value) API. */
function DateInput({
  value,
  onChange,
  disabled,
  invalid,
  className,
  id,
  type: _type,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 268 });
  const selected = typeof value === 'string' ? value : '';
  const parsed = parseISODate(selected);
  const initial = parsed ?? new Date();
  const [view, setView] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const emit = (next: string) => {
    setOpen(false);
    if (onChange) {
      onChange({ target: { value: next } } as unknown as ChangeEvent<HTMLInputElement>);
    }
  };

  const openPicker = () => {
    const base = parsed ?? new Date();
    setView(new Date(base.getFullYear(), base.getMonth(), 1));
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.max(rect.width, 268);
      const left = Math.min(rect.left, window.innerWidth - width - 8);
      let top = rect.bottom + 6;
      if (top + 320 > window.innerHeight) top = Math.max(8, rect.top - 320 - 6);
      setPos({ top, left, width });
    }
    setOpen((current) => !current);
  };

  const shiftMonth = (offset: number) => {
    setView((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const today = new Date();
  const todayISO = toISODate(today);
  const firstDay = view.getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: Array<{ date: Date; iso: string; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(view.getFullYear(), view.getMonth(), i - firstDay + 1);
    cells.push({
      date,
      iso: toISODate(date),
      inMonth: date.getMonth() === view.getMonth(),
    });
  }

  const display = parsed
    ? parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        ref={triggerRef}
        {...(rest as any)}
        id={id}
        type="button"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPicker}
        className={cn(
          'field-input flex min-h-[42px] w-full items-center justify-between gap-2 text-left',
          invalid && 'border-danger',
          open && 'border-forest',
          className,
        )}
      >
        <span className={cn('min-w-0 truncate', !display && 'text-muted')}>
          {display || 'Select a date'}
        </span>
        <CalendarDays size={16} className="pointer-events-none shrink-0 text-muted" aria-hidden />
      </button>

      {open
        ? createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Choose a date"
            className="rounded-xl border border-line bg-surface p-2.5 shadow-lift animate-slide-down"
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 100 }}
          >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Previous month"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="font-serif text-[13px] font-semibold text-ink">
              {MONTHS[view.getMonth()]} {view.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Next month"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((day) => (
              <span key={day} className="py-1 text-center text-[9.5px] font-semibold uppercase tracking-wide text-muted">
                {day}
              </span>
            ))}
            {cells.map((cell) => {
              const isSelected = cell.iso === selected;
              const isToday = cell.iso === todayISO;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => emit(cell.iso)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg text-[12px] tabular transition-colors',
                    isSelected
                      ? 'bg-forest font-semibold text-white'
                      : isToday
                        ? 'bg-forest-tint font-semibold text-forest'
                        : cell.inMonth
                          ? 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                          : 'text-muted/50 hover:bg-surface-2',
                   )}
                >
                  {cell.date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              onClick={() => emit('')}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => emit(todayISO)}
              className="rounded-lg bg-forest-tint px-2.5 py-1 text-[11px] font-semibold text-forest transition-colors hover:bg-forest hover:text-white"
            >
              Today
            </button>
          </div>
        </div>
      ,
      document.body,
    )
    : null}
    </div>
  );
}

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 3, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn('field-input resize-y leading-relaxed', className)}
      {...rest}
    />
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  invalid?: boolean;
  children?: ReactNode;
}

/**
 * Themed dropdown. Native <select> popups are rendered by the browser and
 * cannot be styled, so this renders a button + styled popover while keeping the
 * same onChange(event.target.value) API as a native select.
 */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { options, placeholder, invalid, className, children, value, disabled, onChange, id, ...rest },
  ref,
) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const selected = String(value ?? '');
  const selectedOption = options.find((option) => option.value === selected);
  const display = selectedOption?.label ?? (selected ? selected : placeholder ?? 'Select an option');

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (next: string) => {
    setOpen(false);
    if (onChange) {
      onChange({ target: { value: next } } as unknown as ChangeEvent<HTMLSelectElement>);
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        {...(rest as any)}
        ref={ref}
        id={id}
        type="button"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'field-input flex min-h-[42px] w-full items-center justify-between gap-2 text-left',
          invalid && 'border-danger',
          open && 'border-forest',
          className,
        )}
      >
        <span className={cn('min-w-0 truncate', !selectedOption && !selected && 'text-muted')}>{display}</span>
        <ChevronDown
          size={16}
          className={cn('pointer-events-none shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-60 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-lift animate-slide-down scrollbar-thin"
        >
          {placeholder !== undefined && (
            <button
              type="button"
              role="option"
              aria-selected={selected === ''}
              onClick={() => choose('')}
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
                selected === '' ? 'bg-forest-tint font-semibold text-forest' : 'text-ink-soft hover:bg-surface-2 hover:text-ink',
              )}
            >
              <span className="truncate">{placeholder}</span>
              {selected === '' && <Check size={14} strokeWidth={2.5} />}
            </button>
          )}
          {options.map((option) => {
            const isSelected = option.value === selected;
            return (
              <button
                key={`${option.value}-${option.label}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => choose(option.value)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
                  isSelected ? 'bg-forest-tint font-semibold text-forest' : 'text-ink-soft hover:bg-surface-2 hover:text-ink',
                )}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && <Check size={14} strokeWidth={2.5} />}
              </button>
            );
          })}
          {children}
        </div>
      )}
    </div>
  );
});

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

export function Toggle({ checked, onChange, label, description, disabled, id }: ToggleProps) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className="flex items-start gap-3">
      <button
        id={inputId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-forest' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'inline-flex h-[16px] w-[16px] items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-[19px]' : 'translate-x-[3px]',
          )}
        >
          {checked && <Check size={10} className="text-forest" strokeWidth={3} />}
        </span>
      </button>
      {(label || description) && (
        <label htmlFor={inputId} className="cursor-pointer select-none">
          {label && <span className="block text-[12.5px] font-medium leading-snug text-ink">{label}</span>}
          {description && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{description}</span>}
        </label>
      )}
    </div>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className, ariaLabel = 'Search' }: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="field-input py-2.5 pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:bg-surface-2 hover:text-ink"
          aria-label="Clear search"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
