import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  SearchX,
  ShieldCheck,
  UserCheck,
  UserRound,
  Users2,
} from 'lucide-react';
import { usersApi } from '../../api/users';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { Role, User } from '../../types/api';
import { USER_ROLE_OPTIONS } from '../../lib/fields';
import { useDocumentTitle } from '../../lib/hooks';
import { formatDate, roleLabel, roleShort } from '../../lib/format';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { SectionHeading } from '../../components/ui/Layout';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { FormField, Input, SearchInput, Select, Toggle } from '../../components/ui/Field';
import { EmptyState, ErrorState, TableSkeleton } from '../../components/ui/Feedback';

interface UserFormState {
  full_name: string;
  email: string;
  role: Role;
  designation: string;
  phone: string;
  password: string;
  is_active: boolean;
}

const EMPTY_FORM: UserFormState = {
  full_name: '',
  email: '',
  role: 'VIEWER',
  designation: '',
  phone: '',
  password: '',
  is_active: true,
};

const ROLE_TONE: Record<Role, 'forest' | 'info' | 'amber' | 'gold' | 'neutral'> = {
  ADMIN: 'forest',
  PC_MANAGER: 'info',
  QS: 'amber',
  PC_ENGINEER: 'gold',
  SUPPLY_OFFICER: 'gold',
  VIEWER: 'neutral',
};

const ROLE_FILTER_OPTIONS = [
  { value: '', label: 'All roles' },
  ...USER_ROLE_OPTIONS,
];

