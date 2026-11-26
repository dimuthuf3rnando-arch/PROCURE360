import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  FileText,
  GitBranch,
  HardHat,
  History,
  Info,
  Lock,
  LockOpen,
  MapPin,
  RotateCcw,
  Save,
  SendHorizonal,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  UserRound,
  Users2,
  Wallet,
  XCircle,
} from 'lucide-react';
import { contractsApi } from '../api/contracts';
import { mastersApi } from '../api/masters';
import { contractorsApi } from '../api/contractors';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  AuditLog,
  Contract,
  ContractFields,
  ContractorDirectoryItem,
  EvaluationTeamMember,
  Handoff,
  LookupGroups,
} from '../types/api';
import {
  COMPLETE_REQUIRED,
  FORWARD_REQUIRED,
  SECTIONS,
  SECTION_BY_ROLE,
  fieldLabel,
  isRequired,
  type WorkflowRole,
} from '../lib/fields';
import {
  formatDate,
  formatDateTime,
  formatLKR,
  formatNumber,
  humanizeAction,
  humanizeField,
  relativeTime,
  roleLabel,
  roleShort,
  STATUS_LABELS,
  statusLabel,
  statusTone,
  toneClasses,
} from '../lib/format';
import { useDocumentTitle } from '../lib/hooks';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Badge, StatusBadge, PriorityBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { FormField, Select, Textarea, Toggle } from '../components/ui/Field';
import { Tabs } from '../components/ui/Tabs';
import { PageLoader, ErrorState, EmptyState } from '../components/ui/Feedback';
import { Avatar } from '../components/ui/Avatar';
import { ProgressBar } from '../components/ui/Score';
import { ContractFieldControl, ReadOnlyFieldValue } from '../components/contracts/ContractFields';
import { WorkflowStepper } from '../components/contracts/WorkflowStepper';

const EMPTY_LOOKUPS: LookupGroups = {
  category: [],
  priority: [],
  procurement_method: [],
  office_region: [],
  funds: [],
};

const ROLE_ICONS: Record<WorkflowRole, typeof ClipboardList> = {
  PC_MANAGER: ClipboardList,
  QS: Calculator,
  PC_ENGINEER: HardHat,
  SUPPLY_OFFICER: HardHat,
};

type ActionKind = 'forward' | 'return' | 'complete';

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function buildForm(contract: Contract): Record<string, unknown> {
  const form: Record<string, unknown> = {};
  contract.editable_fields.forEach((field) => {
    const value = (contract as unknown as Record<string, unknown>)[field];
    form[field] = Array.isArray(value) ? [...value] : value;
  });
  return form;
}

const FIELD_ROLE: Record<string, WorkflowRole> = Object.fromEntries(
  SECTIONS.flatMap((section) =>
    section.groups.flatMap((group) => group.fields.map((field) => [field.key, section.role])),
  ),
);

