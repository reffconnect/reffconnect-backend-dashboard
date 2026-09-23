import { z } from 'zod';

const uuid = z.string().uuid();

export const grantConsentSchema = z.object({
  purpose: z.enum([
    'ai_processing',
    'reusable_proof',
    'professional_verification',
    'passport_share',
    'recruiter_discovery',
    'outcome_training',
    'aggregate_benchmarking',
  ]),
  scope: z.record(z.string(), z.unknown()).default({}),
  expires_at: z.string().datetime().nullable().optional(),
});

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).optional(),
  contribution_scope: z.string().max(100).nullable().optional(),
  started_on: z.string().date().nullable().optional(),
  ended_on: z.string().date().nullable().optional(),
});

export const createClaimSchema = z.object({
  title: z.string().trim().min(1).max(300),
  action_text: z.string().trim().min(1).max(2000),
  object_text: z.string().trim().min(1).max(2000),
  context_text: z.string().max(2000).optional(),
  result_text: z.string().max(2000).nullable().optional(),
  contribution_scope: z.string().max(100).default('individual'),
  period_start: z.string().date().nullable().optional(),
  period_end: z.string().date().nullable().optional(),
  project_id: uuid.nullable().optional(),
});

export const activateClaimSchema = z.object({ consent_grant_id: uuid });
export const reviseClaimSchema = z.object({
  title: z.string().trim().max(300).optional(),
  action_text: z.string().trim().max(2000).optional(),
  object_text: z.string().trim().max(2000).optional(),
  context_text: z.string().max(2000).optional(),
  result_text: z.string().max(2000).nullable().optional(),
});
export const setVisibilitySchema = z.object({
  visibility: z.enum(['private', 'passport_eligible', 'discovery_eligible']),
});

export const proposeCompetencySchema = z.object({
  competency_slug: z.string().trim().min(1).max(100),
  source: z.enum(['candidate', 'ai_proposed']).default('candidate'),
  confidence: z.enum(['high', 'medium', 'low']).default('low'),
});
export const decideCompetencySchema = z.object({
  competency_slug: z.string().trim().min(1).max(100),
  confirm: z.boolean(),
});

export const createLinkArtifactSchema = z.object({
  url: z.string().url().max(1000),
  artifact_type: z.enum(['url', 'github_repo', 'project_demo']).default('url'),
  consent_grant_id: uuid,
});
export const createFileArtifactSchema = z.object({
  storage_path: z.string().trim().min(1).max(1000),
  consent_grant_id: uuid,
});
export const attachEvidenceSchema = z.object({
  claim_id: uuid,
  artifact_id: uuid,
  evidence_text: z.string().trim().min(1).max(2000),
  source_locator: z.record(z.string(), z.unknown()).optional(),
  consent_grant_id: uuid,
});
export const reviewEvidenceSchema = z.object({
  decision: z.enum(['confirm', 'reject']),
  consent_grant_id: uuid.optional(),
});

export const openDisputeSchema = z.object({
  subject_type: z.enum(['claim', 'claim_evidence', 'attestation']),
  subject_id: uuid,
  reason_code: z.string().trim().min(1).max(100),
  description: z.string().trim().min(10).max(5000),
});

export const requestVerificationSchema = z.object({
  verifier_id: uuid,
  source_interaction_id: z.string().min(1).max(100),
  claim_ids: z.array(uuid).min(1),
  evidence_ids: z.array(uuid).optional(),
  consent_grant_id: uuid,
  candidate_message: z.string().max(2000).nullable().optional(),
});
export const decideVerificationSchema = z.object({
  decision: z.enum(['accept', 'decline']),
  decline_reason: z.string().max(2000).nullable().optional(),
});
export const submitAttestationSchema = z.object({
  claim_id: uuid.nullable().optional(),
  competency_id: uuid.nullable().optional(),
  observation_basis: z.string().max(2000).nullable().optional(),
  observed_behavior: z.string().max(2000).nullable().optional(),
  scope_limitation: z.string().max(2000).nullable().optional(),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
  relationship: z.string().max(200).nullable().optional(),
  conflict_disclosure: z.string().max(2000).nullable().optional(),
});
export const decideAttestationSchema = z.object({
  decision: z.enum(['accept', 'private', 'dispute']),
  dispute_reason: z.string().max(2000).nullable().optional(),
});

export const createPassportSchema = z.object({
  title: z.string().trim().min(1).max(300),
  purpose: z.string().max(100).default('referral'),
  target_role: z.string().max(200).optional(),
  target_level: z.string().max(200).optional(),
  target_company: z.string().max(200).nullable().optional(),
  target_job_id: z.string().max(200).nullable().optional(),
});
export const issuePassportSchema = z.object({
  claim_ids: z.array(uuid).default([]),
  attestation_ids: z.array(uuid).default([]),
});
export const createShareSchema = z.object({
  recipient_type: z.enum(['link', 'authenticated_user']).default('link'),
  recipient_user_id: uuid.nullable().optional(),
  purpose: z.string().max(100).default('referral_review'),
  max_views: z.number().int().positive().max(1000).default(10),
  expires_in_days: z.number().int().positive().max(365).default(14),
  allow_download: z.boolean().default(false),
  consent_grant_id: uuid,
});
export const redeemSchema = z.object({
  token: z.string().min(10),
  recipient_proof: z.string().max(500).nullable().optional(),
});

export const idParamSchema = z.object({ id: uuid });
export const claimsQuerySchema = z.object({
  status: z.enum(['draft', 'active', 'superseded', 'archived', 'disputed', 'expired']).optional(),
  project_id: uuid.optional(),
});
