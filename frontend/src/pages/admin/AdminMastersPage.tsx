import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Database,
  ListChecks,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  SearchX,
  UserCog,
  Users2,
} from 'lucide-react';
import { mastersApi } from '../../api/masters';
import { ApiError } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import type { EvaluationTeamMember, LookupType, LookupValue } from '../../types/api';
import { useDocumentTitle } from '../../lib/hooks';
import { formatNumber } from '../../lib/format';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { SectionHeading } from '../../components/ui/Layout';
import { Tabs } from '../../components/ui/Tabs';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { FormField, Input, SearchInput, Select, Toggle } from '../../components/ui/Field';
import { EmptyState, ErrorState, TableSkeleton } from '../../components/ui/Feedback';

const FALLBACK_TYPES: Array<{ value: LookupType; label: string }> = [
  { value: 'category', label: 'Category' },
  { value: 'priority', label: 'Priority' },
  { value: 'procurement_method', label: 'Procurement method' },
  { value: 'office_region', label: 'Office / region' },
  { value: 'funds', label: 'Funds' },
];

interface LookupFormState {
  list_type: LookupType;
  value: string;
  sort_order: number;
  is_active: boolean;
}

interface TeamFormState {
  name: string;
  designation: string;
  display_order: number;
  is_active: boolean;
}

const EMPTY_LOOKUP_FORM: LookupFormState = {
  list_type: 'category',
  value: '',
  sort_order: 0,
  is_active: true,
};

const EMPTY_TEAM_FORM: TeamFormState = {
  name: '',
  designation: '',
  display_order: 0,
  is_active: true,
};

type DeleteTarget =
  | { kind: 'lookup'; record: LookupValue }
  | { kind: 'team'; member: EvaluationTeamMember };

