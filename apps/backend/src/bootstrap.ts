import { config, loadDotEnv } from './config/env';
import { createContext, setContext, type AppContext } from './context';
import { connectMongo, disconnectMongo } from './db/connection';
import { buildIntegrations } from './integrations';
import { createLogger, setLogger } from './lib/logger';

/** Shared start-up for the API, workers and CLI: config, logger, MongoDB, Redis, integrations. */
export async function bootstrap(role: 'api' | 'worker' | 'cli'): Promise<AppContext> {
  loadDotEnv();
  const cfg = config();
  const log = createLogger(cfg.LOG_LEVEL).child({ role });
  setLogger(log);
  await connectMongo(cfg.MONGODB_URI, { appName: `digitalycloud-${role}` });
  const integrations = await buildIntegrations(cfg);
  const c = createContext(cfg, log, integrations);
  setContext(c);
  const missing = Object.entries(cfg.capabilities)
    .filter(([, on]) => !on)
    .map(([k]) => k);
  // Operator commands don't need the reminder on every run.
  if (missing.length) log[role === 'cli' ? 'debug' : 'warn']({ missing }, 'optional integrations not configured; their operations will report a configuration error');
  return c;
}

export async function shutdown(c: AppContext) {
  await c.close();
  await disconnectMongo();
}
