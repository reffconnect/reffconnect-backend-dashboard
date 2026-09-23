/**
 * Career-trust / passport business logic. Enforces ownership and consent
 * explicitly (there is no RLS here). Cryptographic-audit guarantees are
 * simplified vs. the original RPCs; the authorization model is preserved.
 */
import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../../utils/AppError';
import * as storage from '../../integrations/storage';
import * as repo from './trust.repository';
import type {
  activateClaimSchema,
  attachEvidenceSchema,
  createClaimSchema,
  createLinkArtifactSchema,
  createPassportSchema,
  createProjectSchema,
  createShareSchema,
  decideAttestationSchema,
  decideCompetencySchema,
  grantConsentSchema,
  issuePassportSchema,
  openDisputeSchema,
  proposeCompetencySchema,
  requestVerificationSchema,
  reviewEvidenceSchema,
  submitAttestationSchema,
} from './trust.schema';
import type { z } from 'zod';

type Row = Record<string, unknown>;

const TRUST_CONSENT_POLICY_VERSION = 'trust_policy_v1';

async function requireConsent(userId: string, grantId: string, purpose: string): Promise<void> {
  if (!(await repo.isConsentValid(userId, grantId, purpose))) {
    throw AppError.forbidden(`An active ${purpose} consent grant is required`);
  }
}

function independenceKeyFromUrl(url: string): string {
  try {
    const host = new URL(url).host.toLowerCase();
    return `candidate_controlled:${host}`;
  } catch {
    return 'candidate_controlled:unknown';
  }
}

// ── Consent ───────────────────────────────────────────────────────────
export async function listConsent(userId: string): Promise<Row[]> {
  return repo.listConsent(userId);
}
export async function getActiveConsent(userId: string, purpose: string): Promise<Row | null> {
  return repo.getActiveConsent(userId, purpose);
}
export async function grantConsent(userId: string, input: z.infer<typeof grantConsentSchema>): Promise<Row> {
  return repo.insertConsent(userId, input.purpose, input.scope, TRUST_CONSENT_POLICY_VERSION, input.expires_at ?? null);
}
export async function withdrawConsent(userId: string, grantId: string): Promise<void> {
  const row = await repo.withdrawConsent(userId, grantId);
  if (!row) throw AppError.notFound('Consent grant not found');
}

// ── Competencies / projects ───────────────────────────────────────────
export async function listCompetencies(): Promise<Row[]> {
  return repo.listCompetencies();
}
export async function listProjects(userId: string): Promise<Row[]> {
  return repo.listProjects(userId);
}
export async function createProject(userId: string, input: z.infer<typeof createProjectSchema>): Promise<Row> {
  return repo.insertProject(userId, {
    title: input.title,
    description: input.description ?? '',
    contribution_scope: input.contribution_scope ?? null,
    started_on: input.started_on ?? null,
    ended_on: input.ended_on ?? null,
  });
}

// ── Claims ────────────────────────────────────────────────────────────
export async function listClaims(userId: string, status?: string, projectId?: string): Promise<Row[]> {
  return repo.listClaims(userId, status, projectId);
}

async function ownClaimOrThrow(claimId: string, userId: string): Promise<Row> {
  const claim = await repo.getClaim(claimId);
  if (!claim || claim['candidate_id'] !== userId) throw AppError.notFound('Claim not found');
  return claim;
}

export async function getClaimDetail(userId: string, claimId: string): Promise<Row> {
  const claim = await ownClaimOrThrow(claimId, userId);
  const [evidence, competencies] = await Promise.all([
    repo.getEvidenceForClaim(claimId),
    repo.listClaimCompetencies(claimId),
  ]);
  return { ...claim, evidence, competencies };
}

export async function createClaim(userId: string, input: z.infer<typeof createClaimSchema>): Promise<Row> {
  if (input.project_id && !(await repo.projectBelongsTo(input.project_id, userId))) {
    throw AppError.forbidden('Project does not belong to you');
  }
  return repo.insertClaim(userId, {
    title: input.title,
    action_text: input.action_text,
    object_text: input.object_text,
    context_text: input.context_text ?? '',
    result_text: input.result_text ?? null,
    contribution_scope: input.contribution_scope,
    period_start: input.period_start ?? null,
    period_end: input.period_end ?? null,
    project_id: input.project_id ?? null,
  });
}

