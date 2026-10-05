import type { AppConfig } from '../config/env';
import { SmtpMailer, UnconfiguredMailer, type Mailer } from './mail';
import { FilesystemStorage, S3Storage, type ObjectStorage } from './storage';
import type { GoogleOidc } from './google';
import type { BillingGateway } from './billing-gateway';
import { GithubRestClient, type GithubApi } from './github';

/**
 * External providers. Each one is either configured or `null`; code paths that need an absent
 * provider fail with an explicit "not configured" error instead of simulating success.
 */
export interface Integrations {
  mailer: Mailer;
  storage: ObjectStorage | null;
  google: GoogleOidc | null;
  /** Always present: public repositories need no App; private ones need the App configured. */
  github: GithubApi;
  /** Null until billing is configured and validated (paid plans unavailable). */
  billing: BillingGateway | null;
}

export async function buildIntegrations(config: AppConfig): Promise<Integrations> {
  const mailer = config.SMTP_URL ? new SmtpMailer(config.SMTP_URL, config.MAIL_FROM) : new UnconfiguredMailer();
  const storage =
    config.storageDriver === 'filesystem'
      ? new FilesystemStorage(config.STORAGE_DIR)
      : config.storageDriver === 's3' && config.capabilities.storage
        ? new S3Storage(config.S3_BUCKET!, {
            endpoint: config.S3_ENDPOINT,
            region: config.S3_REGION,
            accessKeyId: config.S3_ACCESS_KEY_ID!,
            secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
            forcePathStyle: config.S3_FORCE_PATH_STYLE,
          })
        : null;
  const google = config.capabilities.google ? new (await import('./google')).GoogleOidcClient(config) : null;
  let billing: BillingGateway | null = null;
  if (config.capabilities.stripe) {
    billing = new (await import('./stripe')).StripeGateway(config);
    // Paid plans stay unavailable until every configured price matches the catalog.
    await billing.validate().catch(() => {});
  }
  return { mailer, storage, google, github: new GithubRestClient(config), billing };
}
