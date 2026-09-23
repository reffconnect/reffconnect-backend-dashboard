import { Router } from 'express';
import * as c from './trust.controller';
import { authenticate, optionalAuth } from '../../middleware/auth';

export const trustRouter = Router();

// Public: redeem a passport share token (optional auth attributes the view).
trustRouter.post('/passports/redeem', optionalAuth, c.redeemPassport);

// Everything else requires a signed-in user.
trustRouter.use(authenticate);

// Consent
trustRouter.get('/consent', c.listConsent);
trustRouter.post('/consent', c.grantConsent);
trustRouter.delete('/consent/:id', c.withdrawConsent);

// Competencies / projects
trustRouter.get('/competencies', c.listCompetencies);
trustRouter.get('/projects', c.listProjects);
trustRouter.post('/projects', c.createProject);

// Claims
trustRouter.get('/claims', c.listClaims);
trustRouter.post('/claims', c.createClaim);
trustRouter.get('/claims/:id', c.getClaim);
trustRouter.post('/claims/:id/activate', c.activateClaim);
trustRouter.post('/claims/:id/revise', c.reviseClaim);
trustRouter.post('/claims/:id/archive', c.archiveClaim);
trustRouter.patch('/claims/:id/visibility', c.setClaimVisibility);
trustRouter.post('/claims/:id/competencies', c.proposeCompetency);
trustRouter.post('/claims/:id/competencies/decide', c.decideCompetency);

// Artifacts + evidence
trustRouter.post('/artifacts/link', c.createLinkArtifact);
trustRouter.post('/artifacts/file', c.createFileArtifact);
trustRouter.get('/artifacts/:id/view', c.getArtifactView);
trustRouter.post('/evidence', c.attachEvidence);
trustRouter.post('/evidence/:id/review', c.reviewEvidence);
trustRouter.get('/inbox', c.listProofInbox);

// Disputes / summary
trustRouter.post('/disputes', c.openDispute);
trustRouter.get('/disputes', c.listDisputes);
trustRouter.get('/proof-summary', c.proofSummary);

// Candidate verification
trustRouter.get('/verification/sources', c.verificationSources);
trustRouter.post('/verification/requests', c.requestVerification);
trustRouter.get('/verification/requests', c.listMyVerificationRequests);
trustRouter.post('/verification/requests/:id/cancel', c.cancelVerification);
trustRouter.get('/attestations/about-me', c.attestationsAboutMe);
trustRouter.post('/attestations/:id/decide', c.decideAttestation);

// Verifier (professional) side
trustRouter.get('/verifier/requests', c.verifierRequests);
trustRouter.get('/verifier/requests/:id', c.verifierWorkspace);
trustRouter.post('/verifier/requests/:id/respond', c.respondVerification);
trustRouter.post('/verifier/requests/:id/attest', c.submitAttestation);
trustRouter.get('/verifier/attestations', c.listIssuedAttestations);
trustRouter.post('/verifier/attestations/:id/revoke', c.revokeAttestation);

// Passports
trustRouter.get('/passports', c.listPassports);
trustRouter.post('/passports', c.createPassport);
trustRouter.get('/passports/:id', c.getPassport);
trustRouter.post('/passports/:id/issue', c.issuePassport);
trustRouter.post('/passports/:id/revoke', c.revokePassport);
trustRouter.get('/passports/:id/shares', c.listShares);
trustRouter.post('/passports/:id/shares', c.createShare);
trustRouter.post('/passports/:id/shares/:grantId/revoke', c.revokeShare);
trustRouter.get('/passports/:id/access-events', c.listAccessEvents);
