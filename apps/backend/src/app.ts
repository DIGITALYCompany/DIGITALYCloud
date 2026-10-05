import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import type { AppContext } from './context';
import { authenticate } from './middleware/authenticate';
import { csrfProtection } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { generalLimit } from './middleware/rate-limit';
import { httpLogger, httpMetrics, noStore, requestId } from './middleware/request-context';
import { TEAM_HEADER } from './middleware/tenant';
import { v1Routes, webhookRoutes } from './routes';

export function createApp(c: AppContext) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', c.config.trustProxy);
  app.set('query parser', 'simple');

  app.use(requestId);
  app.use(httpMetrics);
  app.use(httpLogger(c.log));
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      // Exact origins only; requests without Origin (curl, server-to-server) get no CORS headers.
      origin: (origin, cb) => cb(null, origin && c.config.corsOrigins.includes(origin) ? origin : false),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', TEAM_HEADER, 'Idempotency-Key', 'Last-Event-ID', 'X-Request-Id'],
      exposedHeaders: ['Retry-After', 'X-Request-Id', 'Content-Disposition'],
      maxAge: 600,
    }),
  );

  // Webhooks verify signatures over the raw body, so they are mounted before any parser.
  app.use('/v1/webhooks', webhookRoutes());

  app.use(cookieParser());
  app.use('/v1', noStore);
  app.use(csrfProtection);
  app.use(authenticate);
  app.use(generalLimit);
  const v1 = Router();
  v1Routes(v1);
  app.use('/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
