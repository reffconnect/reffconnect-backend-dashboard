/**
 * Data access for the career-trust / passport subsystem. Ownership + consent
 * are enforced in the service layer; these functions are deliberately thin.
 */
import { query, withTransaction } from '../../db/pool';
import { AppError } from '../../utils/AppError';

type Row = Record<string, unknown>;

// ── Consent ───────────────────────────────────────────────────────────
export async function listConsent(userId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT * FROM public.consent_grants WHERE user_id = $1 ORDER BY granted_at DESC`,
    [userId],
  );
  return rows;
}

export async function getActiveConsent(userId: string, purpose: string): Promise<Row | null> {
  const { rows } = await query(
    `SELECT * FROM public.consent_grants
      WHERE user_id = $1 AND purpose = $2 AND status = 'active'
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY granted_at DESC LIMIT 1`,
    [userId, purpose],
  );
  return rows[0] ?? null;
}

export async function isConsentValid(userId: string, grantId: string, purpose: string): Promise<boolean> {
  const { rows } = await query<{ ok: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM public.consent_grants
        WHERE id = $1 AND user_id = $2 AND purpose = $3 AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
     ) AS ok`,
    [grantId, userId, purpose],
  );
  return rows[0]?.ok ?? false;
}

export async function insertConsent(
  userId: string,
  purpose: string,
  scope: Record<string, unknown>,
  policyVersion: string,
  expiresAt: string | null,
): Promise<Row> {
  const { rows } = await query(
    `INSERT INTO public.consent_grants (user_id, purpose, scope, policy_version, expires_at)
     VALUES ($1, $2, $3::jsonb, $4, $5) RETURNING *`,
    [userId, purpose, JSON.stringify(scope), policyVersion, expiresAt],
  );
  if (!rows[0]) throw AppError.internal('Failed to grant consent');
  return rows[0];
}

export async function withdrawConsent(userId: string, grantId: string): Promise<Row | null> {
  const { rows } = await query(
    `UPDATE public.consent_grants SET status = 'withdrawn', withdrawn_at = NOW()
      WHERE id = $1 AND user_id = $2 RETURNING *`,
    [grantId, userId],
  );
  return rows[0] ?? null;
}

// ── Competencies ──────────────────────────────────────────────────────
export async function listCompetencies(): Promise<Row[]> {
  const { rows } = await query(
    `SELECT id, slug, name, category, description, version FROM public.competencies
      WHERE status = 'active' ORDER BY category, name`,
  );
  return rows;
}

export async function getCompetencyBySlug(slug: string): Promise<Row | null> {
  const { rows } = await query(
    `SELECT * FROM public.competencies WHERE slug = $1 AND status = 'active' AND prohibited = FALSE LIMIT 1`,
    [slug],
  );
  return rows[0] ?? null;
}

// ── Projects ──────────────────────────────────────────────────────────
export async function listProjects(candidateId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT * FROM public.career_projects
      WHERE candidate_id = $1 AND status <> 'archived' ORDER BY updated_at DESC`,
    [candidateId],
  );
  return rows;
}

export async function insertProject(
  candidateId: string,
  input: { title: string; description: string; contribution_scope?: string | null; started_on?: string | null; ended_on?: string | null },
): Promise<Row> {
  const { rows } = await query(
    `INSERT INTO public.career_projects (candidate_id, title, description, contribution_scope, started_on, ended_on, status, visibility)
     VALUES ($1, $2, $3, $4, $5, $6, 'draft', 'private') RETURNING *`,
    [candidateId, input.title, input.description, input.contribution_scope ?? null, input.started_on ?? null, input.ended_on ?? null],
  );
  if (!rows[0]) throw AppError.internal('Failed to create project');
  return rows[0];
}

export async function projectBelongsTo(projectId: string, candidateId: string): Promise<boolean> {
  const { rows } = await query<{ ok: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM public.career_projects WHERE id = $1 AND candidate_id = $2) AS ok`,
    [projectId, candidateId],
  );
  return rows[0]?.ok ?? false;
}

