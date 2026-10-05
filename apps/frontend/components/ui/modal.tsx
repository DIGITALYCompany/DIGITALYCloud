'use client';

import { useState, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, type DialogSize } from './dialog';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
}

const closeOn = (onClose: () => void) => (open: boolean) => {
  if (!open) onClose();
};

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={closeOn(onClose)}>
      <DialogContent size={size} {...(description ? {} : { 'aria-describedby': undefined })}>
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-5">
          <div>
            <DialogTitle className="text-lg font-semibold text-white">{title}</DialogTitle>
            {description && <DialogDescription className="mt-1 text-sm text-ink-300">{description}</DialogDescription>}
          </div>
          <DialogClose className="rounded-lg p-1.5 text-ink-400 transition hover:bg-white/5 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </DialogClose>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <ModalFooter>{footer}</ModalFooter>}
      </DialogContent>
    </Dialog>
  );
}

function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-2 border-t border-white/[0.06] px-6 py-4 sm:flex-row sm:justify-end">{children}</div>;
}

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  /** When set, the user must type this exact value before confirming. */
  confirmText?: string;
}

export function ConfirmDialog({ open, onClose, ...props }: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={closeOn(busy ? () => {} : onClose)}>
      <DialogContent size="sm">
        <ConfirmBody {...props} onClose={onClose} busy={busy} setBusy={setBusy} />
      </DialogContent>
    </Dialog>
  );
}

// Mounted only while the dialog is open, so the typed confirmation resets each time.
function ConfirmBody({
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  tone = 'danger',
  confirmText,
  busy,
  setBusy,
}: Omit<ConfirmProps, 'open'> & { busy: boolean; setBusy: (busy: boolean) => void }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  // A failed action keeps the dialog open and shows the reason.
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="px-6 py-5">
        <div className="flex gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone === 'danger' ? 'bg-danger-500/10 text-danger-400' : 'bg-brand-500/10 text-brand-300'}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle asChild>
              <h3 className="font-semibold text-white">{title}</h3>
            </DialogTitle>
            <DialogDescription asChild>
              <div className="mt-1.5 text-sm text-ink-300">{description}</div>
            </DialogDescription>
            {confirmText && (
              <div className="mt-4">
                <label className="label">
                  Type <span className="font-mono text-ink-100">{confirmText}</span> to confirm
                </label>
                <input className="input font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
              </div>
            )}
            {error && <p className="mt-3 text-sm text-danger-400">{error}</p>}
          </div>
        </div>
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={run} disabled={!!confirmText && typed !== confirmText}>
          {confirmLabel}
        </Button>
      </ModalFooter>
    </>
  );
}
