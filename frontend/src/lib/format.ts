import type { ContractStatus, Role } from '../types/api';

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return digits === 0 ? integer.format(value) : decimal.format(value);
}

export function formatLKR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `LKR ${integer.format(Math.round(value))}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${decimalWithDigits(digits).format(value)}%`;
}

function decimalWithDigits(digits: number): Intl.NumberFormat {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function formatCompactLKR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `LKR ${decimal.format(value / 1_000_000_000)}B`;
  if (absolute >= 1_000_000) return `LKR ${decimal.format(value / 1_000_000)}M`;
  if (absolute >= 1_000) return `LKR ${integer.format(value / 1_000)}K`;
  return `LKR ${integer.format(value)}`;
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${decimal.format(value / 1_000_000_000)}B`;
  if (absolute >= 1_000_000) return `${decimal.format(value / 1_000_000)}M`;
  if (absolute >= 1_000) return `${integer.format(value / 1_000)}K`;
  return integer.format(value);
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = value.length <= 10 ? parseDateOnly(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatMonth(value: string): string {
  if (!value) return '—';
  const date = parseDateOnly(`${value}-01`);
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(date);
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(value);
}

export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const target = parseDateOnly(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function dueLabel(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'Due today';
  if (days > 0) return `${days}d left`;
  return `${Math.abs(days)}d overdue`;
}

export function ageLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return '—';
  if (days < 1) return '< 1 day';
  if (days < 30) return `${decimal.format(days)} days`;
  return `${decimal.format(days / 30)} months`;
}

export function humanizeAction(action: string | null | undefined): string {
  if (!action) return '—';
  return action
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function humanizeField(field: string): string {
  return field
    .replace(/_id$/, '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function roleLabel(role: Role | string | null | undefined): string {
  switch (role) {
    case 'PC_MANAGER':
      return 'P&C Manager';
    case 'QS':
      return 'Quantity Surveyor';
    case 'PC_ENGINEER':
      return 'P&C Engineer';
    case 'SUPPLY_OFFICER':
      return 'Supply Officer';
    case 'ADMIN':
      return 'Administrator';
    case 'VIEWER':
      return 'Viewer';
    default:
      return role ? String(role).replace(/_/g, ' ') : '—';
  }
}

export function roleShort(role: Role | string | null | undefined): string {
  switch (role) {
    case 'PC_MANAGER':
      return 'P&C Manager';
    case 'QS':
      return 'QS';
    case 'PC_ENGINEER':
      return 'P&C Engineer';
    case 'SUPPLY_OFFICER':
      return 'Supply Officer';
    case 'ADMIN':
      return 'Admin';
    case 'VIEWER':
      return 'Viewer';
    default:
      return role ? String(role).replace(/_/g, ' ') : '—';
  }
}

export const STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT_PC_MANAGER: 'Draft · P&C Manager',
  WITH_QS: 'With QS',
  WITH_PC_ENGINEER: 'With P&C Engineer',
  WITH_SUPPLY_OFFICER: 'With Supply Officer',
  RETURNED_FOR_CORRECTION: 'Returned for correction',
  COMPLETED: 'Completed',
};

export const STATUS_SHORT: Record<ContractStatus, string> = {
  DRAFT_PC_MANAGER: 'Draft',
  WITH_QS: 'With QS',
  WITH_PC_ENGINEER: 'With Engineer',
  WITH_SUPPLY_OFFICER: 'With Supply',
  RETURNED_FOR_CORRECTION: 'Returned',
  COMPLETED: 'Completed',
};

export function statusLabel(status: ContractStatus | string | null | undefined): string {
  if (!status) return '—';
  return STATUS_LABELS[status as ContractStatus] ?? humanizeAction(status);
}

export type StatusTone = 'neutral' | 'amber' | 'forest' | 'danger' | 'info' | 'gold';

export function statusTone(status: ContractStatus | string): StatusTone {
  switch (status) {
    case 'DRAFT_PC_MANAGER':
      return 'neutral';
    case 'WITH_QS':
      return 'amber';
    case 'WITH_PC_ENGINEER':
      return 'info';
    case 'WITH_SUPPLY_OFFICER':
      return 'info';
    case 'RETURNED_FOR_CORRECTION':
      return 'danger';
    case 'COMPLETED':
      return 'forest';
    default:
      return 'neutral';
  }
}

export function statusOwner(status: ContractStatus): Role {
  switch (status) {
    case 'DRAFT_PC_MANAGER':
    case 'RETURNED_FOR_CORRECTION':
      return 'PC_MANAGER';
    case 'WITH_QS':
      return 'QS';
    case 'WITH_PC_ENGINEER':
    case 'COMPLETED':
      return 'PC_ENGINEER';
    case 'WITH_SUPPLY_OFFICER':
      return 'SUPPLY_OFFICER';
  }
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function periodLabel(value: number | null, unit: string | null): string {
  if (!value) return '—';
  return `${formatNumber(value)} ${unit ?? ''}`.trim();
}

export function toneClasses(tone: StatusTone): string {
  switch (tone) {
    case 'forest':
      return 'border-forest-soft bg-forest-soft text-forest';
    case 'amber':
      return 'border-transparent bg-amber-soft text-amber';
    case 'danger':
      return 'border-transparent bg-danger-soft text-danger';
    case 'info':
      return 'border-transparent bg-info-soft text-info';
    case 'gold':
      return 'border-transparent bg-gold-soft text-gold';
    default:
      return 'border-line bg-surface-2 text-muted';
  }
}

export function scoreTone(score: number): StatusTone {
  if (score >= 4.2) return 'forest';
  if (score >= 3.5) return 'gold';
  if (score >= 2.8) return 'amber';
  return 'danger';
}

export function scoreLabel(score: number): string {
  if (score >= 4.5) return 'Excellent';
  if (score >= 4.0) return 'Very good';
  if (score >= 3.5) return 'Good';
  if (score >= 3.0) return 'Satisfactory';
  if (score >= 2.5) return 'Needs attention';
  return 'At risk';
}

export function truncate(value: string | null | undefined, length = 60): string {
  if (!value) return '—';
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function fiscalYearLabel(date = new Date()): string {
  return String(date.getFullYear());
}