// ── Claims ────────────────────────────────────────────────────────────
export async function listClaims(candidateId: string, status?: string, projectId?: string): Promise<Row[]> {
  const params: unknown[] = [candidateId];
  let where = 'candidate_id = $1';
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  if (projectId) {
    params.push(projectId);
    where += ` AND project_id = $${params.length}`;
  }
  const { rows } = await query(`SELECT * FROM public.career_claims WHERE ${where} ORDER BY updated_at DESC`, params);
  return rows;
}

export async function getClaim(claimId: string): Promise<Row | null> {
  const { rows } = await query(`SELECT * FROM public.career_claims WHERE id = $1 LIMIT 1`, [claimId]);
  return rows[0] ?? null;
}

export async function insertClaim(
  candidateId: string,
  payload: {
    title: string;
    action_text: string;
    object_text: string;
    context_text: string;
    result_text: string | null;
    contribution_scope: string;
    period_start: string | null;
    period_end: string | null;
    project_id: string | null;
    parent_claim_id?: string | null;
  },
): Promise<Row> {
  const { rows } = await query(
    `INSERT INTO public.career_claims
       (candidate_id, project_id, parent_claim_id, title, action_text, object_text, context_text,
        result_text, contribution_scope, period_start, period_end, status, visibility)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft','private') RETURNING *`,
    [
      candidateId,
      payload.project_id,
      payload.parent_claim_id ?? null,
      payload.title,
      payload.action_text,
      payload.object_text,
      payload.context_text,
      payload.result_text,
      payload.contribution_scope,
      payload.period_start,
      payload.period_end,
    ],
  );
  if (!rows[0]) throw AppError.internal('Failed to create claim');
  return rows[0];
}

export async function activateClaim(claimId: string, consentGrantId: string): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ parent_claim_id: string | null }>(
      `UPDATE public.career_claims
          SET status = 'active', candidate_confirmed_at = NOW(), consent_grant_id = $2
        WHERE id = $1 RETURNING parent_claim_id`,
      [claimId, consentGrantId],
    );
    const parentId = rows[0]?.parent_claim_id ?? null;
    if (parentId) {
      await client.query(
        `UPDATE public.career_claims SET status = 'superseded', superseded_by = $2
          WHERE id = $1 AND status = 'active'`,
        [parentId, claimId],
      );
    }
  });
}

export async function updateClaimStatus(claimId: string, status: string): Promise<void> {
  await query(`UPDATE public.career_claims SET status = $2 WHERE id = $1`, [claimId, status]);
}

export async function setClaimVisibility(claimId: string, visibility: string): Promise<void> {
  await query(`UPDATE public.career_claims SET visibility = $2 WHERE id = $1`, [claimId, visibility]);
}

