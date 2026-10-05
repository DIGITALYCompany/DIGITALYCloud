import { ctx } from '../../context';
import { unavailable } from '../../lib/errors';

/**
 * Paid plans are only offered when billing is configured and its price mapping was validated
 * against the catalog. Until then, no code path may grant a paid plan.
 */
export function paidPlansAvailable(): boolean {
  const billing = ctx().integrations.billing;
  return Boolean(billing?.ready());
}

export function assertPaidPlansAvailable() {
  if (!paidPlansAvailable()) throw unavailable('Paid plans aren’t available right now. Choose a free plan or try again later.', 'BILLING_UNAVAILABLE');
}
