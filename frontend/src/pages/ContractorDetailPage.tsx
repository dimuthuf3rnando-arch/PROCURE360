import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Star,
  Trash2,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { contractorsApi } from '../api/contractors';
import { mastersApi } from '../api/masters';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  ContractListItem,
  ContractorDetail,
  LookupGroups,
  Rating,
  RatingInput,
} from '../types/api';
import { useDocumentTitle } from '../lib/hooks';
import {
  formatCompactLKR,
  formatDate,
  formatDateTime,
  formatLKR,
  formatNumber,
  formatPercent,
  scoreLabel,
  scoreTone,
  toneClasses,
} from '../lib/format';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { ScoreRing, ProgressBar } from '../components/ui/Score';
import { ScoreRadar } from '../components/charts/Charts';
import { Stars, StarInput } from '../components/ui/Stars';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { FormField, Input, Select, Textarea, Toggle } from '../components/ui/Field';
import { EmptyState, ErrorState, PageLoader } from '../components/ui/Feedback';

const EMPTY_LOOKUPS: LookupGroups = {
  category: [],
  priority: [],
  procurement_method: [],
  office_region: [],
  funds: [],
};

interface EditForm {
  name: string;
  registration_no: string;
  contact_person: string;
  phone: string;
  email: string;
  office_region: string;
  address: string;
  notes: string;
  is_active: boolean;
}

const EMPTY_EDIT: EditForm = {
  name: '',
  registration_no: '',
  contact_person: '',
  phone: '',
  email: '',
  office_region: '',
  address: '',
  notes: '',
  is_active: true,
};

interface RatingForm {
  contract_id: string;
  quality_score: number;
  schedule_score: number;
  compliance_score: number;
  safety_score: number;
  comments: string;
}

const EMPTY_RATING: RatingForm = {
  contract_id: '',
  quality_score: 4,
  schedule_score: 4,
  compliance_score: 4,
  safety_score: 4,
  comments: '',
};

