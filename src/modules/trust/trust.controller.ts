import type { Request } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import * as s from './trust.schema';
import * as service from './trust.service';

function uid(req: Request): string {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
}

// Consent
export const listConsent = asyncHandler(async (req, res) => sendSuccess(res, await service.listConsent(uid(req))));
export const grantConsent = asyncHandler(async (req, res) =>
  sendCreated(res, await service.grantConsent(uid(req), s.grantConsentSchema.parse(req.body))),
);
export const withdrawConsent = asyncHandler(async (req, res) => {
  await service.withdrawConsent(uid(req), s.idParamSchema.parse(req.params).id);
  sendSuccess(res, { withdrawn: true });
});

// Competencies / projects
export const listCompetencies = asyncHandler(async (_req, res) => sendSuccess(res, await service.listCompetencies()));
export const listProjects = asyncHandler(async (req, res) => sendSuccess(res, await service.listProjects(uid(req))));
export const createProject = asyncHandler(async (req, res) =>
  sendCreated(res, await service.createProject(uid(req), s.createProjectSchema.parse(req.body))),
);

// Claims
export const listClaims = asyncHandler(async (req, res) => {
  const q = s.claimsQuerySchema.parse(req.query);
  sendSuccess(res, await service.listClaims(uid(req), q.status, q.project_id));
});
export const getClaim = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.getClaimDetail(uid(req), s.idParamSchema.parse(req.params).id)),
);
export const createClaim = asyncHandler(async (req, res) =>
  sendCreated(res, await service.createClaim(uid(req), s.createClaimSchema.parse(req.body))),
);
export const activateClaim = asyncHandler(async (req, res) => {
  await service.activateClaim(uid(req), s.idParamSchema.parse(req.params).id, s.activateClaimSchema.parse(req.body));
  sendSuccess(res, { activated: true }, 200, 'Claim activated');
});
export const reviseClaim = asyncHandler(async (req, res) =>
  sendCreated(res, await service.reviseClaim(uid(req), s.idParamSchema.parse(req.params).id, s.reviseClaimSchema.parse(req.body))),
);
export const archiveClaim = asyncHandler(async (req, res) => {
  await service.archiveClaim(uid(req), s.idParamSchema.parse(req.params).id);
  sendSuccess(res, { archived: true });
});
export const setClaimVisibility = asyncHandler(async (req, res) => {
  const { visibility } = s.setVisibilitySchema.parse(req.body);
  await service.setClaimVisibility(uid(req), s.idParamSchema.parse(req.params).id, visibility);
  sendSuccess(res, { visibility }, 200, 'Visibility updated');
});
export const proposeCompetency = asyncHandler(async (req, res) => {
  await service.proposeCompetency(uid(req), s.idParamSchema.parse(req.params).id, s.proposeCompetencySchema.parse(req.body));
  sendSuccess(res, { proposed: true });
});
export const decideCompetency = asyncHandler(async (req, res) => {
  await service.decideCompetency(uid(req), s.idParamSchema.parse(req.params).id, s.decideCompetencySchema.parse(req.body));
  sendSuccess(res, { decided: true });
});

// Artifacts + evidence
export const createLinkArtifact = asyncHandler(async (req, res) =>
  sendCreated(res, await service.createLinkArtifact(uid(req), s.createLinkArtifactSchema.parse(req.body))),
);
export const createFileArtifact = asyncHandler(async (req, res) => {
  const { storage_path, consent_grant_id } = s.createFileArtifactSchema.parse(req.body);
  sendCreated(res, await service.createFileArtifact(uid(req), storage_path, consent_grant_id));
});
export const attachEvidence = asyncHandler(async (req, res) =>
  sendCreated(res, await service.attachEvidence(uid(req), s.attachEvidenceSchema.parse(req.body))),
);
export const reviewEvidence = asyncHandler(async (req, res) => {
  await service.reviewEvidence(uid(req), s.idParamSchema.parse(req.params).id, s.reviewEvidenceSchema.parse(req.body));
  sendSuccess(res, { reviewed: true });
});
export const listProofInbox = asyncHandler(async (req, res) => sendSuccess(res, await service.listProofInbox(uid(req))));
export const getArtifactView = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.getArtifactViewUrl(uid(req), s.idParamSchema.parse(req.params).id)),
);

