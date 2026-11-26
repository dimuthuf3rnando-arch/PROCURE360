import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlarmClock,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileClock,
  FileText,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  Undo2,
  Users2,
  Wallet,
} from 'lucide-react';
import { dashboardApi } from '../api/analytics';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { AlertItem, BreakdownItem, CycleTimeItem, Dashboard, MilestoneDuration } from '../types/api';
import {
  ageLabel,
  dueLabel,
  formatCompactLKR,
  formatDate,
  formatLKR,
  formatNumber,
  humanizeAction,
  relativeTime,
  roleLabel,
  statusTone,
  STATUS_SHORT,
  toneClasses,
} from '../lib/format';
import { useAnimatedNumber, useDocumentTitle } from '../lib/hooks';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { SectionHeading } from '../components/ui/Layout';
import { EmptyState, ErrorState, LoadingCards } from '../components/ui/Feedback';
import { PercentRing, ProgressBar } from '../components/ui/Score';
import { Tabs } from '../components/ui/Tabs';
import { StatusBadge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { AwardTrendChart } from '../components/charts/Charts';

const FINANCIAL_TABS = [
  { value: 'office_region', label: 'Region' },
  { value: 'category', label: 'Category' },
  { value: 'procurement_method', label: 'Method' },
  { value: 'funds', label: 'Funds' },
] as const;

const FINANCIAL_PARAMS: Record<(typeof FINANCIAL_TABS)[number]['value'], string> = {
  office_region: 'office_region',
  category: 'category',
  procurement_method: 'procurement_method',
  funds: 'funds',
};

const ALERT_TABS = [
  { value: 'bec_overdue', label: 'BEC overdue' },
  { value: 'upcoming_completion', label: 'Completion watch' },
  { value: 'bond_expiry', label: 'Performance bond expiry' },
] as const;

type AlertTab = (typeof ALERT_TABS)[number]['value'];
type FinancialTab = (typeof FINANCIAL_TABS)[number]['value'];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function contractQuery(params: Record<string, string>): string {
  return `/contracts?${new URLSearchParams(params).toString()}`;
}

export function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user, canCreateRecords, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [financialTab, setFinancialTab] = useState<FinancialTab>('office_region');
  const [alertTab, setAlertTab] = useState<AlertTab>('bec_overdue');

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await dashboardApi.get();
      setData(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The dashboard could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
    [],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="skeleton h-3 w-48" />
          <div className="skeleton h-9 w-80" />
          <div className="skeleton h-3 w-64" />
        </div>
        <LoadingCards count={4} />
        <div className="grid gap-5 xl:grid-cols-3">
          <div className="card h-[330px] p-6 xl:col-span-2">
            <div className="skeleton h-3 w-32" />
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="skeleton h-28 rounded-xl" />
              ))}
            </div>
          </div>
          <div className="card h-[330px] p-6">
            <div className="skeleton h-3 w-28" />
            <div className="skeleton mx-auto mt-8 h-28 w-28 rounded-full" />
            <div className="skeleton mt-6 h-3 w-full" />
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="card h-[340px] p-6" />
          <div className="card h-[340px] p-6" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Dashboard unavailable"
        description={error ?? 'No analytics response was returned.'}
        onRetry={() => void load()}
      />
    );
  }

  const { totals, queues, financials, alerts, recent_activity, top_contractors } = data;
  const trendTotal = data.award_trend.reduce((sum, item) => sum + item.total_lkr, 0);
  const alertItems: AlertItem[] = alerts[alertTab];
  const financialItems: BreakdownItem[] = financials[financialTab] ?? [];
  const financialMax = Math.max(...financialItems.map((item) => item.total_lkr), 1);
  const alertCounts = {
    bec_overdue: alerts.bec_overdue.length,
    upcoming_completion: alerts.upcoming_completion.length,
    bond_expiry: alerts.bond_expiry.length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow mb-2 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-forest" />
            {today}
          </p>
          <h1 className="display-title">
            {greeting()}, <span className="text-forest">{user?.full_name.split(' ')[0]}</span>.
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
            {totals.active_contracts > 0
              ? `${totals.active_contracts} active ${totals.active_contracts === 1 ? 'file is' : 'files are'} moving through the register. ${totals.overdue_bec > 0 ? `${totals.overdue_bec} BEC ${totals.overdue_bec === 1 ? 'response is' : 'responses are'} overdue.` : 'No BEC responses are overdue.'}`
              : 'The register is clear. Open a new record to begin a procurement file.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />}
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            Refresh
          </Button>
          {canCreateRecords && (
            <Button size="sm" icon={<Plus size={15} />} onClick={() => navigate('/contracts/new')}>
              New project
            </Button>
          )}
        </div>
      </header>

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Portfolio awarded"
          value={formatCompactLKR(totals.total_awarded_lkr)}
          icon={Wallet}
          tone="forest"
          sub={`Average ${formatCompactLKR(totals.average_awarded_lkr)} per award`}
          footer={`${formatNumber(totals.total_contracts)} records in the register`}
          delay="animate-delay-1"
        />
        <KpiCard
          label="Active files"
          value={formatNumber(totals.active_contracts)}
          icon={FileClock}
          tone="amber"
          sub={`${formatNumber(totals.completed_contracts)} completed · ${totals.completion_rate}% closure`}
          footer={<ProgressBar value={totals.completion_rate} tone="forest" height="h-1" />}
          delay="animate-delay-2"
        />
        <KpiCard
          label="Awaiting action"
          value={formatNumber(totals.awaiting_action)}
          icon={AlarmClock}
          tone={totals.overdue_bec > 0 ? 'danger' : 'info'}
          sub={`${totals.overdue_bec} BEC overdue · ${totals.due_soon} completion${totals.due_soon === 1 ? '' : 's'} due soon`}
          footer={`${totals.expiring_bonds} performance bond${totals.expiring_bonds === 1 ? '' : 's'} expiring`}
          href="/contracts?mine=true"
          delay="animate-delay-3"
        />
        <KpiCard
          label="On-time completion"
          value={totals.on_time_rate === null ? '—' : `${totals.on_time_rate}%`}
          icon={Timer}
          tone="gold"
          sub={
            totals.avg_cycle_days === null
              ? 'No completed records yet'
              : `Average cycle ${totals.avg_cycle_days} days`
          }
          footer="Measured against effective completion date"
          delay="animate-delay-4"
        />
      </section>

      {/* Pipeline + health */}
      <section className="grid gap-5 xl:grid-cols-3">
        <div className="card animate-fade-up animate-delay-3 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 md:px-6">
            <div>
              <h2 className="font-serif text-[19px] font-semibold leading-tight">Workflow pipeline</h2>
              <p className="mt-0.5 text-[11.5px] text-muted">Live queues, aged from the most recent handoff.</p>
            </div>
            <Link to="/contracts" className="link inline-flex items-center gap-1 text-[11.5px] font-semibold">
              Open register <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 md:p-5">
            {queues.map((queue) => {
              const tone = statusTone(queue.status);
              return (
                <Link
                  key={queue.status}
                  to={contractQuery({ status: queue.status })}
                  className={cn(
                    'group relative overflow-hidden rounded-xl border border-line bg-surface-2 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface hover:shadow-card',
                  )}
                >
                  <span className={cn('absolute inset-y-0 left-0 w-[3px]', tone === 'neutral' ? 'bg-line-strong' : tone === 'amber' ? 'bg-amber' : tone === 'info' ? 'bg-info' : tone === 'danger' ? 'bg-danger' : 'bg-forest')} />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                        {STATUS_SHORT[queue.status as keyof typeof STATUS_SHORT] ?? queue.label}
                      </span>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className={cn('font-serif text-[30px] font-semibold leading-none tabular', queue.count === 0 ? 'text-muted' : 'text-ink')}>
                          {queue.count}
                        </span>
                        <span className="text-[11px] text-muted">{queue.count === 1 ? 'file' : 'files'}</span>
                      </div>
                    </div>
                    <span className={cn('chip px-2 py-1 text-[9px] uppercase tracking-[0.08em]', toneClasses(tone))}>
                      {queue.owner_role === 'MIXED' ? 'Mixed' : roleLabel(queue.owner_role)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-[10.5px] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 size={11} />
                      Avg {ageLabel(queue.avg_age_days)}
                    </span>
                    <span>Oldest {ageLabel(queue.oldest_age_days)}</span>
                  </div>
                  <ChevronRight
                    size={15}
                    className="absolute bottom-4 right-4 text-muted transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-forest"
                  />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="card flex flex-col animate-fade-up animate-delay-4">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-serif text-[19px] font-semibold leading-tight">Register health</h2>
            <p className="mt-0.5 text-[11.5px] text-muted">Completion and delivery performance.</p>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-5 py-6">
            <PercentRing
              percent={totals.completion_rate}
              label="completed"
              sublabel={`${totals.completed_contracts} of ${totals.total_contracts}`}
              size={132}
            />
            <div className="mt-6 grid w-full grid-cols-2 gap-2">
              <HealthFact label="On-time rate" value={totals.on_time_rate === null ? '—' : `${totals.on_time_rate}%`} />
              <HealthFact label="Avg cycle" value={totals.avg_cycle_days === null ? '—' : `${totals.avg_cycle_days}d`} />
              <HealthFact label="Due soon" value={String(totals.due_soon)} tone={totals.due_soon > 0 ? 'amber' : undefined} />
              <HealthFact label="Bonds expiring" value={String(totals.expiring_bonds)} tone={totals.expiring_bonds > 0 ? 'danger' : undefined} />
            </div>
          </div>
        </div>
      </section>

      {/* Trend + financials */}
      <section className="grid gap-5 xl:grid-cols-2">
        <div className="card animate-fade-up animate-delay-3">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 md:px-6">
            <div>
              <h2 className="font-serif text-[19px] font-semibold leading-tight">Award trend</h2>
              <p className="mt-0.5 text-[11.5px] text-muted">Awarded value without VAT · rolling twelve months.</p>
            </div>
            <div className="text-right">
              <p className="font-serif text-lg font-semibold leading-none text-ink">{formatCompactLKR(trendTotal)}</p>
              <p className="mt-1 text-[9.5px] uppercase tracking-[0.1em] text-muted">12-month total</p>
            </div>
          </div>
          <div className="px-3 pb-4 pt-5 md:px-4">
            <AwardTrendChart data={data.award_trend} />
          </div>
        </div>

        <div className="card flex flex-col animate-fade-up animate-delay-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 md:px-6">
            <div>
              <h2 className="font-serif text-[19px] font-semibold leading-tight">Financial breakdown</h2>
              <p className="mt-0.5 text-[11.5px] text-muted">Awarded value by register dimension.</p>
            </div>
            <Tabs
              items={FINANCIAL_TABS.map((tab) => ({ value: tab.value, label: tab.label }))}
              value={financialTab}
              onChange={(value) => setFinancialTab(value as FinancialTab)}
              variant="pill"
            />
          </div>
          <div key={financialTab} className="flex-1 space-y-1 px-4 py-3 animate-fade-in md:px-5">
            {financialItems.length === 0 ? (
              <div className="flex h-full min-h-[220px] items-center justify-center text-[12px] text-muted">
                No awarded value recorded for this dimension yet.
              </div>
            ) : (
              financialItems.slice(0, 6).map((item, index) => (
                <Link
                  key={item.key}
                  to={contractQuery({ [FINANCIAL_PARAMS[financialTab]]: item.key })}
                  className="group block rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-2"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[12px] font-medium text-ink-soft group-hover:text-ink">
                      {item.label}
                    </span>
                    <span className="shrink-0 text-[11.5px] font-semibold text-ink tabular">
                      {formatCompactLKR(item.total_lkr)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <ProgressBar
                      value={item.total_lkr}
                      max={financialMax}
                      tone={index === 0 ? 'forest' : index === 1 ? 'gold' : 'info'}
                      height="h-1"
                      className="flex-1"
                    />
                    <span className="w-14 shrink-0 text-right text-[9.5px] text-muted">{item.count} awards</span>
                  </div>
                </Link>
              ))
            )}
          </div>
          {financialItems.length > 6 && (
            <div className="border-t border-line px-5 py-2.5 text-[10.5px] text-muted">
              + {financialItems.length - 6} more {FINANCIAL_TABS.find((tab) => tab.value === financialTab)?.label.toLowerCase()} values
            </div>
          )}
        </div>
      </section>

      {/* Alerts + top contractors */}
      <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="card animate-fade-up animate-delay-3" id="alerts">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 md:px-6">
            <div>
              <h2 className="font-serif text-[19px] font-semibold leading-tight">Watchlists</h2>
              <p className="mt-0.5 text-[11.5px] text-muted">Deadlines that need a human decision.</p>
            </div>
            <Tabs
              items={ALERT_TABS.map((tab) => ({
                value: tab.value,
                label: tab.label,
                count: alertCounts[tab.value],
              }))}
              value={alertTab}
              onChange={(value) => setAlertTab(value as AlertTab)}
              variant="pill"
            />
          </div>
          <div key={alertTab} className="divide-y divide-line animate-fade-in">
            {alertItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-forest-tint text-forest">
                  <CheckCircle2 size={20} />
                </div>
                <p className="text-[13px] font-semibold text-ink">Nothing on this watchlist.</p>
                <p className="mt-1 text-[11.5px] text-muted">All items in this category are within their thresholds.</p>
              </div>
            ) : (
              alertItems.slice(0, 6).map((alert) => (
                <Link
                  key={`${alert.contract_id}-${alert.date_label}`}
                  to={`/contracts/${alert.contract_id}`}
                  className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2 md:px-6"
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border text-center',
                      alert.severity === 'error'
                        ? 'border-transparent bg-danger-soft text-danger'
                        : 'border-transparent bg-amber-soft text-amber',
                    )}
                  >
                    {alert.severity === 'error' ? <AlarmClock size={15} /> : <CalendarClock size={15} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink group-hover:text-forest">
                      {alert.project_name || alert.contract_no || `Contract #${alert.contract_id}`}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-muted">
                      {alert.contract_no && <span>{alert.contract_no}</span>}
                      {alert.contract_no && <span className="text-line-strong">·</span>}
                      <span>{alert.stage_label}</span>
                      {alert.contractor_name && (
                        <>
                          <span className="text-line-strong">·</span>
                          <span className="truncate">{alert.contractor_name}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10.5px] font-medium text-ink-soft tabular">{formatDate(alert.date)}</p>
                    <span
                      className={cn(
                        'mt-1 inline-block rounded-full px-2 py-0.5 text-[9.5px] font-semibold',
                        alert.days_delta !== null && alert.days_delta < 0
                          ? 'bg-danger-soft text-danger'
                          : 'bg-amber-soft text-amber',
                      )}
                    >
                      {dueLabel(alert.days_delta)}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="card animate-fade-up animate-delay-4">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-serif text-[19px] font-semibold leading-tight">Contractor watch</h2>
              <p className="mt-0.5 text-[11.5px] text-muted">Composite performance score.</p>
            </div>
            <Link to="/contractors" className="link inline-flex items-center gap-1 text-[11px] font-semibold">
              All <ArrowUpRight size={12} />
            </Link>
          </div>
          {top_contractors.length === 0 ? (
            <div className="px-5 py-10 text-center text-[12px] text-muted">No contractor ratings yet.</div>
          ) : (
            <div className="divide-y divide-line">
              {top_contractors.slice(0, 5).map((contractor, index) => (
                <Link
                  key={contractor.id}
                  to={`/contractors/${contractor.id}`}
                  className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2"
                >
                  <span className="w-4 text-center font-mono text-[10px] font-semibold text-muted">{index + 1}</span>
                  <Avatar name={contractor.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-ink group-hover:text-forest">{contractor.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <ProgressBar value={contractor.composite_score} max={5} height="h-1" tone={contractor.composite_score >= 4 ? 'forest' : contractor.composite_score >= 3.5 ? 'gold' : 'amber'} />
                      <span className="w-7 shrink-0 text-[10px] font-semibold text-ink-soft tabular">{contractor.composite_score.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-medium text-muted">{contractor.contract_count} contracts</p>
                    <p className="mt-0.5 text-[10px] font-semibold text-ink-soft">{formatCompactLKR(contractor.total_awarded_lkr)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Activity + cycles */}
      <section className="grid gap-5 lg:grid-cols-3">
        <div className="card animate-fade-up animate-delay-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-serif text-[18px] font-semibold leading-tight">Latest handoffs</h2>
            {isAdmin && (
              <Link to="/admin/audit" className="link text-[10.5px] font-semibold">
                Audit trail
              </Link>
            )}
          </div>
          {recent_activity.length === 0 ? (
            <div className="px-5 py-10 text-center text-[12px] text-muted">No handoffs recorded yet.</div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto scrollbar-thin">
              {recent_activity.slice(0, 7).map((activity) => (
                <Link
                  key={activity.id}
                  to={`/contracts/${activity.contract_id}`}
                  className="flex gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2"
                >
                  <ActivityIcon action={activity.action} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] leading-snug text-ink-soft">
                      <span className="font-semibold text-ink">{activity.acted_by_name || 'System'}</span>{' '}
                      {activity.action === 'FORWARD'
                        ? `moved the file to ${roleLabel(activity.to_role)}`
                        : activity.action === 'RETURN_TO_PREVIOUS'
                          ? `returned the file to ${roleLabel(activity.to_role)}`
                          : activity.action === 'COMPLETE'
                            ? 'completed the contract'
                            : activity.action === 'CREATED'
                              ? 'opened the record'
                              : humanizeAction(activity.action).toLowerCase()}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-muted">
                      {activity.contract_no || activity.project_name || `Contract #${activity.contract_id}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-[9.5px] text-muted">{relativeTime(activity.created_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card animate-fade-up animate-delay-3">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-serif text-[18px] font-semibold leading-tight">Stage turnaround</h2>
            <p className="mt-0.5 text-[11px] text-muted">Average days in each stage, handoff to handoff.</p>
          </div>
          <div className="space-y-4 px-5 py-5">
            {data.cycle_times.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-muted">Not enough handoff history yet.</p>
            ) : (
              <CycleBars items={data.cycle_times} />
            )}
          </div>
        </div>

        <div className="card animate-fade-up animate-delay-4">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-serif text-[18px] font-semibold leading-tight">Milestone durations</h2>
            <p className="mt-0.5 text-[11px] text-muted">Median-free averages from recorded dates.</p>
          </div>
          <div className="px-5 py-4">
            {data.milestone_durations.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-muted">Record milestone dates to see cycle benchmarks.</p>
            ) : (
              <MilestoneList items={data.milestone_durations} />
            )}
          </div>
        </div>
      </section>

      <p className="text-center text-[10px] text-muted">
        Analytics generated {relativeTime(data.generated_at)} · amounts in LKR without VAT
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  sub,
  footer,
  href,
  delay,
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  tone: 'forest' | 'amber' | 'danger' | 'info' | 'gold';
  sub: string;
  footer: React.ReactNode;
  href?: string;
  delay?: string;
}) {
  const palette = {
    forest: 'bg-forest-tint text-forest',
    amber: 'bg-amber-tint text-amber',
    danger: 'bg-danger-tint text-danger',
    info: 'bg-info-tint text-info',
    gold: 'bg-gold-soft text-gold',
  }[tone];

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="eyebrow">{label}</span>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', palette)}>
          <Icon size={16} strokeWidth={1.9} />
        </span>
      </div>
      <p className="mt-3 font-serif text-[30px] font-semibold leading-none tracking-tight text-ink tabular">{value}</p>
      <p className="mt-2.5 text-[11.5px] leading-snug text-muted">{sub}</p>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-muted">{footer}</div>
      {href && (
        <ArrowUpRight
          size={14}
          className="absolute right-4 top-[52px] text-muted transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-forest"
        />
      )}
    </>
  );

  const classes = cn(
    'card card-hover group relative animate-fade-up p-5',
    delay,
    href && 'cursor-pointer',
  );

  if (href) {
    return (
      <Link to={href} className={classes}>
        {content}
      </Link>
    );
  }
  return <div className={classes}>{content}</div>;
}

function HealthFact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'amber' | 'danger';
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className={cn('mt-1 font-serif text-lg font-semibold leading-none tabular', tone === 'amber' ? 'text-amber' : tone === 'danger' ? 'text-danger' : 'text-ink')}>
        {value}
      </p>
    </div>
  );
}

function ActivityIcon({ action }: { action: string }) {
  const map: Record<string, { icon: typeof Plus; cls: string }> = {
    CREATED: { icon: Plus, cls: 'bg-forest-tint text-forest' },
    FORWARD: { icon: ArrowRight, cls: 'bg-info-tint text-info' },
    RETURN_TO_PREVIOUS: { icon: Undo2, cls: 'bg-danger-soft text-danger' },
    COMPLETE: { icon: CheckCircle2, cls: 'bg-forest-tint text-forest' },
    ADMIN_OVERRIDE: { icon: ShieldAlert, cls: 'bg-amber-tint text-amber' },
  };
  const entry = map[action] ?? { icon: FileText, cls: 'bg-surface-2 text-muted' };
  const Icon = entry.icon;
  return (
    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', entry.cls)}>
      <Icon size={14} />
    </span>
  );
}

function CycleBars({ items }: { items: CycleTimeItem[] }) {
  const max = Math.max(...items.map((item) => item.avg_days), 1);
  const toneFor = (key: string) => {
    switch (key) {
      case 'DRAFT_PC_MANAGER':
        return 'bg-line-strong';
      case 'WITH_QS':
        return 'bg-amber';
      case 'WITH_PC_ENGINEER':
        return 'bg-info';
      case 'WITH_SUPPLY_OFFICER':
        return 'bg-info';
      case 'RETURNED_FOR_CORRECTION':
        return 'bg-danger';
      default:
        return 'bg-forest';
    }
  };
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium text-ink-soft">{item.label}</span>
            <span className="text-[11px] font-semibold text-ink tabular">{item.avg_days.toFixed(1)}d</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className={cn('h-full rounded-full animate-grow-bar origin-left', toneFor(item.key))}
                style={{ width: `${Math.max(4, (item.avg_days / max) * 100)}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right text-[9px] text-muted">{item.count} samples</span>
          </div>
        </div>
      ))}
      <p className="pt-1 text-[9.5px] leading-relaxed text-muted">
        Open-stage averages include time still accumulating in the queue.
      </p>
    </div>
  );
}

function MilestoneList({ items }: { items: MilestoneDuration[] }) {
  return (
    <div className="relative space-y-0">
      {items.map((item, index) => (
        <div key={item.key} className="relative flex gap-3 pb-4 last:pb-0">
          {index < items.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-line" aria-hidden />}
          <span className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-forest bg-surface" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-medium leading-snug text-ink-soft">{item.label}</p>
              <p className="shrink-0 text-[11px] font-semibold text-ink tabular">{item.avg_days.toFixed(1)}d</p>
            </div>
            <p className="mt-0.5 text-[9px] text-muted">{item.count} records with both dates</p>
          </div>
        </div>
      ))}
    </div>
  );
}
