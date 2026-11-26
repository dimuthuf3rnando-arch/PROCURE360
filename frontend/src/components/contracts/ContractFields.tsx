import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronsUpDown, Search, Users2, X } from 'lucide-react';
import type { EvaluationTeamMember, LookupGroups } from '../../types/api';
import type { FieldMeta } from '../../lib/fields';
import { PERIOD_UNITS, fieldLabel } from '../../lib/fields';
import { cn } from '../../lib/utils';
import { formatDate, formatLKR, formatNumber } from '../../lib/format';
import { FormField, Input, Select, Textarea, Toggle } from '../ui/Field';
import { contractorsApi, type ContractorInput } from '../../api/contractors';
import { useToast } from '../../context/ToastContext';
import { Button } from '../ui/Button';
import { ApiError } from '../../api/client';

export interface FieldControlProps {
  meta: FieldMeta;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  lookups: LookupGroups;
  team?: EvaluationTeamMember[];
  contractors?: Array<{ id: number; name: string; registration_no?: string | null; is_active?: boolean }>;
  contractorFallbackName?: string;
  onContractorCreated?: (contractor: {
    id: number;
    name: string;
    registration_no?: string | null;
    is_active?: boolean;
  }) => void;
  disabled?: boolean;
  error?: string;
  warning?: string;
  compact?: boolean;
  required?: boolean;
}

const LOOKUP_PLACEHOLDERS: Record<string, string> = {
  category: 'Select a category',
  priority: 'Select a priority',
  procurement_method: 'Select a procurement method',
  office_region: 'Select an office or region',
  funds: 'Select a fund source',
};

export function ContractFieldControl({
  meta,
  value,
  onChange,
  lookups,
  team = [],
  contractors = [],
  contractorFallbackName,
  onContractorCreated,
  disabled,
  error,
  warning,
  compact,
  required,
}: FieldControlProps) {
  const id = `field-${meta.key}`;
  const options = meta.optionsKey
    ? (lookups[meta.optionsKey] ?? []).map((option) => ({ value: option, label: option }))
    : [];

  let control: React.ReactNode;

  switch (meta.kind) {
    case 'textarea':
      control = (
        <Textarea
          id={id}
          value={(value as string) ?? ''}
          disabled={disabled}
          invalid={Boolean(error)}
          rows={compact ? 2 : 3}
          onChange={(event) => onChange(meta.key, event.target.value)}
          placeholder="Add notes…"
        />
      );
      break;
    case 'select':
      control = (
        <Select
          id={id}
          value={(value as string) ?? ''}
          disabled={disabled}
          invalid={Boolean(error)}
          placeholder={LOOKUP_PLACEHOLDERS[meta.optionsKey ?? ''] ?? 'Select an option'}
          options={options}
          onChange={(event) => onChange(meta.key, event.target.value)}
        />
      );
      break;
    case 'period_unit':
      control = (
        <Select
          id={id}
          value={(value as string) ?? ''}
          disabled={disabled}
          invalid={Boolean(error)}
          placeholder="Unit"
          options={PERIOD_UNITS}
          onChange={(event) => onChange(meta.key, event.target.value)}
        />
      );
      break;
    case 'boolean':
      control = (
        <div className={cn('flex min-h-[42px] items-center rounded-xl border border-line bg-surface px-3.5', disabled && 'bg-surface-2')}>
          <Toggle
            id={id}
            checked={value === true}
            onChange={(checked) => onChange(meta.key, checked)}
            disabled={disabled}
            label={value === true ? 'Yes' : value === false ? 'No' : 'Not recorded'}
          />
        </div>
      );
      break;
    case 'date':
      control = (
        <Input
          id={id}
          type="date"
          value={(value as string) ?? ''}
          disabled={disabled}
          invalid={Boolean(error)}
          onChange={(event) => onChange(meta.key, event.target.value || null)}
        />
      );
      break;
    case 'currency':
    case 'number':
      control = (
        <div className="relative">
          {meta.kind === 'currency' && (
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted">
              LKR
            </span>
          )}
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            min={0}
            step={meta.kind === 'currency' ? '0.01' : '1'}
            value={value === null || value === undefined ? '' : String(value)}
            disabled={disabled}
            invalid={Boolean(error)}
            className={cn(meta.kind === 'currency' && 'pl-12', 'tabular')}
            onChange={(event) => onChange(meta.key, event.target.value === '' ? null : Number(event.target.value))}
            placeholder={meta.kind === 'currency' ? '0.00' : '0'}
          />
        </div>
      );
      break;
    case 'team_multiselect':
      control = (
        <BecMemberPicker
          id={id}
          members={team}
          selected={(value as number[]) ?? []}
          onChange={(ids) => onChange(meta.key, ids)}
          disabled={disabled}
          invalid={Boolean(error)}
          label={meta.key === 'doc_evaluation_member_ids' ? 'document evaluators' : 'BEC members'}
          placeholder={
            meta.key === 'doc_evaluation_member_ids'
              ? 'Select document evaluators…'
              : 'Select BEC members…'
          }
        />
      );
      break;
    case 'contractor':
      control = (
        <ContractorPicker
          id={id}
          contractors={contractors}
          value={value === null || value === undefined ? null : Number(value)}
          onChange={(next) => onChange(meta.key, next)}
          disabled={disabled}
          invalid={Boolean(error)}
          fallbackName={contractorFallbackName}
          onContractorCreated={onContractorCreated}
        />
      );
      break;
    default:
      control = (
        <Input
          id={id}
          value={(value as string) ?? ''}
          disabled={disabled}
          invalid={Boolean(error)}
          onChange={(event) => onChange(meta.key, event.target.value)}
          placeholder={meta.hint ? '' : `Enter ${meta.label.toLowerCase()}`}
        />
      );
  }

  return (
    <FormField
      label={meta.label}
      htmlFor={id}
      order={meta.order}
      required={required}
      hint={warning ?? meta.hint}
      warning={Boolean(warning)}
      error={error}
      className={meta.wide ? 'sm:col-span-2' : undefined}
    >
      {control}
    </FormField>
  );
}

