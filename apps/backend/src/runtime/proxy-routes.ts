import { planAllowsCustomDomains } from '@digitalycloud/shared';
import { CustomDomain, Service, type CustomDomainDoc, type ServiceDoc } from '../db/models';
import { ctx } from '../context';

/** Traefik certificate resolver for custom domains (per-hostname ACME, see docs/operations.md). */
export const CUSTOM_DOMAIN_RESOLVER = 'domains';

/**
 * Dynamic configuration for Traefik's HTTP provider. One router per HTTP service on
 * `{serviceId}.{PUBLIC_RUNTIME_DOMAIN}`, pointing at the healthy container's published port on its
 * host's private address. The route only changes after a candidate passes its health check, so a
 * failed deployment never receives traffic. TLS uses the wildcard certificate resolver configured
 * in Traefik's static config (see docs/operations.md).
 *
 * Verified custom domains of paid services get their own router to the same backend, with a
 * certificate issued per hostname by the `domains` resolver.
 */
export async function traefikConfig() {
  const { config } = ctx();
  const services = await Service.find(
    { lifecycle: 'active', port: { $ne: null }, route: { $ne: null }, desiredState: 'running' },
    { _id: 1, route: 1, plan: 1 },
  ).lean<Pick<ServiceDoc, '_id' | 'route' | 'plan'>[]>();
  const routers: Record<string, unknown> = {};
  const backends: Record<string, unknown> = {};
  const tls = config.PUBLIC_RUNTIME_SCHEME === 'https';
  const routed = new Map<string, Pick<ServiceDoc, '_id' | 'route' | 'plan'>>();
  for (const s of services) {
    if (!s.route?.upstream) continue;
    const name = `svc-${s._id}`;
    routed.set(s._id, s);
    routers[name] = {
      rule: `Host(\`${s._id}.${config.PUBLIC_RUNTIME_DOMAIN}\`)`,
      service: name,
      entryPoints: [tls ? 'websecure' : 'web'],
      ...(tls ? { tls: { certResolver: 'wildcard', domains: [{ main: config.PUBLIC_RUNTIME_DOMAIN, sans: [`*.${config.PUBLIC_RUNTIME_DOMAIN}`] }] } } : {}),
    };
    backends[name] = { loadBalancer: { servers: [{ url: s.route.upstream }], passHostHeader: true } };
  }
  if (routed.size) {
    const domains = await CustomDomain.find({ status: 'active', serviceId: { $in: [...routed.keys()] } }, { _id: 1, serviceId: 1, hostname: 1 }).lean<Pick<CustomDomainDoc, '_id' | 'serviceId' | 'hostname'>[]>();
    for (const d of domains) {
      if (!planAllowsCustomDomains(routed.get(d.serviceId)!.plan)) continue;
      routers[`dom-${d._id}`] = {
        rule: `Host(\`${d.hostname}\`)`,
        service: `svc-${d.serviceId}`,
        entryPoints: [tls ? 'websecure' : 'web'],
        ...(tls ? { tls: { certResolver: CUSTOM_DOMAIN_RESOLVER } } : {}),
      };
    }
  }
  return { http: { routers, services: backends } };
}
