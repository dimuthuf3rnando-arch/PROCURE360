import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { authApi } from '../../api/auth';
import { ApiError } from '../../api/client';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { FormField, Input } from '../ui/Field';
import { useToast } from '../../context/ToastContext';

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    if (next.length < 8) {
      setError('Your new password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setError('The confirmation does not match the new password.');
      return;
    }
    setSaving(true);
    try {
      await authApi.changePassword({ current_password: current, new_password: next });
      toast.success('Password updated', 'Use your new password the next time you sign in.');
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update your password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Change password"
      description="Choose a strong password you do not use elsewhere on the network."
      icon={<KeyRound size={18} />}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Update password
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Current password" htmlFor="current-password" required>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </FormField>
        <FormField label="New password" htmlFor="new-password" required hint="At least 8 characters.">
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </FormField>
        <FormField label="Confirm new password" htmlFor="confirm-password" required>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
          />
        </FormField>
        {error && (
          <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-[12px] font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
