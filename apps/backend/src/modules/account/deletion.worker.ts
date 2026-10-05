import { ctx } from '../../context';
import {
  AccountDeletion,
  ApiKey,
  AuthChallenge,
  AuthToken,
  BillingAccount,
  BillingOperation,
  EmailDelivery,
  GithubInstallation,
  IdempotencyRecord,
  Invitation,
  Membership,
  Notification,
  OAuthIdentity,
  OAuthState,
  Service,
  Session,
  SlugReservation,
  SupportTicket,
  Team,
  Upload,
  User,
  type AccountDeletionDoc,
  type MembershipDoc,
  type ServiceDoc,
  type UploadDoc,
  type UserDoc,
} from '../../db/models';
import { registerProcessor } from '../../jobs/registry';
import { purgeService } from '../../runtime/purge';
import { SLUG_RESERVATION_MS } from '../services/services.service';
import { cancelTeamBilling } from '../billing/billing.service';

type Step = (d: AccountDeletionDoc, user: UserDoc | null) => Promise<void>;

/**
 * Ordered, idempotent purge steps. External side effects (runtime, billing, storage) come first;
 * records are deleted last. Invoices are kept: accounting law requires retaining billing records
 * (they reference the team id only). Backups age out on their own schedule (docs/operations.md).
 */
const STEPS: [string, Step][] = [
  [
    'services',
    async (d) => {
      if (!d.personalTeamId) return;
      const now = new Date();
      for (const svc of await Service.find({ teamId: d.personalTeamId }).lean<ServiceDoc[]>()) {
        if (svc.lifecycle === 'active') {
          await Service.updateOne({ _id: svc._id }, { $set: { lifecycle: 'deleting', deletingAt: now, desiredState: 'stopped' }, $inc: { opGeneration: 1 } });
          await SlugReservation.updateOne({ _id: svc._id }, { $set: { state: 'reserved', expiresAt: new Date(now.getTime() + SLUG_RESERVATION_MS) } });
        }
        await purgeService(svc._id);
      }
    },
  ],
  [
    'billing',
    async (d) => {
      if (!d.personalTeamId) return;
      const account = await BillingAccount.findById(d.personalTeamId).lean();
      if (!account?.subscriptionId) return;
      if (!ctx().integrations.billing?.ready()) throw new Error('Billing is not available; the subscription cannot be cancelled yet');
      await cancelTeamBilling(d.personalTeamId);
    },
  ],
  [
    'uploads',
    async (d) => {
      if (!d.personalTeamId) return;
      const storage = ctx().integrations.storage;
      for (const u of await Upload.find({ teamId: d.personalTeamId }).lean<UploadDoc[]>()) {
        if (storage) await storage.delete(u.storageKey);
        await Upload.deleteOne({ _id: u._id });
      }
    },
  ],
  [
    'github',
    async (d) => {
      // The GitHub App itself must be uninstalled on GitHub by the account owner; the binding is removed here.
      if (d.personalTeamId) await GithubInstallation.updateMany({ teamId: d.personalTeamId, removedAt: null }, { $set: { removedAt: new Date() } });
    },
  ],
  [
    'memberships',
    async (d) => {
      if (!d.personalTeamId) return;
      const members = await Membership.find({ teamId: d.personalTeamId, userId: { $ne: d.userId } }).lean<MembershipDoc[]>();
      await Membership.deleteMany({ teamId: d.personalTeamId });
      await Invitation.deleteMany({ teamId: d.personalTeamId });
      await ApiKey.deleteMany({ teamId: d.personalTeamId });
      for (const m of members) await ctx().hub.control(m.userId, { type: 'membership_changed', teamId: d.personalTeamId });
    },
  ],
  [
    'personal-data',
    async (d, user) => {
      await Session.deleteMany({ userId: d.userId });
      await AuthToken.deleteMany({ userId: d.userId });
      await AuthChallenge.deleteMany({ userId: d.userId });
      await OAuthState.deleteMany({ userId: d.userId });
      await OAuthIdentity.deleteMany({ userId: d.userId });
      await Notification.deleteMany({ userId: d.userId });
      await Membership.deleteMany({ userId: d.userId });
      await IdempotencyRecord.deleteMany({ _id: { $regex: `^${d.userId}:` } });
      if (user) await EmailDelivery.deleteMany({ to: user.email });
      if (d.personalTeamId) {
        await SupportTicket.deleteMany({ teamId: d.personalTeamId });
        await BillingOperation.deleteMany({ teamId: d.personalTeamId });
      }
    },
  ],
  [
    'account',
    async (d) => {
      if (d.personalTeamId) await Team.updateOne({ _id: d.personalTeamId }, { $set: { status: 'deleted', name: 'Deleted team' } });
      await User.deleteOne({ _id: d.userId, status: 'deleting' });
    },
  ],
];

export async function processAccountDeletion(deletionId: string) {
  const d = await AccountDeletion.findOneAndUpdate({ _id: deletionId, status: { $ne: 'completed' } }, { $set: { status: 'running' }, $inc: { attempts: 1 } }).lean<AccountDeletionDoc>();
  if (!d) return;
  const user = await User.findById(d.userId).lean<UserDoc>();
  for (const [name, step] of STEPS) {
    if (d.steps?.[name]?.status === 'done') continue;
    try {
      await step(d, user);
      await AccountDeletion.updateOne({ _id: d._id }, { $set: { [`steps.${name}`]: { status: 'done', at: new Date(), error: null } } });
    } catch (err) {
      const message = (err as Error).message.slice(0, 300);
      await AccountDeletion.updateOne({ _id: d._id }, { $set: { status: 'failed', lastError: `${name}: ${message}`, [`steps.${name}`]: { status: 'failed', at: new Date(), error: message } } });
      ctx().log.error({ err, deletionId, step: name }, 'account deletion step failed; will retry');
      throw err;
    }
  }
  await AccountDeletion.updateOne({ _id: d._id }, { $set: { status: 'completed', completedAt: new Date(), lastError: null } });
}

export function registerAccountProcessors() {
  registerProcessor('account.delete', (data) => processAccountDeletion(String(data.deletionId)));
}
