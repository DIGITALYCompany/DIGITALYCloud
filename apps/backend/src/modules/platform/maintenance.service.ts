import { REGIONS } from '@digitalycloud/shared';
import { Maintenance, Membership, Service, type MaintenanceDoc, type MembershipDoc } from '../../db/models';
import { notify } from '../notifications/notifications.service';

const NOTICE_MS = 48 * 3600_000;

/**
 * Scheduled maintenance announced through the CLI is notified once, 48 hours ahead, to members of
 * teams with services in the affected regions (`Compute — <City>` components).
 */
export async function notifyUpcomingMaintenance() {
  const soon = await Maintenance.find({ notifiedAt: null, startsAt: { $lte: new Date(Date.now() + NOTICE_MS) }, endsAt: { $gte: new Date() } }).lean<MaintenanceDoc[]>();
  for (const m of soon) {
    const claimed = await Maintenance.updateOne({ _id: m._id, notifiedAt: null }, { $set: { notifiedAt: new Date() } });
    if (claimed.modifiedCount !== 1) continue;
    const cities = m.affected.filter((a) => a.startsWith('Compute — ')).map((a) => a.slice('Compute — '.length));
    const regionIds = REGIONS.filter((r) => cities.includes(r.city)).map((r) => r.id);
    const teamIds = regionIds.length ? await Service.distinct('teamId', { lifecycle: 'active', regionId: { $in: regionIds } }) : [];
    for (const teamId of teamIds as string[]) {
      const members = await Membership.find({ teamId }).lean<MembershipDoc[]>();
      await notify({ teamId, userIds: members.map((x) => x.userId), kind: 'info', category: 'maintenance', title: 'Scheduled maintenance', body: `${m.title}. ${m.body}`, dedupeKey: `maintenance:${m._id}`, link: '/status' });
    }
  }
}
