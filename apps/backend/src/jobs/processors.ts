import { registerEmailProcessors } from '../modules/email/email.service';
import { registerGithubProcessors } from '../modules/github/github.service';
import { registerRuntimeProcessors } from '../runtime/processors';
import { registerPlatformProcessors } from '../modules/platform/platform.routes';
import { registerAccountProcessors } from '../modules/account/deletion.worker';
import { registerBillingProcessors } from '../modules/billing/billing.service';

/** Registers every job processor. Each domain module owns its processors. */
export function registerAllProcessors() {
  registerEmailProcessors();
  registerGithubProcessors();
  registerRuntimeProcessors();
  registerPlatformProcessors();
  registerAccountProcessors();
  registerBillingProcessors();
}