function BecMemberPicker({
  id,
  members,
  selected,
  onChange,
  disabled,
  invalid,
  label = 'BEC members',
  placeholder = 'Select BEC members…',
}: {
  id: string;
  members: EvaluationTeamMember[];
  selected: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  invalid?: boolean;
  label?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  }>({ top: 0, left: 0, width: 0 });

  const selectedMembers = useMemo(
    () => members.filter((member) => selected.includes(member.id)),
    [members, selected],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter(
      (member) =>
        member.name.toLowerCase().includes(needle) ||
        (member.designation ?? '').toLowerCase().includes(needle),
    );
  }, [members, query]);

  const toggle = (memberId: number) => {
    onChange(selected.includes(memberId) ? selected.filter((item) => item !== memberId) : [...selected, memberId]);
  };

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  // Render in a portal and flip above the trigger when the viewport is tight,
  // so the list is never clipped by the section card or pushed off-screen.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxHeight = Math.min(window.innerHeight * 0.7, 420);
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < maxHeight && rect.top > spaceBelow;
      const left = Math.min(
        Math.max(12, rect.left),
        Math.max(12, window.innerWidth - rect.width - 12),
      );
      setPosition({
        ...(flipUp
          ? { bottom: Math.max(12, window.innerHeight - rect.top + 8) }
          : { top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 96)) }),
        left,
        width: rect.width,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, members.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  if (disabled) {
    return (
      <div className="min-h-[42px] rounded-xl border border-line bg-surface-2 px-3.5 py-2">
        {selectedMembers.length === 0 ? (
          <span className="text-[13px] text-muted">No {label} recorded</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selectedMembers.map((member) => (
              <span key={member.id} className="chip border-line bg-surface text-ink-soft">
                {member.name}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          'field-input flex min-h-[42px] items-center justify-between gap-2 text-left',
          invalid && 'border-danger',
          open && 'border-forest',
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {selectedMembers.length === 0 ? (
            <span className="text-muted">{placeholder}</span>
          ) : (
            selectedMembers.slice(0, 3).map((member) => (
              <span
                key={member.id}
                className="chip max-w-full border-line bg-surface-2 px-2 py-0.5 text-[10px] text-ink-soft"
              >
                <span className="truncate">{member.name}</span>
                <span
                  role="button"
                  tabIndex={0}
                  className="ml-0.5 text-muted hover:text-danger"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(member.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      toggle(member.id);
                    }
                  }}
                  aria-label={`Remove ${member.name}`}
                >
                  <X size={10} />
                </span>
              </span>
            ))
          )}
          {selectedMembers.length > 3 && (
            <span className="text-[10px] font-semibold text-forest">+{selectedMembers.length - 3} more</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {selectedMembers.length > 0 && (
            <span className="rounded-full bg-forest-tint px-1.5 py-0.5 text-[9px] font-semibold text-forest">
              {selectedMembers.length}
            </span>
          )}
          <ChevronsUpDown size={14} className="text-muted" />
        </span>
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
            <div
              ref={panelRef}
              className="fixed z-50 flex max-h-[min(70vh,420px)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lift animate-slide-down"
              style={{
                top: position.top,
                bottom: position.bottom,
                left: position.left,
                width: position.width,
              }}
            >
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                <Search size={13} className="text-muted" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Find a ${label}…`}
                  className="w-full bg-transparent py-1 text-[12px] text-ink outline-none placeholder:text-muted"
                />
              </div>
              <div
                className="min-h-0 flex-1 overflow-y-auto p-1.5 scrollbar-thin"
                role="listbox"
                aria-multiselectable
              >
                {filtered.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[11.5px] text-muted">No matching staff members.</p>
                ) : (
                  filtered.map((member) => {
                    const checked = selected.includes(member.id);
                    return (
                      <button
                        key={member.id}
                        type="button"
                        role="option"
                        aria-selected={checked}
                        onClick={() => toggle(member.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                          checked ? 'bg-forest-tint' : 'hover:bg-surface-2',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            checked ? 'border-forest bg-forest text-white' : 'border-line-strong bg-surface',
                          )}
                        >
                          {checked && <Check size={10} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-medium text-ink">{member.name}</span>
                          {member.designation && (
                            <span className="block truncate text-[10px] text-muted">{member.designation}</span>
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="flex items-center justify-between border-t border-line bg-surface-2 px-3 py-2">
                <span className="text-[10px] text-muted">
                  {selected.length} of {members.length} selected
                </span>
                <Button size="sm" variant="ghost" onClick={close}>
                  Done
                </Button>
              </div>
            </div>
          </>,
          document.body,
        )}
      {selectedMembers.length === 0 && (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
          <Users2 size={11} /> You can select more than one member.
        </p>
      )}
    </div>
  );
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i += 1) {
    let current = i + 1;
    for (let j = 0; j < b.length; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1;
      const next = Math.min(previous[j + 1] + 1, current + 1, previous[j] + cost);
      previous[j] = current;
      current = next;
    }
    previous[b.length] = current;
  }
  return previous[b.length];
}

/**
 * Compare a short search query with the best matching part of a long legal name.
 * A plain whole-string distance unfairly penalises "Lanka Watr" against
 * "Lanka Water Infrastructure (Pvt) Ltd", even though only one letter is wrong.
 */
function similarityScore(needle: string, haystack: string): number {
  if (!needle || !haystack) return 0;
  if (haystack.includes(needle)) return 1;

  const shortestWindow = Math.max(1, needle.length - 2);
  const longestWindow = Math.min(haystack.length, needle.length + 2);
  let best = 0;
  for (let start = 0; start <= haystack.length - shortestWindow; start += 1) {
    for (
      let length = shortestWindow;
      length <= longestWindow && start + length <= haystack.length;
      length += 1
    ) {
      const windowText = haystack.slice(start, start + length);
      const distance = levenshtein(needle, windowText);
      const score = 1 - distance / Math.max(needle.length, length, 1);
      if (score > best) {
        best = score;
        if (best >= 1) return 1;
      }
    }
  }
  return best;
}

interface ContractorOption {
  id: number;
  name: string;
  registration_no?: string | null;
  is_active?: boolean;
}

function ContractorPicker({
  id,
  contractors,
  value,
  onChange,
  disabled,
  invalid,
  fallbackName,
  onContractorCreated,
}: {
  id: string;
  contractors: ContractorOption[];
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  fallbackName?: string;
  onContractorCreated?: (contractor: ContractorOption) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [committing, setCommitting] = useState(false);
  const [options, setOptions] = useState<ContractorOption[]>(contractors);
  const [similar, setSimilar] = useState<{ name: string; contractor: ContractorOption } | null>(null);

  useEffect(() => {
    setOptions(contractors);
  }, [contractors]);

  const selected = options.find((contractor) => contractor.id === value) ?? null;
  const selectedName = selected?.name ?? fallbackName ?? null;
  const selectedRegistration = selected?.registration_no ?? null;

  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeName(trimmedQuery);

  const exactMatch = useMemo(
    () =>
      normalizedQuery
        ? options.find((contractor) => normalizeName(contractor.name) === normalizedQuery) ?? null
        : null,
    [normalizedQuery, options],
  );

  const registrationMatches = useMemo(() => {
    if (!trimmedQuery) return [];
    return options.filter(
      (contractor) =>
        (contractor.registration_no ?? '').trim().toLowerCase() === trimmedQuery.toLowerCase(),
    );
  }, [options, trimmedQuery]);

  const suggestion = useMemo(() => {
    if (normalizedQuery.length < 3) return null;
    if (options.some((contractor) => normalizeName(contractor.name) === normalizedQuery)) return null;

    const prefixMatches = options.filter((contractor) =>
      normalizeName(contractor.name).startsWith(normalizedQuery),
    );
    if (prefixMatches.length === 1) return prefixMatches[0];

    let best: { contractor: ContractorOption; similarity: number } | null = null;
    for (const contractor of options) {
      const similarity = similarityScore(normalizedQuery, normalizeName(contractor.name));
      if (!best || similarity > best.similarity) best = { contractor, similarity };
    }
    return best && best.similarity >= 0.72 ? best.contractor : null;
  }, [normalizedQuery, options]);

  const filtered = useMemo(() => {
    const needle = trimmedQuery.toLowerCase();
    if (!needle) {
      return [...options].sort((left, right) => left.name.localeCompare(right.name));
    }
    return options
      .map((contractor) => {
        const normalizedName = normalizeName(contractor.name);
        const haystack = `${contractor.name} ${contractor.registration_no ?? ''}`.toLowerCase();
        const similarity = similarityScore(normalizedQuery, normalizedName);
        return {
          contractor,
          exact: normalizedName === normalizedQuery,
          starts: normalizedName.startsWith(normalizedQuery),
          contains: haystack.includes(needle) || normalizedName.includes(normalizedQuery),
          similarity,
        };
      })
      .filter((entry) => entry.contains || entry.starts || entry.similarity >= 0.55)
      .sort((left, right) => {
        if (left.exact !== right.exact) return left.exact ? -1 : 1;
        if (left.starts !== right.starts) return left.starts ? -1 : 1;
        if (left.contains !== right.contains) return left.contains ? -1 : 1;
        if (right.similarity !== left.similarity) return right.similarity - left.similarity;
        return left.contractor.name.localeCompare(right.contractor.name);
      })
      .slice(0, 30)
      .map((entry) => entry.contractor);
  }, [normalizedQuery, options, trimmedQuery]);

  const closePicker = () => {
    setOpen(false);
    setQuery('');
    setSimilar(null);
  };

  const selectContractor = (contractor: ContractorOption) => {
    onChange(contractor.id);
    setQuery('');
    setSimilar(null);
    setOpen(false);
    if (contractor.is_active === false) {
      toast.info(
        'Inactive contractor',
        `${contractor.name} is inactive. Reactivate it in the contractor register before the next award.`,
      );
    } else {
      toast.success('Contractor linked', `${contractor.name} is linked to this award.`);
    }
  };

  const createContractor = async (name: string) => {
    if (committing) return;
    setCommitting(true);
    try {
      const created = await contractorsApi.create({
        name,
        registration_no: null,
        contact_person: null,
        phone: null,
        email: null,
        address: null,
        office_region: null,
        notes: null,
        is_active: true,
      } as ContractorInput);
      const option: ContractorOption = {
        id: created.id,
        name: created.name,
        registration_no: created.registration_no,
        is_active: true,
      };
      setOptions((current) =>
        [...current.filter((contractor) => contractor.id !== option.id), option].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      onContractorCreated?.(option);
      onChange(created.id);
      closePicker();
      toast.success('Contractor created', `${created.name} was added and linked to this award.`);
    } catch (error) {
      if (error instanceof ApiError && error.details && typeof error.details === 'object') {
        const details = error.details as {
          existing_id?: number;
          existing_name?: string;
          inactive?: boolean;
        };
        if (details.existing_id && details.existing_name) {
          if (details.inactive) {
            toast.error(
              'Contractor is inactive',
              `${details.existing_name} already uses this name. Reactivate it in the contractor register.`,
            );
            return;
          }
          const existing =
            options.find((contractor) => contractor.id === details.existing_id) ?? {
              id: details.existing_id,
              name: details.existing_name,
              registration_no: null,
              is_active: true,
            };
          if (!options.some((contractor) => contractor.id === existing.id)) {
            setOptions((current) => [...current, existing]);
            onContractorCreated?.(existing);
          }
          selectContractor(existing);
          return;
        }
      }
      toast.error('Could not save contractor', error instanceof ApiError ? error.message : 'The contractor was not saved.');
    } finally {
      setCommitting(false);
    }
  };

  const commitQuery = async () => {
    if (!trimmedQuery || committing) return;
    if (exactMatch) {
      selectContractor(exactMatch);
      return;
    }
    if (registrationMatches.length === 1) {
      selectContractor(registrationMatches[0]);
      return;
    }
    if (similar) {
      selectContractor(similar.contractor);
      return;
    }
    if (suggestion) {
      setSimilar({ name: trimmedQuery, contractor: suggestion });
      return;
    }
    await createContractor(trimmedQuery);
  };

  const openPicker = async () => {
    setOpen(true);
    setQuery('');
    setSimilar(null);
    try {
      const items = await contractorsApi.list({ include_inactive: true, sort: 'name', direction: 'asc' });
      setOptions(items);
    } catch {
      /* keep the list already loaded with the record */
    }
  };

  if (disabled) {
    return (
      <div className="flex min-h-[42px] items-center rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-[13px]">
        {selectedName ? (
          <span className="truncate text-ink">
            {selectedName}
            {selectedRegistration ? ` · ${selectedRegistration}` : ''}
          </span>
        ) : (
          <span className="text-muted">No contractor recorded</span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        onClick={() => {
          if (open) closePicker();
          else void openPicker();
        }}
        className={cn(
          'field-input flex min-h-[42px] items-center justify-between gap-2 text-left',
          invalid && 'border-danger',
          open && 'border-forest',
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 truncate text-[13px]">
          {selectedName ? (
            <span className={cn(selected?.is_active === false ? 'text-muted' : 'text-ink')}>
              {selectedName}
              {selectedRegistration ? <span className="text-muted"> · {selectedRegistration}</span> : null}
              {selected?.is_active === false ? <span className="text-muted"> · inactive</span> : null}
            </span>
          ) : (
            <span className="text-muted">Search or select a contractor…</span>
          )}
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-muted" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={closePicker} aria-hidden />
          <div className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-lift animate-slide-down">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Search size={13} className="text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSimilar(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void commitQuery();
                  }
                  if (event.key === 'Escape') {
                    closePicker();
                  }
                }}
                placeholder="Type a contractor name or registration number…"
                className="w-full bg-transparent py-1 text-[12px] text-ink outline-none placeholder:text-muted"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setSimilar(null);
                  }}
                  className="text-muted hover:text-ink"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {suggestion && !similar && (
              <div className="border-b border-line bg-amber-tint px-3 py-2 text-[11px] text-amber">
                <span className="font-semibold">Similar contractor:</span> {suggestion.name}
                {suggestion.is_active === false ? ' (inactive)' : ''}
                <button
                  type="button"
                  className="ml-2 font-semibold underline"
                  onClick={() => selectContractor(suggestion)}
                >
                  Use existing
                </button>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto p-1.5 scrollbar-thin" role="listbox">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-[11.5px] text-muted">
                  No contractor matches. Press Enter to create “{trimmedQuery}”.
                </p>
              ) : (
                filtered.map((contractor) => {
                  const checked = contractor.id === value;
                  return (
                    <button
                      key={contractor.id}
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => selectContractor(contractor)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                        checked ? 'bg-forest-tint' : 'hover:bg-surface-2',
                      )}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-line-strong bg-surface">
                        {checked && <Check size={10} strokeWidth={3} className="text-forest" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-medium text-ink">
                          {contractor.name}
                          {contractor.is_active === false ? (
                            <span className="ml-1.5 rounded bg-surface-2 px-1 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.06em] text-muted">
                              inactive
                            </span>
                          ) : null}
                        </span>
                        {contractor.registration_no && (
                          <span className="block truncate text-[10px] text-muted">{contractor.registration_no}</span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-line bg-surface-2 px-3 py-2">
              {similar ? (
                <>
                  <p className="text-[11px] leading-snug text-ink">
                    <span className="font-semibold">Similar contractor found:</span> {similar.contractor.name}
                    {similar.contractor.is_active === false ? ' (inactive)' : ''}
                  </p>
                  <p className="mt-1 text-[10px] leading-snug text-muted">
                    Link the existing record to keep its contracts and evaluations together, or create
                    “{similar.name}” as a separate contractor.
                  </p>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void createContractor(similar.name)}
                      loading={committing}
                    >
                      Create separate
                    </Button>
                    <Button size="sm" onClick={() => selectContractor(similar.contractor)} disabled={committing}>
                      Link existing
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[10px] leading-snug text-muted">
                    {exactMatch || registrationMatches.length === 1
                      ? 'Press Enter to link the matching contractor, or select another result above.'
                      : 'Press Enter to check the register. If no contractor matches, a new record is created.'}
                  </p>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={closePicker} disabled={committing}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      loading={committing}
                      disabled={!trimmedQuery}
                      onClick={() => void commitQuery()}
                    >
                      {exactMatch || registrationMatches.length === 1
                        ? 'Link contractor'
                        : suggestion
                          ? 'Review match'
                          : 'Add contractor'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ReadOnlyFieldValue({
  field,
  value,
  team = [],
  contractors = [],
}: {
  field: FieldMeta;
  value: unknown;
  team?: EvaluationTeamMember[];
  contractors?: Array<{ id: number; name: string }>;
}) {
  let display: React.ReactNode = '—';

  if (value !== null && value !== undefined && value !== '') {
    switch (field.kind) {
      case 'date':
        display = formatDate(value as string);
        break;
      case 'currency':
        display = formatLKR(value as number);
        break;
      case 'number':
        display = formatNumber(value as number);
        break;
      case 'boolean':
        display = value ? 'Yes' : 'No';
        break;
      case 'team_multiselect': {
        const ids = value as number[];
        const names = ids
          .map((id) => team.find((member) => member.id === id)?.name)
          .filter(Boolean);
        display = names.length > 0 ? names.join(', ') : `${ids.length} selected`;
        break;
      }
      case 'contractor': {
        const contractor = contractors.find((entry) => entry.id === value);
        display = contractor?.name ?? `Contractor #${value}`;
        break;
      }
      case 'period_unit':
        display = value === 'months' ? 'Months' : value === 'days' ? 'Days' : String(value);
        break;
      case 'textarea':
        display = <span className="whitespace-pre-wrap">{String(value)}</span>;
        break;
      default:
        display = String(value);
    }
  }

  return (
    <div className="min-w-0" id={`field-${field.key}`}>
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
        <span className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[8.5px] tracking-normal">
          {field.order}
        </span>
        {fieldLabel(field.key)}
      </dt>
      <dd className={cn('mt-1 text-[12.5px] leading-relaxed', display === '—' ? 'text-muted' : 'text-ink')}>
        {display}
      </dd>
    </div>
  );
}
