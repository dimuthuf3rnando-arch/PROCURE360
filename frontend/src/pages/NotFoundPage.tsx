import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[62vh] flex-col items-center justify-center text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 text-muted">
        <Compass size={28} strokeWidth={1.5} />
      </div>
      <p className="eyebrow mb-2">404 · Page not found</p>
      <h1 className="font-serif text-3xl font-semibold text-ink">This page has left the register.</h1>
      <p className="mt-3 max-w-md text-[13px] leading-relaxed text-muted">
        The link may be old, or the record may have moved. Head back to the dashboard to continue.
      </p>
      <Link to="/dashboard" className="btn btn-primary mt-6">
        Return to dashboard
      </Link>
    </div>
  );
}
