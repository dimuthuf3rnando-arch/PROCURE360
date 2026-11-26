import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock3, Inbox, Send } from 'lucide-react';
import { dashboardApi } from '../api/analytics';
import { useDocumentTitle } from '../lib/hooks';
import { formatCompactLKR, humanizeAction, relativeTime, roleLabel } from '../lib/format';
import type { MyWork, MyWorkItem } from '../types/api';
import { StatusBadge } from '../components/ui/Badge';
import { SectionHeading } from '../components/ui/Layout';
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/Feedback';
import { Button } from '../components/ui/Button';

export function MyWorkPage() {
  useDocumentTitle('My work');
  const [data, setData] = useState<MyWork | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await dashboardApi.myWork());
    } catch {
      setError('Your work could not be loaded. Try refreshing.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="mx-auto max-w-[1240px] space-y-5">
      <SectionHeading
        eyebrow="Your desk"
        title="My work"
        description="The files you are entering right now and the submissions you have most recently forwarded or returned."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      />

      {loading ? (
        <div className="card p-5">
          <TableSkeleton rows={6} />
        </div>
      ) : error ? (
        <ErrorState title="Work view unavailable" description={error} onRetry={() => setRefreshKey((key) => key + 1)} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <WorkPanel
            title="Received data"
            subtitle="Records currently routed to your section for action"
            icon={<Inbox size={16} />}
            items={data?.ongoing ?? []}
            emptyTitle="Nothing received"
            emptyDescription="Files forwarded to your section will appear here."
          />
          <WorkPanel
            title="Recently sent"
            subtitle="Your forwards, returns and completions from the last 3 months"
            icon={<Send size={16} />}
            items={data?.recent ?? []}
            emptyTitle="No recent submissions"
            emptyDescription="Handoffs you actioned in the last 90 days will be listed here."
            showAction
          />
        </div>
      )}
    </div>
  );
}

function WorkPanel({
  title,
  subtitle,
  icon,
  items,
  emptyTitle,
  emptyDescription,
  showAction = false,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  items: MyWorkItem[];
  emptyTitle: string;
  emptyDescription: string;
  showAction?: boolean;
}) {
  return (
    <section className="card flex flex-col">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-tint text-forest">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-[18px] font-semibold leading-tight text-ink">{title}</h2>
          <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p>
        </div>
        <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={Clock3} title={emptyTitle} description={emptyDescription} />
        </div>
      ) : (
        <div className="divide-y divide-line">
          {items.map((item) => (
            <Link
              key={`${item.contract_id}-${item.action ?? item.status}`}
              to={`/contracts/${item.contract_id}`}
              className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-ink group-hover:text-forest">
                  {item.project_name || item.contract_no || `Contract #${item.contract_id}`}
                </p>
                <p className="mt-0.5 truncate text-[10.5px] text-muted">
                  {item.contract_no ? `${item.contract_no} · ` : ''}
                  {showAction && item.action ? `${humanizeAction(item.action)} · ` : ''}
                  {item.to_role ? `to ${roleLabel(item.to_role)} · ` : ''}
                  {relativeTime(item.updated_at)}
                </p>
                {item.reason && (
                  <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-muted">“{item.reason}”</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <StatusBadge status={item.status} label={item.status_label} />
                {item.amount_lkr !== null && (
                  <span className="text-[10.5px] font-semibold text-ink tabular">
                    {formatCompactLKR(item.amount_lkr)}
                  </span>
                )}
                <ArrowUpRight size={13} className="text-muted transition-colors group-hover:text-forest" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
