import { Router } from 'express';
import { accountRouter } from './modules/account/account.routes';
import { authRouter } from './modules/auth/auth.routes';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { healthRouter } from './modules/health/health.routes';
import { teamsRouter } from './modules/teams/teams.routes';
import { servicesRouter } from './modules/services/services.routes';
import { deploymentsRouter } from './modules/deployments/deployments.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { eventsRouter } from './modules/events/events.routes';
import { uploadsRouter } from './modules/uploads/uploads.routes';
import { githubRouter, githubWebhookRouter } from './modules/github/github.routes';
import { logsRouter } from './modules/logs/logs.routes';
import { metricsRouter } from './modules/metrics/metrics.routes';
import { apiKeysRouter } from './modules/api-keys/api-keys.routes';
import { supportRouter } from './modules/support/support.routes';
import { serversRouter } from './modules/platform/servers.routes';
import { platformRouter } from './modules/platform/platform.routes';
import { billingRouter, stripeWebhookRouter } from './modules/billing/billing.routes';

/** Every `/v1` module router. Each router applies its own validation, permissions and body limits. */
export function v1Routes(v1: Router) {
  v1.use(healthRouter());
  v1.use(catalogRouter());
  v1.use(authRouter());
  v1.use(accountRouter());
  v1.use(teamsRouter());
  v1.use(servicesRouter());
  v1.use(deploymentsRouter());
  v1.use(notificationsRouter());
  v1.use(eventsRouter());
  v1.use(uploadsRouter());
  v1.use(githubRouter());
  v1.use(logsRouter());
  v1.use(metricsRouter());
  v1.use(apiKeysRouter());
  v1.use(supportRouter());
  v1.use(serversRouter());
  v1.use(platformRouter());
  v1.use(billingRouter());
}

/** Signature-verified webhooks (raw bodies). */
export function webhookRoutes() {
  const r = Router();
  r.use(githubWebhookRouter());
  r.use(stripeWebhookRouter());
  return r;
}
