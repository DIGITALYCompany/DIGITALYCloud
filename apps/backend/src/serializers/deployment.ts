import type { DeploymentDto } from '@digitalycloud/shared';
import type { DeploymentDoc } from '../db/models';

export function deploymentDto(d: DeploymentDoc, logs?: string[]): DeploymentDto {
  return {
    id: d._id,
    serviceId: d.serviceId,
    number: d.number,
    environment: d.environment,
    status: d.status,
    stage: d.status === 'building' ? d.stage : null,
    trigger: d.trigger,
    createdAt: d.createdAt.getTime(),
    finishedAt: d.finishedAt?.getTime() ?? null,
    commit: d.commit,
    commitMessage: d.commitMessage,
    author: d.author,
    durationSec: d.durationSec,
    rollbackOf: d.rollbackOf,
    failureReason: d.failureReason,
    ...(logs ? { logs } : {}),
  };
}
