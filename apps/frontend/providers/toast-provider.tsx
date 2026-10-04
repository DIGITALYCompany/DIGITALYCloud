'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { markToastEvent } from '@/lib/toast-events';

type Kind = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  kind: Kind;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export type ToastInput = Omit<Toast, 'id'>;

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

const ICONS = {
  success: <CheckCircle2 className="h-5 w-5 text-success-400" />,
  error: <XCircle className="h-5 w-5 text-danger-400" />,
  info: <Info className="h-5 w-5 text-brand-300" />,
  warning: <AlertTriangle className="h-5 w-5 text-warning-400" />,
};

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: ToastInput) => {
      const id = ++counter;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.action ? 7000 : 4500);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        data-toast-viewport
        onPointerDownCapture={(e) => markToastEvent(e.nativeEvent)}
        onFocusCapture={(e) => markToastEvent(e.nativeEvent)}
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm animate-slide-in-right items-start gap-3 rounded-2xl border border-white/10 bg-ink-850/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            <div className="mt-0.5 shrink-0">{ICONS[t.kind]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-100">{t.title}</p>
              {t.description && <p className="mt-0.5 text-sm text-ink-300">{t.description}</p>}
              {t.action && (
                <button
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="mt-2 text-sm font-medium text-brand-300 hover:text-brand-200"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} className="rounded-md p-1 text-ink-400 transition hover:bg-white/5 hover:text-ink-100" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
