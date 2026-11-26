import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../lib/format';

export function ForbiddenPage() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-[62vh] flex-col items-center justify-center text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <ShieldX size={28} strokeWidth={1.6} />
      </div>
      <p className="eyebrow mb-2">Access restricted</p>
      <h1 className="font-serif text-3xl font-semibold text-ink">This area is not part of your role.</h1>
      <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-muted">
        You are signed in as <span className="font-semibold text-ink">{roleLabel(user?.role)}</span>. If you believe
        you need access, ask an administrator to review your account.
      </p>
      <Link to="/dashboard" className="btn btn-primary mt-6">
        <ArrowLeft size={15} /> Back to dashboard
      </Link>
    </div>
  );
}
