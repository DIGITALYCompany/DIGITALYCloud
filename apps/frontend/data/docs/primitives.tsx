import type { ReactNode } from 'react';
import { Bot, Check, CheckCircle2, Github, KeyRound, X } from 'lucide-react';
import { Dot } from '@/components/ui/badge';

export { Callout } from '@/components/ui/callout';
export { CodeBlock } from '@/components/ui/code-block';

export const H2 = ({ children, id }: { children: ReactNode; id: string }) => (
  <h2 id={id} className="mt-12 scroll-mt-28 text-xl font-semibold leading-tight text-white">
    {children}
  </h2>
);

export const P = ({ children }: { children: ReactNode }) => <p className="mt-4 text-[15px] leading-7 text-ink-300">{children}</p>;

export const C = ({ children }: { children: ReactNode }) => (
  <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[13px] text-ink-100">{children}</code>
);

export const B = ({ children }: { children: ReactNode }) => <strong className="font-medium text-white">{children}</strong>;

export function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-4 space-y-2.5 text-[15px] leading-7 text-ink-300">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

export function Steps({ items }: { items: { title: string; body: ReactNode }[] }) {
  return (
    <ol className="relative mt-6 space-y-6 border-l border-white/[0.08] pl-8">
      {items.map((s, i) => (
        <li key={s.title} className="relative">
          <span className="absolute -left-[45px] flex h-7 w-7 items-center justify-center rounded-full border border-brand-500/40 bg-ink-950 font-mono text-xs text-brand-200">
            {i + 1}
          </span>
          <p className="font-medium text-white">{s.title}</p>
          <div className="mt-1 text-[15px] leading-7 text-ink-300">{s.body}</div>
        </li>
      ))}
    </ol>
  );
}

export function Checklist({ title, items }: { title: string; items: ReactNode[] }) {
  return (
    <div className="my-6 rounded-2xl border border-white/[0.08] bg-ink-900/70 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-400">{title}</p>
      <ul className="mt-3 space-y-2.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-3 text-sm leading-6 text-ink-200">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-success-500/10 ring-1 ring-success-500/25">
              <Check className="h-3 w-3 text-success-400" />
            </span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DoDont({ dos, donts }: { dos: ReactNode[]; donts: ReactNode[] }) {
  const col = (items: ReactNode[], good: boolean) => (
    <div className={`rounded-2xl border p-5 ${good ? 'border-success-500/20 bg-success-500/[0.04]' : 'border-danger-500/20 bg-danger-500/[0.04]'}`}>
      <p className={`flex items-center gap-2 text-sm font-medium ${good ? 'text-success-400' : 'text-danger-400'}`}>
        {good ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />} {good ? 'Do' : "Don't"}
      </p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-300">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="my-6 grid gap-3 sm:grid-cols-2">
      {col(dos, true)}
      {col(donts, false)}
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="my-6 overflow-x-auto rounded-2xl border border-white/[0.08]">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-ink-400">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((r, i) => (
            <tr key={i} className="text-ink-300">
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-3 align-top leading-6 ${j === 0 ? 'text-white' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MockServiceCard() {
  return (
    <div className="my-6 rounded-2xl border border-white/10 bg-ink-900 p-5">
      <p className="mb-3 text-[11px] uppercase tracking-wider text-ink-500">Dashboard preview</p>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/20">
          <Bot className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-white">SyncBot</p>
          <p className="text-xs text-ink-400">Discord Bot · France — Lyon</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-success-500/10 px-2.5 py-0.5 text-xs text-success-400 ring-1 ring-success-500/25">
          <Dot tone="success" pulse /> Online
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-4 text-center">
        {[['CPU', '2.4%'], ['RAM', '186 MB'], ['Uptime', '14d 08h']].map(([k, v]) => (
          <div key={k}>
            <p className="text-[11px] text-ink-500">{k}</p>
            <p className="font-mono text-sm text-white">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MockSourcePicker() {
  return (
    <div className="my-6 grid gap-3 sm:grid-cols-3">
      {[
        { icon: Github, t: 'GitHub', d: 'Auto-deploy on push', active: true },
        { icon: KeyRound, t: 'Upload files', d: 'Drop a .zip archive' },
        { icon: CheckCircle2, t: 'Docker Image', d: 'Any public image' },
      ].map((o) => (
        <div key={o.t} className={`rounded-2xl border p-4 ${o.active ? 'border-brand-500/60 bg-brand-500/[0.07]' : 'border-white/10 bg-ink-900'}`}>
          <o.icon className={`h-5 w-5 ${o.active ? 'text-brand-300' : 'text-ink-400'}`} />
          <p className="mt-3 text-sm font-medium text-white">{o.t}</p>
          <p className="text-xs text-ink-400">{o.d}</p>
        </div>
      ))}
    </div>
  );
}
