import type { ApiKeyScope, TeamRole } from '@digitalycloud/shared';
import type { ApiKeyDoc, MembershipDoc, SessionDoc, TeamDoc, UserDoc } from '../db/models';

export type Principal =
  | { kind: 'session'; user: UserDoc; session: SessionDoc }
  | { kind: 'apiKey'; key: ApiKeyDoc; teamId: string; scope: ApiKeyScope };

/** The team a request operates on, resolved and authorized per request. */
export interface Tenant {
  team: TeamDoc;
  /** Team role for session principals; null for API keys (they are bound to the team instead). */
  role: TeamRole | null;
  membership: MembershipDoc | null;
}

// The permission matrix lives in @digitalycloud/shared so the dashboard gates controls with the same rules.
export { PERMISSIONS, keyAllows, roleAllows, type Action } from '@digitalycloud/shared';

/** How environment values are shown to a principal (see docs/backend-decisions.md). */
export function envVisibility(p: Principal, role: TeamRole | null): 'plain' | 'redacted' | 'omit' {
  if (p.kind === 'apiKey') return 'omit';
  return role === 'viewer' ? 'redacted' : 'plain';
}