// ── Claim competencies ────────────────────────────────────────────────
export async function listClaimCompetencies(claimId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT cc.claim_id, cc.competency_id, cc.mapping_source, cc.candidate_confirmed_at, cc.confidence, c.slug, c.name
       FROM public.claim_competencies cc JOIN public.competencies c ON c.id = cc.competency_id
      WHERE cc.claim_id = $1`,
    [claimId],
  );
  return rows;
}

export async function proposeCompetency(
  claimId: string,
  competencyId: string,
  source: string,
  confidence: string,
): Promise<void> {
  await query(
    `INSERT INTO public.claim_competencies (claim_id, competency_id, mapping_source, candidate_confirmed_at, confidence)
     VALUES ($1, $2, $3, CASE WHEN $3 = 'candidate' THEN NOW() ELSE NULL END, $4)
     ON CONFLICT (claim_id, competency_id) DO NOTHING`,
    [claimId, competencyId, source, confidence],
  );
}

export async function decideCompetency(claimId: string, competencyId: string, confirm: boolean): Promise<void> {
  if (confirm) {
    await query(
      `UPDATE public.claim_competencies SET candidate_confirmed_at = NOW()
        WHERE claim_id = $1 AND competency_id = $2`,
      [claimId, competencyId],
    );
  } else {
    await query(
      `DELETE FROM public.claim_competencies
        WHERE claim_id = $1 AND competency_id = $2 AND candidate_confirmed_at IS NULL`,
      [claimId, competencyId],
    );
  }
}

// ── Artifacts + evidence ──────────────────────────────────────────────
export async function insertLinkArtifact(
  candidateId: string,
  artifactType: string,
  canonicalUrl: string,
  independenceKey: string,
): Promise<Row> {
  const { rows } = await query(
    `INSERT INTO public.evidence_artifacts (candidate_id, artifact_type, canonical_url, independence_key, status)
     VALUES ($1, $2, $3, $4, 'available') RETURNING *`,
    [candidateId, artifactType, canonicalUrl, independenceKey],
  );
  if (!rows[0]) throw AppError.internal('Failed to register artifact');
  return rows[0];
}

export async function getArtifact(candidateId: string, artifactId: string): Promise<Row | null> {
  const { rows } = await query(
    `SELECT * FROM public.evidence_artifacts WHERE id = $1 AND candidate_id = $2 LIMIT 1`,
    [artifactId, candidateId],
  );
  return rows[0] ?? null;
}

export async function insertEvidence(
  claimId: string,
  artifactId: string,
  evidenceText: string,
  sourceLocator: Record<string, unknown>,
  provenance: string,
  consentGrantId: string,
): Promise<Row> {
  const { rows } = await query(
    `INSERT INTO public.claim_evidence
       (claim_id, artifact_id, evidence_text, source_locator, provenance, verification_state, confidence, consent_grant_id)
     VALUES ($1, $2, $3, $4::jsonb, $5, 'unreviewed', 'low', $6) RETURNING *`,
    [claimId, artifactId, evidenceText, JSON.stringify(sourceLocator), provenance, consentGrantId],
  );
  if (!rows[0]) throw AppError.internal('Failed to attach evidence');
  return rows[0];
}

export async function getEvidenceForClaim(claimId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT * FROM public.claim_evidence WHERE claim_id = $1 ORDER BY created_at DESC`,
    [claimId],
  );
  return rows;
}

export async function getEvidenceWithOwner(evidenceId: string): Promise<Row | null> {
  const { rows } = await query(
    `SELECT e.*, c.candidate_id
       FROM public.claim_evidence e JOIN public.career_claims c ON c.id = e.claim_id
      WHERE e.id = $1 LIMIT 1`,
    [evidenceId],
  );
  return rows[0] ?? null;
}

export async function confirmEvidence(evidenceId: string, decision: 'confirm' | 'reject'): Promise<void> {
  if (decision === 'reject') {
    await query(
      `UPDATE public.claim_evidence SET verification_state = 'rejected', candidate_confirmed_at = NULL WHERE id = $1`,
      [evidenceId],
    );
  } else {
    await query(`UPDATE public.claim_evidence SET candidate_confirmed_at = NOW() WHERE id = $1`, [evidenceId]);
  }
}

export async function listProofInbox(candidateId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT e.*, c.title AS claim_title
       FROM public.claim_evidence e JOIN public.career_claims c ON c.id = e.claim_id
      WHERE c.candidate_id = $1 AND e.candidate_confirmed_at IS NULL AND e.verification_state <> 'rejected'
      ORDER BY e.created_at DESC`,
    [candidateId],
  );
  return rows;
}

// ── Disputes ──────────────────────────────────────────────────────────
export async function insertDispute(
  candidateId: string,
  subjectType: string,
  subjectId: string,
  reasonCode: string,
  description: string,
): Promise<Row> {
  const { rows } = await query(
    `INSERT INTO public.trust_disputes (candidate_id, subject_type, subject_id, reason_code, description)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [candidateId, subjectType, subjectId, reasonCode, description],
  );
  if (!rows[0]) throw AppError.internal('Failed to open dispute');
  return rows[0];
}

