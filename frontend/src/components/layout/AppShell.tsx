import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Building2,
  CheckCheck,
  ChevronDown,
  FileText,
  HardHat,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/utils';
import { roleLabel } from '../../lib/format';
import { switchThemeWithAnimation } from '../../lib/theme';
import { Avatar } from '../ui/Avatar';
import { ChangePasswordDialog } from '../account/ChangePasswordDialog';
import { NotificationItem } from '../notifications/NotificationItem';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  match?: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/my-work', label: 'My work', icon: CheckCheck },
  { to: '/contracts', label: 'Contracts', icon: FileText, match: '/contracts' },
  { to: '/contractors', label: 'Contractors', icon: HardHat, match: '/contractors' },
  { to: '/admin/users', label: 'Administration', icon: ShieldCheck, match: '/admin', adminOnly: true },
];

export function AppShell() {
  const { user, logout, isAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  const notifications = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const [themeBusy, setThemeBusy] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const themeBtnRef = useRef<HTMLButtonElement>(null);

  const handleThemeToggle = () => {
    if (themeBusy) return;
    switchThemeWithAnimation({
      theme,
      setTheme,
      button: themeBtnRef.current,
      onBusyChange: setThemeBusy,
    });
  };

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
    setNotificationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!notificationOpen) return;
    const handler = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notificationOpen]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-50 bg-topbar shadow-[0_2px_20px_rgba(10,18,14,0.28)]">
        <div className="mx-auto flex h-[62px] max-w-[1480px] items-center gap-3 px-4 md:px-7">
          <Link to="/dashboard" className="group flex shrink-0 items-center gap-2.5" aria-label="PROCURE360 dashboard">
            <span className="relative flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-forest font-serif text-[13px] font-bold tracking-tight text-white shadow-inset">
              P3
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-gold ring-2 ring-topbar" />
            </span>
            <span className="hidden sm:block">
              <span className="block font-serif text-[17px] font-semibold leading-none tracking-[0.01em] text-white">
                PROCURE<span className="text-gold">360</span>
              </span>
              <span className="mt-1 block text-[8.5px] font-medium uppercase tracking-[0.22em] text-white/40">
                Procurement register
              </span>
            </span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Primary">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => {
                    const active = item.match ? location.pathname.startsWith(item.match) : isActive;
                    return cn('nav-pill flex items-center gap-2', active && 'nav-pill-active');
                  }}
                >
                  <Icon size={14.5} strokeWidth={1.9} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <span className="mr-1 hidden rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/45 md:inline-block">
              LAN edition
            </span>
            <div className="relative" ref={notificationRef}>
              <button
                type="button"
                onClick={() => setNotificationOpen((open) => !open)}
                className={cn(
                  'relative flex h-9 w-9 items-center justify-center rounded-lg text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white',
                  notificationOpen && 'bg-white/[0.08] text-white',
                )}
                aria-label="Notifications"
                aria-expanded={notificationOpen}
              >
                <Bell size={16} />
                {notifications.unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-gold px-1 text-[9px] font-bold leading-4 text-topbar">
                    {notifications.unread > 9 ? '9+' : notifications.unread}
                  </span>
                )}
              </button>

              {notificationOpen && (
                <div className="absolute right-0 top-[48px] w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-line bg-surface shadow-lift animate-slide-down">
                  <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold text-ink">Notifications</p>
                      <p className="text-[10.5px] text-muted">
                        {notifications.unread} unread · Windows alerts {notifications.permission === 'granted' ? 'on' : 'off'}
                      </p>
                    </div>
                    {notifications.unread > 0 && (
                      <button
                        type="button"
                        onClick={() => void notifications.markAllRead()}
                        className="rounded-lg px-2 py-1 text-[10.5px] font-semibold text-forest hover:bg-forest-tint"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.permission !== 'granted' && notifications.permission !== 'unsupported' && (
                    <button
                      type="button"
                      onClick={() => void notifications.enableAlerts()}
                      className="flex w-full items-center gap-2 border-b border-line px-4 py-2.5 text-left text-[11.5px] font-medium text-forest hover:bg-forest-tint"
                    >
                      <Bell size={13} /> Enable Windows notifications
                    </button>
                  )}
                  {notifications.permission === 'unsupported' && (
                    <p className="border-b border-line px-4 py-2.5 text-[10.5px] leading-snug text-muted">
                      Windows notifications need HTTPS. Open{' '}
                      <span className="font-semibold text-ink">https://10.187.233.116:8443</span>{' '}
                      and accept the certificate warning to enable them.
                    </p>
                  )}
                  <div className="max-h-[360px] overflow-y-auto scrollbar-thin">
                    {notifications.items.length === 0 ? (
                      <p className="px-4 py-8 text-center text-[12px] text-muted">No notifications yet.</p>
                    ) : (
                      notifications.items.map((item) => (
                        <NotificationItem
                          key={item.id}
                          item={item}
                          onOpen={(notification) => {
                            if (!notification.is_read) void notifications.markRead(notification.id);
                            if (notification.contract_id) navigate(`/contracts/${notification.contract_id}`);
                            setNotificationOpen(false);
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              ref={themeBtnRef}
              type="button"
              onClick={handleThemeToggle}
              disabled={themeBusy}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-60"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((open) => !open)}
                className={cn(
                  'flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-white/[0.07]',
                  userMenuOpen && 'bg-white/[0.07]',
                )}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
              >
                <Avatar name={user?.full_name} size="sm" />
                <span className="hidden text-left md:block">
                  <span className="block max-w-[150px] truncate text-[12px] font-semibold leading-tight text-white">
                    {user?.full_name}
                  </span>
                  <span className="block text-[9.5px] font-medium uppercase tracking-[0.1em] text-white/40">
                    {roleLabel(user?.role)}
                  </span>
                </span>
                <ChevronDown size={13} className={cn('hidden text-white/45 transition-transform md:block', userMenuOpen && 'rotate-180')} />
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[48px] w-64 overflow-hidden rounded-2xl border border-line bg-surface shadow-lift animate-slide-down"
                >
                  <div className="border-b border-line bg-surface-2 px-4 py-3.5">
                    <p className="text-[13px] font-semibold text-ink">{user?.full_name}</p>
                    <p className="truncate text-[11px] text-muted">{user?.email}</p>
                    <span className="mt-2 inline-flex rounded-full bg-forest-tint px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-forest">
                      {roleLabel(user?.role)}
                    </span>
                  </div>
                  <div className="p-1.5">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setPasswordOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
                    >
                      <KeyRound size={14.5} />
                      Change password
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[12.5px] font-medium text-danger transition-colors hover:bg-danger-soft"
                    >
                      <LogOut size={14.5} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white lg:hidden"
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile drawer: slides in from the left as an overlay so page content
            is not pushed. Backdrop fades in/out alongside the drawer. */}
        <div
          className={cn(
            'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
            mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] bg-topbar shadow-lift transition-transform duration-300 ease-smooth lg:hidden',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div className="flex h-[62px] items-center justify-between border-b border-white/[0.07] px-4">
            <span className="font-serif text-[16px] font-semibold text-white">
              PROCURE<span className="text-gold">360</span>
            </span>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex h-[calc(100%-62px)] flex-col px-3 py-4">
            <nav className="flex flex-col gap-0.5" aria-label="Mobile primary">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = item.match ? location.pathname.startsWith(item.match) : location.pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors',
                      active ? 'bg-white/[0.09] text-white' : 'text-white/65 hover:bg-white/[0.06] hover:text-white',
                    )}
                  >
                    <Icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto flex items-center gap-3 border-t border-white/[0.08] pt-3">
              <Avatar name={user?.full_name} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-white">{user?.full_name}</p>
                <p className="text-[10px] uppercase tracking-[0.1em] text-white/40">{roleLabel(user?.role)}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="ml-auto flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <LogOut size={15} />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 md:px-7 md:py-8">
        <div key={location.pathname} className="page-enter">
          <Outlet />
        </div>
      </main>

      <footer className="no-print mt-auto border-t border-line px-4 py-5 md:px-7">
        <div className="mx-auto flex max-w-[1480px] flex-col items-center justify-between gap-2 text-[10.5px] text-muted sm:flex-row">
          <p className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-forest font-serif text-[8px] font-bold text-white">P3</span>
            PROCURE360 · Procurement &amp; Contracts
          </p>
          <p className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Building2 size={11} /> Sequential handoff</span>
            <span className="text-line-strong">·</span>
            <span>Field-level audit</span>
            <span className="text-line-strong">·</span>
            <span>v1.0</span>
          </p>
        </div>
      </footer>

      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}
