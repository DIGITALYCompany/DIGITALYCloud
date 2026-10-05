import type { Principal, Tenant } from '../http/principal';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: Principal;
      tenant?: Tenant;
      /** Raw body for signature-verified webhooks. */
      rawBody?: Buffer;
    }
  }
}

export {};