// Disputes / summary
export const openDispute = asyncHandler(async (req, res) =>
  sendCreated(res, await service.openDispute(uid(req), s.openDisputeSchema.parse(req.body))),
);
export const listDisputes = asyncHandler(async (req, res) => sendSuccess(res, await service.listDisputes(uid(req))));
export const proofSummary = asyncHandler(async (req, res) => sendSuccess(res, await service.getProofSummary(uid(req))));

// Candidate verification
export const verificationSources = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.listVerificationSources(uid(req))),
);
export const requestVerification = asyncHandler(async (req, res) =>
  sendCreated(res, await service.requestVerification(uid(req), s.requestVerificationSchema.parse(req.body))),
);
export const listMyVerificationRequests = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.listMyVerificationRequests(uid(req))),
);
export const cancelVerification = asyncHandler(async (req, res) => {
  await service.cancelVerification(uid(req), s.idParamSchema.parse(req.params).id);
  sendSuccess(res, { cancelled: true });
});
export const attestationsAboutMe = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.listAttestationsAboutMe(uid(req))),
);
export const decideAttestation = asyncHandler(async (req, res) => {
  await service.decideAttestation(uid(req), s.idParamSchema.parse(req.params).id, s.decideAttestationSchema.parse(req.body));
  sendSuccess(res, { decided: true });
});

// Verifier
export const verifierRequests = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.listVerificationRequestsForVerifier(uid(req))),
);
export const verifierWorkspace = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.getVerificationWorkspace(uid(req), s.idParamSchema.parse(req.params).id)),
);
export const respondVerification = asyncHandler(async (req, res) => {
  const { decision, decline_reason } = s.decideVerificationSchema.parse(req.body);
  sendSuccess(
    res,
    await service.respondVerification(uid(req), s.idParamSchema.parse(req.params).id, decision, decline_reason ?? null),
    200,
    'Response recorded',
  );
});
export const submitAttestation = asyncHandler(async (req, res) =>
  sendCreated(
    res,
    await service.submitAttestation(uid(req), s.idParamSchema.parse(req.params).id, s.submitAttestationSchema.parse(req.body)),
  ),
);
export const listIssuedAttestations = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.listIssuedAttestations(uid(req))),
);
export const revokeAttestation = asyncHandler(async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
  await service.revokeAttestation(uid(req), s.idParamSchema.parse(req.params).id, reason);
  sendSuccess(res, { revoked: true });
});

// Passports
export const listPassports = asyncHandler(async (req, res) => sendSuccess(res, await service.listPassports(uid(req))));
export const createPassport = asyncHandler(async (req, res) =>
  sendCreated(res, await service.createPassportDraft(uid(req), s.createPassportSchema.parse(req.body))),
);
export const getPassport = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.getPassportForOwner(uid(req), s.idParamSchema.parse(req.params).id)),
);
export const issuePassport = asyncHandler(async (req, res) =>
  sendSuccess(
    res,
    await service.issuePassport(uid(req), s.idParamSchema.parse(req.params).id, s.issuePassportSchema.parse(req.body)),
    200,
    'Passport issued',
  ),
);
export const revokePassport = asyncHandler(async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
  await service.revokePassport(uid(req), s.idParamSchema.parse(req.params).id, reason);
  sendSuccess(res, { revoked: true });
});
export const listShares = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.listShareGrants(uid(req), s.idParamSchema.parse(req.params).id)),
);
export const createShare = asyncHandler(async (req, res) =>
  sendCreated(res, await service.createShareGrant(uid(req), s.idParamSchema.parse(req.params).id, s.createShareSchema.parse(req.body))),
);
export const revokeShare = asyncHandler(async (req, res) => {
  const { id, grantId } = s.idParamSchema.extend({ grantId: s.idParamSchema.shape.id }).parse(req.params);
  await service.revokeShareGrant(uid(req), id, grantId);
  sendSuccess(res, { revoked: true });
});
export const listAccessEvents = asyncHandler(async (req, res) =>
  sendSuccess(res, await service.listAccessEvents(uid(req), s.idParamSchema.parse(req.params).id)),
);
export const redeemPassport = asyncHandler(async (req, res) => {
  const { token } = s.redeemSchema.parse(req.body);
  sendSuccess(res, await service.redeemPassport(token, req.user?.id ?? null));
});