export async function activateClaim(
  userId: string,
  claimId: string,
  input: z.infer<typeof activateClaimSchema>,
): Promise<void> {
  const claim = await ownClaimOrThrow(claimId, userId);
  if (claim['status'] !== 'draft') throw AppError.badRequest('Only a draft claim can be activated');
  await requireConsent(userId, input.consent_grant_id, 'reusable_proof');
  await repo.activateClaim(claimId, input.consent_grant_id);
}

export async function reviseClaim(
  userId: string,
  claimId: string,
  patch: Record<string, unknown>,
): Promise<Row> {
  const source = await ownClaimOrThrow(claimId, userId);
  if (!['active', 'disputed', 'expired'].includes(String(source['status']))) {
    throw AppError.badRequest('Only an active, disputed, or expired claim needs a revision');
  }
  const pick = (key: string): string =>
    typeof patch[key] === 'string' && (patch[key] as string).trim() ? (patch[key] as string) : String(source[key] ?? '');
  return repo.insertClaim(userId, {
    title: pick('title'),
    action_text: pick('action_text'),
    object_text: pick('object_text'),
    context_text: pick('context_text'),
    result_text: (patch['result_text'] as string | null | undefined) ?? (source['result_text'] as string | null) ?? null,
    contribution_scope: String(source['contribution_scope'] ?? 'individual'),
    period_start: (source['period_start'] as string | null) ?? null,
    period_end: (source['period_end'] as string | null) ?? null,
    project_id: (source['project_id'] as string | null) ?? null,
    parent_claim_id: claimId,
  });
}

export async function archiveClaim(userId: string, claimId: string): Promise<void> {
  await ownClaimOrThrow(claimId, userId);
  await repo.updateClaimStatus(claimId, 'archived');
}

export async function setClaimVisibility(
  userId: string,
  claimId: string,
  visibility: string,
  consentGrantId?: string,
): Promise<void> {
  const claim = await ownClaimOrThrow(claimId, userId);
  if (visibility !== 'private') {
    if (claim['status'] !== 'active') throw AppError.badRequest('Only an active claim can be shared');
    const grant = consentGrantId ?? (claim['consent_grant_id'] as string | null) ?? '';
    await requireConsent(userId, grant, 'reusable_proof');
  }
  await repo.setClaimVisibility(claimId, visibility);
}

// ── Competency mapping ────────────────────────────────────────────────
export async function proposeCompetency(
  userId: string,
  claimId: string,
  input: z.infer<typeof proposeCompetencySchema>,
): Promise<void> {
  await ownClaimOrThrow(claimId, userId);
  const competency = await repo.getCompetencyBySlug(input.competency_slug);
  if (!competency) throw AppError.badRequest('Unknown competency');
  await repo.proposeCompetency(claimId, competency['id'] as string, input.source, input.confidence);
}

export async function decideCompetency(
  userId: string,
  claimId: string,
  input: z.infer<typeof decideCompetencySchema>,
): Promise<void> {
  await ownClaimOrThrow(claimId, userId);
  const competency = await repo.getCompetencyBySlug(input.competency_slug);
  if (!competency) throw AppError.badRequest('Unknown competency');
  await repo.decideCompetency(claimId, competency['id'] as string, input.confirm);
}

// ── Artifacts + evidence ──────────────────────────────────────────────
export async function createLinkArtifact(
  userId: string,
  input: z.infer<typeof createLinkArtifactSchema>,
): Promise<Row> {
  await requireConsent(userId, input.consent_grant_id, 'reusable_proof');
  return repo.insertLinkArtifact(userId, input.artifact_type, input.url, independenceKeyFromUrl(input.url));
}

export async function attachEvidence(userId: string, input: z.infer<typeof attachEvidenceSchema>): Promise<Row> {
  await requireConsent(userId, input.consent_grant_id, 'reusable_proof');
  await ownClaimOrThrow(input.claim_id, userId);
  const artifact = await repo.getArtifact(userId, input.artifact_id);
  if (!artifact) throw AppError.notFound('Artifact not found');
  return repo.insertEvidence(
    input.claim_id,
    input.artifact_id,
    input.evidence_text,
    input.source_locator ?? {},
    'candidate_declared',
    input.consent_grant_id,
  );
}