export function AdminMastersPage() {
  useDocumentTitle('Masters');
  const { toast } = useToast();

  const [records, setRecords] = useState<LookupValue[]>([]);
  const [team, setTeam] = useState<EvaluationTeamMember[]>([]);
  const [types, setTypes] = useState(FALLBACK_TYPES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('lookups');
  const [searchDraft, setSearchDraft] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [lookupOpen, setLookupOpen] = useState(false);
  const [editingLookup, setEditingLookup] = useState<LookupValue | null>(null);
  const [lookupForm, setLookupForm] = useState<LookupFormState>(EMPTY_LOOKUP_FORM);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<EvaluationTeamMember | null>(null);
  const [teamForm, setTeamForm] = useState<TeamFormState>(EMPTY_TEAM_FORM);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [recordsResult, teamResult, typesResult] = await Promise.allSettled([
      mastersApi.lookupRecords(),
      mastersApi.allTeam(),
      mastersApi.lookupTypes(),
    ]);
    if (recordsResult.status === 'fulfilled') setRecords(recordsResult.value);
    if (teamResult.status === 'fulfilled') setTeam(teamResult.value);
    if (typesResult.status === 'fulfilled' && typesResult.value.length > 0) setTypes(typesResult.value);

    if (
      recordsResult.status === 'rejected' ||
      teamResult.status === 'rejected'
    ) {
      setError('One or more master data collections could not be loaded.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const needle = searchDraft.trim().toLowerCase();
  const filteredRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          !needle ||
          record.value.toLowerCase().includes(needle) ||
          record.list_type.toLowerCase().includes(needle),
      ),
    [records, needle],
  );
  const filteredTeam = useMemo(
    () =>
      team.filter(
        (member) =>
          !needle ||
          member.name.toLowerCase().includes(needle) ||
          (member.designation || '').toLowerCase().includes(needle),
      ),
    [team, needle],
  );

  const lookupCounts = useMemo(() => {
    const counts = new Map<LookupType, number>();
    filteredRecords.forEach((record) => {
      const type = record.list_type as LookupType;
      counts.set(type, (counts.get(type) ?? 0) + 1);
    });
    return counts;
  }, [filteredRecords]);

  const stats = useMemo(
    () => ({
      lookupTotal: records.length,
      lookupActive: records.filter((record) => record.is_active).length,
      teamTotal: team.length,
      teamActive: team.filter((member) => member.is_active).length,
    }),
    [records, team],
  );

  const typeLabel = (type: string) => types.find((entry) => entry.value === type)?.label ?? type.replace(/_/g, ' ');

  const openCreateLookup = (type: LookupType) => {
    setEditingLookup(null);
    setLookupForm({ ...EMPTY_LOOKUP_FORM, list_type: type });
    setLookupError(null);
    setLookupOpen(true);
  };

  const openEditLookup = (record: LookupValue) => {
    setEditingLookup(record);
    setLookupForm({
      list_type: record.list_type as LookupType,
      value: record.value,
      sort_order: record.sort_order,
      is_active: record.is_active,
    });
    setLookupError(null);
    setLookupOpen(true);
  };

  const saveLookup = async () => {
    if (!lookupForm.value.trim()) {
      setLookupError('Enter the dropdown option text.');
      return;
    }
    setSaving(true);
    try {
      if (editingLookup) {
        await mastersApi.updateLookup(editingLookup.id, {
          value: lookupForm.value.trim(),
          sort_order: lookupForm.sort_order,
          is_active: lookupForm.is_active,
        });
        toast.success('Option updated', `${typeLabel(lookupForm.list_type)} lists now use the revised value.`);
      } else {
        await mastersApi.createLookup({
          list_type: lookupForm.list_type,
          value: lookupForm.value.trim(),
          sort_order: lookupForm.sort_order,
        });
        toast.success('Option added', `"${lookupForm.value.trim()}" is now available in ${typeLabel(lookupForm.list_type)}.`);
      }
      setLookupOpen(false);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'The option was not saved.';
      setLookupError(message);
      toast.error('Could not save the option', message);
    } finally {
      setSaving(false);
    }
  };

  const openCreateTeam = () => {
    setEditingMember(null);
    setTeamForm({ ...EMPTY_TEAM_FORM, display_order: team.length + 1 });
    setTeamError(null);
    setTeamOpen(true);
  };

  const openEditTeam = (member: EvaluationTeamMember) => {
    setEditingMember(member);
    setTeamForm({
      name: member.name,
      designation: member.designation ?? '',
      display_order: member.display_order,
      is_active: member.is_active,
    });
    setTeamError(null);
    setTeamOpen(true);
  };

  const saveTeam = async () => {
    if (teamForm.name.trim().length < 2) {
      setTeamError('Enter the staff member name.');
      return;
    }
    setSaving(true);
    try {
      if (editingMember) {
        await mastersApi.updateTeamMember(editingMember.id, {
          name: teamForm.name.trim(),
          designation: teamForm.designation.trim() || null,
          display_order: teamForm.display_order,
          is_active: teamForm.is_active,
        });
        toast.success('Team member updated', 'The BEC member picker now uses the revised details.');
      } else {
        await mastersApi.createTeamMember({
          name: teamForm.name.trim(),
          designation: teamForm.designation.trim() || null,
          display_order: teamForm.display_order,
          is_active: teamForm.is_active,
        });
        toast.success('Team member added', `${teamForm.name.trim()} is available for BEC selection.`);
      }
      setTeamOpen(false);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'The team member was not saved.';
      setTeamError(message);
      toast.error('Could not save the team member', message);
    } finally {
      setSaving(false);
    }
  };

  const reactivateLookup = async (record: LookupValue) => {
    setWorkingId(`lookup-${record.id}`);
    try {
      await mastersApi.updateLookup(record.id, { is_active: true });
      toast.success('Option reactivated', `"${record.value}" is available again.`);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      toast.error('Could not reactivate', err instanceof ApiError ? err.message : 'The option was not changed.');
    } finally {
      setWorkingId(null);
    }
  };

  const reactivateTeam = async (member: EvaluationTeamMember) => {
    setWorkingId(`team-${member.id}`);
    try {
      await mastersApi.updateTeamMember(member.id, { is_active: true });
      toast.success('Team member reactivated', `${member.name} is available for BEC selection again.`);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      toast.error('Could not reactivate', err instanceof ApiError ? err.message : 'The team member was not changed.');
    } finally {
      setWorkingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'lookup') {
        await mastersApi.deactivateLookup(deleteTarget.record.id);
        toast.success('Option deactivated', `"${deleteTarget.record.value}" is hidden from new records.`);
      } else {
        await mastersApi.deactivateTeamMember(deleteTarget.member.id);
        toast.success('Team member deactivated', `${deleteTarget.member.name} is hidden from new BEC selections.`);
      }
      setDeleteTarget(null);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      toast.error('Could not deactivate', err instanceof ApiError ? err.message : 'The record was not changed.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Reference data"
        title="Masters"
        description="Dropdown lists and the evaluation team mirror the workbook. Inactive values remain attached to historical records."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} className={cn(loading && 'animate-spin')} />}
              onClick={() => setRefreshKey((key) => key + 1)}
              disabled={loading}
            >
              Refresh
            </Button>
            {tab === 'lookups' ? (
              <Button size="sm" icon={<Plus size={15} />} onClick={() => openCreateLookup('category')}>
                Add option
              </Button>
            ) : (
              <Button size="sm" icon={<Plus size={15} />} onClick={openCreateTeam}>
                Add team member
              </Button>
            )}
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Dropdown values" value={formatNumber(stats.lookupTotal)} sub={`${stats.lookupActive} active`} icon={ListChecks} tone="forest" />
        <StatCard label="List groups" value={String(types.length)} sub="workbook reference lists" icon={Database} tone="info" />
        <StatCard label="Evaluation team" value={formatNumber(stats.teamTotal)} sub={`${stats.teamActive} active members`} icon={Users2} tone="gold" />
        <StatCard label="Active staff" value={formatNumber(stats.teamActive)} sub="selectable in BEC" icon={UserCog} tone="amber" />
      </section>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              items={[
                { value: 'lookups', label: 'Dropdown lists', count: records.length, icon: <Database size={13} /> },
                { value: 'team', label: 'Evaluation team', count: team.length, icon: <Users2 size={13} /> },
              ]}
              value={tab}
              onChange={(value) => {
                setTab(value);
                setSearchDraft('');
              }}
            />
            {tab === 'team' && (
              <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={openCreateTeam}>
                Add member
              </Button>
            )}
            <SearchInput
              value={searchDraft}
              onChange={setSearchDraft}
              placeholder={tab === 'lookups' ? 'Search values…' : 'Search staff or designation…'}
              className="w-full sm:w-[280px]"
              ariaLabel="Search master data"
            />
          </div>
          <p className="text-[10.5px] text-muted">
            {loading
              ? 'Loading master data…'
              : tab === 'lookups'
                ? `${filteredRecords.length} of ${records.length} values shown`
                : `${filteredTeam.length} of ${team.length} team members shown`}
          </p>
        </div>

        {loading ? (
          <div className="p-4 md:p-5">
            <TableSkeleton rows={7} />
          </div>
        ) : error ? (
          <div className="p-5">
            <ErrorState title="Master data unavailable" description={error} onRetry={() => setRefreshKey((key) => key + 1)} />
          </div>
        ) : tab === 'lookups' ? (
          <div className="grid items-start gap-4 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-3">
            {types.map((type) => {
              const entries = filteredRecords.filter((record) => record.list_type === type.value);
              const totalForType = records.filter((record) => record.list_type === type.value).length;
              if (needle && entries.length === 0) return null;
              return (
                <div key={type.value} className="rounded-xl border border-line bg-surface">
                  <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-semibold text-ink">{type.label}</p>
                      <p className="mt-0.5 text-[9.5px] text-muted">
                        {lookupCounts.get(type.value) ?? 0} shown · {totalForType} total
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCreateLookup(type.value)}
                      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-forest-tint hover:text-forest"
                      aria-label={`Add ${type.label} option`}
                      title="Add option"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  {entries.length === 0 ? (
                    <p className="px-4 py-6 text-center text-[11px] text-muted">No values in this list yet.</p>
                  ) : (
                    <div className="divide-y divide-line">
                      {entries.map((record) => (
                        <div key={record.id} className="group flex items-center gap-2 px-4 py-2.5">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-surface-2 font-mono text-[9px] font-semibold text-muted">
                            {record.sort_order}
                          </span>
                          <span
                            className={cn(
                              'min-w-0 flex-1 truncate text-[11.5px]',
                              record.is_active ? 'font-medium text-ink-soft' : 'text-muted line-through',
                            )}
                            title={record.value}
                          >
                            {record.value}
                          </span>
                          <Badge tone={record.is_active ? 'forest' : 'neutral'} className="px-1.5 py-0.5 text-[9px]">
                            {record.is_active ? 'On' : 'Off'}
                          </Badge>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => openEditLookup(record)}
                              className="rounded p-1 text-muted transition-colors hover:bg-surface-2 hover:text-forest"
                              aria-label={`Edit ${record.value}`}
                              title="Edit option"
                            >
                              <Pencil size={12} />
                            </button>
                            {record.is_active ? (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ kind: 'lookup', record })}
                                className="rounded p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                                aria-label={`Deactivate ${record.value}`}
                                title="Deactivate option"
                              >
                                <Power size={12} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void reactivateLookup(record)}
                                disabled={workingId === `lookup-${record.id}`}
                                className="rounded p-1 text-muted transition-colors hover:bg-forest-tint hover:text-forest disabled:opacity-40"
                                aria-label={`Reactivate ${record.value}`}
                                title="Reactivate option"
                              >
                                <Power size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredRecords.length === 0 && needle && (
              <div className="md:col-span-2 xl:col-span-3">
                <EmptyState
                  icon={SearchX}
                  title="No dropdown values match."
                  description="Try a different search term, or add the option to one of the lists."
                  action={
                    <Button variant="secondary" onClick={() => setSearchDraft('')}>
                      Clear search
                    </Button>
                  }
                />
              </div>
            )}
          </div>
        ) : (
          <>
            {filteredTeam.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={SearchX}
                  title={needle ? 'No team members match.' : 'No evaluation team members yet.'}
                  description={
                    needle
                      ? 'Try a different name or designation.'
                      : 'Add the staff who sit on Bid Evaluation Committees.'
                  }
                  action={
                    needle ? (
                      <Button variant="secondary" onClick={() => setSearchDraft('')}>
                        Clear search
                      </Button>
                    ) : (
                      <Button icon={<Plus size={15} />} onClick={openCreateTeam}>
                        Add team member
                      </Button>
                    )
                  }
                />
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-line bg-surface-2">
                        <th className="table-head w-16 px-5 py-3">Order</th>
                        <th className="table-head px-3 py-3">Name</th>
                        <th className="table-head px-3 py-3">Designation</th>
                        <th className="table-head px-3 py-3">Status</th>
                        <th className="w-28 px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {filteredTeam.map((member) => (
                        <tr key={member.id} className="transition-colors hover:bg-surface-2">
                          <td className="px-5 py-3.5">
                            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded bg-surface-2 px-1.5 font-mono text-[9.5px] font-semibold text-muted">
                              {member.display_order}
                            </span>
                          </td>
                          <td className="px-3 py-3.5">
                            <p className={cn('text-[12.5px] font-semibold', member.is_active ? 'text-ink' : 'text-muted')}>
                              {member.name}
                            </p>
                          </td>
                          <td className="px-3 py-3.5 text-[11.5px] text-ink-soft">{member.designation || '—'}</td>
                          <td className="px-3 py-3.5">
                            <Badge tone={member.is_active ? 'forest' : 'neutral'} dot>
                              {member.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEditTeam(member)}
                                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-forest-tint hover:text-forest"
                                aria-label={`Edit ${member.name}`}
                                title="Edit team member"
                              >
                                <Pencil size={14} />
                              </button>
                              {member.is_active ? (
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget({ kind: 'team', member })}
                                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                                  aria-label={`Deactivate ${member.name}`}
                                  title="Deactivate team member"
                                >
                                  <Power size={14} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => void reactivateTeam(member)}
                                  disabled={workingId === `team-${member.id}`}
                                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-forest-tint hover:text-forest disabled:opacity-40"
                                  aria-label={`Reactivate ${member.name}`}
                                  title="Reactivate team member"
                                >
                                  <Power size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-line md:hidden">
                  {filteredTeam.map((member) => (
                    <div key={member.id} className="flex items-start gap-3 px-4 py-3.5">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-surface-2 font-mono text-[10px] font-semibold text-muted">
                        {member.display_order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-ink">{member.name}</p>
                        <p className="mt-0.5 text-[10px] text-muted">{member.designation || 'No designation'}</p>
                        <Badge tone={member.is_active ? 'forest' : 'neutral'} dot className="mt-1.5">
                          {member.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditTeam(member)}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-forest"
                        aria-label={`Edit ${member.name}`}
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <Modal
        open={lookupOpen}
        onClose={() => setLookupOpen(false)}
        title={editingLookup ? 'Edit dropdown option' : 'Add dropdown option'}
        description="Options appear in the contract form immediately and remain attached to historical records when deactivated."
        eyebrow="Reference list"
        icon={<ListChecks size={18} />}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLookupOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveLookup} loading={saving}>
              {editingLookup ? 'Save option' : 'Add option'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {lookupError && (
            <p className="rounded-lg border border-line bg-danger-soft px-3 py-2 text-[11px] font-medium text-danger">
              {lookupError}
            </p>
          )}
          <FormField label="Dropdown list" htmlFor="lookup-type" required>
            <Select
              id="lookup-type"
              value={lookupForm.list_type}
              onChange={(event) =>
                setLookupForm((current) => ({ ...current, list_type: event.target.value as LookupType }))
              }
              options={types}
              disabled={Boolean(editingLookup)}
            />
          </FormField>
          <FormField label="Option value" htmlFor="lookup-value" required>
            <Input
              id="lookup-value"
              value={lookupForm.value}
              onChange={(event) => setLookupForm((current) => ({ ...current, value: event.target.value }))}
              placeholder="e.g. Minor Works"
              autoFocus
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Sort order" htmlFor="lookup-order" hint="Lower numbers appear first.">
              <Input
                id="lookup-order"
                type="number"
                min={0}
                value={lookupForm.sort_order}
                onChange={(event) =>
                  setLookupForm((current) => ({ ...current, sort_order: Number(event.target.value) || 0 }))
                }
              />
            </FormField>
            <div className="flex items-end pb-1">
              <Toggle
                checked={lookupForm.is_active}
                onChange={(checked) => setLookupForm((current) => ({ ...current, is_active: checked }))}
                label="Available for new records"
                description="Inactive values stay in history."
                disabled={!editingLookup}
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={teamOpen}
        onClose={() => setTeamOpen(false)}
        title={editingMember ? 'Edit team member' : 'Add evaluation team member'}
        description="Members appear in the BEC multi-select on the engineer section of every contract."
        eyebrow="Evaluation team"
        icon={<Users2 size={18} />}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTeamOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveTeam} loading={saving}>
              {editingMember ? 'Save member' : 'Add member'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {teamError && (
            <p className="rounded-lg border border-line bg-danger-soft px-3 py-2 text-[11px] font-medium text-danger">
              {teamError}
            </p>
          )}
          <FormField label="Full name" htmlFor="team-name" required>
            <Input
              id="team-name"
              value={teamForm.name}
              onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="e.g. K. A. Jayasuriya"
              autoFocus
            />
          </FormField>
          <FormField label="Designation" htmlFor="team-designation">
            <Input
              id="team-designation"
              value={teamForm.designation}
              onChange={(event) => setTeamForm((current) => ({ ...current, designation: event.target.value }))}
              placeholder="e.g. Chief Engineer"
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Display order" htmlFor="team-order">
              <Input
                id="team-order"
                type="number"
                min={0}
                value={teamForm.display_order}
                onChange={(event) =>
                  setTeamForm((current) => ({ ...current, display_order: Number(event.target.value) || 0 }))
                }
              />
            </FormField>
            <div className="flex items-end pb-1">
              <Toggle
                checked={teamForm.is_active}
                onChange={(checked) => setTeamForm((current) => ({ ...current, is_active: checked }))}
                label="Active member"
                description="Selectable on new BECs."
              />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={deleteTarget?.kind === 'team' ? 'Deactivate this team member?' : 'Deactivate this option?'}
        description="It will be hidden from new records but remain attached to historical contracts. You can reactivate it later."
        confirmLabel="Deactivate"
        tone="danger"
        loading={deleting}
        icon={<Power size={18} />}
      >
        {deleteTarget && (
          <p className="text-[12px] leading-relaxed text-ink-soft">
            {deleteTarget.kind === 'team' ? (
              <>
                <span className="font-semibold text-ink">{deleteTarget.member.name}</span>
                {deleteTarget.member.designation ? ` · ${deleteTarget.member.designation}` : ''}
              </>
            ) : (
              <>
                <span className="font-semibold text-ink">{deleteTarget.record.value}</span> in{' '}
                {typeLabel(deleteTarget.record.list_type)}
              </>
            )}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof Database;
  tone: 'forest' | 'info' | 'amber' | 'gold';
}) {
  const palette = {
    forest: 'bg-forest-tint text-forest',
    info: 'bg-info-tint text-info',
    amber: 'bg-amber-tint text-amber',
    gold: 'bg-gold-soft text-gold',
  }[tone];

  return (
    <div className="card animate-fade-up p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="eyebrow">{label}</span>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', palette)}>
          <Icon size={15} />
        </span>
      </div>
      <p className="mt-2.5 font-serif text-[26px] font-semibold leading-none text-ink tabular">{value}</p>
      <p className="mt-2 text-[10.5px] text-muted">{sub}</p>
    </div>
  );
}
