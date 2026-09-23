import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { sendEmail } from '../../integrations/email';
import * as repo from './workEmail.repository';

/** Personal / disposable domains that cannot serve as employment proof. */
const BLOCKED_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com',
  'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com',
  'zoho.com', 'mail.com', 'gmx.com', 'yandex.com', 'pm.me',
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'trashmail.com',
]);

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_PER_HOUR = 5;

function pepper(): string {
  return config.WORK_EMAIL_OTP_PEPPER ?? config.JWT_REFRESH_SECRET;
}

function hashCode(code: string, challengeId: string): string {
  // Keyed HMAC rather than a bare SHA-256 of code+pepper: the pepper is a secret
  // MAC key, so a leaked code_hash can't be brute-forced offline without it and
  // there is no length-extension exposure. The challengeId binds the MAC to one
  // challenge so a hash can't be replayed across challenges.
  return createHmac('sha256', pepper()).update(`${code}:${challengeId}`).digest('hex');
}

/** Constant-time compare of a submitted code against a stored HMAC digest. */
function codeMatches(code: string, challengeId: string, expectedHex: string): boolean {
  const actual = Buffer.from(hashCode(code, challengeId), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function domainOf(email: string): string {
  return email.split('@')[1] ?? '';
}

export async function sendOtp(userId: string, email: string): Promise<{ challengeId: string; sent: boolean }> {
  const domain = domainOf(email);
  if (!domain || BLOCKED_DOMAINS.has(domain)) {
    throw AppError.badRequest('Use your company email — personal and disposable domains are not accepted');
  }
  if (await repo.isEmailTakenByOther(email, userId)) {
    throw AppError.conflict('That work email is already verified by another account');
  }

  const recent = await repo.getMostRecent(userId);
  if (recent && Date.now() - new Date(recent.created_at).getTime() < RESEND_COOLDOWN_MS) {
    throw AppError.tooManyRequests('Please wait a minute before requesting another code');
  }
  const lastHour = await repo.countChallengesSince(userId, new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (lastHour >= MAX_PER_HOUR) {
    throw AppError.tooManyRequests('Too many verification attempts this hour. Try again later.');
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const challengeId = randomUUID();
  await repo.supersedeLive(userId, email);
  await repo.insertChallenge({
    id: challengeId,
    userId,
    email,
    emailDomain: domain,
    codeHash: hashCode(code, challengeId),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  const { sent } = await sendEmail({
    to: email,
    subject: 'Your ConnectX work-email verification code',
    html: `<p>Your verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
    template: 'work-email-otp',
  });

  return { challengeId, sent };
}

export async function verifyOtp(
  userId: string,
  email: string,
  code: string,
): Promise<{ verified: true; email: string }> {
  const challenge = await repo.getLiveChallenge(userId, email);
  if (!challenge) throw AppError.badRequest('No active verification for this email. Request a new code.');

  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    await repo.consume(challenge.id);
    throw AppError.badRequest('That code has expired. Request a new one.');
  }

  if (!codeMatches(code, challenge.id, challenge.code_hash)) {
    const attempts = await repo.incrementAttempt(challenge.id);
    if (attempts >= challenge.max_attempts) {
      await repo.consume(challenge.id);
      throw AppError.badRequest('Too many incorrect attempts. Request a new code.');
    }
    throw AppError.badRequest('Incorrect code');
  }

  await repo.markVerified(challenge.id, userId, email, challenge.email_domain);
  return { verified: true, email };
}

export async function getVerified(userId: string): Promise<repo.VerifiedWorkEmailRow | null> {
  return repo.getVerified(userId);
}
