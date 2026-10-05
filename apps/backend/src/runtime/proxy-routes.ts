import { Service, type ServiceDoc } from '../db/models';
import { ctx } from '../context';

/**
 * Dynamic configuration for Traefik's HTTP provider. One router per HTTP service on
 * `{serviceId}.{PUBLIC_RUNTIME_DOMAIN}`, pointing at the healthy container's published port on its
 * host's private address. The route only changes after a candidate passes its health check, so a
 * failed deployment never receives traffic. TLS uses the wildcard certificate resolver configured
 * in Traefik's static config (see docs/operations.md).
 */
export async function traefikConfig() {
  const { config } = ctx();
  const services = await Service.find(
    { lifecycle: 'active', port: { $ne: null }, route: { $ne: null }, desiredState: 'running' },
    { _id: 1, route: 1 },
  ).lean<Pick<ServiceDoc, '_id' | 'route'>[]>();
  const routers: Record<string, unknown> = {};
  const backends: Record<string, unknown> = {};
  const tls = config.PUBLIC_RUNTIME_SCHEME === 'https';
  for (const s of services) {
    if (!s.route?.upstream) continue;
    const name = `svc-${s._id}`;
    routers[name] = {
      rule: `Host(\`${s._id}.${config.PUBLIC_RUNTIME_DOMAIN}\`)`,
      service: name,
      entryPoints: [tls ? 'websecure' : 'web'],
      ...(tls ? { tls: { certResolver: 'wildcard', domains: [{ main: config.PUBLIC_RUNTIME_DOMAIN, sans: [`*.${config.PUBLIC_RUNTIME_DOMAIN}`] }] } } : {}),
    };
    backends[name] = { loadBalancer: { servers: [{ url: s.route.upstream }], passHostHeader: true } };
  }
  return { http: { routers, services: backends } };
}
