import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BadgeCheck,
  CircleDollarSign,
  HardHat,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  SearchX,
  Timer,
  Users2,
} from 'lucide-react';
import { contractorsApi, type ContractorInput } from '../api/contractors';
import { mastersApi } from '../api/masters';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { ContractorDirectoryItem, LookupGroups } from '../types/api';
import { useDebouncedValue, useDocumentTitle } from '../lib/hooks';
import {
  formatCompactLKR,
  formatNumber,
  formatPercent,
  scoreLabel,
  scoreTone,
} from '../lib/format';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { ScoreRing, ProgressBar } from '../components/ui/Score';
import { Stars } from '../components/ui/Stars';
import { EmptyState, ErrorState, LoadingCards } from '../components/ui/Feedback';
import { SearchInput, FormField, Input, Select, Textarea, Toggle } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';

const EMPTY_LOOKUPS: LookupGroups = {
  category: [],
  priority: [],
  procurement_method: [],
  office_region: [],
  funds: [],
};

const SORT_OPTIONS = [
  { value: 'score:desc', label: 'Highest performance score' },
  { value: 'volume:desc', label: 'Largest awarded value' },
  { value: 'contracts:desc', label: 'Most contracts' },
  { value: 'on_time:desc', label: 'Best on-time delivery' },
  { value: 'name:asc', label: 'Name A–Z' },
];

type SortKey = 'score' | 'name' | 'volume' | 'contracts' | 'on_time';

interface CreateForm {
  name: string;
  registration_no: string;
  contact_person: string;
  phone: string;
  email: string;
  office_region: string;
  address: string;
  notes: string;
  is_active: boolean;
}

const EMPTY_FORM: CreateForm = {
  name: '',
  registration_no: '',
  contact_person: '',
  phone: '',
  email: '',
  office_region: '',
  address: '',
  notes: '',
  is_active: true,
};

