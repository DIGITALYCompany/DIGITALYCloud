import { Schema } from 'mongoose';
import { DEFAULT_NOTIFICATION_PREFERENCES, LANGUAGES, PLATFORM_ROLES, type Language, type NotificationPreferences, type PlatformRole } from '@digitalycloud/shared';
import type { Encrypted } from '../../lib/crypto';
import { baseOptions, defineModel, encryptedSchema } from './common';

// ---------------------------------------------------------------------------------------------
// Users

export interface RecoveryCode {
  hash: string;
  usedAt: Date | null;
}

export interface UserDoc {
  _id: string;
  name: string;
  email: string;
  emailNormalized: string;
  emailVerifiedAt: Date | null;
  pendingEmail: string | null;
  pendingEmailNormalized: string | null;
  passwordHash: string | null;
  passwordChangedAt: Date | null;
  role: PlatformRole;
  language: Language;
  timezone: string;
  twoFactor: {
    enabled: boolean;
    secretEnc: Encrypted | null;
    pendingSecretEnc: Encrypted | null;
    pendingCreatedAt: Date | null;
    enabledAt: Date | null;
    /** Last accepted TOTP time step; codes for this step or earlier are rejected (replay protection). */
    lastUsedStep: number | null;
    recoveryCodes: RecoveryCode[];
  };
  notificationPreferences: NotificationPreferences;
  defaultTeamId: string | null;
  status: 'active' | 'deleting' | 'deleted';
  deletionRequestedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const prefs = Object.fromEntries(Object.entries(DEFAULT_NOTIFICATION_PREFERENCES).map(([k, v]) => [k, { type: Boolean, default: v, required: true }]));

const userSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, required: true, maxlength: 254 },
    emailNormalized: { type: String, required: true, lowercase: true, maxlength: 254 },
    emailVerifiedAt: { type: Date, default: null },
    pendingEmail: { type: String, default: null },
    pendingEmailNormalized: { type: String, default: null },
    passwordHash: { type: String, default: null },
    passwordChangedAt: { type: Date, default: null },
    role: { type: String, enum: PLATFORM_ROLES, default: 'user', required: true },
    language: { type: String, enum: LANGUAGES, default: 'en', required: true },
    timezone: { type: String, default: 'Europe/Paris', required: true, maxlength: 64 },
    twoFactor: {
      enabled: { type: Boolean, default: false },
      secretEnc: { type: encryptedSchema, default: null },
      pendingSecretEnc: { type: encryptedSchema, default: null },
      pendingCreatedAt: { type: Date, default: null },
      enabledAt: { type: Date, default: null },
      lastUsedStep: { type: Number, default: null },
      recoveryCodes: { type: [new Schema({ hash: { type: String, required: true }, usedAt: { type: Date, default: null } }, { _id: false, strict: 'throw' })], default: [] },
    },
    notificationPreferences: { type: new Schema(prefs, { _id: false, strict: 'throw' }), default: () => ({ ...DEFAULT_NOTIFICATION_PREFERENCES }) },
    defaultTeamId: { type: String, default: null },
    status: { type: String, enum: ['active', 'deleting', 'deleted'], default: 'active', required: true },
    deletionRequestedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { ...baseOptions, timestamps: true },
);
userSchema.index({ emailNormalized: 1 }, { unique: true, name: 'user_email_unique' });
userSchema.index({ pendingEmailNormalized: 1 }, { name: 'user_pending_email', partialFilterExpression: { pendingEmailNormalized: { $type: 'string' } } });
userSchema.index({ status: 1, deletionRequestedAt: 1 }, { name: 'user_status_deletion' });
userSchema.index({ createdAt: -1, _id: -1 }, { name: 'user_created' });

export const User = defineModel<UserDoc>('User', userSchema, 'users');

// ---------------------------------------------------------------------------------------------
// OAuth identities

export interface OAuthIdentityDoc {
  _id: string;
  provider: 'google';
  providerUserId: string;
  userId: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}

