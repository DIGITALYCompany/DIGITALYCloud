export function formatUptime(startedAt: number | null, now = Date.now()) {
  if (!startedAt) return '—';
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${String(h).padStart(2, '0')}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

export function timeAgo(ts: number, now = Date.now()) {
  const s = Math.floor((now - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
}

export function formatDate(ts: number | string) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatMb(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export function formatEuro(n: number) {
  return `€${n.toFixed(2)}`;
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m}m ${sec % 60}s` : `${sec}s`;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function uid(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 10);
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Chart labels for metric buckets. */
export const hourLabelOf = (ts: number) => `${String(new Date(ts).getHours()).padStart(2, '0')}:00`;
export const dayLabelOf = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "Sep 24"-style label for a day relative to today. */
export function daysAgoLabel(daysAgo: number) {
  return dayLabelOf(Date.now() - daysAgo * 86400_000);
}
