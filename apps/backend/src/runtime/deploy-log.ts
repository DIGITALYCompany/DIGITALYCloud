import { ctx } from '../context';
import { Deployment, DeploymentLog, type DeploymentDoc, type DeploymentLogDoc } from '../db/models';
import { Redactor } from './redact';

const MAX_LINES = 10_000;
const BUILD_LOG_RETENTION_MS = 90 * 24 * 3600_000;
const FLUSH_MS = 300;

/**
 * Build log for one deployment: append-only lines with stable numbers (`(deploymentId, lineNo)`
 * is unique, so retries continue numbering instead of duplicating), redacted, batched to MongoDB
 * and streamed as `deployment.log` events.
 */
export class DeployLog {
  private next: number;
  private pending: DeploymentLogDoc[] = [];
  private timer: NodeJS.Timeout | null = null;
  private dropped = 0;
  private flushing: Promise<void> = Promise.resolve();
  private redactor: Redactor;

  constructor(
    private readonly dep: Pick<DeploymentDoc, '_id' | 'serviceId' | 'teamId' | 'logLines'>,
    secrets: string[] = [],
  ) {
    this.next = dep.logLines + 1;
    this.redactor = new Redactor(secrets);
  }

  setSecrets(secrets: string[]) {
    this.redactor = new Redactor(secrets);
  }

  line(text: string) {
    if (this.next > MAX_LINES) {
      this.dropped++;
      return;
    }
    const clean = this.redactor.redact(text).slice(0, 8000);
    this.pending.push({
      deploymentId: this.dep._id,
      serviceId: this.dep.serviceId,
      teamId: this.dep.teamId,
      lineNo: this.next++,
      text: clean,
      ts: new Date(),
      expiresAt: new Date(Date.now() + BUILD_LOG_RETENTION_MS),
    });
    this.timer ??= setTimeout(() => void this.flush(), FLUSH_MS);
  }

  step(text: string) {
    this.line(`==> ${text}`);
  }

  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const batch = this.pending.splice(0);
    if (batch.length === 0) return this.flushing;
    this.flushing = this.flushing.then(async () => {
      try {
        await DeploymentLog.insertMany(batch, { ordered: false });
      } catch (e) {
        // Duplicate line numbers after a retry are expected and ignored.
        if ((e as { code?: number }).code !== 11000 && !(e as { writeErrors?: unknown[] }).writeErrors) throw e;
      }
      await Deployment.updateOne({ _id: this.dep._id }, { $max: { logLines: batch[batch.length - 1]!.lineNo } });
      const hub = ctx().hub;
      for (const l of batch) await hub.publish({ kind: 'team', id: this.dep.teamId }, 'deployment.log', { deploymentId: this.dep._id, lineNo: l.lineNo, text: l.text }, { replay: false });
    });
    return this.flushing;
  }

  async close() {
    if (this.dropped) this.pending.push({ deploymentId: this.dep._id, serviceId: this.dep.serviceId, teamId: this.dep.teamId, lineNo: this.next++, text: `… ${this.dropped} more lines were not stored (log limit reached)`, ts: new Date(), expiresAt: new Date(Date.now() + BUILD_LOG_RETENTION_MS) });
    await this.flush();
  }
}
