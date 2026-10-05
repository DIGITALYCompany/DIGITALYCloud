import * as oidc from 'openid-client';
import type { AppConfig } from '../config/env';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/** Google sign-in via OpenID Connect (authorization code + PKCE, state and nonce checked by openid-client). */
export interface GoogleOidc {
  authorizationUrl(params: { state: string; nonce: string; codeChallenge: string }): Promise<string>;
  exchange(callbackUrl: URL, checks: { state: string; nonce: string; codeVerifier: string }): Promise<GoogleIdentity>;
}

export class GoogleOidcClient implements GoogleOidc {
  private configuration: Promise<oidc.Configuration> | null = null;

  constructor(private readonly config: AppConfig) {}

  private discover() {
    this.configuration ??= oidc
      .discovery(new URL(this.config.GOOGLE_ISSUER), this.config.GOOGLE_CLIENT_ID!, this.config.GOOGLE_CLIENT_SECRET!, undefined, {
        // Only for local test issuers served over http (never Google itself).
        execute: this.config.GOOGLE_ISSUER.startsWith('http://') && !this.config.production ? [oidc.allowInsecureRequests] : [],
      })
      .catch((e: unknown) => {
        this.configuration = null;
        throw e;
      });
    return this.configuration;
  }

  async authorizationUrl({ state, nonce, codeChallenge }: { state: string; nonce: string; codeChallenge: string }) {
    const c = await this.discover();
    return oidc
      .buildAuthorizationUrl(c, {
        redirect_uri: this.config.googleRedirectUri,
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      })
      .toString();
  }

  async exchange(callbackUrl: URL, { state, nonce, codeVerifier }: { state: string; nonce: string; codeVerifier: string }): Promise<GoogleIdentity> {
    const c = await this.discover();
    const tokens = await oidc.authorizationCodeGrant(c, callbackUrl, { pkceCodeVerifier: codeVerifier, expectedState: state, expectedNonce: nonce, idTokenExpected: true });
    const claims = tokens.claims();
    if (!claims?.sub) throw new Error('Google did not return an identity');
    const email = typeof claims.email === 'string' ? claims.email : '';
    return {
      sub: claims.sub,
      email,
      emailVerified: claims.email_verified === true,
      name: typeof claims.name === 'string' && claims.name.trim().length >= 2 ? claims.name.trim() : email.split('@')[0] || 'DIGITALY user',
    };
  }
}

export const pkce = {
  verifier: () => oidc.randomPKCECodeVerifier(),
  challenge: (v: string) => oidc.calculatePKCECodeChallenge(v),
  nonce: () => oidc.randomNonce(),
};
