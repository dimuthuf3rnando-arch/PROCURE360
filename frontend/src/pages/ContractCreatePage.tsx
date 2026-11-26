import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, Info, Plus, ShieldAlert } from 'lucide-react';
import { contractsApi } from '../api/contracts';
import { mastersApi } from '../api/masters';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { LookupGroups } from '../types/api';
import { CREATE_REQUIRED, SECTIONS, fieldsForRole } from '../lib/fields';
import { useDocumentTitle } from '../lib/hooks';
import { cn } from '../lib/utils';
import { formatDate } from '../lib/format';
import { Button } from '../components/ui/Button';
import { ContractFieldControl } from '../components/contracts/ContractFields';
import { FormField, Textarea, Toggle } from '../components/ui/Field';
import { PageLoader } from '../components/ui/Feedback';
import { WorkflowStepper } from '../components/contracts/WorkflowStepper';

const EMPTY_LOOKUPS: LookupGroups = {
  category: [],
  priority: [],
  procurement_method: [],
  office_region: [],
  funds: [],
};

export function ContractCreatePage() {
  useDocumentTitle('New project');
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [lookups, setLookups] = useState<LookupGroups>(EMPTY_LOOKUPS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(fieldsForRole('PC_MANAGER').map((key) => [key, null])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [adminOverride, setAdminOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    let cancelled = false;
    mastersApi
      .bundle()
      .then((bundle) => {
        if (!cancelled) setLookups(bundle.lookups);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Lookup lists could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const section = SECTIONS[0];
  const fields = useMemo(() => section.groups.flatMap((group) => group.fields), [section]);

  const dateWarning = useMemo(() => {
    const target = values.target_completion as string | null;
    const received = values.request_receiving_date as string | null;
    if (target && received && target < received) {
      return 'Target completion falls before the request was received. Please confirm the dates.';
    }
    return null;
  }, [values.target_completion, values.request_receiving_date]);

  const update = (key: string, value: unknown) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    fields.forEach((field) => {
      const value = values[field.key];
      if (value === null || value === undefined || value === '') {
        nextErrors[field.key] = 'Required to open the record.';
      }
    });
    if (isAdmin && adminOverride && overrideReason.trim().length < 5) {
      setErrors(nextErrors);
      return false;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) {
      toast.error('Some fields need attention', 'Complete the highlighted mandatory fields before opening the record.');
      return;
    }
    if (isAdmin && !adminOverride) {
      toast.error('Administrator override required', 'Enable override mode and record a reason before creating a record.');
      return;
    }
    setSubmitting(true);
    try {
      const contract = await contractsApi.create({
        ...(values as Record<string, never>),
        ...(isAdmin ? { admin_override: true, override_reason: overrideReason.trim() } : {}),
      });
      toast.success('Contract record opened', `${contract.project_name ?? 'The new record'} is now a draft with the P&C Manager.`);
      navigate(`/contracts/${contract.id}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'The record could not be created.';
      toast.error('Could not open the record', message);
      if (err instanceof ApiError && err.details && typeof err.details === 'object' && 'field' in err.details) {
        const field = String((err.details as { field?: string }).field ?? '');
        if (field) setErrors((current) => ({ ...current, [field]: message }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoader label="Loading record options…" />;

  return (
    <div className="mx-auto max-w-[1240px]">
      <div className="mb-5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
        <Link to="/contracts" className="link inline-flex items-center gap-1.5">
          <ArrowLeft size={13} /> Contracts
        </Link>
        <ChevronRight size={12} className="text-line-strong" />
        <span className="text-ink-soft">New record</span>
      </div>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Orders 1–7 · P&amp;C Manager</p>
          <h1 className="display-title">Open a procurement record.</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
            Capture the request brief and route it to the Quantity Surveyor. Every field you enter here becomes the
            fixed starting point for the rest of the file.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">Will be owned by</p>
          <p className="mt-1 text-[12.5px] font-semibold text-ink">{user?.full_name}</p>
        </div>
      </header>

      {loadError && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-line bg-amber-soft px-4 py-3 text-[12px] text-amber">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{loadError} You can still type custom values, but dropdown options may be limited.</span>
        </div>
      )}

      <form onSubmit={submit} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 md:px-6">
              <div>
                <h2 className="font-serif text-[19px] font-semibold leading-tight">Project brief</h2>
                <p className="mt-0.5 text-[11.5px] text-muted">All seven orders are mandatory to open the record.</p>
              </div>
              <span className="chip border-line bg-surface-2 text-muted">Draft · P&amp;C Manager</span>
            </div>
            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 md:px-6 md:py-6">
              {fields.map((field) => (
                <ContractFieldControl
                  key={field.key}
                  meta={field}
                  value={values[field.key]}
                  onChange={update}
                  lookups={lookups}
                  error={errors[field.key]}
                  warning={field.key === 'target_completion' && dateWarning ? dateWarning : undefined}
                />
              ))}
            </div>
          </div>

          {isAdmin && (
            <div className="card border-amber">
              <div className="flex items-start gap-3 px-5 py-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-tint text-amber">
                  <ShieldAlert size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink">Administrator override</p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                    Administrator-created records require override mode and a written reason, both of which are
                    recorded in the audit trail.
                  </p>
                  <div className="mt-3">
                    <Toggle
                      checked={adminOverride}
                      onChange={setAdminOverride}
                      label="Create this record as an administrator override"
                    />
                  </div>
                  {adminOverride && (
                    <div className="mt-4">
                      <FormField
                        label="Override reason"
                        htmlFor="create-override-reason"
                        required
                        hint="Minimum 5 characters. Stored against the record creation."
                      >
                        <Textarea
                          id="create-override-reason"
                          rows={3}
                          value={overrideReason}
                          onChange={(event) => setOverrideReason(event.target.value)}
                          placeholder="Explain why an administrator is opening this record…"
                        />
                      </FormField>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[11px] text-muted">
              <Info size={13} /> You can still adjust these fields until the record is forwarded to the QS.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => navigate('/contracts')} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="submit"
                icon={<Plus size={15} />}
                loading={submitting}
                disabled={isAdmin && (!adminOverride || overrideReason.trim().length < 5)}
              >
                Open record
              </Button>
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-[86px]">
          <div className="card p-5">
            <p className="eyebrow mb-4">Handoff path</p>
            <WorkflowStepper status="DRAFT_PC_MANAGER" currentOwnerRole="PC_MANAGER" vertical />
            <p className="mt-5 border-t border-line pt-4 text-[11px] leading-relaxed text-muted">
              Each discipline completes its own orders before the file moves forward. You can amend this brief until
              you forward it to the Quantity Surveyor.
            </p>
          </div>

          <div className="card p-5">
            <p className="eyebrow mb-2">Good to know</p>
            <ul className="space-y-2.5 text-[11.5px] leading-relaxed text-muted">
              <li className="flex gap-2">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-forest" />
                Opening the record does not forward it. You can review and amend before the handoff.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-forest" />
                Contract No is assigned by the QS; award details arrive with the P&C Engineer.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-forest" />
                Each handoff and field change is recorded with the actor and timestamp.
              </li>
            </ul>
          </div>

          {dateWarning && (
            <div className="rounded-xl border border-line bg-amber-soft px-4 py-3 text-[11px] leading-relaxed text-amber">
              <span className="font-semibold">Date check:</span> {dateWarning}
            </div>
          )}

          <p className="px-1 text-[10px] leading-relaxed text-muted">
            Opening this record will notify the register, not other staff. Use the forward action when the brief is
            ready for the QS.
          </p>
        </aside>
      </form>
    </div>
  );
}

function SidebarStep({
  step,
  title,
  description,
  active,
}: {
  step: string;
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <div className="flex gap-2.5">
      <span
        className={cn(
          'font-mono text-[9px] font-semibold',
          active ? 'text-forest' : 'text-muted',
        )}
      >
        {step}
      </span>
      <div>
        <p className={cn('text-[11.5px] font-semibold leading-tight', active ? 'text-ink' : 'text-ink-soft')}>{title}</p>
        <p className="mt-0.5 text-[10.5px] leading-snug text-muted">{description}</p>
      </div>
    </div>
  );
}
