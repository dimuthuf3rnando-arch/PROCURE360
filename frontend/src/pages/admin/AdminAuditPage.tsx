import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  FileClock,
  GitBranch,
  History,
  RefreshCw,
  RotateCcw,
  SearchX,
  ShieldAlert,
  SlidersHorizontal,
  Undo2,
  UserRound,
} from 'lucide-react';
import { auditApi } from '../../api/analytics';
import { ApiError } from '../../api/client';
import type { AuditLog, AuditSummary, Handoff, Page } from '../../types/api';
import { useDocumentTitle } from '../../lib/hooks';
import {
  formatDateTime,
  humanizeAction,
  roleShort,
  statusLabel,
  statusTone,
  toneClasses,
  type StatusTone,
} from '../../lib/format';
import { fieldLabel } from '../../lib/fields';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { SectionHeading } from '../../components/ui/Layout';
import { Tabs } from '../../components/ui/Tabs';
import { FormField, Input, Select, Toggle } from '../../components/ui/Field';
import { EmptyState, ErrorState, TableSkeleton } from '../../components/ui/Feedback';
import { Pagination } from '../../components/ui/Pagination';

const PAGE_SIZE = 25;

const LOG_ACTIONS = ['CREATE', 'FIELD_UPDATE', 'TRANSITION', 'RETURN', 'COMPLETE', 'ADMIN_OVERRIDE'];
const HANDOFF_ACTIONS = ['CREATED', 'FORWARD', 'RETURN_TO_PREVIOUS', 'COMPLETE', 'ADMIN_OVERRIDE'];

