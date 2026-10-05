import client from 'prom-client';

/** Operational metrics (Prometheus text format on the internal listener only). */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'dgc_' });

export const httpRequests = new client.Counter({
  name: 'dgc_http_requests_total',
  help: 'HTTP requests by method, route group and status',
  labelNames: ['method', 'group', 'status'] as const,
  registers: [registry],
});

export const httpDuration = new client.Histogram({
  name: 'dgc_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['group'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const sseConnections = new client.Gauge({ name: 'dgc_sse_connections', help: 'Open SSE connections', labelNames: ['kind'] as const, registers: [registry] });

export const jobsProcessed = new client.Counter({
  name: 'dgc_jobs_total',
  help: 'Background jobs by topic and result',
  labelNames: ['topic', 'result'] as const,
  registers: [registry],
});

export const outboxGauge = new client.Gauge({ name: 'dgc_outbox_records', help: 'Outbox records by status', labelNames: ['status'] as const, registers: [registry] });
export const queueGauge = new client.Gauge({ name: 'dgc_queue_jobs', help: 'Queue jobs by queue and state', labelNames: ['queue', 'state'] as const, registers: [registry] });
export const deploymentsFinished = new client.Counter({
  name: 'dgc_deployments_finished_total',
  help: 'Finished deployments by result',
  labelNames: ['result'] as const,
  registers: [registry],
});

/** Coarse route group for labels (never the raw path, which contains ids). */
export function routeGroup(path: string) {
  const seg = path.split('/')[2] ?? 'root';
  return /^[a-z-]{1,24}$/.test(seg) ? seg : 'other';
}