export async function listDisputes(candidateId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT * FROM public.trust_disputes WHERE candidate_id = $1 ORDER BY created_at DESC`,
    [candidateId],
  );
  return rows;
}

// ── Proof summary ─────────────────────────────────────────────────────
export async function getProofSummary(candidateId: string): Promise<Row> {
  const { rows } = await query(
    `WITH claims AS (SELECT * FROM public.career_claims WHERE candidate_id = $1),
          evidence AS (
            SELECT e.* FROM public.claim_evidence e JOIN claims c ON c.id = e.claim_id
          )
     SELECT
       (SELECT COUNT(*)::int FROM claims WHERE status = 'active')                        AS active_claims,
       (SELECT COUNT(*)::int FROM claims WHERE status = 'draft')                         AS draft_claims,
       (SELECT COUNT(*)::int FROM evidence WHERE candidate_confirmed_at IS NOT NULL)     AS confirmed_evidence,
       (SELECT COUNT(*)::int FROM evidence WHERE candidate_confirmed_at IS NULL AND verification_state <> 'rejected') AS pending_inbox,
       (SELECT COUNT(*)::int FROM public.trust_disputes WHERE candidate_id = $1 AND status IN ('open','awaiting_response')) AS open_disputes`,
    [candidateId],
  );
  return rows[0] ?? {};
}

// ── Verification sources (derived from real completed interactions) ─────
export async function listVerificationSources(candidateId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT src.source_interaction_id, src.verifier_id, src.type, src.occurred_at, p.full_name AS verifier_name
       FROM (
         SELECT 'rs-' || rs.id::text AS source_interaction_id, rs.referrer_id AS verifier_id,
                'referral_session' AS type, rs.scheduled_end AS occurred_at
           FROM public.referral_sessions rs WHERE rs.requester_id = $1 AND rs.status = 'completed'
         UNION ALL
         SELECT 'ms-' || ms.id::text, ms.referrer_id, 'mock_interview', ms.scheduled_end
           FROM public.mock_interview_sessions ms WHERE ms.requester_id = $1 AND ms.status = 'completed'
         UNION ALL
         SELECT 'rr-' || rr.id::text, rr.referrer_id, 'resume_review', rr.feedback_submitted_at
           FROM public.resume_review_requests rr
          WHERE rr.requester_id = $1 AND rr.status = 'feedback_delivered' AND rr.referrer_id IS NOT NULL
       ) src
       JOIN public.profiles p ON p.id = src.verifier_id
      ORDER BY src.occurred_at DESC NULLS LAST`,
    [candidateId],
  );
  return rows;
}

// ── Verification requests + attestations ──────────────────────────────
export async function insertVerificationRequest(
  candidateId: string,
  verifierId: string,
  sourceInteractionId: string,
  consentGrantId: string,
  message: string | null,
  claimIds: string[],
  evidenceIds: string[],
): Promise<Row> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO public.verification_requests
         (candidate_id, verifier_id, source_interaction_id, consent_grant_id, candidate_message,
          expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '30 days') RETURNING *`,
      [candidateId, verifierId, sourceInteractionId, consentGrantId, message],
    );
    const request = rows[0] as { id: string };
    for (const claimId of claimIds) {
      await client.query(
        `INSERT INTO public.verification_request_claims (request_id, claim_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [request.id, claimId],
      );
    }
    for (const evidenceId of evidenceIds) {
      await client.query(
        `INSERT INTO public.verification_request_evidence (request_id, evidence_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [request.id, evidenceId],
      );
    }
    return request as Row;
  });
}

export async function getVerificationRequest(requestId: string): Promise<Row | null> {
  const { rows } = await query(`SELECT * FROM public.verification_requests WHERE id = $1 LIMIT 1`, [requestId]);
  return rows[0] ?? null;
}

export async function listVerificationRequestsForCandidate(candidateId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT * FROM public.verification_requests WHERE candidate_id = $1 ORDER BY created_at DESC`,
    [candidateId],
  );
  return rows;
}

