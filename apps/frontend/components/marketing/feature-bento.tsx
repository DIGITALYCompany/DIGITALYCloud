import type { ReactNode } from 'react';
import { Activity, Check, GitBranch, Globe2, KeyRound, RefreshCw, ScrollText } from 'lucide-react';
import { REGION_AREAS, REGIONS } from '@/data/regions';
import { cn } from '@/lib/utils';

function Tile({ icon, title, body, className, children }: { icon: ReactNode; title: string; body: string; className?: string; children?: ReactNode }) {
  return (
    <div className={cn('group card card-hover relative flex flex-col overflow-hidden p-6', className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-white [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-brand-300">
        {icon}
        {title}
      </div>
      <p className="mt-2 max-w-sm text-sm text-ink-300">{body}</p>
      {children && <div className="mt-6 flex-1">{children}</div>}
    </div>
  );
}

const LOGS = [
  ['21:14:02', 'info', 'Starting SyncBot...'],
  ['21:14:04', 'info', 'Connecting to Discord gateway'],
  ['21:14:05', 'ok', 'Logged in as SyncBot#4821'],
  ['21:14:07', 'info', '/sync executed by @lea.m in 12ms'],
  ['21:14:09', 'warn', 'Rate limit bucket at 80%'],
];

const BARS = [32, 41, 36, 48, 44, 58, 52, 61, 49, 55, 46, 63, 57, 50, 44, 52, 60, 54];

export function FeatureBento() {
  return (
    <div className="grid gap-4 md:grid-cols-6">
      <Tile icon={<ScrollText />} title="Live logs" body="Stream output in real time. Search, filter by level, pause and download." className="md:col-span-4">
        <div className="rounded-xl border border-white/[0.06] bg-[#05070D] p-4 font-mono text-[12px] leading-6">
          {LOGS.map(([t, lvl, msg]) => (
            <div key={t} className="flex gap-3">
              <span className="text-ink-500">{t}</span>
              <span className={lvl === 'ok' ? 'text-success-400' : lvl === 'warn' ? 'text-warning-400' : 'text-ink-300'}>{msg}</span>
            </div>
          ))}
          <span className="mt-1 inline-block h-3.5 w-1.5 animate-pulse bg-ink-300" />
        </div>
      </Tile>

      <Tile icon={<Activity />} title="Metrics" body="CPU, RAM and network for every service." className="md:col-span-2">
        <div className="flex h-28 items-end gap-1">
          {BARS.map((h, i) => (
            <span key={i} className="flex-1 rounded-t bg-brand-gradient opacity-70 transition-all duration-500 group-hover:opacity-100" style={{ height: `${h}%` }} />
          ))}
        </div>
      </Tile>

      <Tile icon={<KeyRound />} title="Encrypted secrets" body="Tokens and keys injected only at runtime." className="md:col-span-2">
        <div className="space-y-2 font-mono text-xs">
          {['DISCORD_TOKEN', 'DATABASE_URL', 'API_KEY'].map((k) => (
            <div key={k} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
              <span className="text-ink-200">{k}</span>
              <span className="tracking-widest text-ink-500">••••••••</span>
            </div>
          ))}
        </div>
      </Tile>

      <Tile icon={<GitBranch />} title="Deploy on push" body="Connect GitHub. Every push to main ships automatically, with rollbacks." className="md:col-span-2">
        <div className="space-y-2.5 text-xs">
          {[
            ['#42', 'feat: add /sync slash command', 'Live'],
            ['#41', 'fix: reconnect on gateway close', 'Ready'],
            ['#40', 'chore: bump discord.js', 'Failed'],
          ].map(([n, m, s]) => (
            <div key={n} className="flex items-center gap-2">
              <span className="font-mono text-ink-500">{n}</span>
              <span className="min-w-0 flex-1 truncate text-ink-300">{m}</span>
              <span className={s === 'Live' ? 'text-success-400' : s === 'Failed' ? 'text-danger-400' : 'text-ink-400'}>{s}</span>
            </div>
          ))}
        </div>
      </Tile>

      <Tile icon={<RefreshCw />} title="Self-healing" body="Crashed processes restart in seconds, and you get notified." className="md:col-span-2">
        <div className="flex items-center gap-3 rounded-xl border border-success-500/20 bg-success-500/[0.05] p-3 text-xs">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-500/15 text-success-400">
            <Check className="h-3.5 w-3.5" />
          </span>
          <span className="text-ink-200">
            CommunityAPI recovered in <span className="font-mono text-white">2.8s</span>
          </span>
        </div>
      </Tile>

      <Tile
        icon={<Globe2 />}
        title={`${REGIONS.length} regions, your choice`}
        body="Start in France for free, then deploy across Europe, North America and Asia Pacific as your plan grows."
        className="md:col-span-6 md:flex-row md:items-center md:justify-between"
      >
        <div className="flex flex-wrap gap-2 md:mt-0">
          {REGION_AREAS.map((area) => (
            <span key={area} className="flex items-center gap-2 rounded-full border border-white/[0.08] px-3 py-1.5 font-mono text-xs text-ink-200">
              <span className="h-1.5 w-1.5 rounded-full bg-success-400" /> {area} · {REGIONS.filter((r) => r.area === area).length}
            </span>
          ))}
        </div>
      </Tile>
    </div>
  );
}
