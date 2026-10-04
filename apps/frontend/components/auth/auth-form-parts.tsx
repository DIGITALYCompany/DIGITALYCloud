import type { ReactNode } from 'react';

export function GoogleButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-medium text-ink-100 transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-60"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="#EA4335"
          d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z"
        />
      </svg>
      Continue with Google
    </button>
  );
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-ink-500">
      <span className="h-px flex-1 bg-white/[0.07]" />
      {children}
      <span className="h-px flex-1 bg-white/[0.07]" />
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="animate-fade-in rounded-xl border border-danger-500/25 bg-danger-500/[0.08] px-3.5 py-2.5 text-sm text-danger-400">{message}</div>;
}
