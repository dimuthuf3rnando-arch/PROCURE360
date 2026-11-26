import { Check, RotateCcw } from 'lucide-react';
import type { ContractStatus, Role } from '../../types/api';
import { cn } from '../../lib/utils';
import { ROLE_ORDER, SECTION_BY_ROLE } from '../../lib/fields';
import { roleShort } from '../../lib/format';

interface WorkflowStepperProps {
  status: ContractStatus;
  currentOwnerRole: Role;
  returnedFromRole?: Role | null;
  compact?: boolean;
  vertical?: boolean;
}

type StepState = 'complete' | 'current' | 'returned' | 'upcoming';

export function WorkflowStepper({
  status,
  currentOwnerRole,
  returnedFromRole,
  compact = false,
  vertical = false,
}: WorkflowStepperProps) {
  const completed = status === 'COMPLETED';
  const returned = status === 'RETURNED_FOR_CORRECTION';
  // The Supply Officer occupies the same step as the P&C Engineer.
  const stepRole = currentOwnerRole === 'SUPPLY_OFFICER' ? 'PC_ENGINEER' : currentOwnerRole;
  const ownerIndex = ROLE_ORDER.indexOf(stepRole as (typeof ROLE_ORDER)[number]);

  const steps = ROLE_ORDER.map((role, index) => {
    const section = SECTION_BY_ROLE[role];
    let state: StepState = 'upcoming';
    if (completed) state = 'complete';
    else if (returned && index === ownerIndex) state = 'returned';
    else if (index < ownerIndex) state = 'complete';
    else if (index === ownerIndex) state = 'current';
    return {
      role,
      label: roleShort(role),
      range: section.range.replace('Orders ', ''),
      orders: section.range,
      state,
    };
  });

  if (vertical) {
    const allSteps = [
      ...steps,
      {
        role: 'COMPLETED' as const,
        label: 'Completed',
        orders: 'Closed file',
        range: 'Closed file',
        state: (completed ? 'complete' : 'upcoming') as StepState,
      },
    ];
    return (
      <div className="space-y-1">
        {allSteps.map((step, index) => (
          <div key={step.role} className="relative flex items-start gap-3.5 pb-3 last:pb-0">
            {index < allSteps.length - 1 && (
              <span
                className={cn(
                  'absolute left-[15px] top-8 h-[calc(100%-24px)] w-px',
                  step.state === 'complete' ? 'bg-forest' : 'bg-line',
                )}
                aria-hidden
              />
            )}
            <span
              className={cn(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold',
                step.state === 'complete' && 'border-forest bg-forest text-white',
                step.state === 'current' && 'border-forest bg-surface text-forest ring-4 ring-[var(--focus-ring)]',
                step.state === 'returned' && 'border-danger bg-danger-soft text-danger',
                step.state === 'upcoming' && 'border-line-strong bg-surface text-muted',
              )}
            >
              {step.state === 'complete' ? (
                <Check size={13} strokeWidth={3} />
              ) : step.state === 'returned' ? (
                <RotateCcw size={12} strokeWidth={2.4} />
              ) : (
                String(index + 1).padStart(2, '0')
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <p
                  className={cn(
                    'text-[12px] font-semibold',
                    step.state === 'upcoming' ? 'text-muted' : 'text-ink',
                    step.state === 'returned' && 'text-danger',
                  )}
                >
                  {step.label}
                </p>
                {step.state === 'current' && (
                  <span className="rounded-full bg-forest-tint px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-forest">
                    Current
                  </span>
                )}
                {step.state === 'returned' && (
                  <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-danger">
                    Returned
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[10.5px] text-muted">{step.orders}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('w-full', compact ? 'space-y-0' : 'space-y-0')}>
      <div className="grid grid-cols-4 gap-0">
        {steps.map((step, index) => (
          <div key={step.role} className="relative flex flex-col items-start">
            {index < steps.length - 1 && (
              <span
                className={cn(
                  'absolute left-[19px] top-[15px] h-[2px] w-[calc(100%-8px)] transition-colors',
                  step.state === 'complete' ? 'bg-forest' : 'bg-line',
                )}
                aria-hidden
              />
            )}
            <div className="relative z-10 flex w-full items-start gap-2.5">
              <span
                className={cn(
                  'flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold transition-all',
                  step.state === 'complete' && 'border-forest bg-forest text-white',
                  step.state === 'current' && 'border-forest bg-surface text-forest ring-4 ring-[var(--focus-ring)]',
                  step.state === 'returned' && 'border-danger bg-danger-soft text-danger',
                  step.state === 'upcoming' && 'border-line-strong bg-surface text-muted',
                )}
              >
                {step.state === 'complete' ? (
                  <Check size={13} strokeWidth={3} />
                ) : step.state === 'returned' ? (
                  <RotateCcw size={12} strokeWidth={2.4} />
                ) : (
                  String(index + 1).padStart(2, '0')
                )}
              </span>
              <div className="min-w-0 pt-0.5 pr-2">
                <p
                  className={cn(
                    'text-[11px] font-semibold leading-tight',
                    step.state === 'upcoming' ? 'text-muted' : 'text-ink',
                    step.state === 'returned' && 'text-danger',
                  )}
                >
                  {step.label}
                </p>
                <p className="mt-0.5 text-[9px] leading-tight text-muted">{compact ? step.range : step.orders}</p>
                {step.state === 'current' && (
                  <span className="mt-1 inline-block rounded-full bg-forest-tint px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-forest">
                    Current
                  </span>
                )}
                {step.state === 'returned' && (
                  <span className="mt-1 inline-block rounded-full bg-danger-soft px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-danger">
                    Returned
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="relative flex flex-col items-start">
          <div className="relative z-10 flex w-full items-start gap-2.5">
            <span
              className={cn(
                'flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-full border-2 transition-all',
                completed
                  ? 'border-forest bg-forest text-white'
                  : 'border-line-strong bg-surface text-muted',
              )}
            >
              <Check size={13} strokeWidth={3} />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn('text-[11px] font-semibold leading-tight', completed ? 'text-forest' : 'text-muted')}>
                Completed
              </p>
              <p className="mt-0.5 text-[9px] text-muted">Closed file</p>
            </div>
          </div>
        </div>
      </div>

      {returned && returnedFromRole && (
        <p className="mt-3 rounded-lg bg-danger-soft px-2.5 py-1.5 text-[10px] font-medium text-danger">
          Returned by {roleShort(returnedFromRole)} for correction. Owned again by {roleShort(currentOwnerRole)}.
        </p>
      )}
    </div>
  );
}
