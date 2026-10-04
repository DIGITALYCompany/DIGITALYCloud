'use client';

import { useState } from 'react';
import { MoreHorizontal, UserPlus } from 'lucide-react';
import { ActionMenu } from '@/components/ui/action-menu';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { isValidEmail } from '@/lib/validation';

type Role = 'Owner' | 'Admin' | 'Developer' | 'Viewer';

interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  pending?: boolean;
}

const ASSIGNABLE_ROLES: Role[] = ['Admin', 'Developer', 'Viewer'];

const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Team members and invitations (local state until the backend exists). */
export function TeamPanel() {
  const { user } = useAuth();
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([
    { id: 'm0', name: user?.name ?? 'Mehdi Forhrani', email: user?.email ?? '', role: 'Owner' },
    { id: 'm1', name: 'Léa Martin', email: 'lea@digitaly.fr', role: 'Developer' },
    { id: 'm2', name: 'Hugo Petit', email: 'hugo@digitaly.fr', role: 'Viewer' },
  ]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('Developer');

  const invite = () => {
    const name = email.split('@')[0];
    setMembers((m) => [...m, { id: `m${Date.now()}`, name, email, role, pending: true }]);
    toast({ kind: 'success', title: 'Invitation sent', description: `${email} will receive an email to join.` });
    setOpen(false);
    setEmail('');
  };

  return (
    <Panel
      title="Team"
      description="Invite collaborators to manage services with you."
      bodyClass="p-0"
      action={
        <Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setOpen(true)}>
          Invite
        </Button>
      }
    >
      <div className="divide-y divide-white/[0.05]">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-5 py-3.5">
            <Avatar initials={initials(m.name)} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{m.name}</p>
              <p className="truncate text-xs text-ink-400">{m.email}</p>
            </div>
            {m.pending && <Badge tone="warning">Pending</Badge>}
            <Badge tone={m.role === 'Owner' ? 'brand' : 'neutral'}>{m.role}</Badge>
            {m.role !== 'Owner' ? (
              <ActionMenu
                trigger={
                  <button className="rounded-lg p-1.5 text-ink-400 transition hover:bg-white/[0.06] hover:text-white" aria-label={`Manage ${m.name}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                }
                items={[
                  ...ASSIGNABLE_ROLES.map((r) => ({
                    label: `Make ${r}`,
                    onClick: () => {
                      setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, role: r } : x)));
                      toast({ kind: 'success', title: `${m.name} is now ${r}` });
                    },
                  })),
                  {
                    label: 'Remove from team',
                    danger: true,
                    onClick: () => {
                      setMembers((list) => list.filter((x) => x.id !== m.id));
                      toast({ kind: 'success', title: `${m.name} removed` });
                    },
                  },
                ]}
              />
            ) : (
              <span className="w-7" />
            )}
          </div>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Invite a teammate"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={invite} disabled={!isValidEmail(email)}>
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
            <select id="invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </Panel>
  );
}
