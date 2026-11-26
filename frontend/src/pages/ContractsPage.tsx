import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDownUp,
  ArrowUpRight,
  CalendarDays,
  Download,
  FileSearch,
  FileText,
  Filter,
  FolderOpen,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { contractsApi, type ContractListParams } from '../api/contracts';
import { mastersApi } from '../api/masters';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { ContractListItem, LookupGroups } from '../types/api';
import { useDocumentTitle, useDebouncedValue } from '../lib/hooks';
import {
  daysUntil,
  dueLabel,
  formatDate,
  formatLKR,
  formatNumber,
  relativeTime,
  roleShort,
} from '../lib/format';
import { STATUS_OPTIONS } from '../lib/fields';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { StatusBadge, PriorityBadge } from '../components/ui/Badge';
import { FormField, Input, SearchInput, Select, Toggle } from '../components/ui/Field';
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/Feedback';
import { Pagination } from '../components/ui/Pagination';
import { Avatar } from '../components/ui/Avatar';

const EMPTY_LOOKUPS: LookupGroups = {
  category: [],
  priority: [],
  procurement_method: [],
  office_region: [],
  funds: [],
};

const PAGE_SIZE = 15;

const SORT_OPTIONS = [
  { value: 'updated_at:desc', label: 'Recently updated' },
  { value: 'created_at:desc', label: 'Newest records' },
  { value: 'awarded_amount_without_vat:desc', label: 'Highest award' },
  { value: 'target_completion:asc', label: 'Nearest target date' },
  { value: 'project_name:asc', label: 'Project name A–Z' },
  { value: 'status:asc', label: 'Workflow status' },
];

interface Filters {
  q: string;
  status: string;
  category: string;
  office_region: string;
  procurement_method: string;
  priority: string;
  funds: string;
  mine: boolean;
  received_from: string;
  received_to: string;
  sort: string;
}

function initialFilters(params: URLSearchParams): Filters {
  return {
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    category: params.get('category') ?? '',
    office_region: params.get('office_region') ?? '',
    procurement_method: params.get('procurement_method') ?? '',
    priority: params.get('priority') ?? '',
    funds: params.get('funds') ?? '',
    mine: params.get('mine') === 'true',
    received_from: params.get('received_from') ?? '',
    received_to: params.get('received_to') ?? '',
    sort: params.get('sort') ? `${params.get('sort')}:${params.get('direction') ?? 'desc'}` : 'updated_at:desc',
  };
}