export async function reviewEvidence(
  userId: string,
  evidenceId: string,
  input: z.infer<typeof reviewEvidenceSchema>,
): Promise<void> {
  const evidence = await repo.getEvidenceWithOwner(evidenceId);
  if (!evidence || evidence['candidate_id'] !== userId) throw AppError.notFound('Evidence not found');
  if (input.decision === 'confirm') {
    if (!input.consent_grant_id) throw AppError.badRequest('Reusable-proof consent is required to confirm evidence');
    await requireConsent(userId, input.consent_grant_id, 'reusable_proof');
  }
  await repo.confirmEvidence(evidenceId, input.decision);
}

export async function listProofInbox(userId: string): Promise<Row[]> {
  return repo.listProofInbox(userId);
}

export async function createFileArtifact(
  userId: string,
  storagePath: string,
  consentGrantId: string,
): Promise<Row> {
  await requireConsent(userId, consentGrantId, 'reusable_proof');
  return repo.insertFileArtifact(userId, storagePath, `candidate_controlled:${userId}|upload`);
}

export async function getArtifactViewUrl(userId: string, artifactId: string): Promise<{ url: string }> {
  const artifact = await repo.getArtifact(userId, artifactId);
  if (!artifact) throw AppError.notFound('Artifact not found');
  const canonical = (artifact['canonical_url'] as string | null) ?? null;
  if (canonical) return { url: canonical };
  const storagePath = (artifact['storage_path'] as string | null) ?? null;
  if (storagePath) return { url: storage.downloadUrlFor(storagePath) };
  throw AppError.badRequest('This artifact has no viewable content');
}

// ── Disputes / summary ────────────────────────────────────────────────
export async function openDispute(userId: string, input: z.infer<typeof openDisputeSchema>): Promise<Row> {
  return repo.insertDispute(userId, input.subject_type, input.subject_id, input.reason_code, input.description);
}
export async function listDisputes(userId: string): Promise<Row[]> {
  return repo.listDisputes(userId);
}
export async function getProofSummary(userId: string): Promise<Row> {
  return repo.getProofSummary(userId);
}

// ── Candidate verification ────────────────────────────────────────────
export async function listVerificationSources(userId: string): Promise<Row[]> {
  return repo.listVerificationSources(userId);
}

export async function requestVerification(
  userId: string,
  input: z.infer<typeof requestVerificationSchema>,
): Promise<Row> {
  await requireConsent(userId, input.consent_grant_id, 'professional_verification');
  if (input.verifier_id === userId) throw AppError.badRequest('You cannot verify your own claims');
  for (const claimId of input.claim_ids) {
    const claim = await repo.getClaim(claimId);
    if (!claim || claim['candidate_id'] !== userId) throw AppError.forbidden('You can only submit your own claims');
  }
  return repo.insertVerificationRequest(
    userId,
    input.verifier_id,
    input.source_interaction_id,
    input.consent_grant_id,
    input.candidate_message ?? null,
    input.claim_ids,
    input.evidence_ids ?? [],
  );
}

export async function cancelVerification(userId: string, requestId: string): Promise<void> {
  const request = await repo.getVerificationRequest(requestId);
  if (!request || request['candidate_id'] !== userId) throw AppError.notFound('Verification request not found');
  await repo.setVerificationStatus(requestId, 'cancelled', null);
}

export async function listMyVerificationRequests(userId: string): Promise<Row[]> {
  return repo.listVerificationRequestsForCandidate(userId);
}
export async function listAttestationsAboutMe(userId: string): Promise<Row[]> {
  return repo.listAttestationsAboutCandidate(userId);
}

export async function decideAttestation(
  userId: string,
  attestationId: string,
  input: z.infer<typeof decideAttestationSchema>,
): Promise<void> {
  const attestation = await repo.getAttestation(attestationId);
  if (!attestation || attestation['candidate_id'] !== userId) throw AppError.notFound('Attestation not found');
  if (input.decision === 'accept') {
    await repo.setAttestationStatus(attestationId, 'accepted');
  } else if (input.decision === 'private') {
    await repo.setAttestationStatus(attestationId, 'private');
  } else {
    if ((input.dispute_reason ?? '').trim().length < 10) {
      throw AppError.badRequest('Describe the dispute in at least 10 characters');
    }
    await repo.insertDispute(userId, 'attestation', attestationId, 'candidate_dispute', input.dispute_reason ?? '');
    await repo.setAttestationStatus(attestationId, 'disputed');
  }
}

