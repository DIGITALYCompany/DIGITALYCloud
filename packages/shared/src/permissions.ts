import type { ApiKeyScope, TeamRole } from './enums';

/**
 * Endpoint permission matrix. Each action lists the team roles allowed for signed-in users and
 * the minimum API-key scope (`null`: API keys are never accepted). The API enforces it; the
 * dashboard reads the same table to hide or disable controls a role cannot use.
 * Platform-staff access is separate.
 */
export const PERMISSIONS = {
  'services.read': { roles: ['owner', 'admin', 'developer', 'viewer'], key: 'read' },
  'services.create': { roles: ['owner', 'admin'], key: null },
  'services.update': { roles: ['owner', 'admin'], key: 'full' },
  'services.delete': { roles: ['owner', 'admin'], key: null },
  'services.control': { roles: ['owner', 'admin', 'developer'], key: 'full' },
  'services.plan': { roles: ['owner', 'admin'], key: null },
  'services.env.write': { roles: ['owner', 'admin'], key: 'full' },
  'deployments.read': { roles: ['owner', 'admin', 'developer', 'viewer'], key: 'read' },
  'logs.read': { roles: ['owner', 'admin', 'developer', 'viewer'], key: 'read' },
  'logs.stream': { roles: ['owner', 'admin', 'developer', 'viewer'], key: null },
  'metrics.read': { roles: ['owner', 'admin', 'developer', 'viewer'], key: 'read' },
  'metrics.usage': { roles: ['owner', 'admin', 'developer', 'viewer'], key: null },
  'events.stream': { roles: ['owner', 'admin', 'developer', 'viewer'], key: null },
  'apiKeys.manage': { roles: ['owner', 'admin'], key: null },
  'team.read': { roles: ['owner', 'admin', 'developer', 'viewer'], key: null },
  'team.manage': { roles: ['owner', 'admin'], key: null },
  'billing.manage': { roles: ['owner'], key: null },
  'billing.operations': { roles: ['owner', 'admin'], key: null },
  'uploads.create': { roles: ['owner', 'admin', 'developer'], key: null },
  'github.manage': { roles: ['owner', 'admin'], key: null },
  'support.create': { roles: ['owner', 'admin', 'developer', 'viewer'], key: null },
  'servers.read': { roles: ['owner', 'admin', 'developer', 'viewer'], key: null },
} as const satisfies Record<string, { roles: readonly TeamRole[]; key: ApiKeyScope | null }>;

export type Action = keyof typeof PERMISSIONS;

export function roleAllows(action: Action, role: TeamRole | null | undefined) {
  return !!role && (PERMISSIONS[action].roles as readonly TeamRole[]).includes(role);
}

export function keyAllows(action: Action, scope: ApiKeyScope) {
  const need = PERMISSIONS[action].key as ApiKeyScope | null;
  if (!need) return false;
  return need === 'read' || scope === 'full';
}
