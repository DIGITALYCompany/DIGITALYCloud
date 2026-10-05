'use client';

import { useState } from 'react';
import { MoreHorizontal, UserPlus } from 'lucide-react';
import { ASSIGNABLE_TEAM_ROLES, type AssignableTeamRole, type TeamRole } from '@digitalycloud/shared';
import { ActionMenu } from '@/components/ui/action-menu';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/card';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { isValidEmail } from '@/lib/validation';
import type { TeamMember } from '@/lib/types';

const ROLE_LABEL: Record<TeamRole, string> = { owner: 'Owner', admin: 'Admin', developer: 'Developer', viewer: 'Viewer' };
const ROLE_HINT: Record<AssignableTeamRole, string> = {
  admin: 'Everything except billing and ownership.',
  developer: 'Deploy, restart and read logs. No settings, env or billing.',
  viewer: 'Read-only access. Secret values stay hidden.',
};

const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Members and pending invitations of the tab's team. Owners and admins can manage them. */
export function TeamPanel() {
  const { user, team, can } = useAuth();
  const toast = useToast();
  const members = useApi(() => api.teams.members(), [team?.id]);
  const manage = can('team.manage');
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableTeamRole>('developer');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  const invite = async () => {
    setInviting(true);
    setInviteError(null);
    try {
      const m = await api.teams.invite(email.trim(), role);
      members.setData((list) => [...(list ?? []), m]);
      toast({ kind: 'success', title: 'Invitation sent', description: `${email.trim()} will receive an email to join.` });
      setOpen(false);
      setEmail('');
    } catch (e) {
      setInviteError(errorMessage(e));
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (m: TeamMember, r: AssignableTeamRole) => {
    try {
      const updated = await api.teams.changeRole(m.id, r);
      members.setData((list) => (list ?? []).map((x) => (x.id === m.id ? updated : x)));
      toast({ kind: 'success', title: `${m.name} is now ${ROLE_LABEL[r]}` });
    } catch (e) {
      toast({ kind: 'error', title: 'Role not changed', description: errorMessage(e) });
    }
  };

  return (
    <Panel
      title={team ? `Team · ${team.name}` : 'Team'}
      description={manage ? 'Invite collaborators to manage services with you.' : `You are a ${team ? ROLE_LABEL[team.role] : 'member'} of this team.`}
      bodyClass="p-0"
      action={
        manage ? (
          <Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Invite
          </Button>
        ) : undefined
      }
    >
      {members.loading && !members.data ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : members.error ? (
        <p className="px-5 py-8 text-center text-sm text-danger-400">{members.error}</p>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {(members.data ?? []).map((m) => {
            const self = m.email.toLowerCase() === user?.email.toLowerCase() && !m.pending;
            return (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar initials={initials(m.name)} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {m.name}
                    {self && <span className="ml-1.5 text-xs font-normal text-ink-500">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    {m.email}
                    {m.pending && m.invitedAt ? ` · invited ${timeAgo(m.invitedAt)}` : ''}
                  </p>
                </div>
                {m.pending && <Badge tone="warning">Pending</Badge>}
                <Badge tone={m.role === 'owner' ? 'brand' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge>
                {manage && m.role !== 'owner' && !self ? (
                  <ActionMenu
                    trigger={
                      <button className="rounded-lg p-1.5 text-ink-400 transition hover:bg-white/[0.06] hover:text-white" aria-label={`Manage ${m.name}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    }
                    items={[
                      ...(m.pending
                        ? []
                        : ASSIGNABLE_TEAM_ROLES.filter((r) => r !== m.role).map((r) => ({
                            label: `Make ${ROLE_LABEL[r]}`,
                            onClick: () => void changeRole(m, r),
                          }))),
                      { label: m.pending ? 'Revoke invitation' : 'Remove from team', danger: true, onClick: () => setRemoving(m) },
                    ]}
                  />
                ) : (
                  <span className="w-7" />
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Invite a teammate"
        description="They get an email link. They sign in (or create an account) with this address to join."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={inviting}>
              Cancel
            </Button>
            <Button onClick={invite} loading={inviting} disabled={!isValidEmail(email.trim())}>
              Send invite
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="invite-email">
              Email
            </label>
            <input id="invite-email" className="input" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="invite-role">
              Role
            </label>
            <select id="invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value as AssignableTeamRole)}>
              {ASSIGNABLE_TEAM_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-ink-500">{ROLE_HINT[role]}</p>
          </div>
          {inviteError && <p className="text-sm text-danger-400">{inviteError}</p>}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={removing?.pending ? `Revoke the invitation for ${removing.email}?` : `Remove ${removing?.name ?? ''}?`}
        description={removing?.pending ? 'The invitation link stops working.' : 'They lose access to this team’s services immediately, and API keys they created are revoked.'}
        confirmLabel={removing?.pending ? 'Revoke' : 'Remove'}
        onConfirm={async () => {
          if (!removing) return;
          await api.teams.remove(removing.id);
          members.setData((list) => (list ?? []).filter((x) => x.id !== removing.id));
          toast({ kind: 'success', title: removing.pending ? 'Invitation revoked' : `${removing.name} removed` });
        }}
      />
    </Panel>
  );
}