// ── Professional (verifier) side ──────────────────────────────────────
export async function listVerificationRequestsForVerifier(verifierId: string): Promise<Row[]> {
  return repo.listVerificationRequestsForVerifier(verifierId);
}

export async function getVerificationWorkspace(verifierId: string, requestId: string): Promise<Row> {
  const request = await repo.getVerificationRequest(requestId);
  if (!request || request['verifier_id'] !== verifierId) throw AppError.notFound('Verification request not found');
  return repo.getVerificationWorkspace(requestId);
}

export async function respondVerification(
  verifierId: string,
  requestId: string,
  decision: 'accept' | 'decline',
  declineReason: string | null,
): Promise<Row> {
  const request = await repo.getVerificationRequest(requestId);
  if (!request || request['verifier_id'] !== verifierId) throw AppError.notFound('Verification request not found');
  if (request['status'] !== 'pending') throw AppError.badRequest('This request is no longer pending');
  const updated = await repo.setVerificationStatus(
    requestId,
    decision === 'accept' ? 'accepted' : 'declined',
    decision === 'decline' ? declineReason : null,
  );
  if (!updated) throw AppError.notFound('Verification request not found');
  return updated;
}

export async function submitAttestation(
  verifierId: string,
  requestId: string,
  input: z.infer<typeof submitAttestationSchema>,
): Promise<Row> {
  const request = await repo.getVerificationRequest(requestId);
  if (!request || request['verifier_id'] !== verifierId) throw AppError.notFound('Verification request not found');
  if (request['status'] !== 'accepted') throw AppError.badRequest('Accept the request before attesting');
  const attestation = await repo.insertAttestation(verifierId, request['candidate_id'] as string, requestId, {
    claim_id: input.claim_id ?? null,
    competency_id: input.competency_id ?? null,
    observation_basis: input.observation_basis ?? null,
    observed_behavior: input.observed_behavior ?? null,
    scope_limitation: input.scope_limitation ?? null,
    confidence: input.confidence,
    relationship: input.relationship ?? null,
    conflict_disclosure: input.conflict_disclosure ?? null,
  });
  await repo.setVerificationStatus(requestId, 'completed', null);
  return attestation;
}

export async function revokeAttestation(verifierId: string, attestationId: string, reason: string | null): Promise<void> {
  const attestation = await repo.getAttestation(attestationId);
  if (!attestation || attestation['verifier_id'] !== verifierId) throw AppError.notFound('Attestation not found');
  await repo.setAttestationStatus(attestationId, 'revoked', reason);
}

export async function listIssuedAttestations(verifierId: string): Promise<Row[]> {
  return repo.listAttestationsByVerifier(verifierId);
}

// ── Passports ─────────────────────────────────────────────────────────
async function ownPassportOrThrow(passportId: string, userId: string): Promise<Row> {
  const passport = await repo.getPassport(passportId);
  if (!passport || passport['candidate_id'] !== userId) throw AppError.notFound('Passport not found');
  return passport;
}

export async function createPassportDraft(userId: string, input: z.infer<typeof createPassportSchema>): Promise<Row> {
  return repo.insertPassportDraft(userId, {
    title: input.title,
    purpose: input.purpose,
    target_role: input.target_role ?? '',
    target_level: input.target_level ?? '',
    target_company: input.target_company ?? null,
    target_job_id: input.target_job_id ?? null,
  });
}

export async function issuePassport(
  userId: string,
  passportId: string,
  input: z.infer<typeof issuePassportSchema>,
): Promise<Row> {
  await ownPassportOrThrow(passportId, userId);
  if (input.claim_ids.length === 0 && input.attestation_ids.length === 0) {
    throw AppError.badRequest('Select at least one claim or attestation to include');
  }

  const items: Array<{ item_type: string; item_id: string; sort_order: number }> = [];
  const claimSnapshots: Row[] = [];
  let order = 0;
  for (const claimId of input.claim_ids) {
    const claim = await repo.getClaim(claimId);
    if (!claim || claim['candidate_id'] !== userId || claim['status'] !== 'active') {
      throw AppError.badRequest('Only your own active claims can be included');
    }
    claimSnapshots.push(claim);
    items.push({ item_type: 'claim', item_id: claimId, sort_order: order++ });
  }

  const attestationSnapshots: Row[] = [];
  for (const attestationId of input.attestation_ids) {
    const attestation = await repo.getAttestation(attestationId);
    if (!attestation || attestation['candidate_id'] !== userId || attestation['status'] !== 'accepted') {
      throw AppError.badRequest('Only accepted attestations about you can be included');
    }
    attestationSnapshots.push(attestation);
    items.push({ item_type: 'attestation', item_id: attestationId, sort_order: order++ });
  }

  const snapshot = { claims: claimSnapshots, attestations: attestationSnapshots, frozen_at: new Date().toISOString() };
  return repo.issuePassport(passportId, snapshot, items);
}