export function ContractWorkspacePage() {
  const { id } = useParams();
  const contractId = Number(id);
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();

  const [contract, setContract] = useState<Contract | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [snapshot, setSnapshot] = useState('{}');
  const [lookups, setLookups] = useState<LookupGroups>(EMPTY_LOOKUPS);
  const [team, setTeam] = useState<EvaluationTeamMember[]>([]);
  const [contractors, setContractors] = useState<ContractorDirectoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('record');
  const [openSections, setOpenSections] = useState<Set<WorkflowRole>>(new Set());
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [adminOverride, setAdminOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [dialog, setDialog] = useState<ActionKind | null>(null);
  const [forwardTarget, setForwardTarget] = useState<'PC_ENGINEER' | 'SUPPLY_OFFICER'>('PC_ENGINEER');
  const [actionReason, setActionReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [handoffs, setHandoffs] = useState<Handoff[] | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const hydrate = useCallback((next: Contract) => {
    setContract(next);
    const nextForm = buildForm(next);
    setForm(nextForm);
    setSnapshot(JSON.stringify(nextForm));
    const role =
      next.status === 'COMPLETED'
        ? null
        : (next.current_owner_role as WorkflowRole);
    // Supply Officer and P&C Engineer share one section on the record.
    const sectionRole = role === 'SUPPLY_OFFICER' ? 'PC_ENGINEER' : role;
    if (sectionRole && SECTION_BY_ROLE[sectionRole]) {
      setOpenSections((current) =>
        current.has(sectionRole) ? current : new Set([...current, sectionRole]),
      );
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (!Number.isFinite(contractId)) return;
    setHistoryLoading(true);
    setHistoryError(null);
    const [handoffResult, auditResult] = await Promise.allSettled([
      contractsApi.handoffs(contractId),
      contractsApi.audit(contractId),
    ]);
    if (handoffResult.status === 'fulfilled') setHandoffs(handoffResult.value);
    else setHistoryError('Handoff history could not be loaded.');
    if (auditResult.status === 'fulfilled') setAuditLogs(auditResult.value);
    else setHistoryError('Audit history could not be loaded.');
    setHistoryLoading(false);
  }, [contractId]);

  const loadContract = useCallback(async () => {
    const next = await contractsApi.get(contractId);
    hydrate(next);
    return next;
  }, [contractId, hydrate]);

  useEffect(() => {
    if (!Number.isFinite(contractId)) {
      setLoading(false);
      setError('That contract reference is not valid.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadContract()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'The contract could not be loaded.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    mastersApi
      .bundle()
      .then((bundle) => {
        if (!cancelled) {
          setLookups(bundle.lookups);
          setTeam(bundle.evaluation_team);
        }
      })
      .catch(() => undefined);

    contractorsApi
      .list({ sort: 'name', direction: 'asc', include_inactive: true })
      .then((items) => {
        if (!cancelled) setContractors(items);
      })
      .catch(() => undefined);

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [contractId, loadContract, loadHistory]);

  useDocumentTitle(contract?.contract_no || contract?.project_name || 'Contract');

  const dirty = useMemo(() => JSON.stringify(form) !== snapshot, [form, snapshot]);
  const adminReady = !isAdmin || (adminOverride && overrideReason.trim().length >= 5);
  const canEditFields = Boolean(contract && contract.editable_fields.length > 0 && (!isAdmin || adminOverride));
  const canSave = dirty && canEditFields && adminReady;

  const requiredFields = useMemo(() => {
    if (!contract || contract.status === 'COMPLETED') return [];
    const role = contract.current_owner_role as WorkflowRole;
    if (role === 'PC_ENGINEER' || role === 'SUPPLY_OFFICER') return COMPLETE_REQUIRED;
    return FORWARD_REQUIRED[role] ?? [];
  }, [contract]);

  const readValue = useCallback(
    (field: string): unknown => {
      if (Object.prototype.hasOwnProperty.call(form, field)) return form[field];
      if (!contract) return null;
      return (contract as unknown as Record<string, unknown>)[field];
    },
    [form, contract],
  );

  const missingRequired = useMemo(
    () => requiredFields.filter((field) => isEmpty(readValue(field))),
    [requiredFields, readValue],
  );

  const warningByField = useMemo(() => {
    const map: Record<string, string> = {};
    contract?.warnings.forEach((warning) => {
      warning.fields.forEach((field) => {
        if (!map[field]) map[field] = warning.message;
      });
    });
    return map;
  }, [contract?.warnings]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const focusField = useCallback((field: string) => {
    const role = FIELD_ROLE[field];
    if (role) {
      setOpenSections((current) => (current.has(role) ? current : new Set([...current, role])));
    }
    setActiveTab('record');
    window.setTimeout(() => {
      const element = document.getElementById(`field-${field}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = element?.querySelector<HTMLElement>('input, select, textarea, button');
      input?.focus({ preventScroll: true });
    }, 120);
  }, []);

  const persist = useCallback(
    async (announce: boolean): Promise<Contract | null> => {
      if (!contract) return null;
      if (!dirty) {
        if (announce) toast.info('Nothing to save', 'No field values have changed on this record.');
        return contract;
      }
      if (isAdmin && !adminReady) {
        toast.error('Override required', 'Enable administrator override and record a reason of at least 5 characters.');
        return null;
      }
      setSaving(true);
      try {
        const values: Record<string, unknown> = {};
        contract.editable_fields.forEach((field) => {
          const raw = form[field];
          values[field] = raw === '' ? null : raw;
        });
        const updated = await contractsApi.update(contract.id, {
          ...(values as Partial<ContractFields>),
          version: contract.version,
          reason: changeNote.trim() || 'Record section updated.',
          admin_override: isAdmin ? adminOverride : false,
          override_reason: isAdmin && adminOverride ? overrideReason.trim() : null,
        });
        hydrate(updated);
        setChangeNote('');
        if (announce) toast.success('Changes saved', `Version ${updated.version} is now on the record.`);
        void loadHistory();
        return updated;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setConflict(true);
          throw err;
        }
        toast.error('Could not save changes', err instanceof ApiError ? err.message : 'The record could not be updated.');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [
      contract,
      dirty,
      form,
      isAdmin,
      adminReady,
      adminOverride,
      overrideReason,
      changeNote,
      hydrate,
      loadHistory,
      toast,
    ],
  );

  const handleSave = async () => {
    try {
      await persist(true);
    } catch {
      /* conflict dialog takes over */
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (canSave && !saving) void handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const openAction = (kind: ActionKind) => {
    if (!contract) return;
    if (kind !== 'return') {
      if (missingRequired.length > 0) {
        toast.error(
          'Required fields are incomplete',
          `${missingRequired.length} field${missingRequired.length === 1 ? '' : 's'} must be completed before this action.`,
        );
        focusField(missingRequired[0]);
        return;
      }
    }
    if (isAdmin && !adminReady) {
      toast.error('Override required', 'Enable administrator override and record a reason before changing the workflow.');
      return;
    }
    setActionError(null);
    setActionReason('');
    setDialog(kind);
  };

  const confirmAction = async () => {
    if (!contract || !dialog) return;
    if (dialog === 'return' && actionReason.trim().length < 5) {
      setActionError('A return reason of at least 5 characters is required.');
      return;
    }
    if (isAdmin && !adminReady) {
      setActionError('Administrator override and a written reason are required for workflow actions.');
      return;
    }
    setActionBusy(true);
    setActionError(null);
    let current = contract;
    try {
      if (dirty) {
        const updated = await persist(false);
        if (!updated) {
          setDialog(null);
          setActionBusy(false);
          return;
        }
        current = updated;
      }
      const payload = {
        version: current.version,
        reason: actionReason.trim() || null,
        admin_override: isAdmin ? adminOverride : false,
        override_reason: isAdmin && adminOverride ? overrideReason.trim() : null,
        ...(dialog === 'forward' && current.current_owner_role === 'QS'
          ? { target_role: forwardTarget }
          : {}),
      };
      const response =
        dialog === 'forward'
          ? await contractsApi.forward(current.id, payload)
          : dialog === 'return'
            ? await contractsApi.returnForCorrection(current.id, payload)
            : await contractsApi.complete(current.id, payload);
      hydrate(response.contract);
      setDialog(null);
      setActionReason('');
      toast.success(
        dialog === 'return' ? 'Returned for correction' : dialog === 'complete' ? 'Contract completed' : 'Handoff recorded',
        response.message,
      );
      void loadHistory();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDialog(null);
        setConflict(true);
      } else {
        setActionError(err instanceof ApiError ? err.message : 'The workflow action could not be completed.');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const reloadLatest = async () => {
    setConflict(false);
    try {
      await loadContract();
      void loadHistory();
      toast.info('Latest version loaded', 'The record has been refreshed from the server.');
    } catch (err) {
      toast.error('Could not reload', err instanceof ApiError ? err.message : 'The record could not be refreshed.');
    }
  };

  if (loading) return <PageLoader label="Opening contract file…" />;
  if (error || !contract) {
    return (
      <ErrorState
        title="Contract unavailable"
        description={error ?? 'The record was not found.'}
        onRetry={() => void loadContract().then(hydrate)}
        action={
          <Link to="/contracts" className="btn btn-secondary">
            Back to contracts
          </Link>
        }
      />
    );
  }

  const available = contract.available_actions;
  const canForward = available.includes('FORWARD') && !available.includes('COMPLETE');
  const canComplete = available.includes('COMPLETE');
  const canReturn = available.includes('RETURN');
  const hasActions = canForward || canComplete || canReturn;
  const editableSections = new Set(contract.editable_sections as WorkflowRole[]);
  const completed = contract.status === 'COMPLETED';
  const currentRole = contract.current_owner_role as WorkflowRole;
  const nextRole: WorkflowRole =
    currentRole === 'PC_MANAGER' ? 'QS' : currentRole === 'QS' ? forwardTarget : 'PC_ENGINEER';
  const missingLabels = missingRequired.map((field) => fieldLabel(field));
  const warnings = contract.warnings;
  const shownWarnings = showAllWarnings ? warnings : warnings.slice(0, 3);
  const errorCount = warnings.filter((warning) => warning.severity === 'error').length;

  const actionCopy = {
    forward: {
      title: `Forward to ${roleShort(nextRole)}`,
      description: `The ${roleShort(nextRole)} becomes the owner and your section locks. Any unsaved changes are saved first.`,
      confirm: 'Forward record',
      icon: <SendHorizonal size={18} />,
    },
    return: {
      title: 'Return for correction',
      description: 'The record moves back to the previous role. A written reason is mandatory and appears in the handoff history.',
      confirm: 'Return record',
      icon: <Undo2 size={18} />,
    },
    complete: {
      title: 'Complete this contract',
      description: 'Completion closes the file and records your name, timestamp and note against the procurement lifecycle.',
      confirm: 'Complete contract',
      icon: <BadgeCheck size={18} />,
    },
  };

  return (
    <div className="mx-auto max-w-[1400px] pb-24 xl:pb-0">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
        <Link to="/contracts" className="link inline-flex items-center gap-1.5">
          <ArrowLeft size={13} /> Contracts
        </Link>
        <ChevronRight size={12} className="text-line-strong" />
        <span className="text-ink-soft">{contract.contract_no || `Record #${contract.id}`}</span>
      </div>

      {/* Header */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={contract.status} />
            <PriorityBadge priority={contract.priority} />
            {contract.assigned_to_me && (
              <Badge tone="forest" dot>
                Assigned to you
              </Badge>
            )}
            {contract.is_overdue && (
              <Badge tone="danger" dot>
                Overdue
              </Badge>
            )}
          </div>
          <h1 className="max-w-4xl font-serif text-[30px] font-semibold leading-[1.15] tracking-tight text-ink md:text-[36px]">
            {contract.project_name || `Contract record #${contract.id}`}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
            {contract.contract_no && <span className="font-medium text-ink-soft">{contract.contract_no}</span>}
            {contract.contract_no && <span className="text-line-strong">·</span>}
            <span>{contract.contract_name || 'Contract identity pending'}</span>
            <span className="text-line-strong">·</span>
            <span>Version {contract.version}</span>
            <span className="text-line-strong">·</span>
            <span>Updated {relativeTime(contract.updated_at)}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowLeft size={14} />}
            onClick={() => {
              if (dirty && !window.confirm('You have unsaved changes. Leave this record and discard them?')) return;
              navigate('/contracts');
            }}
          >
            Register
          </Button>
        </div>
      </header>

      {/* Fact strip */}
      <div className="card mb-5 grid grid-cols-2 divide-line overflow-hidden md:grid-cols-4 md:divide-x">
        <Fact
          icon={Wallet}
          label="Awarded without VAT"
          value={formatLKR(contract.awarded_amount_without_vat)}
          sub={contract.funds || 'Fund source pending'}
        />
        <Fact
          icon={Users2}
          label="Contractor"
          value={contract.contractor?.name || 'Not selected'}
          sub={contract.contractor?.registration_no || 'Assigned at award'}
          className="border-t border-line md:border-t-0"
        />
        <Fact
          icon={CalendarClock}
          label="Effective completion"
          value={formatDate(contract.effective_completion_date)}
          sub={
            contract.revised_completion_date
              ? `Revised · original ${formatDate(contract.original_intended_completion_date)}`
              : contract.original_intended_completion_date
                ? `Original completion`
                : contract.target_completion
                  ? `Target ${formatDate(contract.target_completion)}`
                  : 'Not yet recorded'
          }
          className="border-t border-line md:border-t-0"
        />
        <Fact
          icon={UserRound}
          label="Current owner"
          value={roleLabel(contract.current_owner_role)}
          sub={contract.assigned_to_me ? 'Waiting on your section' : `Status · ${contract.status_label}`}
          className="border-t border-line md:border-t-0"
        />
      </div>

      {/* Return reason */}
      {contract.status === 'RETURNED_FOR_CORRECTION' && contract.return_reason && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-line bg-danger-soft px-4 py-3.5 animate-fade-up">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger text-danger">
            <RotateCcw size={15} />
          </span>
          <div>
            <p className="text-[12px] font-semibold text-danger">
              Returned by {roleLabel(contract.returned_from_role)} for correction
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-soft">{contract.return_reason}</p>
          </div>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div
          className={cn(
            'mb-4 rounded-2xl border px-4 py-3.5',
            errorCount > 0 ? 'border-danger bg-danger-soft' : 'border-line bg-amber-soft',
          )}
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className={cn('mt-0.5 shrink-0', errorCount > 0 ? 'text-danger' : 'text-amber')} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn('text-[12px] font-semibold', errorCount > 0 ? 'text-danger' : 'text-amber')}>
                  {warnings.length} data-quality {warnings.length === 1 ? 'note' : 'notes'}
                </p>
                <span className="text-[10px] text-muted">{errorCount} error{errorCount === 1 ? '' : 's'}</span>
              </div>
              <ul className="mt-1.5 space-y-1">
                {shownWarnings.map((warning) => (
                  <li key={`${warning.code}-${warning.fields.join('-')}`}>
                    <button
                      type="button"
                      onClick={() => warning.fields[0] && focusField(warning.fields[0])}
                      className={cn(
                        'text-left text-[11.5px] leading-relaxed transition-colors hover:underline',
                        warning.severity === 'error' ? 'text-danger' : 'text-ink-soft',
                      )}
                    >
                      {warning.message}
                    </button>
                  </li>
                ))}
              </ul>
              {warnings.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllWarnings((show) => !show)}
                  className="mt-1.5 text-[10.5px] font-semibold text-forest hover:underline"
                >
                  {showAllWarnings ? 'Show fewer' : `Show all ${warnings.length}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_352px]">
        {/* Main column */}
        <div>
          <Tabs
            items={[
              { value: 'record', label: 'Record', icon: <FileText size={13} /> },
              { value: 'handoffs', label: 'Handoffs', icon: <GitBranch size={13} />, count: handoffs?.length },
              { value: 'audit', label: 'Audit trail', icon: <History size={13} />, count: auditLogs?.length },
            ]}
            value={activeTab}
            onChange={setActiveTab}
            variant="pill"
            className="mb-4"
          />

          {activeTab === 'record' && (
            <div className="space-y-4">
              {isAdmin && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[11px] text-muted">
                  <ShieldAlert size={13} className="text-amber" />
                  Administrator view. All sections are editable only with override mode and a written reason.
                  {!adminOverride && (
                    <button type="button" className="ml-auto font-semibold text-amber hover:underline" onClick={() => setAdminOverride(true)}>
                      Enable override
                    </button>
                  )}
                </div>
              )}

              {SECTIONS.map((section, index) => {
                const fields = section.groups.flatMap((group) => group.fields);
                const sectionEditable = editableSections.has(section.role);
                const showControls = sectionEditable && canEditFields;
                const filled = fields.filter((field) => !isEmpty(readValue(field.key))).length;
                const open = openSections.has(section.role);
                const Icon = ROLE_ICONS[section.role];
                const isCurrent =
                  !completed &&
                  (contract.current_owner_role === section.role ||
                    (contract.current_owner_role === 'SUPPLY_OFFICER' && section.role === 'PC_ENGINEER'));
                const complete = filled === fields.length;
                return (
                  <section
                    key={section.role}
                    className={cn(
                      'card overflow-hidden transition-shadow',
                      isCurrent && 'ring-1 ring-[var(--forest-line)]',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSections((current) => {
                          const next = new Set(current);
                          if (next.has(section.role)) next.delete(section.role);
                          else next.add(section.role);
                          return next;
                        })
                      }
                      className="flex w-full items-start gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-2 md:px-5"
                      aria-expanded={open}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                          isCurrent
                            ? 'border-forest-soft bg-forest-tint text-forest'
                            : sectionEditable
                              ? 'border-line bg-surface-2 text-ink-soft'
                              : 'border-line bg-surface-2 text-muted',
                        )}
                      >
                        <Icon size={17} strokeWidth={1.8} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                            {section.range}
                          </span>
                          <span className="text-line-strong" aria-hidden>·</span>
                          <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                            {section.label}
                          </span>
                          {isCurrent && !completed && (
                            <span className="rounded-full bg-forest-tint px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-forest">
                              Current stage
                            </span>
                          )}
                          {completed && section.role === 'PC_ENGINEER' && (
                            <span className="chip border-transparent bg-forest-soft py-0.5 text-[8.5px] text-forest">Closed</span>
                          )}
                        </div>
                        <h2 className="mt-1 font-serif text-[19px] font-semibold leading-tight text-ink">{section.title}</h2>
                        <p className="mt-1 hidden max-w-2xl text-[11.5px] leading-relaxed text-muted sm:block">
                          {section.description}
                        </p>
                      </div>
                      <div className="hidden shrink-0 flex-col items-end gap-1.5 pt-0.5 sm:flex">
                        <span className="text-[9.5px] font-medium text-muted">
                          {filled}/{fields.length} fields
                        </span>
                        <div className="flex items-center gap-2">
                          {sectionEditable && canEditFields ? (
                            <span className="chip border-forest-soft bg-forest-soft py-0.5 text-[8.5px] text-forest">
                              <LockOpen size={9} /> Editable
                            </span>
                          ) : sectionEditable && isAdmin ? (
                            <span className="chip border-transparent bg-amber-soft py-0.5 text-[8.5px] text-amber">
                              <ShieldAlert size={9} /> Override
                            </span>
                          ) : complete ? (
                            <span className="chip border-line bg-surface-2 py-0.5 text-[8.5px] text-muted">
                              <Check size={9} /> Recorded
                            </span>
                          ) : (
                            <span className="chip border-line bg-surface-2 py-0.5 text-[8.5px] text-muted">
                              <Lock size={9} /> Locked
                            </span>
                          )}
                          <ChevronDown
                            size={16}
                            className={cn('text-muted transition-transform duration-200', open && 'rotate-180')}
                          />
                        </div>
                      </div>
                      <ChevronDown
                        size={16}
                        className={cn('mt-2 shrink-0 text-muted transition-transform duration-200 sm:hidden', open && 'rotate-180')}
                      />
                    </button>

                    {open && (
                      <div className="border-t border-line bg-surface px-4 py-5 md:px-5">
                        {!sectionEditable && !completed && (
                          <div className="mb-5 flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-[11px] leading-relaxed text-muted">
                            <Lock size={13} className="mt-0.5 shrink-0" />
                            <span>
                              This section is locked while the record is with{' '}
                              <span className="font-semibold text-ink-soft">{roleLabel(contract.current_owner_role)}</span>.
                              You can read every value but only the current owner can change them.
                            </span>
                          </div>
                        )}
                        {sectionEditable && isAdmin && !adminOverride && (
                          <div className="mb-5 flex items-start gap-2 rounded-xl border border-line bg-amber-soft px-3.5 py-2.5 text-[11px] leading-relaxed text-amber">
                            <ShieldAlert size={13} className="mt-0.5 shrink-0" />
                            <span>Enable administrator override in the sidebar to edit any section. Every change is audited.</span>
                          </div>
                        )}
                        {sectionEditable && isAdmin && adminOverride && overrideReason.trim().length < 5 && (
                          <div className="mb-5 flex items-start gap-2 rounded-xl border border-line bg-amber-soft px-3.5 py-2.5 text-[11px] leading-relaxed text-amber">
                            <ShieldAlert size={13} className="mt-0.5 shrink-0" />
                            <span>Record an override reason of at least 5 characters before saving.</span>
                          </div>
                        )}

                        <div className="space-y-6">
                          {section.groups.map((group) => (
                            <div key={group.title}>
                              <div className="mb-3 flex items-center gap-2.5">
                                <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
                                  {group.title}
                                </h3>
                                <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-mono text-[8.5px] text-muted">
                                  {group.caption}
                                </span>
                                <span className="h-px flex-1 bg-line" />
                              </div>
                              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                                {group.fields.map((field) => {
                                  // QS picks the committee once; afterwards the saved selection is reference-only.
                                  // Use the persisted value so several members can be chosen in one edit session.
                                  const becLockedForQs =
                                    section.role === 'QS' &&
                                    field.key === 'bec_member_ids' &&
                                    ((contract?.bec_member_ids as number[] | null)?.length ?? 0) > 0;
                                  return showControls && !becLockedForQs ? (
                                    <ContractFieldControl
                                      key={field.key}
                                      meta={field}
                                      value={readValue(field.key)}
                                      onChange={(key, value) =>
                                        setForm((current) => ({ ...current, [key]: value }))
                                      }
                                      lookups={lookups}
                                      team={team}
                                      contractors={contractors}
                                      contractorFallbackName={
                                        field.key === 'contractor_id' ? contract?.contractor?.name ?? undefined : undefined
                                      }
                                      onContractorCreated={(created) =>
                                        setContractors((current) => [
                                          ...current,
                                          {
                                            id: created.id,
                                            name: created.name,
                                            registration_no: created.registration_no ?? null,
                                            contact_person: null,
                                            phone: null,
                                            email: null,
                                            office_region: null,
                                            is_active: created.is_active ?? true,
                                            composite_score: 0,
                                            rating_label: 'Unrated',
                                            rating_count: 0,
                                            contract_count: 0,
                                            completed_count: 0,
                                            total_awarded_lkr: 0,
                                            on_time_extended_rate: null,
                                            average_mobilization_days: null,
                                          },
                                        ])
                                      }
                                      required={isRequired(requiredFields, field.key)}
                                      warning={warningByField[field.key]}
                                    />
                                  ) : (
                                    <ReadOnlyFieldValue
                                      key={field.key}
                                      field={field}
                                      value={readValue(field.key)}
                                      team={team}
                                      contractors={contractors}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>

                        {index < SECTIONS.length - 1 && filled === 0 && !sectionEditable && (
                          <p className="mt-5 flex items-center gap-1.5 text-[10.5px] text-muted">
                            <Clock3 size={11} /> This section will open when the record reaches this stage.
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}

              <p className="px-1 text-[10px] leading-relaxed text-muted">
                Fields are grouped by the 41 procurement orders. Compound orders are normalised: contract period
                (35), tender documents (34), time extension (38), performance bond (39) and engagement order (41).
              </p>
            </div>
          )}

          {activeTab === 'handoffs' && (
            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="font-serif text-[19px] font-semibold leading-tight">Handoff history</h2>
                  <p className="mt-0.5 text-[11.5px] text-muted">Every stage change, in order, with the actor and reason.</p>
                </div>
                <span className="chip border-line bg-surface-2 text-muted">{handoffs?.length ?? 0} events</span>
              </div>
              <div className="px-5 py-5">
                {historyLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((item) => (
                      <div key={item} className="flex gap-3">
                        <div className="skeleton h-8 w-8 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <div className="skeleton h-3 w-1/3" />
                          <div className="skeleton h-2.5 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : historyError ? (
                  <ErrorState title="History unavailable" description={historyError} onRetry={() => void loadHistory()} />
                ) : !handoffs || handoffs.length === 0 ? (
                  <EmptyState icon={GitBranch} title="No handoffs yet" description="This record has not moved between roles." />
                ) : (
                  <HandoffTimeline handoffs={handoffs} />
                )}
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="font-serif text-[19px] font-semibold leading-tight">Field-level audit</h2>
                  <p className="mt-0.5 text-[11.5px] text-muted">Immutable change log with old and new values.</p>
                </div>
                <div className="flex items-center gap-2">
                  {auditLogs?.some((log) => log.is_admin_override) && (
                    <Badge tone="amber" icon={<ShieldAlert size={10} />}>Contains overrides</Badge>
                  )}
                  <span className="chip border-line bg-surface-2 text-muted">{auditLogs?.length ?? 0} entries</span>
                </div>
              </div>
              <div className="px-5 py-5">
                {historyLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((item) => (
                      <div key={item} className="skeleton h-16 rounded-xl" />
                    ))}
                  </div>
                ) : !auditLogs || auditLogs.length === 0 ? (
                  <EmptyState icon={History} title="No audit entries yet" description="Field changes will appear here as the record is edited." />
                ) : (
                  <div className="space-y-2.5">
                    {auditLogs.map((log) => (
                      <AuditEntry key={log.id} log={log} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 xl:sticky xl:top-[86px]">
          <div className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow mb-1.5">File progress</p>
                <p className="text-[12px] font-semibold text-ink">{contract.status_label}</p>
              </div>
              <span className="rounded-lg border border-line bg-surface-2 px-2 py-1 font-mono text-[9.5px] text-muted">
                v{contract.version}
              </span>
            </div>
            <div className="mt-4">
              <WorkflowStepper
                status={contract.status}
                currentOwnerRole={contract.current_owner_role}
                returnedFromRole={contract.returned_from_role}
                vertical
              />
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-[10.5px] text-muted">
              <span className={cn('h-1.5 w-1.5 rounded-full', contract.assigned_to_me ? 'bg-forest' : 'bg-line-strong')} />
              {contract.assigned_to_me
                ? 'This handoff is waiting on you.'
                : `Waiting on ${roleLabel(contract.current_owner_role)}.`}
            </div>
          </div>

          {!completed && requiredFields.length > 0 && (hasActions || canEditFields) && (
            <div className="card p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="eyebrow">Before {canComplete ? 'completion' : 'handoff'}</p>
                <span className="text-[10px] font-semibold text-muted tabular">
                  {requiredFields.length - missingRequired.length}/{requiredFields.length}
                </span>
              </div>
              <ProgressBar
                value={requiredFields.length - missingRequired.length}
                max={requiredFields.length}
                tone={missingRequired.length === 0 ? 'forest' : 'amber'}
                className="mt-2.5"
              />
              {missingRequired.length === 0 ? (
                <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-forest">
                  <CheckCircle2 size={13} /> All required fields are complete.
                </p>
              ) : (
                <>
                  <p className="mt-2.5 text-[10.5px] leading-relaxed text-muted">
                    {missingRequired.length} required field{missingRequired.length === 1 ? '' : 's'} remain before this action
                    can move forward.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {missingLabels.slice(0, 6).map((label, index) => (
                      <li key={label}>
                        <button
                          type="button"
                          onClick={() => focusField(missingRequired[index])}
                          className="group flex w-full items-start gap-1.5 rounded-md px-1 py-1 text-left text-[11px] text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
                        >
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber" />
                          <span className="flex-1">{label}</span>
                          <ArrowRight size={10} className="mt-0.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                      </li>
                    ))}
                    {missingLabels.length > 6 && (
                      <li className="px-1 pt-0.5 text-[10px] text-muted">+ {missingLabels.length - 6} more</li>
                    )}
                  </ul>
                </>
              )}
            </div>
          )}

          {isAdmin && (
            <div className={cn('card p-5', adminOverride && 'border-amber')}>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-tint text-amber">
                  <ShieldAlert size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-ink">Administrator override</p>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                    Required for any edit or workflow action by an administrator.
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <Toggle
                  checked={adminOverride}
                  onChange={(checked) => {
                    setAdminOverride(checked);
                    if (!checked) setOverrideReason('');
                  }}
                  label={adminOverride ? 'Override mode is on' : 'Enable override mode'}
                />
              </div>
              {adminOverride && (
                <div className="mt-3.5 animate-slide-down">
                  <FormField
                    label="Override reason"
                    htmlFor="override-reason"
                    required
                    hint={
                      overrideReason.trim().length >= 5
                        ? 'Recorded against every field change and action.'
                        : 'Minimum 5 characters. Stored in the audit trail.'
                    }
                  >
                    <Textarea
                      id="override-reason"
                      rows={2}
                      value={overrideReason}
                      onChange={(event) => setOverrideReason(event.target.value)}
                      placeholder="Why is this administrative change necessary?"
                    />
                  </FormField>
                </div>
              )}
            </div>
          )}

          <div className="card p-5">
            <p className="eyebrow mb-3">Actions</p>
            {contract.editable_fields.length > 0 && (
              <div className="mb-4">
                <FormField label="Change note (optional)" htmlFor="change-note" hint="Saved with the field updates in the audit trail.">
                  <Textarea
                    id="change-note"
                    rows={2}
                    value={changeNote}
                    onChange={(event) => setChangeNote(event.target.value)}
                    placeholder="A short context for this edit…"
                  />
                </FormField>
              </div>
            )}

            <div className="space-y-2">
              <Button
                variant="secondary"
                fullWidth
                icon={<Save size={14} />}
                loading={saving}
                disabled={!canSave || saving}
                onClick={() => void handleSave()}
              >
                {dirty ? 'Save changes' : 'No unsaved changes'}
              </Button>

              {canForward && (
                <Button
                  fullWidth
                  icon={<SendHorizonal size={14} />}
                  disabled={!adminReady || actionBusy}
                  onClick={() => openAction('forward')}
                >
                  Forward
                </Button>
              )}

              {canComplete && (
                <Button
                  fullWidth
                  icon={<BadgeCheck size={15} />}
                  disabled={!adminReady || actionBusy}
                  onClick={() => openAction('complete')}
                  className="bg-forest"
                >
                  Complete contract
                </Button>
              )}

              {canReturn && (
                <Button
                  variant="ghost"
                  fullWidth
                  icon={<Undo2 size={14} />}
                  disabled={!adminReady || actionBusy}
                  onClick={() => openAction('return')}
                  className="text-amber hover:bg-amber-soft"
                >
                  Return for correction
                </Button>
              )}
            </div>

            {isAdmin && !adminReady && (
              <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-amber">
                <ShieldAlert size={11} className="mt-0.5 shrink-0" />
                Enable override and enter a reason to save or change the workflow.
              </p>
            )}
            {dirty && !isAdmin && (
              <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted">
                <Info size={11} /> Unsaved changes will be saved automatically when you forward.
              </p>
            )}
            {!hasActions && contract.editable_fields.length === 0 && (
              <p className="mt-1 text-center text-[10.5px] leading-relaxed text-muted">
                {contract.status === 'COMPLETED'
                  ? 'This contract is closed. Only an administrator override can amend it.'
                  : 'Your role has read-only access at this stage.'}
              </p>
            )}
            {contract.version > 0 && (
              <p className="mt-3 border-t border-line pt-2.5 text-center text-[9px] text-muted">
                Optimistic lock · v{contract.version} · Ctrl/⌘ + S to save
              </p>
            )}
          </div>

          <div className="card p-5">
            <p className="eyebrow mb-2.5">Record details</p>
            <dl className="divide-y divide-line">
              <SidebarRow label="Category" value={contract.category || '—'} />
              <SidebarRow label="Region" value={contract.office_region || '—'} />
              <SidebarRow label="Method" value={contract.procurement_method || '—'} />
              <SidebarRow
                label="Target date"
                value={formatDate(contract.target_completion)}
              />
              <SidebarRow
                label="Original completion"
                value={formatDate(contract.original_intended_completion_date)}
              />
              <SidebarRow label="Created" value={formatDateTime(contract.created_at)} />
              <SidebarRow label="Last updated" value={formatDateTime(contract.updated_at)} />
              {contract.completed_at && (
                <SidebarRow label="Completed" value={formatDateTime(contract.completed_at)} />
              )}
            </dl>
          </div>
        </aside>
      </div>

      {/* Mobile sticky save bar */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-4 py-3 shadow-lift backdrop-blur xl:hidden">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <p className="text-[11px] font-medium text-ink-soft">You have unsaved changes.</p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  hydrate(contract);
                  setChangeNote('');
                }}
                disabled={saving}
              >
                Discard
              </Button>
              <Button size="sm" icon={<Save size={13} />} loading={saving} disabled={!canSave} onClick={() => void handleSave()}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Action modal */}
      <Modal
        open={Boolean(dialog)}
        onClose={() => {
          if (actionBusy) return;
          setDialog(null);
          setActionError(null);
        }}
        title={dialog ? actionCopy[dialog].title : ''}
        description={dialog ? actionCopy[dialog].description : undefined}
        icon={dialog ? actionCopy[dialog].icon : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={actionBusy}>
              Cancel
            </Button>
            <Button
              variant={dialog === 'return' ? 'amber' : 'primary'}
              onClick={() => void confirmAction()}
              loading={actionBusy}
              disabled={
                actionBusy ||
                (dialog === 'return' && actionReason.trim().length < 5) ||
                !adminReady
              }
            >
              {dialog ? actionCopy[dialog].confirm : 'Confirm'}
            </Button>
          </>
        }
      >
        {dialog && (
          <div className="space-y-4">
            {dialog === 'forward' && (
              <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
                <div className="flex-1">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">Current</p>
                  <p className="mt-0.5 text-[12px] font-semibold text-ink">{roleLabel(contract.current_owner_role)}</p>
                </div>
                <ArrowRight size={16} className="text-muted" />
                <div className="flex-1 text-right">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">Next</p>
                  <p className="mt-0.5 text-[12px] font-semibold text-forest">{roleLabel(nextRole)}</p>
                </div>
              </div>
            )}

            {dialog === 'forward' && contract.current_owner_role === 'QS' && (
              <FormField
                label="Forward to"
                htmlFor="forward-target"
                hint="Both sections handle the same tender, award and delivery steps. Choose who takes the file next."
              >
                <Select
                  id="forward-target"
                  value={forwardTarget}
                  onChange={(event) =>
                    setForwardTarget(event.target.value as 'PC_ENGINEER' | 'SUPPLY_OFFICER')
                  }
                  options={[
                    { value: 'PC_ENGINEER', label: 'P&C Engineer' },
                    { value: 'SUPPLY_OFFICER', label: 'Supply Officer' },
                  ]}
                />
              </FormField>
            )}

            {dialog === 'return' && (
              <div className="flex items-center gap-3 rounded-xl border border-line bg-amber-soft p-3">
                <Undo2 size={16} className="shrink-0 text-amber" />
                <p className="text-[11px] leading-relaxed text-ink-soft">
                  The record will return to{' '}
                  <span className="font-semibold text-ink">
                    {roleLabel(contract.current_owner_role === 'QS' ? 'PC_MANAGER' : 'QS')}
                  </span>
                  . Their section reopens and the reason below is visible to everyone.
                </p>
              </div>
            )}

            {dialog === 'complete' && (
              <div className="rounded-xl border border-line bg-forest-soft p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-forest">
                  <CheckCircle2 size={13} /> Required completion data is complete
                </p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-ink-soft">
                  Completion date, final award and contract dates will be frozen at this version. Administrator
                  overrides remain the only way to change the file afterwards.
                </p>
              </div>
            )}

            {dirty && (
              <p className="flex items-center gap-1.5 rounded-lg bg-info-soft px-3 py-2 text-[10.5px] text-info">
                <Info size={12} /> Your unsaved edits will be saved before the handoff is executed.
              </p>
            )}

            <FormField
              label={dialog === 'return' ? 'Reason for return' : dialog === 'complete' ? 'Completion note (optional)' : 'Note for the next stage (optional)'}
              htmlFor="action-reason"
              required={dialog === 'return'}
              hint={
                dialog === 'return'
                  ? 'Minimum 5 characters. This reason is stored in the handoff history.'
                  : 'Stored with the handoff record in the audit trail.'
              }
            >
              <Textarea
                id="action-reason"
                rows={3}
                value={actionReason}
                onChange={(event) => {
                  setActionReason(event.target.value);
                  setActionError(null);
                }}
                placeholder={
                  dialog === 'return'
                    ? 'What needs to be corrected before the record can move forward?'
                    : 'Add context for the team…'
                }
              />
            </FormField>

            {isAdmin && (
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-soft px-3 py-2 text-[10.5px] leading-relaxed text-amber">
                <ShieldAlert size={12} className="mt-0.5 shrink-0" />
                Administrator override active. The reason recorded in the sidebar is attached to this action.
              </p>
            )}

            {actionError && (
              <div className="rounded-lg border border-line bg-danger-soft px-3 py-2.5 text-[11.5px] font-medium leading-relaxed text-danger">
                {actionError}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Conflict modal */}
      <Modal
        open={conflict}
        onClose={() => setConflict(false)}
        title="This record has moved on"
        description="Another user saved a newer version while this page was open. Reload before continuing so your changes are based on the latest data."
        icon={<ShieldAlert size={18} />}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConflict(false)}>
              Stay on this page
            </Button>
            <Button onClick={() => void reloadLatest()} icon={<RotateCcw size={14} />}>
              Reload latest
            </Button>
          </>
        }
      >
        <div className="rounded-xl border border-line bg-surface-2 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted">Your working version</span>
            <span className="font-mono text-[11px] font-semibold text-ink">v{contract.version}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted">Server state</span>
            <span className="text-[11px] font-semibold text-amber">Newer version available</span>
          </div>
        </div>
        <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
          Reloading discards the unsaved edits currently in this browser tab. Copy anything you need before continuing.
        </p>
      </Modal>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  sub,
  className,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start gap-3 px-4 py-4', className)}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-muted">{label}</p>
        <p className="mt-1 truncate text-[12.5px] font-semibold text-ink">{value}</p>
        <p className="mt-0.5 truncate text-[9.5px] text-muted">{sub}</p>
      </div>
    </div>
  );
}

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-[0.07em] text-muted">{label}</dt>
      <dd className="text-right text-[10.5px] font-medium text-ink">{value}</dd>
    </div>
  );
}

const HANDOFF_META: Record<string, { label: string; icon: typeof Check; tone: string }> = {
  CREATED: { label: 'Record opened', icon: FileText, tone: 'bg-forest-tint text-forest' },
  FORWARD: { label: 'Forwarded', icon: SendHorizonal, tone: 'bg-info-tint text-info' },
  RETURN_TO_PREVIOUS: { label: 'Returned for correction', icon: Undo2, tone: 'bg-danger-soft text-danger' },
  COMPLETE: { label: 'Contract completed', icon: BadgeCheck, tone: 'bg-forest-tint text-forest' },
  ADMIN_OVERRIDE: { label: 'Administrator override', icon: ShieldAlert, tone: 'bg-amber-tint text-amber' },
};

function HandoffTimeline({ handoffs }: { handoffs: Handoff[] }) {
  return (
    <div>
      {handoffs.map((handoff, index) => {
        const meta = HANDOFF_META[handoff.action] ?? {
          label: humanizeAction(handoff.action),
          icon: GitBranch,
          tone: 'bg-surface-2 text-muted',
        };
        const Icon = meta.icon;
        const durationHours = handoff.duration_in_previous_stage_hours;
        return (
          <div key={handoff.id} className="relative flex gap-3.5 pb-5 last:pb-0">
            {index < handoffs.length - 1 && (
              <span className="absolute left-[15px] top-8 h-[calc(100%-12px)] w-px bg-line" aria-hidden />
            )}
            <span className={cn('relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', meta.tone)}>
              <Icon size={14} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[12px] font-semibold text-ink">{meta.label}</p>
                {handoff.is_admin_override && (
                  <span className="chip border-transparent bg-amber-soft py-0.5 text-[8.5px] text-amber">
                    <ShieldAlert size={9} /> Override
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10.5px] text-muted">
                {handoff.acted_by_name || 'System'} · {formatDateTime(handoff.created_at)}
                {durationHours !== null && durationHours !== undefined && (
                  <span className="ml-1.5 text-muted">· {formatNumber(durationHours)}h in previous stage</span>
                )}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                {handoff.from_role && (
                  <>
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-ink-soft">{roleLabel(handoff.from_role)}</span>
                    <ArrowRight size={10} className="text-muted" />
                  </>
                )}
                <span className="rounded bg-forest-tint px-1.5 py-0.5 font-medium text-forest">{roleLabel(handoff.to_role)}</span>
                <span className="text-line-strong">·</span>
                <span className="text-muted">{statusLabel(handoff.to_status)}</span>
              </div>
              {handoff.reason && (
                <p className="mt-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[10.5px] leading-relaxed text-ink-soft">
                  “{handoff.reason}”
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AuditEntry({ log }: { log: AuditLog }) {
  const valueLabel = (value: string | null) => {
    if (value === null || value === '') return '—';
    if (['status', 'from_status', 'to_status'].includes(log.field_name ?? '')) return statusLabel(value);
    if (['current_owner_role', 'to_role', 'from_role'].includes(log.field_name ?? '')) return roleLabel(value);
    if (['awarded_amount_without_vat', 'p_bond_amount_lkr'].includes(log.field_name ?? '')) {
      const number = Number(value);
      return Number.isFinite(number) ? formatLKR(number) : value;
    }
    return value.length > 120 ? `${value.slice(0, 119)}…` : value;
  };

  const isOverride = log.is_admin_override;
  return (
    <div
      className={cn(
        'rounded-xl border px-3.5 py-3 transition-colors',
        isOverride ? 'border-amber bg-amber-soft/30' : 'border-line bg-surface-2',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={log.user_name} size="xs" />
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold text-ink">{log.user_name || 'System'}</p>
            <p className="text-[9.5px] text-muted">
              {humanizeAction(log.action)} · {formatDateTime(log.changed_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isOverride && (
            <span className="chip border-transparent bg-amber-soft py-0.5 text-[8px] text-amber">
              <ShieldAlert size={8} /> Override
            </span>
          )}
          {log.field_name && (
            <span className="rounded bg-surface px-1.5 py-0.5 text-[9px] font-medium text-muted">
              {fieldLabel(log.field_name) === log.field_name ? humanizeField(log.field_name) : fieldLabel(log.field_name)}
            </span>
          )}
        </div>
      </div>
      {log.field_name && (log.old_value !== null || log.new_value !== null) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[10.5px]">
          <span className="max-w-[45%] truncate rounded bg-surface px-2 py-1 text-muted line-through decoration-line-strong">
            {valueLabel(log.old_value)}
          </span>
          <ArrowRight size={11} className="shrink-0 text-muted" />
          <span className="max-w-[45%] truncate rounded bg-surface px-2 py-1 font-medium text-ink">
            {valueLabel(log.new_value)}
          </span>
        </div>
      )}
      {log.reason && (
        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          <span className="font-medium text-ink-soft">Reason:</span> {log.reason}
        </p>
      )}
    </div>
  );
}
