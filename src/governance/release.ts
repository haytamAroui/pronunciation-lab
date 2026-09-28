import { fingerprint } from "../core/fingerprint.js";
import type { RenderArtifact } from "../core/model.js";
import type { BlindReviewSession } from "../review/blindSession.js";
import {
  validateReviewEvidence,
  type CandidateReviewEvidence,
} from "../review/evidence.js";
import { createArtifactReviewBindingFingerprint } from "../review/workflow.js";
import type {
  AcousticQaResult,
  GovernedCandidatePlan,
  ReleasedReference,
  TechnicalQaResult,
} from "./model.js";

const REQUIRED_HUMAN_ROLES = ["native_linguistic", "clinical"] as const;

function evidenceForCandidate(input: {
  candidateId: string;
  session: BlindReviewSession;
  evidence: readonly CandidateReviewEvidence[];
}): readonly CandidateReviewEvidence[] {
  if (input.session.assignments.length === 0) {
    throw new Error("Blind review session has no assignments");
  }
  const labels = new Set(
    input.session.assignments
      .filter((assignment) => assignment.candidateId === input.candidateId)
      .map((assignment) => assignment.blindLabel),
  );
  if (labels.size === 0) {
    throw new Error("Candidate is not present in the blind review session");
  }

  return Object.freeze(
    input.evidence.filter(
      (item) => item.sessionId === input.session.sessionId && labels.has(item.blindLabel),
    ),
  );
}

export function createReleasedReference(input: {
  plan: GovernedCandidatePlan;
  artifact: RenderArtifact;
  technicalQa: TechnicalQaResult;
  acousticQa: AcousticQaResult;
  session: BlindReviewSession;
  evidence: readonly CandidateReviewEvidence[];
  releasedAt: string;
}): ReleasedReference {
  if (!Number.isFinite(Date.parse(input.releasedAt))) {
    throw new Error("releasedAt must be an ISO timestamp");
  }
  if (input.session.targetId !== input.plan.targetId) {
    throw new Error("Blind review session target does not match governed plan");
  }
  if (
    input.artifact.candidateId !== input.plan.candidateId ||
    input.artifact.candidateFingerprint !== input.plan.candidateFingerprint
  ) {
    throw new Error("Artifact does not match governed candidate plan");
  }
  if (
    input.technicalQa.artifactId !== input.artifact.artifactId ||
    input.acousticQa.artifactId !== input.artifact.artifactId
  ) {
    throw new Error("QA evidence does not match the release artifact");
  }
  if (input.technicalQa.status !== "pass") {
    throw new Error("Technical QA is blocking and must pass before release");
  }

  const humanEvidence = evidenceForCandidate({
    candidateId: input.plan.candidateId,
    session: input.session,
    evidence: input.evidence,
  });

  for (const item of humanEvidence) {
    const issues = validateReviewEvidence(item);
    if (issues.length > 0) {
      throw new Error(`Invalid human review evidence ${item.evidenceId}: ${issues.join(",")}`);
    }
    const expectedBinding = createArtifactReviewBindingFingerprint({
      sessionId: input.session.sessionId,
      blindLabel: item.blindLabel,
      candidateId: input.plan.candidateId,
      artifactId: input.artifact.artifactId,
      audioSha256: input.artifact.audioSha256,
    });
    if (item.artifactBindingFingerprint !== expectedBinding) {
      throw new Error(
        `Human review evidence ${item.evidenceId} does not bind to the release artifact bytes`,
      );
    }
  }

  const roleEvidence = new Map<string, CandidateReviewEvidence[]>();
  for (const item of humanEvidence) {
    const list = roleEvidence.get(item.reviewerRole) ?? [];
    list.push(item);
    roleEvidence.set(item.reviewerRole, list);
  }

  for (const role of REQUIRED_HUMAN_ROLES) {
    const reviews = roleEvidence.get(role) ?? [];
    if (reviews.some((review) => review.overallDecision === "fail")) {
      throw new Error(`Human review role ${role} contains a failing decision`);
    }
    if (!reviews.some((review) => review.overallDecision === "pass")) {
      throw new Error(`Release requires an explicit passing ${role} review`);
    }
  }

  const linguisticReviewEvidenceIds = Object.freeze(
    (roleEvidence.get("native_linguistic") ?? [])
      .filter((item) => item.overallDecision === "pass")
      .map((item) => item.evidenceId)
      .sort(),
  );
  const clinicalReviewEvidenceIds = Object.freeze(
    (roleEvidence.get("clinical") ?? [])
      .filter((item) => item.overallDecision === "pass")
      .map((item) => item.evidenceId)
      .sort(),
  );

  const releaseManifestFingerprint = fingerprint({
    targetId: input.plan.targetId,
    targetRegistryVersion: input.plan.targetRegistryVersion,
    artifactId: input.artifact.artifactId,
    audioSha256: input.artifact.audioSha256,
    candidateId: input.plan.candidateId,
    renderingProfileId: input.plan.renderingProfileId,
    renderingProfileVersion: input.plan.renderingProfileVersion,
    rendererIdentity: input.plan.renderer.rendererId,
    rendererVersion: input.plan.renderer.rendererVersion,
    linguisticReviewEvidenceIds,
    clinicalReviewEvidenceIds,
    technicalQaId: input.technicalQa.qaId,
    acousticQaId: input.acousticQa.qaId,
    acousticQaStatus: input.acousticQa.status,
    releasedAt: input.releasedAt,
  });

  return Object.freeze({
    schemaVersion: "1.0.0",
    releaseId: `release:${releaseManifestFingerprint.slice("sha256:".length)}`,
    targetId: input.plan.targetId,
    targetRegistryVersion: input.plan.targetRegistryVersion,
    artifactId: input.artifact.artifactId,
    audioSha256: input.artifact.audioSha256,
    candidateId: input.plan.candidateId,
    renderingProfileId: input.plan.renderingProfileId,
    renderingProfileVersion: input.plan.renderingProfileVersion,
    rendererIdentity: input.plan.renderer.rendererId,
    rendererVersion: input.plan.renderer.rendererVersion,
    linguisticReviewEvidenceIds,
    clinicalReviewEvidenceIds,
    technicalQaId: input.technicalQa.qaId,
    acousticQaId: input.acousticQa.qaId,
    acousticQaStatus: input.acousticQa.status,
    releasedAt: input.releasedAt,
    releaseManifestFingerprint,
    status: "active",
    authority: "human_approved_release",
  });
}

export function hasActiveReleaseForArtifact(input: {
  artifact: Pick<RenderArtifact, "artifactId" | "audioSha256">;
  releases: readonly ReleasedReference[];
}): boolean {
  return input.releases.some(
    (release) =>
      release.status === "active" &&
      release.artifactId === input.artifact.artifactId &&
      release.audioSha256 === input.artifact.audioSha256,
  );
}
