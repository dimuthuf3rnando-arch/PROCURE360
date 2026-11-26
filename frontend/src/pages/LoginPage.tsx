import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  FileCheck2,
  Layers3,
  LockKeyhole,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { contractsApi } from '../api/contracts';
import { ApiError } from '../api/client';
import type { PublicStats } from '../types/api';
import { formatCompactLKR, formatNumber } from '../lib/format';
import { cn } from '../lib/utils';
import { switchThemeWithAnimation } from '../lib/theme';
import { useDocumentTitle } from '../lib/hooks';
import { Spinner } from '../components/ui/Feedback';

const WORKFLOW = [
  {
    step: '01',
    role: 'P&C Manager',
    detail: 'Opens the record · Orders 1–7',
    icon: FileCheck2,
  },
  {
    step: '02',
    role: 'Quantity Surveyor',
    detail: 'Contract formation · Orders 8–20',
    icon: Layers3,
  },
  {
    step: '03',
    role: 'P&C Engineer / Supply Officer',
    detail: 'Tender, award & delivery · Orders 21–41',
    icon: ShieldCheck,
  },
];

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { user, login } = useAuth();
  const { theme, setTheme } = useTheme();
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const [themeBusy, setThemeBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState<PublicStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    contractsApi
      .publicStats()
      .then((response) => {
        if (!cancelled) setStats(response);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (user) return <Navigate to={from} replace />;

  const handleThemeToggle = () => {
    if (themeBusy) return;
    switchThemeWithAnimation({
      theme,
      setTheme,
      button: themeBtnRef.current,
      onBusyChange: setThemeBusy,
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach the PROCURE360 server. Check the network connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      {/* ── Editorial panel ─────────────────────────────────────────────── */}
      <section className="relative hidden overflow-hidden bg-topbar px-10 py-9 text-white lg:flex lg:flex-col xl:px-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              'radial-gradient(760px 420px at 15% 8%, rgba(46,107,87,0.5), transparent 62%), radial-gradient(620px 400px at 88% 88%, rgba(183,146,78,0.14), transparent 60%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '72px 72px',
            maskImage: 'radial-gradient(circle at 30% 30%, black, transparent 75%)',
          }}
        />

        <div className="relative flex items-center gap-3">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-forest font-serif text-sm font-bold text-white shadow-inset">
            P3
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-gold ring-2 ring-topbar" />
          </span>
          <div>
            <p className="font-serif text-[21px] font-semibold leading-none">
              PROCURE<span className="text-gold">360</span>
            </p>
            <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.26em] text-white/40">
              Procurement &amp; Contracts
            </p>
          </div>
        </div>

        <div className="relative my-auto max-w-[540px] py-12">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55 animate-fade-up">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            One register · Three disciplines
          </p>
          <h1 className="text-balance font-serif text-[44px] font-medium leading-[1.08] tracking-[-0.015em] text-[#f7f3e9] animate-fade-up animate-delay-1 xl:text-[52px]">
            A calmer way to run
            <br />
            <em className="text-[#c9b382]">procurement.</em>
          </h1>
          <p className="mt-5 max-w-[430px] text-[13.5px] leading-relaxed text-white/55 animate-fade-up animate-delay-2">
            A single, audited file moves from request to award to delivery — with every handoff,
            field change and deadline held in one place.
          </p>

          <div className="mt-10 overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.035] backdrop-blur-sm animate-fade-up animate-delay-3">
            {WORKFLOW.map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className={cn(
                    'group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03]',
                    index < WORKFLOW.length - 1 && 'border-b border-white/[0.07]',
                  )}
                >
                  <span className="font-mono text-[10px] font-semibold text-gold">{item.step}</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-white/60 transition-colors group-hover:bg-forest group-hover:text-white">
                    <Icon size={15} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold text-white/90">{item.role}</p>
                    <p className="mt-0.5 text-[10.5px] text-white/40">{item.detail}</p>
                  </div>
                  <CheckCircle2 size={15} className="text-white/20 transition-colors group-hover:text-forest" />
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative flex flex-wrap items-end justify-between gap-6 border-t border-white/[0.08] pt-6">
          {stats ? (
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              <Stat value={formatNumber(stats.total_contracts)} label="Records" />
              <Stat value={formatCompactLKR(stats.total_awarded_lkr)} label="Awarded value" />
              <Stat value={formatNumber(stats.contractors)} label="Contractors" />
            </div>
          ) : (
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Audited at every handoff</p>
          )}
          <p className="text-[9.5px] uppercase tracking-[0.16em] text-white/25">Secure LAN session</p>
        </div>
      </section>

      {/* ── Sign-in panel ───────────────────────────────────────────────── */}
      <section className="relative flex flex-col bg-canvas px-5 py-7 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest font-serif text-[12px] font-bold text-white">
              P3
            </span>
            <span className="font-serif text-lg font-semibold text-ink">
              PROCURE<span className="text-gold">360</span>
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              ref={themeBtnRef}
              type="button"
              onClick={handleThemeToggle}
              disabled={themeBusy}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:text-ink disabled:opacity-60"
              aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>

        <div className="my-auto w-full max-w-[420px] self-center py-10">
          <p className="eyebrow mb-3 animate-fade-up">Welcome back</p>
          <h2 className="font-serif text-[34px] font-semibold leading-tight tracking-tight text-ink animate-fade-up animate-delay-1">
            Sign in to the register.
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted animate-fade-up animate-delay-1">
            Use the account issued by your procurement administrator.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4 animate-fade-up animate-delay-2">
            <div>
              <label htmlFor="login-email" className="field-label">
                <Mail size={12} /> Email address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@procure360.lk"
                className="field-input py-3"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="field-label">
                  <LockKeyhole size={12} /> Password
                </label>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••"
                  className="field-input py-3 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((show) => !show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-line bg-danger-soft px-3.5 py-3 text-[12px] font-medium leading-relaxed text-danger animate-slide-down"
              >
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn btn-primary btn-lg w-full">
              {submitting ? (
                <>
                  <Spinner size={15} className="text-white dark:text-[#0f1915]" /> Signing in…
                </>
              ) : (
                <>
                  Sign in <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[10.5px] text-muted">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-forest" /> Session encrypted in transit
          </span>
          <Link to="/dashboard" className="link hidden sm:inline">
            Continue to dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-serif text-xl font-semibold leading-none text-white/90">{value}</p>
      <p className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-white/35">{label}</p>
    </div>
  );
}
