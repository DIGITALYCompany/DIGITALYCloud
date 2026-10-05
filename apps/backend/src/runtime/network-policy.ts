import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const V4_PRIVATE: [number, number][] = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // 100.64/10 (CGNAT)
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // link-local (cloud metadata 169.254.169.254)
  [0xac100000, 12], // 172.16/12
  [0xc0000000, 24], // 192.0.0/24
  [0xc0a80000, 16], // 192.168/16
  [0xc6120000, 15], // 198.18/15
  [0xe0000000, 4], // multicast
  [0xf0000000, 4], // reserved
];

export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
    return V4_PRIVATE.some(([base, bits]) => n >>> (32 - bits) === base >>> (32 - bits));
  }
  if (kind === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff');
  }
  return true;
}

/**
 * Before a runtime host pulls a user-supplied image, the registry hostname must resolve only to
 * public addresses, so a pull cannot be aimed at the control-plane network or cloud metadata.
 * (Hosts should additionally block such egress at the firewall; see docs/operations.md.)
 */
export async function assertPublicRegistry(registry: string): Promise<void> {
  const host = registry.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (host === 'docker.io') return;
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('private');
    return;
  }
  const addrs = await lookup(host, { all: true, verbatim: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) throw new Error('private');
}
