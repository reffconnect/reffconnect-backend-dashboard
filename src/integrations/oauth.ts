/**
 * OAuth verification helpers. Google uses id_token verification (only a client
 * id needed); LinkedIn uses the OIDC authorization-code exchange. Both fail
 * closed when unconfigured.
 */
import { config } from '../config/env';
import { AppError } from '../utils/AppError';

export interface OAuthIdentity {
  email: string;
  name: string;
  sub: string;
  emailVerified: boolean;
}

/** Verify a Google ID token via the tokeninfo endpoint and check the audience. */
export async function verifyGoogleIdToken(idToken: string): Promise<OAuthIdentity> {
  if (!config.GOOGLE_CLIENT_ID) {
    throw new AppError(503, 'Google sign-in is not configured on this server', { code: 'oauth_unconfigured' });
  }
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw AppError.unauthorized('Invalid Google token');
  const payload = (await res.json()) as {
    aud?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    sub?: string;
  };
  if (payload.aud !== config.GOOGLE_CLIENT_ID) {
    throw AppError.unauthorized('Google token was issued for a different app');
  }
  if (!payload.email || !payload.sub) throw AppError.unauthorized('Google token missing identity');
  return {
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split('@')[0] || 'User',
    sub: payload.sub,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
  };
}

/** Exchange a LinkedIn OIDC authorization code for the user's profile. */
export async function exchangeLinkedInCode(code: string, redirectUri: string): Promise<OAuthIdentity> {
  if (!config.LINKEDIN_CLIENT_ID || !config.LINKEDIN_CLIENT_SECRET) {
    throw new AppError(503, 'LinkedIn sign-in is not configured on this server', { code: 'oauth_unconfigured' });
  }
  const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: config.LINKEDIN_CLIENT_ID,
      client_secret: config.LINKEDIN_CLIENT_SECRET,
    }),
  });
  if (!tokenRes.ok) throw AppError.unauthorized('LinkedIn code exchange failed');
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw AppError.unauthorized('LinkedIn returned no access token');

  const infoRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!infoRes.ok) throw AppError.unauthorized('Could not read LinkedIn profile');
  const info = (await infoRes.json()) as { email?: string; name?: string; sub?: string; email_verified?: boolean };
  if (!info.email || !info.sub) throw AppError.unauthorized('LinkedIn profile missing identity');
  return {
    email: info.email.toLowerCase(),
    name: info.name || info.email.split('@')[0] || 'User',
    sub: info.sub,
    emailVerified: info.email_verified ?? true,
  };
}
