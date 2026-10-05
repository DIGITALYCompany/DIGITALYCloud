import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { httpDuration, httpRequests, routeGroup } from '../infra/metrics';

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

/** Request ids: accepted from the trusted proxy when well-formed, otherwise generated. Echoed as `X-Request-Id`. */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

/** Prometheus request counter and latency, labelled by route group (never raw paths, which contain ids). */
export function httpMetrics(req: Request, res: Response, next: NextFunction) {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const group = routeGroup(req.originalUrl.split('?')[0] ?? '');
    end({ group });
    httpRequests.inc({ method: req.method, group, status: String(res.statusCode) });
  });
  next();
}

export function httpLogger(log: Logger) {
  return pinoHttp({
    logger: log,
    genReqId: (req) => (req as Request).requestId,
    // Bodies are never logged; headers are redacted by the logger configuration.
    serializers: {
      req: (req: { id: string; method: string; url: string; headers: Record<string, unknown> }) => ({
        id: req.id,
        method: req.method,
        url: req.url?.split('?')[0],
        userAgent: req.headers?.['user-agent'],
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    customProps: (req) => {
      const a = (req as Request).auth;
      return a?.kind === 'session' ? { userId: a.user._id } : a?.kind === 'apiKey' ? { apiKeyId: a.key._id } : {};
    },
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'info' : 'debug'),
    autoLogging: { ignore: (req) => req.url === '/v1/health' },
  });
}

/** Sensitive responses must never be cached by browsers or intermediaries. */
export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}