export async function revokePassport(userId: string, passportId: string, reason: string | null): Promise<void> {
  await ownPassportOrThrow(passportId, userId);
  await repo.revokePassport(passportId, reason);
}

export async function listPassports(userId: string): Promise<Row[]> {
  return repo.listPassports(userId);
}

export async function getPassportForOwner(userId: string, passportId: string): Promise<Row> {
  const passport = await ownPassportOrThrow(passportId, userId);
  const [items, grants] = await Promise.all([repo.getPassportItems(passportId), repo.listShareGrants(passportId)]);
  return { ...passport, items, grants };
}

export async function createShareGrant(
  userId: string,
  passportId: string,
  input: z.infer<typeof createShareSchema>,
): Promise<{ grantId: string; shareToken: string }> {
  const passport = await ownPassportOrThrow(passportId, userId);
  if (passport['status'] !== 'ready') throw AppError.badRequest('Issue the passport before sharing it');
  await requireConsent(userId, input.consent_grant_id, 'passport_share');

  const token = randomBytes(24).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + input.expires_in_days * 24 * 60 * 60 * 1000).toISOString();
  const grant = await repo.insertShareGrant(passportId, tokenHash, {
    recipient_type: input.recipient_type,
    recipient_user_id: input.recipient_user_id ?? null,
    purpose: input.purpose,
    max_views: input.max_views,
    expires_at: expiresAt,
    allow_download: input.allow_download,
  });
  return { grantId: grant['id'] as string, shareToken: token };
}

export async function revokeShareGrant(userId: string, passportId: string, grantId: string): Promise<void> {
  await ownPassportOrThrow(passportId, userId);
  const grant = await repo.revokeShareGrant(grantId);
  if (!grant) throw AppError.notFound('Share grant not found');
}

export async function listShareGrants(userId: string, passportId: string): Promise<Row[]> {
  await ownPassportOrThrow(passportId, userId);
  return repo.listShareGrants(passportId);
}

export async function listAccessEvents(userId: string, passportId: string): Promise<Row[]> {
  await ownPassportOrThrow(passportId, userId);
  return repo.listAccessEvents(passportId);
}

/** Public redemption: consume a view atomically and return the frozen snapshot. */
export async function redeemPassport(
  token: string,
  actorUserId: string | null,
): Promise<Row> {
  const tokenHash = createHash('sha256').update(token).digest('hex');

  // Enforce recipient restriction BEFORE consuming a view, so an unauthorized
  // attempt can't burn the legitimate recipient's view budget.
  const preGrant = await repo.getShareGrantByTokenHash(tokenHash);
  if (!preGrant) throw AppError.forbidden('This share link is invalid');
  if (preGrant['recipient_type'] === 'authenticated_user') {
    if (!actorUserId || actorUserId !== preGrant['recipient_user_id']) {
      throw AppError.forbidden('This passport link is restricted to a specific recipient');
    }
  }

  const grant = await repo.consumeShareView(tokenHash);
  if (!grant) throw AppError.forbidden('This share link is invalid, expired, revoked, or out of views');

  const passportId = grant['passport_id'] as string;
  const passport = await repo.getPassport(passportId);
  if (!passport || passport['status'] === 'revoked') {
    throw AppError.forbidden('This passport is no longer available');
  }
  await repo.insertAccessEvent(passportId, grant['id'] as string, actorUserId, 'redeem');

  return {
    passport_id: passportId,
    title: passport['title'],
    target_role: passport['target_role'],
    target_company: passport['target_company'],
    snapshot: passport['snapshot'],
    views_used: grant['views_used'],
    max_views: grant['max_views'],
    allow_download: grant['allow_download'],
  };
}
