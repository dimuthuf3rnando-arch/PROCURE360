import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

type Size = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  eyebrow?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: Size;
  closeOnBackdrop?: boolean;
}

const sizes: Record<Size, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  eyebrow,
  icon,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-[#101713]/60 backdrop-blur-[2px] animate-fade-in"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-lift animate-scale-in sm:rounded-2xl',
          sizes[size],
        )}
      >
        <div className="flex items-start gap-3.5 border-b border-line px-6 py-5">
          {icon && (
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest-tint text-forest">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            <h2 id="modal-title" className="font-serif text-[22px] font-semibold leading-tight text-ink">
              {title}
            </h2>
            {description && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>
        <div className="scrollbar-thin overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 rounded-b-3xl border-t border-line bg-surface-2 px-6 py-4 sm:rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger' | 'amber';
  loading?: boolean;
  children?: ReactNode;
  icon?: ReactNode;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading,
  children,
  icon,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={icon}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