function clean(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function ContractorsPage() {
  useDocumentTitle('Contractors');
  const { canEditContractors } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<ContractorDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const search = useDebouncedValue(searchDraft, 300);
  const [sort, setSort] = useState('score:desc');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookups, setLookups] = useState<LookupGroups>(EMPTY_LOOKUPS);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mastersApi
      .bundle()
      .then((bundle) => setLookups(bundle.lookups))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const [sortKey, direction] = sort.split(':');
    contractorsApi
      .list({
        q: search || undefined,
        include_inactive: includeInactive || undefined,
        sort: sortKey as SortKey,
        direction: direction === 'asc' ? 'asc' : 'desc',
      })
      .then((response) => {
        if (!cancelled) setItems(response);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'The contractor register could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, sort, includeInactive, refreshKey]);

  const summary = useMemo(() => {
    const rated = items.filter((item) => item.rating_count > 0);
    const awarded = items.reduce((sum, item) => sum + item.total_awarded_lkr, 0);
    const average = rated.length
      ? rated.reduce((sum, item) => sum + item.composite_score, 0) / rated.length
      : null;
    return {
      total: items.length,
      active: items.filter((item) => item.is_active).length,
      rated: rated.length,
      awarded,
      average,
      contracts: items.reduce((sum, item) => sum + item.contract_count, 0),
    };
  }, [items]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setCreateOpen(true);
  };

  const updateForm = (key: keyof CreateForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const submitCreate = async () => {
    const errors: Record<string, string> = {};
    if (form.name.trim().length < 2) errors.name = 'Enter the registered contractor name.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload: ContractorInput = {
      name: form.name.trim(),
      registration_no: clean(form.registration_no),
      contact_person: clean(form.contact_person),
      phone: clean(form.phone),
      email: clean(form.email),
      office_region: clean(form.office_region),
      address: clean(form.address),
      notes: clean(form.notes),
      is_active: form.is_active,
    };

    setSaving(true);
    try {
      const contractor = await contractorsApi.create(payload);
      toast.success('Contractor added', `${contractor.name} is now available for award selection.`);
      setCreateOpen(false);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      toast.error('Could not add contractor', err instanceof ApiError ? err.message : 'The contractor could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const resetFilters = () => {
    setSearchDraft('');
    setSort('score:desc');
    setIncludeInactive(false);
  };

  const hasFilters = Boolean(searchDraft) || includeInactive;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Contractor intelligence</p>
          <h1 className="display-title">The people who build.</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
            Composite performance combines weighted evaluation scores with on-time delivery, mobilisation speed and
            awarded volume. Open a contractor to see their full scorecard and history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} className={cn(loading && 'animate-spin')} />}
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={loading}
          >
            Refresh
          </Button>
          {canEditContractors && (
            <Button size="sm" icon={<Plus size={15} />} onClick={openCreate}>
              Add contractor
            </Button>
          )}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Contractors"
          value={formatNumber(summary.total)}
          sub={`${summary.active} active · ${summary.total - summary.active} inactive`}
          icon={HardHat}
          tone="forest"
        />
        <SummaryCard
          label="Rated companies"
          value={`${summary.rated}/${summary.total}`}
          sub={summary.average === null ? 'No ratings recorded yet' : `Average score ${summary.average.toFixed(2)} / 5`}
          icon={BadgeCheck}
          tone="gold"
        />
        <SummaryCard
          label="Awarded portfolio"
          value={formatCompactLKR(summary.awarded)}
          sub={`Across ${formatNumber(summary.contracts)} linked contracts`}
          icon={CircleDollarSign}
          tone="info"
        />
        <SummaryCard
          label="Average score"
          value={summary.average === null ? '—' : summary.average.toFixed(2)}
          sub={summary.average === null ? 'Add a rating to begin scoring' : scoreLabel(summary.average)}
          icon={Users2}
          tone="amber"
        />
      </section>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={searchDraft}
              onChange={setSearchDraft}
              placeholder="Search name, registration, contact or region…"
              className="min-w-[220px] flex-1"
              ariaLabel="Search contractors"
            />
            <Select
              aria-label="Sort contractors"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              options={SORT_OPTIONS}
              className="w-full sm:w-[230px]"
            />
            <div className="flex h-[42px] shrink-0 items-center rounded-xl border border-line bg-surface px-3.5">
              <Toggle
                checked={includeInactive}
                onChange={setIncludeInactive}
                label="Include inactive"
              />
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-[11px] font-semibold text-forest hover:underline"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex items-center justify-between text-[10.5px] text-muted">
            <span>
              {loading
                ? 'Loading contractor register…'
                : `${formatNumber(items.length)} contractor${items.length === 1 ? '' : 's'} shown`}
            </span>
            <span className="hidden sm:inline">Scores out of 5 · 35% objective weighting</span>
          </div>
        </div>

        {loading ? (
          <div className="p-4 md:p-5">
            <LoadingCards count={4} />
          </div>
        ) : error ? (
          <div className="p-5">
            <ErrorState
              title="Contractor register unavailable"
              description={error}
              onRetry={() => setRefreshKey((key) => key + 1)}
            />
          </div>
        ) : items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={SearchX}
              title={hasFilters ? 'No contractors match this view.' : 'No contractors yet.'}
              description={
                hasFilters
                  ? 'Try a different search term, or include inactive contractors in the results.'
                  : 'Add the first contractor to make them available for award and performance rating.'
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : canEditContractors ? (
                  <Button icon={<Plus size={15} />} onClick={openCreate}>
                    Add the first contractor
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-3">
            {items.map((contractor, index) => (
              <ContractorCard key={contractor.id} contractor={contractor} index={index} />
            ))}
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add a contractor"
        description="Registration details are used on awards, agreements and performance scorecards."
        eyebrow="Contractor register"
        icon={<HardHat size={18} />}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submitCreate} loading={saving}>
              Add contractor
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Registered name" htmlFor="new-contractor-name" required error={formErrors.name} className="sm:col-span-2">
            <Input
              id="new-contractor-name"
              value={form.name}
              onChange={(event) => updateForm('name', event.target.value)}
              placeholder="e.g. Ruhunu Civil Constructions (Pvt) Ltd"
              invalid={Boolean(formErrors.name)}
              autoFocus
            />
          </FormField>
          <FormField label="Registration number" htmlFor="new-contractor-reg">
            <Input
              id="new-contractor-reg"
              value={form.registration_no}
              onChange={(event) => updateForm('registration_no', event.target.value)}
              placeholder="e.g. C-1042"
            />
          </FormField>
          <FormField label="Office / region" htmlFor="new-contractor-region">
            <Input
              id="new-contractor-region"
              list="contractor-regions"
              value={form.office_region}
              onChange={(event) => updateForm('office_region', event.target.value)}
              placeholder="Select or type a region"
            />
            <datalist id="contractor-regions">
              {lookups.office_region.map((region) => (
                <option key={region} value={region} />
              ))}
            </datalist>
          </FormField>
          <FormField label="Contact person" htmlFor="new-contractor-contact">
            <Input
              id="new-contractor-contact"
              value={form.contact_person}
              onChange={(event) => updateForm('contact_person', event.target.value)}
              placeholder="Primary contact"
            />
          </FormField>
          <FormField label="Phone" htmlFor="new-contractor-phone">
            <Input
              id="new-contractor-phone"
              value={form.phone}
              onChange={(event) => updateForm('phone', event.target.value)}
              placeholder="+94 …"
            />
          </FormField>
          <FormField label="Email" htmlFor="new-contractor-email" error={formErrors.email}>
            <Input
              id="new-contractor-email"
              type="email"
              value={form.email}
              onChange={(event) => updateForm('email', event.target.value)}
              placeholder="office@contractor.lk"
              invalid={Boolean(formErrors.email)}
            />
          </FormField>
          <div className="flex items-end pb-1">
            <Toggle
              checked={form.is_active}
              onChange={(checked) => updateForm('is_active', checked)}
              label="Available for new awards"
              description="Inactive contractors remain in history."
            />
          </div>
          <FormField label="Address" htmlFor="new-contractor-address" className="sm:col-span-2">
            <Input
              id="new-contractor-address"
              value={form.address}
              onChange={(event) => updateForm('address', event.target.value)}
              placeholder="Street, city"
            />
          </FormField>
          <FormField
            label="Internal notes"
            htmlFor="new-contractor-notes"
            hint="Visible to the procurement team only."
            className="sm:col-span-2"
          >
            <Textarea
              id="new-contractor-notes"
              value={form.notes}
              onChange={(event) => updateForm('notes', event.target.value)}
              placeholder="Capabilities, past performance, registration notes…"
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}

function ContractorCard({ contractor, index }: { contractor: ContractorDirectoryItem; index: number }) {
  const rated = contractor.rating_count > 0;
  const tone = rated ? scoreTone(contractor.composite_score) : 'neutral';

  return (
    <Link
      to={`/contractors/${contractor.id}`}
      className="group relative flex flex-col rounded-xl border border-line bg-surface p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card animate-fade-up"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="flex items-start gap-3">
        <Avatar name={contractor.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-ink group-hover:text-forest">
              {contractor.name}
            </p>
            <ArrowUpRight
              size={14}
              className="mt-0.5 shrink-0 text-muted transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-forest"
            />
          </div>
          <p className="mt-0.5 truncate text-[10.5px] text-muted">
            {contractor.registration_no || 'Registration not recorded'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={contractor.is_active ? 'forest' : 'neutral'} dot>
              {contractor.is_active ? 'Active' : 'Inactive'}
            </Badge>
            {contractor.office_region && (
              <span className="inline-flex items-center gap-1 text-[9.5px] text-muted">
                <MapPin size={9} /> {contractor.office_region}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-center">
          <ScoreRing score={rated ? contractor.composite_score : 0} size={62} strokeWidth={5} />
          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">
            {rated ? contractor.rating_label : 'Not rated'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-line bg-surface-2 p-2.5">
        <Metric label="Contracts" value={String(contractor.contract_count)} />
        <Metric label="Awarded" value={formatCompactLKR(contractor.total_awarded_lkr)} />
        <Metric
          label="On time"
          value={contractor.on_time_extended_rate === null ? '—' : formatPercent(contractor.on_time_extended_rate)}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        {rated ? (
          <span className="flex items-center gap-1.5">
            <Stars value={contractor.composite_score} size={11} />
            <span className="text-[10px] font-semibold text-ink-soft tabular">{contractor.composite_score.toFixed(1)}</span>
            <span className="text-[9.5px] text-muted">({contractor.rating_count})</span>
          </span>
        ) : (
          <span className="text-[10px] text-muted">Awaiting first evaluation</span>
        )}
        <span className="inline-flex items-center gap-1 text-[9.5px] text-muted">
          <Timer size={10} />
          {contractor.average_mobilization_days === null
            ? 'No mobilisation data'
            : `${contractor.average_mobilization_days.toFixed(0)}d mobilisation`}
        </span>
      </div>

      {contractor.completed_count > 0 && (
        <div className="mt-2.5">
          <ProgressBar
            value={contractor.completed_count}
            max={Math.max(contractor.contract_count, 1)}
            tone={tone === 'forest' ? 'forest' : tone === 'gold' ? 'gold' : tone === 'amber' ? 'amber' : 'danger'}
            height="h-1"
          />
          <p className="mt-1 text-[9px] text-muted">
            {contractor.completed_count} of {contractor.contract_count} contracts completed
          </p>
        </div>
      )}

      {(contractor.contact_person || contractor.phone || contractor.email) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9.5px] text-muted">
          {contractor.contact_person && <span className="truncate">{contractor.contact_person}</span>}
          {contractor.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone size={9} /> {contractor.phone}
            </span>
          )}
          {contractor.email && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Mail size={9} /> <span className="truncate">{contractor.email}</span>
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 text-center">
      <p className="text-[8.5px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-0.5 truncate text-[11px] font-semibold text-ink tabular">{value}</p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof HardHat;
  tone: 'forest' | 'gold' | 'info' | 'amber';
}) {
  const palette = {
    forest: 'bg-forest-tint text-forest',
    gold: 'bg-gold-soft text-gold',
    info: 'bg-info-tint text-info',
    amber: 'bg-amber-tint text-amber',
  }[tone];

  return (
    <div className="card animate-fade-up p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="eyebrow">{label}</span>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', palette)}>
          <Icon size={15} />
        </span>
      </div>
      <p className="mt-2.5 font-serif text-[26px] font-semibold leading-none text-ink tabular">{value}</p>
      <p className="mt-2 text-[10.5px] leading-snug text-muted">{sub}</p>
    </div>
  );
}