export function ContractsPage() {
  useDocumentTitle('Contracts');
  const { canCreateRecords } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => initialFilters(searchParams));
  const [searchDraft, setSearchDraft] = useState(() => initialFilters(searchParams).q);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);
  const [page, setPage] = useState(() => Number(searchParams.get('page') ?? 1) || 1);
  const [items, setItems] = useState<ContractListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lookups, setLookups] = useState<LookupGroups>(EMPTY_LOOKUPS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    mastersApi
      .bundle()
      .then((bundle) => setLookups(bundle.lookups))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setFilters((current) => (current.q === debouncedSearch ? current : { ...current, q: debouncedSearch }));
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const [sort, direction] = filters.sort.split(':');
    const params: ContractListParams = {
      q: filters.q || undefined,
      status: filters.status || undefined,
      category: filters.category || undefined,
      office_region: filters.office_region || undefined,
      procurement_method: filters.procurement_method || undefined,
      priority: filters.priority || undefined,
      funds: filters.funds || undefined,
      mine: filters.mine || undefined,
      received_from: filters.received_from || undefined,
      received_to: filters.received_to || undefined,
      sort,
      direction: direction === 'asc' ? 'asc' : 'desc',
      page,
      page_size: PAGE_SIZE,
    };
    contractsApi
      .list(params)
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
        setTotal(response.total);
        setPages(response.pages);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'The register could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, page, refreshKey]);

  useEffect(() => {
    const [sort, direction] = filters.sort.split(':');
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (filters.category) params.set('category', filters.category);
    if (filters.office_region) params.set('office_region', filters.office_region);
    if (filters.procurement_method) params.set('procurement_method', filters.procurement_method);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.funds) params.set('funds', filters.funds);
    if (filters.mine) params.set('mine', 'true');
    if (filters.received_from) params.set('received_from', filters.received_from);
    if (filters.received_to) params.set('received_to', filters.received_to);
    if (filters.sort !== 'updated_at:desc') {
      params.set('sort', sort);
      params.set('direction', direction);
    }
    if (page > 1) params.set('page', String(page));
    setSearchParams(params, { replace: true });
  }, [filters, page, setSearchParams]);

  const update = (key: keyof Filters, value: string | boolean) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const clearAll = () => {
    setSearchDraft('');
    setFilters(initialFilters(new URLSearchParams()));
    setPage(1);
  };

  const activeChips = useMemo(() => {
    const chips: Array<{ key: keyof Filters; label: string }> = [];
    if (filters.status) chips.push({ key: 'status', label: STATUS_OPTIONS.find((option) => option.value === filters.status)?.label ?? filters.status });
    if (filters.category) chips.push({ key: 'category', label: filters.category });
    if (filters.office_region) chips.push({ key: 'office_region', label: filters.office_region });
    if (filters.procurement_method) chips.push({ key: 'procurement_method', label: filters.procurement_method });
    if (filters.priority) chips.push({ key: 'priority', label: filters.priority });
    if (filters.funds) chips.push({ key: 'funds', label: filters.funds });
    if (filters.mine) chips.push({ key: 'mine', label: 'Assigned to me' });
    if (filters.received_from) chips.push({ key: 'received_from', label: `Received from ${formatDate(filters.received_from)}` });
    if (filters.received_to) chips.push({ key: 'received_to', label: `Received to ${formatDate(filters.received_to)}` });
    return chips;
  }, [filters]);

  const advancedCount = activeChips.filter((chip) => chip.key !== 'status' && chip.key !== 'mine').length;

  const applyChipRemove = (key: keyof Filters) => {
    if (key === 'mine') update('mine', false);
    else update(key, '');
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const [sort, direction] = filters.sort.split(':');
      await contractsApi.export({
        q: filters.q || undefined,
        status: filters.status || undefined,
        category: filters.category || undefined,
        office_region: filters.office_region || undefined,
        procurement_method: filters.procurement_method || undefined,
        priority: filters.priority || undefined,
        funds: filters.funds || undefined,
        mine: filters.mine || undefined,
        sort,
        direction: direction === 'asc' ? 'asc' : 'desc',
      });
      toast.success('Export ready', 'The filtered register has been downloaded as an Excel workbook.');
    } catch (err) {
      toast.error('Export failed', err instanceof ApiError ? err.message : 'The workbook could not be generated.');
    } finally {
      setExporting(false);
    }
  };

  const retry = useCallback(() => setRefreshKey((key) => key + 1), []);

  const hasFilters = activeChips.length > 0 || Boolean(searchDraft);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Register</p>
          <h1 className="display-title">Procurement contracts</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
            Every record, its current stage and the amount committed. Open a file to edit the active section, hand it
            forward or review its history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} className={cn(loading && 'animate-spin')} />}
            onClick={retry}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Download size={14} />}
            onClick={handleExport}
            loading={exporting}
          >
            Export
          </Button>
          {canCreateRecords && (
            <Button size="sm" icon={<Plus size={15} />} onClick={() => navigate('/contracts/new')}>
              New project
            </Button>
          )}
        </div>
      </header>

      <div className="card overflow-visible">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-line p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={searchDraft}
              onChange={setSearchDraft}
              placeholder="Search project, contract no, contractor…"
              className="min-w-[220px] flex-1"
              ariaLabel="Search contracts"
            />
            <Select
              aria-label="Filter by status"
              value={filters.status}
              onChange={(event) => update('status', event.target.value)}
              options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              className="w-full sm:w-[190px]"
            />
            <Select
              aria-label="Sort contracts"
              value={filters.sort}
              onChange={(event) => update('sort', event.target.value)}
              options={SORT_OPTIONS}
              className="w-full sm:w-[180px]"
            />
            <button
              type="button"
              onClick={() => setAdvancedOpen((open) => !open)}
              className={cn(
                'btn btn-secondary btn-sm h-[42px] shrink-0',
                advancedOpen && 'border-forest-soft bg-forest-soft text-forest',
              )}
              aria-expanded={advancedOpen}
            >
              <SlidersHorizontal size={14} />
              Filters
              {advancedCount > 0 && (
                <span className="rounded-full bg-forest px-1.5 py-0.5 text-[9px] font-semibold text-white">{advancedCount}</span>
              )}
            </button>
          </div>

          {advancedOpen && (
            <div className="grid gap-3 rounded-xl border border-line bg-surface-2 p-3.5 animate-slide-down sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Category" htmlFor="filter-category">
                <Select
                  id="filter-category"
                  value={filters.category}
                  onChange={(event) => update('category', event.target.value)}
                  placeholder="Any category"
                  options={lookups.category.map((value) => ({ value, label: value }))}
                />
              </FormField>
              <FormField label="Office / region" htmlFor="filter-region">
                <Select
                  id="filter-region"
                  value={filters.office_region}
                  onChange={(event) => update('office_region', event.target.value)}
                  placeholder="Any region"
                  options={lookups.office_region.map((value) => ({ value, label: value }))}
                />
              </FormField>
              <FormField label="Procurement method" htmlFor="filter-method">
                <Select
                  id="filter-method"
                  value={filters.procurement_method}
                  onChange={(event) => update('procurement_method', event.target.value)}
                  placeholder="Any method"
                  options={lookups.procurement_method.map((value) => ({ value, label: value }))}
                />
              </FormField>
              <FormField label="Priority" htmlFor="filter-priority">
                <Select
                  id="filter-priority"
                  value={filters.priority}
                  onChange={(event) => update('priority', event.target.value)}
                  placeholder="Any priority"
                  options={lookups.priority.map((value) => ({ value, label: value }))}
                />
              </FormField>
              <FormField label="Funds" htmlFor="filter-funds">
                <Select
                  id="filter-funds"
                  value={filters.funds}
                  onChange={(event) => update('funds', event.target.value)}
                  placeholder="Any fund"
                  options={lookups.funds.map((value) => ({ value, label: value }))}
                />
              </FormField>
              <FormField label="Received from" htmlFor="filter-from">
                <Input
                  id="filter-from"
                  type="date"
                  value={filters.received_from}
                  onChange={(event) => update('received_from', event.target.value)}
                />
              </FormField>
              <FormField label="Received to" htmlFor="filter-to">
                <Input
                  id="filter-to"
                  type="date"
                  value={filters.received_to}
                  onChange={(event) => update('received_to', event.target.value)}
                />
              </FormField>
              <div className="flex items-center rounded-xl border border-line bg-surface px-3.5 py-2.5">
                <Toggle
                  checked={filters.mine}
                  onChange={(checked) => update('mine', checked)}
                  label="Assigned to me"
                  description="Only my active stage"
                />
              </div>
            </div>
          )}

          {(activeChips.length > 0 || searchDraft) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[10px] font-medium text-muted">Active:</span>
              {searchDraft && (
                <FilterChip label={`“${searchDraft}”`} onRemove={() => setSearchDraft('')} />
              )}
              {activeChips.map((chip) => (
                <FilterChip key={chip.key} label={chip.label} onRemove={() => applyChipRemove(chip.key)} />
              ))}
              <button
                type="button"
                onClick={clearAll}
                className="ml-1 text-[10.5px] font-semibold text-forest hover:underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Count */}
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5 md:px-5">
          <p className="text-[10.5px] font-medium text-muted">
            {loading ? 'Loading records…' : `${formatNumber(total)} record${total === 1 ? '' : 's'} found`}
          </p>
          <p className="hidden items-center gap-1.5 text-[10px] text-muted sm:flex">
            <ArrowDownUp size={11} /> {SORT_OPTIONS.find((option) => option.value === filters.sort)?.label}
          </p>
        </div>

        {loading ? (
          <div className="p-4 md:p-5">
            <TableSkeleton rows={7} />
          </div>
        ) : error ? (
          <div className="p-5">
            <ErrorState title="Register unavailable" description={error} onRetry={retry} />
          </div>
        ) : items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={FileSearch}
              title={hasFilters ? 'No records match these filters.' : 'The register is empty.'}
              description={
                hasFilters
                  ? 'Try removing a filter or searching for a different project, contract number or contractor.'
                  : 'Open the first procurement record to start the sequential P&C Manager → QS → Engineer workflow.'
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" onClick={clearAll} icon={<X size={14} />}>
                    Clear filters
                  </Button>
                ) : canCreateRecords ? (
                  <Button onClick={() => navigate('/contracts/new')} icon={<Plus size={15} />}>
                    Open the first record
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-line bg-surface-2">
                    <th className="table-head px-5 py-3">Project</th>
                    <th className="table-head px-3 py-3">Stage</th>
                    <th className="table-head px-3 py-3">Contractor</th>
                    <th className="table-head px-3 py-3 text-right">Awarded</th>
                    <th className="table-head px-3 py-3">Completion</th>
                    <th className="table-head px-3 py-3">Updated</th>
                    <th className="w-10 px-3 py-3" aria-label="Open" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((contract) => {
                    const days = daysUntil(contract.effective_completion_date);
                    return (
                      <tr
                        key={contract.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => navigate(`/contracts/${contract.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            navigate(`/contracts/${contract.id}`);
                          }
                        }}
                        className="group cursor-pointer transition-colors hover:bg-surface-2"
                      >
                        <td className="max-w-[320px] px-5 py-3.5">
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted transition-colors group-hover:border-forest-soft group-hover:bg-forest-tint group-hover:text-forest">
                              <FolderOpen size={14} />
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-[12.5px] font-semibold text-ink group-hover:text-forest">
                                  {contract.project_name || `Contract #${contract.id}`}
                                </p>
                                <PriorityBadge priority={contract.priority} />
                              </div>
                              <p className="mt-0.5 truncate text-[10.5px] text-muted">
                                {contract.contract_no ? `${contract.contract_no} · ` : ''}
                                {contract.contract_name || 'Contract identity pending'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <StatusBadge status={contract.status} />
                          <p className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-muted">
                            {contract.assigned_to_me ? (
                              <span className="font-semibold text-forest">Assigned to you</span>
                            ) : (
                              <>with {roleShort(contract.current_owner_role)}</>
                            )}
                          </p>
                        </td>
                        <td className="px-3 py-3.5">
                          {contract.contractor_name ? (
                            <>
                              <p className="max-w-[160px] truncate text-[11.5px] font-medium text-ink-soft">
                                {contract.contractor_name}
                              </p>
                              <p className="mt-0.5 text-[9.5px] text-muted">{contract.office_region || '—'}</p>
                            </>
                          ) : (
                            <span className="text-[11px] text-muted">Unassigned</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <p className="text-[11.5px] font-semibold text-ink tabular">
                            {formatLKR(contract.awarded_amount_without_vat)}
                          </p>
                          <p className="mt-0.5 text-[9.5px] text-muted">{contract.funds || '—'}</p>
                        </td>
                        <td className="px-3 py-3.5">
                          <p className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                            <CalendarDays size={11} className="text-muted" />
                            {formatDate(contract.effective_completion_date)}
                          </p>
                          {contract.status !== 'COMPLETED' && days !== null && days <= 45 && (
                            <p className={cn('mt-0.5 text-[9.5px] font-semibold', days < 0 ? 'text-danger' : 'text-amber')}>
                              {dueLabel(days)}
                            </p>
                          )}
                          {contract.status === 'COMPLETED' && (
                            <p className="mt-0.5 text-[9.5px] font-medium text-forest">Closed</p>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <p className="text-[10.5px] text-muted">{relativeTime(contract.updated_at)}</p>
                          <p className="mt-0.5 text-[9px] text-muted">v{contract.version}</p>
                        </td>
                        <td className="px-3 py-3.5">
                          <ArrowUpRight
                            size={15}
                            className="text-muted transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-forest"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-line md:hidden">
              {items.map((contract) => (
                <Link
                  key={contract.id}
                  to={`/contracts/${contract.id}`}
                  className="block px-4 py-4 transition-colors hover:bg-surface-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink">{contract.project_name || `Contract #${contract.id}`}</p>
                      <p className="mt-0.5 truncate text-[10.5px] text-muted">
                        {contract.contract_no || 'No contract no'} · {contract.contract_name || 'Identity pending'}
                      </p>
                    </div>
                    <StatusBadge status={contract.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10.5px]">
                    <div>
                      <span className="text-muted">Contractor</span>
                      <p className="mt-0.5 truncate font-medium text-ink-soft">{contract.contractor_name || 'Unassigned'}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-muted">Awarded</span>
                      <p className="mt-0.5 font-semibold text-ink tabular">{formatLKR(contract.awarded_amount_without_vat)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[9.5px] text-muted">
                    <span>{contract.assigned_to_me ? <span className="font-semibold text-forest">Assigned to you</span> : `with ${roleShort(contract.current_owner_role)}`}</span>
                    <span>{relativeTime(contract.updated_at)}</span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="border-t border-line px-4 py-3.5 md:px-5">
              <Pagination page={page} pages={pages} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-muted">
        <span className="flex items-center gap-1.5">
          <FileText size={11} /> Sequential handoff · optimistic locking · field-level audit
        </span>
        <span>Amounts shown without VAT, in Sri Lankan Rupees.</span>
      </div>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-[240px] items-center gap-1 rounded-full border border-line bg-surface px-2 py-1 text-[10px] font-medium text-ink-soft">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-full p-0.5 text-muted transition-colors hover:bg-surface-2 hover:text-danger"
        aria-label={`Remove filter ${label}`}
      >
        <X size={10} />
      </button>
    </span>
  );
}
