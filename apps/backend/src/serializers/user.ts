import { PLAN_LEVELS, nameParts, planLevel, type PlanId, type UserDto } from '@digitalycloud/shared';
import { Service, type UserDoc } from '../db/models';

/** Explicit DTO: hashes, TOTP secrets, recovery codes and internal fields never leave the server. */
export function toUserDto(u: UserDoc, plan: PlanId = 'free'): UserDto {
  const { firstName, avatarInitials } = nameParts(u.name);
  return {
    id: u._id,
    name: u.name,
    firstName,
    email: u.email,
    plan,
    role: u.role,
    avatarInitials,
    language: u.language,
    timezone: u.timezone,
    twoFactorEnabled: u.twoFactor?.enabled === true,
    emailVerified: Boolean(u.emailVerifiedAt),
    pendingEmail: u.pendingEmail ?? null,
    hasPassword: Boolean(u.passwordHash),
    createdAt: u.createdAt.getTime(),
  };
}

/** `User.plan` compatibility value: the highest plan among the team's services, default `free`. */
export async function highestPlan(teamId: string | null | undefined): Promise<PlanId> {
  if (!teamId) return 'free';
  const plans = await Service.distinct('plan', { teamId, lifecycle: 'active' });
  return (plans as PlanId[]).reduce<PlanId>((best, p) => (planLevel(p) > planLevel(best) ? p : best), PLAN_LEVELS[0]);
}