export function AdminUsersPage() {
  useDocumentTitle('User accounts');
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [includeInactive, setIncludeInactive] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await usersApi.list(true);
      setUsers(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The user directory could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const filtered = useMemo(() => {
    const needle = searchDraft.trim().toLowerCase();
    return users.filter((user) => {
      if (!includeInactive && !user.is_active) return false;
      if (roleFilter && user.role !== roleFilter) return false;
      if (!needle) return true;
      return (
        user.full_name.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle) ||
        (user.designation || '').toLowerCase().includes(needle) ||
        (user.phone || '').toLowerCase().includes(needle)
      );
    });
  }, [users, searchDraft, roleFilter, includeInactive]);

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.is_active).length,
      admins: users.filter((user) => user.role === 'ADMIN' && user.is_active).length,
      roles: new Set(users.filter((user) => user.is_active).map((user) => user.role)).size,
    }),
    [users],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setForm({
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      designation: user.designation ?? '',
      phone: user.phone ?? '',
      password: '',
      is_active: user.is_active,
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const updateForm = (key: keyof UserFormState, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const submit = async () => {
    const errors: Record<string, string> = {};
    if (form.full_name.trim().length < 2) errors.full_name = 'Enter the full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address.';
    if (!editing && form.password.length < 8) errors.password = 'Use at least 8 characters.';
    if (editing && form.password && form.password.length < 8) errors.password = 'Use at least 8 characters or leave blank.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      if (editing) {
        const payload: {
          full_name: string;
          email: string;
          role: Role;
          designation: string | null;
          phone: string | null;
          is_active: boolean;
          password?: string;
        } = {
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          role: form.role,
          designation: form.designation.trim() || null,
          phone: form.phone.trim() || null,
          is_active: form.is_active,
        };
        if (form.password) payload.password = form.password;
        await usersApi.update(editing.id, payload);
        toast.success('Account updated', `${form.full_name.trim()} now has ${roleLabel(form.role)} access.`);
      } else {
        await usersApi.create({
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          role: form.role,
          designation: form.designation.trim() || null,
          phone: form.phone.trim() || null,
          is_active: form.is_active,
          password: form.password,
        });
        toast.success('Account created', `${form.full_name.trim()} can now sign in with the temporary password.`);
      }
      setModalOpen(false);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      toast.error('Could not save the account', err instanceof ApiError ? err.message : 'The account was not saved.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await usersApi.deactivate(deactivateTarget.id);
      toast.success('Account deactivated', `${deactivateTarget.full_name} can no longer sign in.`);
      setDeactivateTarget(null);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      toast.error('Could not deactivate', err instanceof ApiError ? err.message : 'The account was not changed.');
    } finally {
      setDeactivating(false);
    }
  };

  const resetFilters = () => {
    setSearchDraft('');
    setRoleFilter('');
    setIncludeInactive(true);
  };

  const hasFilters = Boolean(searchDraft) || Boolean(roleFilter) || !includeInactive;

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Access control"
        title="User accounts"
        description="Five roles map to the workflow. Only administrators can create accounts or change access."
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
            <Button size="sm" icon={<Plus size={15} />} onClick={openCreate}>
              New account
            </Button>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Accounts" value={String(stats.total)} sub="all records" icon={Users2} tone="forest" />
        <StatCard label="Active" value={String(stats.active)} sub="can sign in" icon={UserCheck} tone="info" />
        <StatCard label="Administrators" value={String(stats.admins)} sub="full override access" icon={ShieldCheck} tone="amber" />
        <StatCard label="Roles in use" value={String(stats.roles)} sub="of 5 defined roles" icon={UserRound} tone="gold" />
      </section>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              value={searchDraft}
              onChange={setSearchDraft}
              placeholder="Search name, email, designation or phone…"
              className="min-w-[220px] flex-1"
              ariaLabel="Search user accounts"
            />
            <Select
              aria-label="Filter by role"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              options={ROLE_FILTER_OPTIONS}
              className="w-full sm:w-[180px]"
            />
            <div className="flex h-[42px] shrink-0 items-center rounded-xl border border-line bg-surface px-3.5">
              <Toggle checked={includeInactive} onChange={setIncludeInactive} label="Include inactive" />
            </div>
            {hasFilters && (
              <button type="button" onClick={resetFilters} className="text-[11px] font-semibold text-forest hover:underline">
                Reset
              </button>
            )}
          </div>
          <p className="text-[10.5px] text-muted">
            {loading ? 'Loading accounts…' : `${filtered.length} of ${users.length} account${users.length === 1 ? '' : 's'} shown`}
          </p>
        </div>

        {loading ? (
          <div className="p-4 md:p-5">
            <TableSkeleton rows={6} />
          </div>
        ) : error ? (
          <div className="p-5">
            <ErrorState
              title="User directory unavailable"
              description={error}
              onRetry={() => setRefreshKey((key) => key + 1)}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={SearchX}
              title={hasFilters ? 'No accounts match this view.' : 'No user accounts yet.'}
              description={
                hasFilters
                  ? 'Try a different search term or remove the role filter.'
                  : 'Create the first account to give a colleague access to the register.'
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button icon={<Plus size={15} />} onClick={openCreate}>
                    Create the first account
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
                    <th className="table-head px-5 py-3">Account</th>
                    <th className="table-head px-3 py-3">Role</th>
                    <th className="table-head px-3 py-3">Designation</th>
                    <th className="table-head px-3 py-3">Contact</th>
                    <th className="table-head px-3 py-3">Status</th>
                    <th className="table-head px-3 py-3">Created</th>
                    <th className="w-24 px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((user) => {
                    const isSelf = user.id === currentUser?.id;
                    return (
                      <tr key={user.id} className="transition-colors hover:bg-surface-2">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={user.full_name} size="sm" />
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                                <span className="truncate">{user.full_name}</span>
                                {isSelf && (
                                  <span className="rounded bg-forest-tint px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-forest">
                                    You
                                  </span>
                                )}
                              </p>
                              <p className="truncate text-[10px] text-muted">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <Badge tone={ROLE_TONE[user.role]}>{roleLabel(user.role)}</Badge>
                        </td>
                        <td className="max-w-[190px] px-3 py-3.5">
                          <p className="truncate text-[11.5px] text-ink-soft">{user.designation || '—'}</p>
                        </td>
                        <td className="px-3 py-3.5">
                          <p className="text-[11px] text-ink-soft">{user.phone || '—'}</p>
                        </td>
                        <td className="px-3 py-3.5">
                          <Badge tone={user.is_active ? 'forest' : 'neutral'} dot>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-3 py-3.5 text-[10.5px] text-muted">{formatDate(user.created_at)}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(user)}
                              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-forest-tint hover:text-forest"
                              aria-label={`Edit ${user.full_name}`}
                              title="Edit account"
                            >
                              <Pencil size={14} />
                            </button>
                            {user.is_active && !isSelf && (
                              <button
                                type="button"
                                onClick={() => setDeactivateTarget(user)}
                                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                                aria-label={`Deactivate ${user.full_name}`}
                                title="Deactivate account"
                              >
                                <KeyRound size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line md:hidden">
              {filtered.map((user) => {
                const isSelf = user.id === currentUser?.id;
                return (
                  <div key={user.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={user.full_name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold text-ink">
                            {user.full_name} {isSelf && <span className="text-[9px] font-semibold text-forest">(you)</span>}
                          </p>
                          <p className="truncate text-[10px] text-muted">{user.email}</p>
                        </div>
                      </div>
                      <Badge tone={ROLE_TONE[user.role]}>{roleShort(user.role)}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
                      <span>{user.designation || 'No designation'}</span>
                      <span>{user.phone || 'No phone'}</span>
                      <Badge tone={user.is_active ? 'forest' : 'neutral'} dot>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="mt-2.5 flex items-center justify-end gap-2">
                      <Button variant="secondary" size="sm" icon={<Pencil size={12} />} onClick={() => openEdit(user)}>
                        Edit
                      </Button>
                      {user.is_active && !isSelf && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<KeyRound size={12} />}
                          onClick={() => setDeactivateTarget(user)}
                          className="text-danger hover:bg-danger-soft"
                        >
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit account' : 'Create a user account'}
        description={
          editing
            ? 'Adjust access, contact details or reset the password. Changes take effect at their next request.'
            : 'The temporary password can be changed by the user after their first sign-in.'
        }
        eyebrow={editing ? 'Existing account' : 'New account'}
        icon={editing ? <Pencil size={17} /> : <Users2 size={18} />}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              {editing ? 'Save changes' : 'Create account'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Full name" htmlFor="user-name" required error={formErrors.full_name} className="sm:col-span-2">
            <Input
              id="user-name"
              value={form.full_name}
              onChange={(event) => updateForm('full_name', event.target.value)}
              placeholder="e.g. Nadeesha Perera"
              invalid={Boolean(formErrors.full_name)}
              autoFocus
            />
          </FormField>
          <FormField label="Email address" htmlFor="user-email" required error={formErrors.email}>
            <Input
              id="user-email"
              type="email"
              value={form.email}
              onChange={(event) => updateForm('email', event.target.value)}
              placeholder="name@procure360.lk"
              invalid={Boolean(formErrors.email)}
            />
          </FormField>
          <FormField label="Role" htmlFor="user-role" required hint={roleLabel(form.role)}>
            <Select
              id="user-role"
              value={form.role}
              onChange={(event) => updateForm('role', event.target.value)}
              options={USER_ROLE_OPTIONS}
            />
          </FormField>
          <FormField label="Designation" htmlFor="user-designation">
            <Input
              id="user-designation"
              value={form.designation}
              onChange={(event) => updateForm('designation', event.target.value)}
              placeholder="e.g. Senior Quantity Surveyor"
            />
          </FormField>
          <FormField label="Phone" htmlFor="user-phone">
            <Input
              id="user-phone"
              value={form.phone}
              onChange={(event) => updateForm('phone', event.target.value)}
              placeholder="+94 …"
            />
          </FormField>
          <FormField
            label={editing ? 'Reset password' : 'Temporary password'}
            htmlFor="user-password"
            required={!editing}
            error={formErrors.password}
            hint={editing ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}
          >
            <Input
              id="user-password"
              type="password"
              value={form.password}
              onChange={(event) => updateForm('password', event.target.value)}
              placeholder={editing ? 'Unchanged' : 'Minimum 8 characters'}
              autoComplete="new-password"
              invalid={Boolean(formErrors.password)}
            />
          </FormField>
          <div className="flex items-end pb-1">
            <Toggle
              checked={form.is_active}
              onChange={(checked) => updateForm('is_active', checked)}
              label="Account active"
              description="Inactive accounts cannot sign in."
              disabled={editing?.id === currentUser?.id}
            />
          </div>
        </div>
        {editing?.id === currentUser?.id && (
          <p className="mt-4 rounded-lg border border-line bg-amber-soft px-3 py-2 text-[10.5px] leading-relaxed text-amber">
            You cannot deactivate your own account or remove your own administrator role.
          </p>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={confirmDeactivate}
        title="Deactivate this account?"
        description="The user will lose access immediately. Their historical actions remain in the audit trail."
        confirmLabel="Deactivate account"
        tone="danger"
        loading={deactivating}
        icon={<KeyRound size={18} />}
      >
        {deactivateTarget && (
          <p className="text-[12px] leading-relaxed text-ink-soft">
            <span className="font-semibold text-ink">{deactivateTarget.full_name}</span> ·{' '}
            {deactivateTarget.email} · {roleLabel(deactivateTarget.role)}
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
  icon: typeof Users2;
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