export async function listVerificationRequestsForVerifier(verifierId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT * FROM public.verification_requests WHERE verifier_id = $1 ORDER BY created_at DESC`,
    [verifierId],
  );
  return rows;
}

export async function getVerificationWorkspace(requestId: string): Promise<Row> {
  const request = await getVerificationRequest(requestId);
  const [claims, evidence] = await Promise.all([
    query(
      `SELECT c.* FROM public.verification_request_claims rc
         JOIN public.career_claims c ON c.id = rc.claim_id WHERE rc.request_id = $1`,
      [requestId],
    ),
    query(
      `SELECT e.* FROM public.verification_request_evidence re
         JOIN public.claim_evidence e ON e.id = re.evidence_id WHERE re.request_id = $1`,
      [requestId],
    ),
  ]);
  return { request, claims: claims.rows, evidence: evidence.rows };
}

export async function setVerificationStatus(
  requestId: string,
  status: string,
  declineReason: string | null,
): Promise<Row | null> {
  const { rows } = await query(
    `UPDATE public.verification_requests SET status = $2, decline_reason = $3 WHERE id = $1 RETURNING *`,
    [requestId, status, declineReason],
  );
  return rows[0] ?? null;
}

export async function insertAttestation(
  verifierId: string,
  candidateId: string,
  requestId: string | null,
  payload: {
    claim_id: string | null;
    competency_id: string | null;
    observation_basis: string | null;
    observed_behavior: string | null;
    scope_limitation: string | null;
    confidence: string;
    relationship: string | null;
    conflict_disclosure: string | null;
  },
): Promise<Row> {
  const { rows } = await query(
    `INSERT INTO public.attestations
       (candidate_id, verifier_id, verification_request_id, claim_id, competency_id, observation_basis,
        observed_behavior, scope_limitation, confidence, relationship, conflict_disclosure, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'issued') RETURNING *`,
    [
      candidateId,
      verifierId,
      requestId,
      payload.claim_id,
      payload.competency_id,
      payload.observation_basis,
      payload.observed_behavior,
      payload.scope_limitation,
      payload.confidence,
      payload.relationship,
      payload.conflict_disclosure,
    ],
  );
  if (!rows[0]) throw AppError.internal('Failed to submit attestation');
  return rows[0];
}

export async function listAttestationsAboutCandidate(candidateId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT * FROM public.attestations WHERE candidate_id = $1 ORDER BY created_at DESC`,
    [candidateId],
  );
  return rows;
}

export async function listAttestationsByVerifier(verifierId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT * FROM public.attestations WHERE verifier_id = $1 ORDER BY created_at DESC`,
    [verifierId],
  );
  return rows;
}

export async function getAttestation(attestationId: string): Promise<Row | null> {
  const { rows } = await query(`SELECT * FROM public.attestations WHERE id = $1 LIMIT 1`, [attestationId]);
  return rows[0] ?? null;
}

export async function setAttestationStatus(
  attestationId: string,
  status: string,
  revocationReason?: string | null,
): Promise<Row | null> {
  const { rows } = await query(
    `UPDATE public.attestations
        SET status = $2,
            accepted_at = CASE WHEN $2 = 'accepted' THEN NOW() ELSE accepted_at END,
            revoked_at = CASE WHEN $2 = 'revoked' THEN NOW() ELSE revoked_at END,
            revocation_reason = COALESCE($3, revocation_reason)
      WHERE id = $1 RETURNING *`,
    [attestationId, status, revocationReason ?? null],
  );
  return rows[0] ?? null;
}

// ── Passports ─────────────────────────────────────────────────────────
export async function insertPassportDraft(
  candidateId: string,
  payload: { title: string; purpose: string; target_role: string; target_level: string; target_company: string | null; target_job_id: string | null },
): Promise<Row> {
  const { rows } = await query(
    `INSERT INTO public.referral_passports
       (candidate_id, title, purpose, target_role, target_level, target_company, target_job_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft') RETURNING *`,
    [candidateId, payload.title, payload.purpose, payload.target_role, payload.target_level, payload.target_company, payload.target_job_id],
  );
  if (!rows[0]) throw AppError.internal('Failed to create passport draft');
  return rows[0];
}

export async function getPassport(passportId: string): Promise<Row | null> {
  const { rows } = await query(`SELECT * FROM public.referral_passports WHERE id = $1 LIMIT 1`, [passportId]);
  return rows[0] ?? null;
}