const oauthIdentitySchema = new Schema(
  {
    _id: { type: String, required: true },
    provider: { type: String, enum: ['google'], required: true },
    providerUserId: { type: String, required: true, maxlength: 255 },
    userId: { type: String, required: true },
    email: { type: String, required: true },
    emailVerified: { type: Boolean, required: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
    lastUsedAt: { type: Date, default: null },
  },
  baseOptions,
);
oauthIdentitySchema.index({ provider: 1, providerUserId: 1 }, { unique: true, name: 'oauth_provider_user_unique' });
oauthIdentitySchema.index({ userId: 1 }, { name: 'oauth_user' });

export const OAuthIdentity = defineModel<OAuthIdentityDoc>('OAuthIdentity', oauthIdentitySchema, 'oauth_identities');

// ---------------------------------------------------------------------------------------------
// Sessions (opaque cookie tokens, stored as SHA-256 hashes)

export interface SessionDoc {
  _id: string;
  tokenHash: string;
  userId: string;
  remember: boolean;
  /** Default team for new tabs; each tab may scope requests to another of the user's teams. */
  activeTeamId: string | null;
  /** Last time the user proved their identity (password, OAuth, 2FA). Used for reauthentication checks. */
  authenticatedAt: Date;
  method: 'password' | 'google' | 'signup' | 'reset';
  userAgent: string | null;
  device: string;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

const sessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    tokenHash: { type: String, required: true },
    userId: { type: String, required: true },
    remember: { type: Boolean, required: true },
    activeTeamId: { type: String, default: null },
    authenticatedAt: { type: Date, required: true },
    method: { type: String, enum: ['password', 'google', 'signup', 'reset'], required: true },
    userAgent: { type: String, default: null, maxlength: 512 },
    device: { type: String, required: true, maxlength: 120 },
    ip: { type: String, default: null, maxlength: 64 },
    createdAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  baseOptions,
);
sessionSchema.index({ tokenHash: 1 }, { unique: true, name: 'session_token_unique' });
sessionSchema.index({ userId: 1, createdAt: -1 }, { name: 'session_user' });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'session_ttl' });

export const Session = defineModel<SessionDoc>('Session', sessionSchema, 'sessions');

// ---------------------------------------------------------------------------------------------
// Single-use tokens: password reset (1 h) and email verification (24 h)

export interface AuthTokenDoc {
  _id: string;
  kind: 'password_reset' | 'email_verify';
  tokenHash: string;
  userId: string;
  /** Address being verified (the new address for email changes). */
  email: string | null;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}

const authTokenSchema = new Schema(
  {
    _id: { type: String, required: true },
    kind: { type: String, enum: ['password_reset', 'email_verify'], required: true },
    tokenHash: { type: String, required: true },
    userId: { type: String, required: true },
    email: { type: String, default: null },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  baseOptions,
);
authTokenSchema.index({ tokenHash: 1 }, { unique: true, name: 'auth_token_unique' });
authTokenSchema.index({ userId: 1, kind: 1 }, { name: 'auth_token_user' });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'auth_token_ttl' });

export const AuthToken = defineModel<AuthTokenDoc>('AuthToken', authTokenSchema, 'auth_tokens');

// ---------------------------------------------------------------------------------------------
// Second-factor challenges (5 minutes, limited attempts, consumed atomically)

export interface AuthChallengeDoc {
  _id: string;
  kind: '2fa_login';
  tokenHash: string;
  userId: string;
  remember: boolean;
  method: 'password' | 'google';
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}

const authChallengeSchema = new Schema(
  {
    _id: { type: String, required: true },
    kind: { type: String, enum: ['2fa_login'], required: true },
    tokenHash: { type: String, required: true },
    userId: { type: String, required: true },
    remember: { type: Boolean, required: true },
    method: { type: String, enum: ['password', 'google'], required: true },
    attempts: { type: Number, default: 0, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  baseOptions,
);
authChallengeSchema.index({ tokenHash: 1 }, { unique: true, name: 'auth_challenge_unique' });
authChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'auth_challenge_ttl' });

export const AuthChallenge = defineModel<AuthChallengeDoc>('AuthChallenge', authChallengeSchema, 'auth_challenges');

// ---------------------------------------------------------------------------------------------
// OAuth state (Google sign-in, GitHub App installation), bound to the initiating browser

export interface OAuthStateDoc {
  _id: string;
  stateHash: string;
  purpose: 'google_login' | 'github_install';
  /** Hash of the random value in the `dgc_oauth` cookie set when the flow started. */
  bindingHash: string;
  nonce: string | null;
  codeVerifierEnc: Encrypted | null;
  from: string;
  userId: string | null;
  sessionId: string | null;
  teamId: string | null;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}

const oauthStateSchema = new Schema(
  {
    _id: { type: String, required: true },
    stateHash: { type: String, required: true },
    purpose: { type: String, enum: ['google_login', 'github_install'], required: true },
    bindingHash: { type: String, required: true },
    nonce: { type: String, default: null },
    codeVerifierEnc: { type: encryptedSchema, default: null },
    from: { type: String, required: true },
    userId: { type: String, default: null },
    sessionId: { type: String, default: null },
    teamId: { type: String, default: null },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  baseOptions,
);
oauthStateSchema.index({ stateHash: 1 }, { unique: true, name: 'oauth_state_unique' });
oauthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'oauth_state_ttl' });

export const OAuthState = defineModel<OAuthStateDoc>('OAuthState', oauthStateSchema, 'oauth_states');