interface Filters {
  contractId: string;
  action: string;
  fieldName: string;
  adminOnly: boolean;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: Filters = {
  contractId: '',
  action: '',
  fieldName: '',
  adminOnly: false,
  dateFrom: '',
  dateTo: '',
};

function actionTone(action: string): StatusTone {
  switch (action) {
    case 'CREATE':
    case 'CREATED':
    case 'FORWARD':
      return 'forest';
    case 'FIELD_UPDATE':
      return 'info';
    case 'TRANSITION':
      return 'gold';
    case 'RETURN':
    case 'RETURN_TO_PREVIOUS':
      return 'danger';
    case 'COMPLETE':
      return 'forest';
    case 'ADMIN_OVERRIDE':
      return 'amber';
    default:
      return 'neutral';
  }
}

function actionLabel(action: string): string {
  return action === 'RETURN_TO_PREVIOUS' ? 'Returned' : humanizeAction(action);
}

function shortValue(value: string | null, max = 48): string {
  if (!value) return '—';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function AdminAuditPage() {
  useDocumentTitle('Audit trail');
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [tab, setTab] = useState<'logs' | 'handoffs'>('logs');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [logsPage, setLogsPage] = useState<Page<AuditLog> | null>(null);
  const [handoffsPage, setHandoffsPage] = useState<Page<Handoff> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await auditApi.summary());
    } catch {
      /* summary is supplementary; keep the trail usable */
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const contractId = filters.contractId ? Number(filters.contractId) : undefined;
    const common = {
      contract_id: Number.isFinite(contractId) ? contractId : undefined,
      action: filters.action || undefined,
      admin_only: filters.adminOnly || undefined,
      page,
      page_size: PAGE_SIZE,
    };

    const request =
      tab === 'logs'
        ? auditApi.logs({
            ...common,
            field_name: filters.fieldName || undefined,
            date_from: filters.dateFrom || undefined,
            date_to: filters.dateTo || undefined,
          })
        : auditApi.handoffs(common);

    request
      .then((response) => {
        if (cancelled) return;
        if (tab === 'logs') setLogsPage(response as Page<AuditLog>);
        else setHandoffsPage(response as Page<Handoff>);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'The audit trail could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, filters, page, refreshKey]);

  const updateFilter = (key: keyof Filters, value: string | boolean) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const switchTab = (value: string) => {
    setTab(value as 'logs' | 'handoffs');
    setFilters((current) => ({ ...current, action: '', fieldName: '', dateFrom: '', dateTo: '' }));
    setPage(1);
  };

  const reset = () => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const actionOptions = useMemo(
    () => [
      { value: '', label: 'All actions' },
      ...(tab === 'logs' ? LOG_ACTIONS : HANDOFF_ACTIONS).map((action) => ({
        value: action,
        label: actionLabel(action),
      })),
    ],
    [tab],
  );

  const activeFilterCount =
    Number(Boolean(filters.contractId)) +
    Number(Boolean(filters.action)) +
    Number(Boolean(filters.fieldName)) +
    Number(filters.adminOnly) +
    Number(Boolean(filters.dateFrom)) +
    Number(Boolean(filters.dateTo));

  const currentPage = tab === 'logs' ? logsPage : handoffsPage;
  const rows = currentPage?.items ?? [];

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Governance"
        title="Audit trail"
        description="Every field change, transition, return and administrator override recorded by the register."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} className={cn(loading && 'animate-spin')} />}
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Field changes"
          value={summary?.total_changes ?? 0}
          sub="logged edits across the register"
          icon={History}
          tone="forest"
        />
        <SummaryCard
          label="Handoffs"
          value={summary?.total_handoffs ?? 0}
          sub="stage transitions recorded"
          icon={GitBranch}
          tone="info"
        />
        <SummaryCard
          label="Returns"
          value={summary?.return_count ?? 0}
          sub="sent back for correction"
          icon={Undo2}
          tone="amber"
        />
        <SummaryCard
          label="Overrides"
          value={summary?.override_count ?? 0}
          sub="administrator field edits"
          icon={ShieldAlert}
          tone="danger"
        />
      </section>

      <div className="card overflow-hidden">
        <div className="border-b border-line px-4 pt-1 md:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              items={[
                { value: 'logs', label: 'Field audit', count: summary?.total_changes, icon: <FileClock size={13} /> },
                { value: 'handoffs', label: 'Handoff history', count: summary?.total_handoffs, icon: <GitBranch size={13} /> },
              ]}
              value={tab}
              onChange={switchTab}
            />
            <button
              type="button"
              onClick={() => setAdvancedOpen((open) => !open)}
              className={cn(
                'mb-2 inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-semibold text-ink-soft transition-colors hover:bg-surface-2',
                advancedOpen && 'border-forest-soft bg-forest-soft text-forest',
              )}
              aria-expanded={advancedOpen}
            >
              <SlidersHorizontal size={13} />
              Filters
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-forest px-1.5 py-0.5 text-[9px] font-semibold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-line p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Select
              aria-label="Filter by action"
              value={filters.action}
              onChange={(event) => updateFilter('action', event.target.value)}
              options={actionOptions}
              className="w-full sm:w-[190px]"
            />
            <Input
              type="number"
              min={1}
              value={filters.contractId}
              onChange={(event) => updateFilter('contractId', event.target.value)}
              placeholder="Contract ID"
              aria-label="Filter by contract ID"
              className="w-full sm:w-[150px]"
            />
            <div className="flex h-[42px] shrink-0 items-center rounded-xl border border-line bg-surface px-3.5">
              <Toggle
                checked={filters.adminOnly}
                onChange={(checked) => updateFilter('adminOnly', checked)}
                label="Overrides only"
              />
            </div>
            {activeFilterCount > 0 && (
              <button type="button" onClick={reset} className="text-[11px] font-semibold text-forest hover:underline">
                Reset filters
              </button>
            )}
            <p className="ml-auto hidden text-[10px] text-muted sm:block">
              {currentPage ? `${currentPage.total} record${currentPage.total === 1 ? '' : 's'}` : '—'}
            </p>
          </div>

          {advancedOpen && tab === 'logs' && (
            <div className="grid gap-3 rounded-xl border border-line bg-surface-2 p-3.5 animate-slide-down sm:grid-cols-3">
              <FormField label="Field contains" htmlFor="audit-field">
                <Input
                  id="audit-field"
                  value={filters.fieldName}
                  onChange={(event) => updateFilter('fieldName', event.target.value)}
                  placeholder="e.g. amount, status"
                />
              </FormField>
              <FormField label="Changed from" htmlFor="audit-from">
                <Input
                  id="audit-from"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) => updateFilter('dateFrom', event.target.value)}
                />
              </FormField>
              <FormField label="Changed to" htmlFor="audit-to">
                <Input
                  id="audit-to"
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) => updateFilter('dateTo', event.target.value)}
                />
              </FormField>
            </div>
          )}
          {advancedOpen && tab === 'handoffs' && (
            <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[10.5px] text-muted">
              Handoffs can be filtered by action, contract and administrator override. Field and date filters apply to the
              field audit tab.
            </p>
          )}
        </div>

        {loading ? (
          <div className="p-4 md:p-5">
            <TableSkeleton rows={8} />
          </div>
        ) : error ? (
          <div className="p-5">
            <ErrorState title="Audit trail unavailable" description={error} onRetry={() => setRefreshKey((key) => key + 1)} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={SearchX}
              title="No audit entries match this view."
              description={
                activeFilterCount
                  ? 'Try removing a filter or widening the date range.'
                  : 'Nothing has been recorded for this view yet.'
              }
              action={
                activeFilterCount ? (
                  <Button variant="secondary" icon={<RotateCcw size={13} />} onClick={reset}>
                    Reset filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : tab === 'logs' ? (
          <LogsTable logs={rows as AuditLog[]} />
        ) : (
          <HandoffsTable handoffs={rows as Handoff[]} />
        )}

        {!loading && !error && currentPage && currentPage.total > 0 && (
          <div className="border-t border-line px-4 py-3.5 md:px-5">
            <Pagination
              page={currentPage.page}
              pages={currentPage.pages}
              total={currentPage.total}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </div>
        )}
      </div>

      <p className="flex items-center gap-1.5 px-1 text-[10px] text-muted">
        <ShieldAlert size={11} /> Administrator overrides require a written reason and are permanently visible here.
      </p>
    </div>
  );
}

function LogsTable({ logs }: { logs: AuditLog[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th className="table-head px-5 py-3">When</th>
              <th className="table-head px-3 py-3">Actor</th>
              <th className="table-head px-3 py-3">Action</th>
              <th className="table-head px-3 py-3">Contract</th>
              <th className="table-head px-3 py-3">Change</th>
              <th className="table-head px-3 py-3">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {logs.map((log) => (
              <tr key={log.id} className="align-top transition-colors hover:bg-surface-2">
                <td className="whitespace-nowrap px-5 py-3.5 text-[10.5px] text-muted">{formatDateTime(log.changed_at)}</td>
                <td className="px-3 py-3.5">
                  <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-soft">
                    <UserRound size={11} className="shrink-0 text-muted" />
                    <span className="max-w-[120px] truncate">{log.user_name || 'System'}</span>
                  </span>
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={actionTone(log.action)} className="px-1.5 py-0.5 text-[9px]">
                      {actionLabel(log.action)}
                    </Badge>
                    {log.is_admin_override && (
                      <span className="inline-flex items-center gap-1 text-[8.5px] font-semibold uppercase tracking-[0.06em] text-amber">
                        <ShieldAlert size={9} /> Override
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  {log.contract_no ? (
                    <Link to={`/contracts/${log.contract_id}`} className="link block max-w-[150px] truncate text-[11px]">
                      {log.contract_no}
                    </Link>
                  ) : (
                    <Link to={`/contracts/${log.contract_id}`} className="link text-[11px]">
                      #{log.contract_id}
                    </Link>
                  )}
                  <p className="mt-0.5 max-w-[150px] truncate text-[9px] text-muted">{log.project_name || '—'}</p>
                </td>
                <td className="max-w-[280px] px-3 py-3.5">
                  {log.field_name ? (
                    <div>
                      <p className="text-[10.5px] font-semibold text-ink-soft">{fieldLabel(log.field_name)}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] leading-snug">
                        <span className="max-w-[110px] truncate text-muted line-through" title={log.old_value || 'empty'}>
                          {shortValue(log.old_value, 28)}
                        </span>
                        <ArrowRight size={9} className="shrink-0 text-line-strong" />
                        <span className="max-w-[110px] truncate font-medium text-ink" title={log.new_value || 'empty'}>
                          {shortValue(log.new_value, 28)}
                        </span>
                      </p>
                    </div>
                  ) : (
                    <p className="text-[10.5px] text-muted">Stage transition</p>
                  )}
                </td>
                <td className="max-w-[200px] px-3 py-3.5">
                  <p className="break-words text-[10.5px] leading-relaxed text-muted" title={log.reason || undefined}>
                    {log.reason ? shortValue(log.reason, 80) : '—'}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-line md:hidden">
        {logs.map((log) => (
          <div key={log.id} className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-2">
              <Badge tone={actionTone(log.action)} className="px-1.5 py-0.5 text-[9px]">
                {actionLabel(log.action)}
              </Badge>
              <span className="text-[9.5px] text-muted">{formatDateTime(log.changed_at)}</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-ink-soft">
              <UserRound size={11} className="text-muted" />
              <span className="font-medium">{log.user_name || 'System'}</span>
              <span className="text-line-strong">·</span>
              <Link to={`/contracts/${log.contract_id}`} className="link truncate">
                {log.contract_no || `#${log.contract_id}`}
              </Link>
            </div>
            {log.field_name && (
              <p className="mt-2 text-[10.5px] leading-snug">
                <span className="font-semibold text-ink-soft">{fieldLabel(log.field_name)}: </span>
                <span className="text-muted line-through">{shortValue(log.old_value, 28)}</span>
                <span className="mx-1 text-line-strong">→</span>
                <span className="font-medium text-ink">{shortValue(log.new_value, 28)}</span>
              </p>
            )}
            {log.reason && <p className="mt-1.5 text-[10px] leading-relaxed text-muted">{log.reason}</p>}
            {log.is_admin_override && (
              <span className="mt-1.5 inline-flex items-center gap-1 text-[8.5px] font-semibold uppercase tracking-[0.06em] text-amber">
                <ShieldAlert size={9} /> Administrator override
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function HandoffsTable({ handoffs }: { handoffs: Handoff[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th className="table-head px-5 py-3">When</th>
              <th className="table-head px-3 py-3">Contract</th>
              <th className="table-head px-3 py-3">Action</th>
              <th className="table-head px-3 py-3">Stage movement</th>
              <th className="table-head px-3 py-3">Acted by</th>
              <th className="table-head px-3 py-3">Reason</th>
              <th className="table-head px-3 py-3 text-right">Version</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {handoffs.map((handoff) => (
              <tr key={handoff.id} className="align-top transition-colors hover:bg-surface-2">
                <td className="whitespace-nowrap px-5 py-3.5 text-[10.5px] text-muted">{formatDateTime(handoff.created_at)}</td>
                <td className="px-3 py-3.5">
                  <Link to={`/contracts/${handoff.contract_id}`} className="link text-[11px]">
                    Contract #{handoff.contract_id}
                  </Link>
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={actionTone(handoff.action)} className="px-1.5 py-0.5 text-[9px]">
                      {actionLabel(handoff.action)}
                    </Badge>
                    {handoff.is_admin_override && (
                      <span className="inline-flex items-center gap-1 text-[8.5px] font-semibold uppercase tracking-[0.06em] text-amber">
                        <ShieldAlert size={9} /> Override
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {handoff.from_status && (
                      <span className={cn('chip px-1.5 py-0.5 text-[8.5px]', toneClasses(statusTone(handoff.from_status)))}>
                        {statusLabel(handoff.from_status)}
                      </span>
                    )}
                    <ArrowRight size={9} className="text-line-strong" />
                    <span className={cn('chip px-1.5 py-0.5 text-[8.5px]', toneClasses(statusTone(handoff.to_status)))}>
                      {statusLabel(handoff.to_status)}
                    </span>
                  </div>
                  <p className="mt-1 text-[9px] text-muted">
                    {roleShort(handoff.from_role)} → {roleShort(handoff.to_role)}
                  </p>
                </td>
                <td className="px-3 py-3.5 text-[11px] text-ink-soft">{handoff.acted_by_name || 'System'}</td>
                <td className="max-w-[220px] px-3 py-3.5">
                  <p className="text-[10.5px] leading-relaxed text-muted" title={handoff.reason || undefined}>
                    {handoff.reason ? shortValue(handoff.reason, 90) : '—'}
                  </p>
                </td>
                <td className="px-3 py-3.5 text-right font-mono text-[10px] text-muted">v{handoff.version_after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-line md:hidden">
        {handoffs.map((handoff) => (
          <div key={handoff.id} className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-2">
              <Badge tone={actionTone(handoff.action)} className="px-1.5 py-0.5 text-[9px]">
                {actionLabel(handoff.action)}
              </Badge>
              <span className="text-[9.5px] text-muted">{formatDateTime(handoff.created_at)}</span>
            </div>
            <Link to={`/contracts/${handoff.contract_id}`} className="link mt-2 block text-[11px] font-semibold">
              Contract #{handoff.contract_id}
            </Link>
            <p className="mt-1 text-[10px] text-muted">
              {statusLabel(handoff.from_status)} → {statusLabel(handoff.to_status)}
            </p>
            <p className="mt-1 text-[10px] text-ink-soft">
              {handoff.acted_by_name || 'System'} · {roleShort(handoff.from_role)} → {roleShort(handoff.to_role)}
            </p>
            {handoff.reason && <p className="mt-1.5 text-[10px] leading-relaxed text-muted">{handoff.reason}</p>}
          </div>
        ))}
      </div>
    </>
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
  value: number;
  sub: string;
  icon: typeof History;
  tone: 'forest' | 'info' | 'amber' | 'danger';
}) {
  const palette = {
    forest: 'bg-forest-tint text-forest',
    info: 'bg-info-tint text-info',
    amber: 'bg-amber-tint text-amber',
    danger: 'bg-danger-tint text-danger',
  }[tone];

  return (
    <div className="card animate-fade-up p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="eyebrow">{label}</span>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', palette)}>
          <Icon size={15} />
        </span>
      </div>
      <p className="mt-2.5 font-serif text-[26px] font-semibold leading-none text-ink tabular">
        {value.toLocaleString()}
      </p>
      <p className="mt-2 text-[10.5px] text-muted">{sub}</p>
    </div>
  );
}
