import http from 'node:http';
import { createApp } from './app';
import { bootstrap, shutdown } from './bootstrap';
import { createInternalApp } from './internal';

/** API process. Workers and collectors run separately (`src/worker.ts`) and scale independently. */
async function main() {
  const c = await bootstrap('api');
  const server = http.createServer(createApp(c));
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 0; // SSE streams are long-lived; per-route timeouts apply instead.
  await new Promise<void>((resolve) => server.listen(c.config.PORT, c.config.HOST, resolve));
  c.log.info({ port: c.config.PORT }, 'API listening');

  let internal: http.Server | null = null;
  if (c.config.INTERNAL_PORT) {
    internal = http.createServer(createInternalApp(c));
    await new Promise<void>((resolve) => internal!.listen(c.config.INTERNAL_PORT, c.config.INTERNAL_HOST, resolve));
    c.log.info({ port: c.config.INTERNAL_PORT, host: c.config.INTERNAL_HOST }, 'internal listener ready');
  }

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    c.log.info({ signal }, 'shutting down');
    const force = setTimeout(() => process.exit(1), 25_000).unref();
    server.close();
    internal?.close();
    // Long-lived SSE connections are closed so clients reconnect to another instance.
    server.closeAllConnections();
    await shutdown(c).catch((err: unknown) => c.log.error({ err }, 'shutdown error'));
    clearTimeout(force);
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
