import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/logo';
import { Dot } from '@/components/ui/badge';

const PREVIEW = [
  ['SyncBot', 'Discord Bot', '14d 08h'],
  ['CommunityAPI', 'Node.js', '5d 13h'],
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm animate-fade-up">{children}</div>
        </div>
        <p className="text-xs text-ink-500">© 2026 DIGITALY SAS</p>
      </div>
      <div className="relative hidden overflow-hidden border-l border-white/[0.06] bg-ink-900 lg:block">
        <div className="grid-bg absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
        <div className="absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 animate-glow rounded-full bg-brand-gradient-3 opacity-40 blur-[100px]" />
        <div className="relative flex h-full flex-col justify-center px-16">
          <div className="max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-300">DIGITALYCloud</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-white">Deploy. Run. Scale.</h2>
            <p className="mt-4 text-ink-300">Join thousands of developers keeping their Discord bots and Node.js apps online with DIGITALY.</p>
            <div className="mt-10 space-y-3">
              {PREVIEW.map(([n, t, u]) => (
                <div key={n} className="glass flex items-center gap-3 rounded-2xl p-4">
                  <Dot tone="success" pulse />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{n}</p>
                    <p className="text-xs text-ink-400">{t}</p>
                  </div>
                  <span className="font-mono text-xs text-ink-300">up {u}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
