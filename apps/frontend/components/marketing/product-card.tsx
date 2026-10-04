import Link from 'next/link';
import { ArrowUpRight, Cpu, MemoryStick } from 'lucide-react';
import { Dot } from '@/components/ui/badge';
import type { Product } from '@/data/products';
import { cn } from '@/lib/utils';
import { ProductIcon } from './product-icon';
import { formatStartingPrice } from './pricing';

export function ProductCard({ p, large = false }: { p: Product; large?: boolean }) {
  return (
    <Link href={`/products/${p.slug}`} className={cn('group card card-hover relative flex flex-col overflow-hidden', large ? 'p-7' : 'p-6')}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-0 blur-3xl transition duration-500 group-hover:opacity-40" style={{ background: p.accent.hex }} />
      <div className="relative flex items-start justify-between">
        <ProductIcon product={p} className="h-11 w-11 rounded-xl transition group-hover:scale-105" />
        <span className="flex items-center gap-2">
          {p.badge && <span className="rounded-full bg-aqua-500/15 px-2 py-0.5 text-[11px] font-medium text-aqua-300">{p.badge}</span>}
          <ArrowUpRight className="h-4 w-4 text-ink-500 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
        </span>
      </div>
      <h3 className="relative mt-5 font-semibold text-white">{p.name}</h3>
      <p className="relative mt-1.5 flex-1 text-sm text-ink-300">{p.description}</p>
      <div className="relative mt-5 flex flex-wrap gap-1.5">
        {p.stack.slice(0, large ? 6 : 4).map((s) => (
          <span key={s} className="rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-0.5 font-mono text-[11px] text-ink-300">
            {s}
          </span>
        ))}
      </div>
      <p className="relative mt-5 border-t border-white/[0.06] pt-4 text-sm text-ink-400">
        From <span className="font-mono text-white">{formatStartingPrice(p)}</span>/month
      </p>
    </Link>
  );
}

export function ProductVisual({ p }: { p: Product }) {
  const lines = p.code.content.split('\n');
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-6 rounded-[40px] opacity-30 blur-3xl" style={{ background: `radial-gradient(circle at 30% 30%, ${p.accent.hex}, transparent 70%)` }} />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#070A12] shadow-2xl shadow-black/60">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <span className="ml-3 font-mono text-xs text-ink-400">{p.code.title}</span>
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed">
          {lines.map((l, i) => (
            <div key={i} className="flex">
              <span className="w-8 shrink-0 select-none text-ink-600">{i + 1}</span>
              <span className={l.trim().startsWith('#') || l.trim().startsWith('//') ? 'text-ink-500' : l.startsWith('✓') ? 'text-success-400' : l.startsWith('$') ? 'text-white' : 'text-ink-200'}>{l || ' '}</span>
            </div>
          ))}
        </pre>
      </div>
      <div className="glass absolute -bottom-8 right-4 w-60 animate-fade-up rounded-2xl p-4 shadow-2xl shadow-black/50 [animation-delay:300ms] sm:-right-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-white">{p.slug === 'game-servers' ? 'community-smp' : 'production'}</span>
          <span className="flex items-center gap-1.5 text-xs text-success-400">
            <Dot tone="success" pulse /> Online
          </span>
        </div>
        <div className="mt-3 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-ink-400">
            <Cpu className="h-3.5 w-3.5" /> CPU
            <span className="ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full w-[28%] rounded-full" style={{ background: p.accent.hex }} />
            </span>
          </div>
          <div className="flex items-center gap-2 text-ink-400">
            <MemoryStick className="h-3.5 w-3.5" /> RAM
            <span className="ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full w-[46%] rounded-full" style={{ background: p.accent.hex }} />
            </span>
          </div>
        </div>
        <p className="mt-3 font-mono text-[11px] text-ink-500">Lyon · France</p>
      </div>
    </div>
  );
}