export async function listPassports(candidateId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT * FROM public.referral_passports WHERE candidate_id = $1 ORDER BY created_at DESC`,
    [candidateId],
  );
  return rows;
}

/** Build a snapshot of the selected claims + attestations and mark the passport ready. */
export async function issuePassport(
  passportId: string,
  snapshot: Record<string, unknown>,
  items: Array<{ item_type: string; item_id: string; sort_order: number }>,
): Promise<Row> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE public.referral_passports SET status = 'ready', snapshot = $2::jsonb, issued_at = NOW()
        WHERE id = $1 RETURNING *`,
      [passportId, JSON.stringify(snapshot)],
    );
    for (const item of items) {
      await client.query(
        `INSERT INTO public.passport_items (passport_id, item_type, item_id, sort_order)
         VALUES ($1, $2, $3, $4) ON CONFLICT (passport_id, item_type, item_id) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
        [passportId, item.item_type, item.item_id, item.sort_order],
      );
    }
    if (!rows[0]) throw AppError.internal('Failed to issue passport');
    return rows[0];
  });
}

export async function revokePassport(passportId: string, _reason: string | null): Promise<Row | null> {
  const { rows } = await query(
    `UPDATE public.referral_passports SET status = 'revoked', revoked_at = NOW() WHERE id = $1 RETURNING *`,
    [passportId],
  );
  return rows[0] ?? null;
}

export async function getPassportItems(passportId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT * FROM public.passport_items WHERE passport_id = $1 ORDER BY sort_order ASC`,
    [passportId],
  );
  return rows;
}

// ── Share grants + access events ──────────────────────────────────────
export async function insertShareGrant(
  passportId: string,
  tokenHash: string,
  options: { recipient_type: string; recipient_user_id: string | null; purpose: string; max_views: number; expires_at: string | null; allow_download: boolean },
): Promise<Row> {
  const { rows } = await query(
    `INSERT INTO public.passport_share_grants
       (passport_id, token_hash, recipient_type, recipient_user_id, purpose, max_views, expires_at, allow_download)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      passportId,
      tokenHash,
      options.recipient_type,
      options.recipient_user_id,
      options.purpose,
      options.max_views,
      options.expires_at,
      options.allow_download,
    ],
  );
  if (!rows[0]) throw AppError.internal('Failed to create share grant');
  return rows[0];
}

export async function listShareGrants(passportId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT id, passport_id, recipient_type, recipient_user_id, purpose, max_views, views_used,
            allow_download, expires_at, revoked_at, created_at
       FROM public.passport_share_grants WHERE passport_id = $1 ORDER BY created_at DESC`,
    [passportId],
  );
  return rows;
}

export async function revokeShareGrant(grantId: string): Promise<Row | null> {
  const { rows } = await query(
    `UPDATE public.passport_share_grants SET revoked_at = NOW() WHERE id = $1 RETURNING *`,
    [grantId],
  );
  return rows[0] ?? null;
}

export async function getShareGrantByTokenHash(tokenHash: string): Promise<Row | null> {
  const { rows } = await query(`SELECT * FROM public.passport_share_grants WHERE token_hash = $1 LIMIT 1`, [tokenHash]);
  return rows[0] ?? null;
}

/** Atomically consume a view against the grant (enforces max_views + expiry + revocation). */
export async function consumeShareView(tokenHash: string): Promise<Row | null> {
  const { rows } = await query(
    `UPDATE public.passport_share_grants
        SET views_used = views_used + 1
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
        AND views_used < max_views
      RETURNING *`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function insertAccessEvent(
  passportId: string,
  grantId: string | null,
  actorUserId: string | null,
  eventType: string,
): Promise<void> {
  await query(
    `INSERT INTO public.passport_access_events (passport_id, grant_id, actor_user_id, event_type)
     VALUES ($1, $2, $3, $4)`,
    [passportId, grantId, actorUserId, eventType],
  );
}

export async function listAccessEvents(passportId: string): Promise<Row[]> {
  const { rows } = await query(
    `SELECT * FROM public.passport_access_events WHERE passport_id = $1 ORDER BY occurred_at DESC LIMIT 200`,
    [passportId],
  );
  return rows;
}

/** Register an already-uploaded file as a candidate-controlled evidence artifact. */
export async function insertFileArtifact(
  candidateId: string,
  storagePath: string,
  independenceKey: string,
): Promise<Row> {
  const { rows } = await query(
    `INSERT INTO public.evidence_artifacts
       (candidate_id, artifact_type, storage_bucket, storage_path, independence_key, status)
     VALUES ($1, 'file', 'local', $2, $3, 'available') RETURNING *`,
    [candidateId, storagePath, independenceKey],
  );
  if (!rows[0]) throw AppError.internal('Failed to register file artifact');
  return rows[0];
}