function clean(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function platform(detail: ContractorDetail): string {
  const contractor = detail.scorecard.contractor;
  return contractor.registration_no || contractor.office_region || contractor.contact_person || 'Contractor';
}

export function ContractorDetailPage() {
  const { id } = useParams();
  const contractorId = Number(id);
  const { isAdmin, canEditContractors } = useAuth();
  const { toast } = useToast();

  const [detail, setDetail] = useState<ContractorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lookups, setLookups] = useState<LookupGroups>(EMPTY_LOOKUPS);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingForm, setRatingForm] = useState<RatingForm>(EMPTY_RATING);
  const [ratingSaving, setRatingSaving] = useState(false);
  const [removeRating, setRemoveRating] = useState<Rating | null>(null);
  const [removing, setRemoving] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  useDocumentTitle(detail?.scorecard.contractor.name || 'Contractor');

  const load = useCallback(
    async (silent = false) => {
      if (!Number.isFinite(contractorId)) {
        setLoading(false);
        setError('That contractor reference is not valid.');
        return;
      }
      if (!silent) setLoading(true);
      setError(null);
      try {
        const response = await contractorsApi.get(contractorId);
        setDetail(response);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'The contractor scorecard could not be loaded.');
      } finally {
        setLoading(false);
      }
    },
    [contractorId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    mastersApi
      .bundle()
      .then((bundle) => setLookups(bundle.lookups))
      .catch(() => undefined);
  }, []);

  const weightedPreview = useMemo(
    () =>
      ratingForm.quality_score * 0.3 +
      ratingForm.schedule_score * 0.3 +
      ratingForm.compliance_score * 0.25 +
      ratingForm.safety_score * 0.15,
    [ratingForm],
  );

  const openEdit = () => {
    if (!detail) return;
    const contractor = detail.scorecard.contractor;
    setEditForm({
      name: contractor.name,
      registration_no: contractor.registration_no ?? '',
      contact_person: contractor.contact_person ?? '',
      phone: contractor.phone ?? '',
      email: contractor.email ?? '',
      office_region: contractor.office_region ?? '',
      address: contractor.address ?? '',
      notes: contractor.notes ?? '',
      is_active: contractor.is_active,
    });
    setEditErrors({});
    setEditOpen(true);
  };

  const updateEdit = (key: keyof EditForm, value: string | boolean) => {
    setEditForm((current) => ({ ...current, [key]: value }));
    setEditErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const saveEdit = async () => {
    const errors: Record<string, string> = {};
    if (editForm.name.trim().length < 2) errors.name = 'Enter the registered contractor name.';
    if (editForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await contractorsApi.update(contractorId, {
        name: editForm.name.trim(),
        registration_no: clean(editForm.registration_no),
        contact_person: clean(editForm.contact_person),
        phone: clean(editForm.phone),
        email: clean(editForm.email),
        office_region: clean(editForm.office_region),
        address: clean(editForm.address),
        notes: clean(editForm.notes),
        is_active: editForm.is_active,
      });
      toast.success('Profile updated', 'The contractor directory and scorecard now use the new details.');
      setEditOpen(false);
      await load(true);
    } catch (err) {
      toast.error('Could not update the profile', err instanceof ApiError ? err.message : 'The changes were not saved.');
    } finally {
      setSaving(false);
    }
  };

  const openRating = (rating?: Rating) => {
    if (rating) {
      setRatingForm({
        contract_id: rating.contract_id ? String(rating.contract_id) : '',
        quality_score: rating.quality_score,
        schedule_score: rating.schedule_score,
        compliance_score: rating.compliance_score,
        safety_score: rating.safety_score,
        comments: rating.comments ?? '',
      });
    } else {
      const onlyContract = detail?.contracts.length === 1 ? detail.contracts[0] : null;
      setRatingForm(
        onlyContract ? { ...EMPTY_RATING, contract_id: String(onlyContract.id) } : EMPTY_RATING,
      );
    }
    setRatingOpen(true);
  };

  const submitRating = async () => {
    const payload: RatingInput = {
      contract_id: ratingForm.contract_id ? Number(ratingForm.contract_id) : null,
      quality_score: ratingForm.quality_score,
      schedule_score: ratingForm.schedule_score,
      compliance_score: ratingForm.compliance_score,
      safety_score: ratingForm.safety_score,
      comments: clean(ratingForm.comments),
    };
    setRatingSaving(true);
    try {
      await contractorsApi.rate(contractorId, payload);
      toast.success('Evaluation recorded', 'The composite score and delivery profile have been recalculated.');
      setRatingOpen(false);
      await load(true);
    } catch (err) {
      toast.error('Could not record the evaluation', err instanceof ApiError ? err.message : 'The rating was not saved.');
    } finally {
      setRatingSaving(false);
    }
  };

  const confirmRemoveRating = async () => {
    if (!removeRating) return;
    setRemoving(true);
    try {
      await contractorsApi.removeRating(contractorId, removeRating.id);
      toast.success('Rating removed', 'The scorecard has been recalculated without that evaluation.');
      setRemoveRating(null);
      await load(true);
    } catch (err) {
      toast.error('Could not remove the rating', err instanceof ApiError ? err.message : 'The rating was not removed.');
    } finally {
      setRemoving(false);
    }
  };

  const confirmDeactivate = async () => {
    setDeactivating(true);
    try {
      await contractorsApi.deactivate(contractorId);
      toast.success('Contractor deactivated', 'They remain in history but are hidden from new award lists.');
      setDeactivateOpen(false);
      await load(true);
    } catch (err) {
      toast.error('Could not deactivate', err instanceof ApiError ? err.message : 'The contractor was not changed.');
    } finally {
      setDeactivating(false);
    }
  };

  const ratings = detail?.ratings ?? [];

  const groupedRatings = useMemo(() => {
    const groups = new Map<
      string,
      { label: string; contractId: number | null; ratings: Rating[] }
    >();
    for (const rating of ratings) {
      const key = rating.contract_id ? `contract-${rating.contract_id}` : 'general';
      if (!groups.has(key)) {
        groups.set(key, {
          label: rating.contract_id
            ? rating.contract_no || `Contract #${rating.contract_id}`
            : 'General evaluations',
          contractId: rating.contract_id ?? null,
          ratings: [],
        });
      }
      groups.get(key)!.ratings.push(rating);
    }
    return Array.from(groups.values()).sort((left, right) => {
      if (!left.contractId && right.contractId) return 1;
      if (left.contractId && !right.contractId) return -1;
      return (right.ratings[0]?.created_at ?? '').localeCompare(left.ratings[0]?.created_at ?? '');
    });
  }, [ratings]);

  if (loading) return <PageLoader label="Loading contractor scorecard…" />;

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Link to="/contractors" className="link inline-flex items-center gap-1.5 text-[11.5px]">
          <ArrowLeft size={13} /> Contractor register
        </Link>
        <ErrorState
          title="Scorecard unavailable"
          description={error ?? 'No contractor response was returned.'}
          onRetry={() => void load()}
          action={
            <Link to="/contractors" className="btn btn-secondary">
              Back to register
            </Link>
          }
        />
      </div>
    );
  }

  const { scorecard, contracts } = detail;
  const contractor = scorecard.contractor;
  const rated = scorecard.rating_count > 0;
  const tone = rated ? scoreTone(scorecard.composite_score) : 'neutral';
  const linkedRatings = ratings.filter((rating) => rating.contract_id !== null);
  const generalRatings = ratings.filter((rating) => rating.contract_id === null);
  const overallCount = linkedRatings.length > 0 ? linkedRatings.length : generalRatings.length;
  const overallBasis = linkedRatings.length > 0 ? 'linked-contract' : 'general';
  const evaluationBasisLabel =
    linkedRatings.length > 0
      ? 'Linked-contract evaluation'
      : generalRatings.length > 0
        ? 'General evaluation'
        : 'Evaluation average';
  const selectedContractRating = ratingForm.contract_id
    ? ratings.find((rating) => rating.contract_id === Number(ratingForm.contract_id))
    : undefined;
  const bestContract = contracts.reduce<ContractListItem | null>((best, contract) => {
    if (!contract.awarded_amount_without_vat) return best;
    if (!best || (best.awarded_amount_without_vat ?? 0) < contract.awarded_amount_without_vat) return contract;
    return best;
  }, null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
        <Link to="/contractors" className="link inline-flex items-center gap-1.5">
          <ArrowLeft size={13} /> Contractors
        </Link>
        <ChevronRight size={12} className="text-line-strong" />
        <span className="truncate text-ink-soft">{contractor.name}</span>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={contractor.name} size="lg" />
          <div className="min-w-0">
            <p className="eyebrow mb-1.5">Contractor scorecard</p>
            <h1 className="font-serif text-[28px] font-semibold leading-tight text-ink md:text-[32px]">
              {contractor.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={contractor.is_active ? 'forest' : 'neutral'} dot>
                {contractor.is_active ? 'Active' : 'Inactive'}
              </Badge>
              {contractor.registration_no && (
                <span className="inline-flex items-center gap-1 text-[10.5px] text-muted">
                  <Building2 size={10} /> {contractor.registration_no}
                </span>
              )}
              {contractor.office_region && (
                <span className="inline-flex items-center gap-1 text-[10.5px] text-muted">
                  <MapPin size={10} /> {contractor.office_region}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[10.5px] text-muted">
                <CalendarDays size={10} /> Added {formatDate(contractor.created_at)}
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-muted">
              {contractor.contact_person && (
                <span className="inline-flex items-center gap-1.5">
                  <UserRound size={11} /> {contractor.contact_person}
                </span>
              )}
              {contractor.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={11} /> {contractor.phone}
                </span>
              )}
              {contractor.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={11} /> {contractor.email}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={() => void load(true)}
          >
            Refresh
          </Button>
          {canEditContractors && (
            <>
              <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={openEdit}>
                Edit profile
              </Button>
              <Button size="sm" icon={<Star size={14} />} onClick={() => openRating()}>
                Add evaluation
              </Button>
            </>
          )}
          {isAdmin && contractor.is_active && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Power size={14} />}
              onClick={() => setDeactivateOpen(true)}
              className="text-danger hover:bg-danger-soft"
            >
              Deactivate
            </Button>
          )}
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr_1.35fr]">
        <div className="card animate-fade-up p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-[18px] font-semibold leading-tight">Composite score</h2>
              <p className="mt-0.5 text-[10.5px] text-muted">65% evaluation · 35% delivery</p>
            </div>
            <span className={cn('chip', toneClasses(tone))}>
              {rated ? scorecard.rating_label : 'Not rated'}
            </span>
          </div>
          <div className="mt-5 flex flex-col items-center">
            <ScoreRing score={rated ? scorecard.composite_score : 0} size={142} strokeWidth={9} />
            <div className="mt-4 flex items-center gap-2">
              <Stars value={rated ? scorecard.composite_score : 0} size={14} />
              <span className="text-[11px] text-muted">
                {overallCount} {overallBasis} evaluation{overallCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div className="mt-5 space-y-3 border-t border-line pt-4">
            <ScoreLine
              label={evaluationBasisLabel}
              value={scorecard.subjective_score}
              tone="forest"
            />
            <ScoreLine
              label="Objective delivery"
              value={scorecard.objective_score}
              tone="gold"
            />
          </div>
        </div>

        <div className="card animate-fade-up animate-delay-1">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-serif text-[18px] font-semibold leading-tight">Evaluation profile</h2>
            <p className="mt-0.5 text-[10.5px] text-muted">
              {linkedRatings.length > 0
                ? 'Average of linked-contract quality, schedule, compliance and safety scores.'
                : 'Weighted quality, schedule, compliance and safety.'}
            </p>
          </div>
          <div className="px-2 py-2">
            {rated ? (
              <ScoreRadar dimensions={scorecard.dimensions} />
            ) : (
              <div className="flex h-[260px] flex-col items-center justify-center px-6 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-muted">
                  <Star size={19} />
                </span>
                <p className="mt-3 text-[12.5px] font-semibold text-ink">No evaluations yet</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  Record a quality, schedule, compliance and safety score to shape this profile.
                </p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-line px-4 py-4">
            <Dimension label="Quality" value={scorecard.dimensions.quality} />
            <Dimension label="Schedule" value={scorecard.dimensions.schedule} />
            <Dimension label="Compliance" value={scorecard.dimensions.compliance} />
            <Dimension label="Safety" value={scorecard.dimensions.safety} />
          </div>
        </div>

        <div className="card animate-fade-up animate-delay-2">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-serif text-[18px] font-semibold leading-tight">Delivery metrics</h2>
            <p className="mt-0.5 text-[10.5px] text-muted">Measured from the contract register.</p>
          </div>
          <div className="grid grid-cols-2 gap-px bg-line">
            <MetricBlock label="Contracts" value={formatNumber(scorecard.metrics.total_contracts)} sub={`${scorecard.metrics.active_contracts} active`} />
            <MetricBlock label="Completed" value={formatNumber(scorecard.metrics.completed_contracts)} sub="closed files" />
            <MetricBlock label="Awarded value" value={formatCompactLKR(scorecard.metrics.total_awarded_lkr)} sub="without VAT" />
            <MetricBlock label="Average award" value={formatCompactLKR(scorecard.metrics.average_awarded_lkr)} sub="per contract" />
            <MetricBlock
              label="On time · original"
              value={formatPercent(scorecard.metrics.on_time_original_rate)}
              sub="against original date"
            />
            <MetricBlock
              label="On time · revised"
              value={formatPercent(scorecard.metrics.on_time_extended_rate)}
              sub="against revised date"
            />
            <MetricBlock
              label="Mobilisation"
              value={
                scorecard.metrics.average_mobilization_days === null
                  ? '—'
                  : `${scorecard.metrics.average_mobilization_days.toFixed(0)}d`
              }
              sub="award to start"
            />
            <MetricBlock
              label="Delivery score"
              value={
                scorecard.metrics.mobilization_score === null
                  ? '—'
                  : scorecard.metrics.mobilization_score.toFixed(2)
              }
              sub="objective component"
            />
          </div>
          {bestContract && (
            <div className="border-t border-line px-5 py-3.5">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted">Largest award</p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-[11.5px] font-medium text-ink-soft">
                  {bestContract.project_name || bestContract.contract_no || `Contract #${bestContract.id}`}
                </p>
                <p className="shrink-0 text-[11px] font-semibold text-ink tabular">
                  {formatCompactLKR(bestContract.awarded_amount_without_vat)}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="card animate-fade-up animate-delay-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-serif text-[19px] font-semibold leading-tight">Contract history</h2>
              <p className="mt-0.5 text-[10.5px] text-muted">Every record linked to this contractor.</p>
            </div>
            <span className="chip border-line bg-surface-2 text-muted">{contracts.length} total</span>
          </div>
          {contracts.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No linked contracts"
              description="A contract appears here once this contractor is selected on the award section."
              className="border-0 bg-transparent py-10"
            />
          ) : (
            <div className="divide-y divide-line">
              {contracts.map((contract) => (
                <Link
                  key={contract.id}
                  to={`/contracts/${contract.id}`}
                  className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted transition-colors group-hover:border-forest-soft group-hover:bg-forest-tint group-hover:text-forest">
                    <FileText size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-ink group-hover:text-forest">
                      {contract.project_name || contract.contract_no || `Contract #${contract.id}`}
                    </p>
                    <p className="mt-0.5 truncate text-[9.5px] text-muted">
                      {contract.contract_no || 'No contract no'} · {contract.contract_name || 'Identity pending'}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-[10.5px] font-semibold text-ink tabular">
                      {formatCompactLKR(contract.awarded_amount_without_vat)}
                    </p>
                    <p className="mt-0.5 text-[9px] text-muted">{formatDate(contract.effective_completion_date)}</p>
                  </div>
                  <StatusBadge status={contract.status} className="hidden shrink-0 md:inline-flex" />
                  <ArrowUpRight
                    size={14}
                    className="shrink-0 text-muted transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-forest"
                  />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card animate-fade-up animate-delay-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-serif text-[19px] font-semibold leading-tight">Evaluations</h2>
              <p className="mt-0.5 text-[10.5px] text-muted">
                {ratings.length === 0
                  ? 'No evaluations recorded.'
                  : linkedRatings.length > 0
                    ? `${linkedRatings.length} linked-contract evaluation${
                        linkedRatings.length === 1 ? '' : 's'
                      } · overall ${scorecard.subjective_score?.toFixed(2) ?? '—'}${
                        generalRatings.length > 0
                          ? ` · ${generalRatings.length} general excluded`
                          : ''
                      }`
                    : `${generalRatings.length} general evaluation${
                        generalRatings.length === 1 ? '' : 's'
                      } · overall ${scorecard.subjective_score?.toFixed(2) ?? '—'}`}
              </p>
            </div>
            {canEditContractors && (
              <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={() => openRating()}>
                Add
              </Button>
            )}
          </div>
          {ratings.length === 0 ? (
            <EmptyState
              icon={BadgeCheck}
              title="No evaluations yet"
              description="Quality, schedule, compliance and safety scores build the contractor's subjective profile."
              className="border-0 bg-transparent py-10"
              action={
                canEditContractors ? (
                  <Button size="sm" icon={<Star size={13} />} onClick={() => openRating()}>
                    Record first evaluation
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="max-h-[560px] overflow-y-auto scrollbar-thin">
              {groupedRatings.map((group) => (
                <div key={group.contractId ?? 'general'} className="border-b border-line last:border-0">
                  <div className="flex items-center justify-between gap-2 bg-surface-2 px-5 py-2">
                    <span className="truncate text-[10.5px] font-semibold text-ink">
                      {group.contractId ? (
                        <Link to={`/contracts/${group.contractId}`} className="link">
                          {group.label}
                        </Link>
                      ) : (
                        <>
                          {group.label}
                          {linkedRatings.length > 0 && (
                            <span className="ml-2 font-normal text-muted">excluded from overall</span>
                          )}
                        </>
                      )}
                    </span>
                    <span className="shrink-0 text-[9.5px] text-muted">
                      {group.ratings.length} evaluation{group.ratings.length === 1 ? '' : 's'} · avg{' '}
                      {(group.ratings.reduce((sum, rating) => sum + rating.weighted_score, 0) / group.ratings.length).toFixed(2)}
                    </span>
                  </div>
                  {group.ratings.map((rating) => (
                    <RatingEntry
                      key={rating.id}
                      rating={rating}
                      canEdit={canEditContractors && rating.contract_id !== null}
                      onEdit={() => openRating(rating)}
                      canDelete={isAdmin}
                      onDelete={() => setRemoveRating(rating)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {contractor.notes && (
        <section className="card p-5">
          <h2 className="font-serif text-[16px] font-semibold text-ink">Internal notes</h2>
          <p className="mt-2 whitespace-pre-line text-[12px] leading-relaxed text-ink-soft">{contractor.notes}</p>
        </section>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit contractor profile"
        description="Changes apply immediately to awards, agreements and scorecards."
        eyebrow="Contractor register"
        icon={<Pencil size={17} />}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveEdit} loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Registered name" htmlFor="edit-contractor-name" required error={editErrors.name} className="sm:col-span-2">
            <Input
              id="edit-contractor-name"
              value={editForm.name}
              onChange={(event) => updateEdit('name', event.target.value)}
              invalid={Boolean(editErrors.name)}
            />
          </FormField>
          <FormField label="Registration number" htmlFor="edit-contractor-reg">
            <Input
              id="edit-contractor-reg"
              value={editForm.registration_no}
              onChange={(event) => updateEdit('registration_no', event.target.value)}
            />
          </FormField>
          <FormField label="Office / region" htmlFor="edit-contractor-region">
            <Input
              id="edit-contractor-region"
              list="edit-contractor-regions"
              value={editForm.office_region}
              onChange={(event) => updateEdit('office_region', event.target.value)}
              placeholder="Select or type a region"
            />
            <datalist id="edit-contractor-regions">
              {lookups.office_region.map((region) => (
                <option key={region} value={region} />
              ))}
            </datalist>
          </FormField>
          <FormField label="Contact person" htmlFor="edit-contractor-contact">
            <Input
              id="edit-contractor-contact"
              value={editForm.contact_person}
              onChange={(event) => updateEdit('contact_person', event.target.value)}
            />
          </FormField>
          <FormField label="Phone" htmlFor="edit-contractor-phone">
            <Input
              id="edit-contractor-phone"
              value={editForm.phone}
              onChange={(event) => updateEdit('phone', event.target.value)}
            />
          </FormField>
          <FormField label="Email" htmlFor="edit-contractor-email" error={editErrors.email}>
            <Input
              id="edit-contractor-email"
              type="email"
              value={editForm.email}
              onChange={(event) => updateEdit('email', event.target.value)}
              invalid={Boolean(editErrors.email)}
            />
          </FormField>
          <div className="flex items-end pb-1">
            <Toggle
              checked={editForm.is_active}
              onChange={(checked) => updateEdit('is_active', checked)}
              label="Available for new awards"
              description="Inactive contractors remain in history."
            />
          </div>
          <FormField label="Address" htmlFor="edit-contractor-address" className="sm:col-span-2">
            <Input
              id="edit-contractor-address"
              value={editForm.address}
              onChange={(event) => updateEdit('address', event.target.value)}
            />
          </FormField>
          <FormField label="Internal notes" htmlFor="edit-contractor-notes" className="sm:col-span-2">
            <Textarea
              id="edit-contractor-notes"
              value={editForm.notes}
              onChange={(event) => updateEdit('notes', event.target.value)}
              rows={4}
            />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={ratingOpen}
        onClose={() => setRatingOpen(false)}
        title={selectedContractRating ? 'Update this evaluation' : 'Record an evaluation'}
        description="Score each dimension from 1 to 5. Quality and schedule carry 30% each; compliance 25%, safety 15%."
        eyebrow="Performance evaluation"
        icon={<Star size={18} />}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRatingOpen(false)} disabled={ratingSaving}>
              Cancel
            </Button>
            <Button onClick={submitRating} loading={ratingSaving} icon={<BadgeCheck size={15} />}>
              {selectedContractRating ? 'Update evaluation' : 'Save evaluation'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.11em] text-muted">Weighted preview</p>
                <p className="mt-0.5 text-[10.5px] text-muted">Subjective composite before the 35% delivery blend.</p>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-serif text-[30px] font-semibold leading-none text-ink tabular">
                  {weightedPreview.toFixed(2)}
                </span>
                <span className="text-[10px] text-muted">/ 5</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField
                label="Linked contract"
                htmlFor="rating-contract"
                hint={
                  selectedContractRating
                    ? 'This contract already has an evaluation. Saving replaces its scores and notes.'
                    : 'Link the evaluation to a specific award so it counts toward the contractor’s overall rating.'
                }
                warning={Boolean(selectedContractRating)}
              >
                <Select
                  id="rating-contract"
                  value={ratingForm.contract_id}
                  onChange={(event) => {
                    const contractId = event.target.value;
                    const existing = ratings.find(
                      (rating) => String(rating.contract_id) === contractId,
                    );
                    if (existing) {
                      setRatingForm({
                        contract_id: contractId,
                        quality_score: existing.quality_score,
                        schedule_score: existing.schedule_score,
                        compliance_score: existing.compliance_score,
                        safety_score: existing.safety_score,
                        comments: existing.comments ?? '',
                      });
                    } else {
                      setRatingForm((current) => ({ ...current, contract_id: contractId }));
                    }
                  }}
                  placeholder="General contractor evaluation"
                  options={contracts.map((contract) => ({
                    value: String(contract.id),
                    label: `${contract.contract_no || `#${contract.id}`} · ${contract.project_name || contract.contract_name || 'Untitled'}`,
                  }))}
                />
              </FormField>
            </div>
            <RatingDimension
              label="Quality of work"
              description="Workmanship, finish and defect control."
              value={ratingForm.quality_score}
              onChange={(value) => setRatingForm((current) => ({ ...current, quality_score: value }))}
            />
            <RatingDimension
              label="Schedule performance"
              description="Delivery against agreed dates."
              value={ratingForm.schedule_score}
              onChange={(value) => setRatingForm((current) => ({ ...current, schedule_score: value }))}
            />
            <RatingDimension
              label="Compliance"
              description="Documents, specifications and instructions."
              value={ratingForm.compliance_score}
              onChange={(value) => setRatingForm((current) => ({ ...current, compliance_score: value }))}
            />
            <RatingDimension
              label="Safety & site conduct"
              description="Safety practice and site organisation."
              value={ratingForm.safety_score}
              onChange={(value) => setRatingForm((current) => ({ ...current, safety_score: value }))}
            />
          </div>

          <FormField label="Evaluation notes" htmlFor="rating-comments" hint="Specific observations help future tender decisions.">
            <Textarea
              id="rating-comments"
              value={ratingForm.comments}
              onChange={(event) => setRatingForm((current) => ({ ...current, comments: event.target.value }))}
              placeholder="What went well, what needs attention on the next award…"
              rows={3}
            />
          </FormField>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeRating)}
        onClose={() => setRemoveRating(null)}
        onConfirm={confirmRemoveRating}
        title="Remove this evaluation?"
        description="The scorecard will be recalculated without this rating. This cannot be undone."
        confirmLabel="Remove rating"
        tone="danger"
        loading={removing}
        icon={<Trash2 size={18} />}
      >
        {removeRating && (
          <p className="text-[12px] leading-relaxed text-ink-soft">
            Recorded {formatDateTime(removeRating.created_at)}
            {removeRating.rated_by_name ? ` by ${removeRating.rated_by_name}` : ''} · score{' '}
            <span className="font-semibold text-ink">{removeRating.weighted_score.toFixed(2)}</span>
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        onConfirm={confirmDeactivate}
        title="Deactivate this contractor?"
        description="They will no longer appear in award selection or the active directory. Historical contracts and ratings remain intact."
        confirmLabel="Deactivate contractor"
        tone="danger"
        loading={deactivating}
        icon={<Power size={18} />}
      >
        <p className="text-[12px] leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">{contractor.name}</span> currently has{' '}
          {formatNumber(scorecard.metrics.active_contracts)} active contract
          {scorecard.metrics.active_contracts === 1 ? '' : 's'} in the register.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function ScoreLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: 'forest' | 'gold';
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[10.5px] font-medium text-ink-soft">{label}</span>
        <span className="text-[10.5px] font-semibold text-ink tabular">
          {value === null ? '—' : `${value.toFixed(2)} / 5`}
        </span>
      </div>
      <ProgressBar value={value ?? 0} max={5} tone={tone} height="h-1.5" />
    </div>
  );
}

function Dimension({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-2">
      <p className="text-[8.5px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-0.5 text-[12px] font-semibold text-ink tabular">{value === null ? '—' : value.toFixed(2)}</p>
    </div>
  );
}

function MetricBlock({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <p className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-1 truncate text-[15px] font-semibold text-ink tabular">{value}</p>
      <p className="mt-0.5 text-[9px] text-muted">{sub}</p>
    </div>
  );
}

function RatingEntry({
  rating,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  rating: Rating;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const dimensions = [
    { label: 'Quality', value: rating.quality_score },
    { label: 'Schedule', value: rating.schedule_score },
    { label: 'Compliance', value: rating.compliance_score },
    { label: 'Safety', value: rating.safety_score },
  ];

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Stars value={rating.weighted_score} size={12} />
            <span className="text-[11px] font-semibold text-ink tabular">{rating.weighted_score.toFixed(2)}</span>
            {rating.contract_id && (
              <Link to={`/contracts/${rating.contract_id}`} className="link text-[9.5px]">
                {rating.contract_no || `Contract #${rating.contract_id}`}
              </Link>
            )}
          </div>
          <p className="mt-1 text-[9.5px] text-muted">
            {rating.rated_by_name || 'Recorded evaluation'} · {formatDateTime(rating.created_at)}
          </p>
        </div>
        {(canEdit || canDelete) && (
          <div className="flex shrink-0 items-center gap-1">
            {canEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-forest-tint hover:text-forest"
                aria-label="Edit rating"
              >
                <Pencil size={13} />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                aria-label="Remove rating"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        {dimensions.map((dimension) => (
          <div key={dimension.label} className="rounded-md bg-surface-2 px-1.5 py-1 text-center">
            <p className="text-[8px] uppercase tracking-[0.05em] text-muted">{dimension.label}</p>
            <p className="text-[11px] font-semibold text-ink tabular">{dimension.value}</p>
          </div>
        ))}
      </div>
      {rating.comments && (
        <p className="mt-2.5 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[10.5px] leading-relaxed text-ink-soft">
          {rating.comments}
        </p>
      )}
    </div>
  );
}

function RatingDimension({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11.5px] font-semibold text-ink">{label}</p>
          <p className="mt-0.5 text-[9.5px] leading-snug text-muted">{description}</p>
        </div>
        <span className="font-serif text-lg font-semibold text-ink tabular">{value}</span>
      </div>
      <div className="mt-2.5">
        <StarInput value={value} onChange={onChange} size={23} />
      </div>
    </div>
  );
}
