import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Database, ScrollText, ShieldCheck, Users2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useDocumentTitle } from '../../lib/hooks';

const TABS = [
  {
    to: '/admin/users',
    label: 'User accounts',
    description: 'Roles, access and credentials',
    icon: Users2,
  },
  {
    to: '/admin/masters',
    label: 'Masters',
    description: 'Dropdown lists and evaluation team',
    icon: Database,
  },
  {
    to: '/admin/audit',
    label: 'Audit trail',
    description: 'Every field change and handoff',
    icon: ScrollText,
  },
];

export function AdminLayout() {
  useDocumentTitle('Administration');
  const location = useLocation();
  const active = TABS.find((tab) => location.pathname.startsWith(tab.to)) ?? TABS[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2 flex items-center gap-2">
            <ShieldCheck size={12} />
            Administration · restricted
          </p>
          <h1 className="display-title">Control the register.</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
            Manage who can act, keep the workbook lists current and inspect every recorded change. Administrative
            actions are visible to the whole audit trail.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">Current section</p>
          <p className="mt-1 text-[12.5px] font-semibold text-ink">{active.label}</p>
        </div>
      </header>

      <nav
        className="grid gap-2 rounded-2xl border border-line bg-surface p-2 sm:grid-cols-3"
        aria-label="Administration sections"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3.5 py-3 transition-all duration-200',
                  isActive
                    ? 'bg-forest-tint text-forest'
                    : 'text-ink-soft hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
                      isActive
                        ? 'border-forest-soft bg-surface text-forest'
                        : 'border-line bg-surface-2 text-muted group-hover:text-ink',
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold">{tab.label}</span>
                    <span className={cn('mt-0.5 block truncate text-[10.5px]', isActive ? 'text-forest' : 'text-muted')}>
                      {tab.description}
                    </span>
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div key={location.pathname} className="animate-fade-in">
        <Outlet />
      </div>
    </div>
  );
}
