'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, Eraser, Pause, Play, Search, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { useServiceLogs } from '@/hooks/use-service-logs';
import { useToast } from '@/providers/toast-provider';
import { downloadTextFile } from '@/lib/browser';
import { formatClock } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { LogLine } from '@/lib/types';
import { useService } from './service-shell';

const LEVEL: Record<LogLine['level'], string> = {
  info: 'text-ink-200',
  debug: 'text-ink-400',
  warn: 'text-warning-400',
  error: 'text-danger-400',
  success: 'text-success-400',
};

const FILTERABLE_LEVELS = ['info', 'warn', 'error', 'debug'] as const;

function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-aqua-500/30 px-0.5 text-aqua-300">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function ServiceLogs() {
  const service = useService();
  const toast = useToast();
  const { lines, clear } = useServiceLogs(service);
  const [q, setQ] = useState('');
  const [auto, setAuto] = useState(true);
  // While paused, the view shows the lines captured at the moment the stream was paused.
  const [paused, setPaused] = useState<LogLine[] | null>(null);
  const [levels, setLevels] = useState<Set<LogLine['level']>>(new Set(['info', 'debug', 'warn', 'error', 'success']));
  const box = useRef<HTMLDivElement>(null);

  const shown = paused ?? lines;
  const visible = useMemo(() => shown.filter((l) => levels.has(l.level) && l.text.toLowerCase().includes(q.toLowerCase())), [shown, levels, q]);

  useEffect(() => {
    if (auto && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [visible, auto]);

  const download = () => {
    const text = shown.map((l) => `[${formatClock(l.ts)}] ${l.level.toUpperCase().padEnd(7)} ${l.text}`).join('\n');
    downloadTextFile(`${service.id}-logs-${new Date().toISOString().slice(0, 10)}.log`, text);
    toast({ kind: 'success', title: 'Logs downloaded', description: `${shown.length} lines saved.` });
  };

  const toggleLevel = (l: LogLine['level']) =>
    setLevels((s) => {
      const n = new Set(s);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="input h-10 py-0 pl-9 font-mono text-[13px]" placeholder="Search logs" aria-label="Search logs" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {FILTERABLE_LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => toggleLevel(l)}
                aria-pressed={levels.has(l)}
                className={cn('rounded-lg px-2.5 py-1 font-mono text-[11px] uppercase transition', levels.has(l) ? `bg-white/[0.07] ${LEVEL[l]}` : 'text-ink-500 line-through')}
              >
                {l}
              </button>
            ))}
          </div>
          <label className="ml-1 flex items-center gap-2 text-xs text-ink-300">
            <Switch checked={auto} onChange={setAuto} label="Auto-scroll" /> Auto-scroll
          </label>
          <Tooltip label={paused ? 'Resume stream' : 'Pause stream'}>
            <Button size="sm" variant="outline" onClick={() => setPaused((p) => (p ? null : lines))} icon={paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}>
              {paused ? 'Resume' : 'Pause'}
            </Button>
          </Tooltip>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              clear();
              setPaused((p) => (p ? [] : null));
            }}
            icon={<Eraser className="h-3.5 w-3.5" />}
          >
            Clear
          </Button>
          <Button size="sm" variant="outline" onClick={download} disabled={shown.length === 0} icon={<ArrowDownToLine className="h-3.5 w-3.5" />}>
            Download
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#05070D]">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
          <div className="flex items-center gap-2 font-mono text-xs text-ink-400">
            <Terminal className="h-3.5 w-3.5" /> {service.id} — production
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-ink-500">
            {service.status === 'running' && !paused && (
              <span className="flex items-center gap-1.5 text-success-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success-400" /> live
              </span>
            )}
            {paused && <span className="text-warning-400">paused</span>}
            {visible.length} lines
          </div>
        </div>
        <div ref={box} className="h-[520px] overflow-y-auto p-4 font-mono text-[12.5px] leading-6" role="log" aria-live="polite">
          {visible.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-ink-500">
              <Terminal className="mb-3 h-6 w-6" />
              {shown.length === 0 ? (service.status === 'running' ? 'Waiting for new log lines...' : 'No logs. Start the service to see output.') : 'No lines match your filters.'}
            </div>
          ) : (
            visible.map((l) => (
              <div key={l.id} className="group flex gap-3 rounded px-1 hover:bg-white/[0.03]">
                <span className="shrink-0 select-none text-ink-500">[{formatClock(l.ts)}]</span>
                <span className={cn('break-all', LEVEL[l.level])}>{highlight(l.text, q)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
