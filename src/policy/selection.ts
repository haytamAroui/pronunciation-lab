import type { BlindReviewSession } from "../review/blindSession.js";
import {
  validateReviewEvidence,
  type CandidateReviewEvidence,
} from "../review/evidence.js";

export type CandidateDisposition =
  | "preferred_candidate"
  | "insufficient_evidence"
  | "rejected"
  | "human_recording_required";

export interface CandidateSelectionResult {
  disposition: CandidateDisposition;
  candidateId: string | null;
  evidenceIds: readonly string[];
  reason: string;
}

export interface SelectionPolicy {
  requiredReviewerRoles: readonly string[];
  requireNoCriticalFlags: boolean;
  minimumOverallPasses: number;
}

export const DEFAULT_SELECTION_POLICY: SelectionPolicy = Object.freeze({
  requiredReviewerRoles: Object.freeze(["native_linguistic", "clinical"]),
  requireNoCriticalFlags: true,
  minimumOverallPasses: 2,
});

export function selectCandidate(input: {
  session: BlindReviewSession;
  evidence: readonly CandidateReviewEvidence[];
  policy?: SelectionPolicy;
}): CandidateSelectionResult {
  const policy = input.policy ?? DEFAULT_SELECTION_POLICY;
  const evidenceByCandidate = new Map<string, CandidateReviewEvidence[]>();
  const invalidEvidenceIds = new Set<string>();

  for (const item of input.evidence) {
    if (item.sessionId !== input.session.sessionId) continue;
    if (validateReviewEvidence(item).length > 0) {
      invalidEvidenceIds.add(item.evidenceId);
      continue;
    }
    const assignment = input.session.assignments.find((candidate) => candidate.blindLabel === item.blindLabel);
    if (!assignment) continue;
    const list = evidenceByCandidate.get(assignment.candidateId) ?? [];
    list.push(item);
    evidenceByCandidate.set(assignment.candidateId, list);
  }

  if (invalidEvidenceIds.size > 0) {
    return Object.freeze({
      disposition: "insufficient_evidence",
      candidateId: null,
      evidenceIds: Object.freeze([...invalidEvidenceIds]),
      reason: "One or more review evidence records are invalid and cannot establish a selection decision.",
    });
  }

  const passed: { candidateId: string; evidence: CandidateReviewEvidence[] }[] = [];
  let allCandidatesFullyReviewed = true;

  for (const assignment of input.session.assignments) {
    const reviews = evidenceByCandidate.get(assignment.candidateId) ?? [];
    const conclusiveRoles = new Set(
      reviews
        .filter((review) => review.overallDecision !== "abstain")
        .map((review) => review.reviewerRole),
    );
    const hasConclusiveRequiredRoles = policy.requiredReviewerRoles.every((role) =>
      conclusiveRoles.has(role),
    );
    if (!hasConclusiveRequiredRoles) allCandidatesFullyReviewed = false;

    const criticalOk =
      !policy.requireNoCriticalFlags ||
      reviews.every((review) => review.criticalFlags.length === 0);
    const passCount = reviews.filter((review) => review.overallDecision === "pass").length;
    const hasFail = reviews.some((review) => review.overallDecision === "fail");

    if (
      hasConclusiveRequiredRoles &&
      criticalOk &&
      !hasFail &&
      passCount >= policy.minimumOverallPasses
    ) {
      passed.push({ candidateId: assignment.candidateId, evidence: reviews });
    }
  }

  if (passed.length === 1) {
    return Object.freeze({
      disposition: "preferred_candidate",
      candidateId: passed[0]!.candidateId,
      evidenceIds: Object.freeze(passed[0]!.evidence.map((item) => item.evidenceId)),
      reason: "Exactly one candidate satisfies the configured human-review policy.",
    });
  }

  if (passed.length > 1) {
    return Object.freeze({
      disposition: "insufficient_evidence",
      candidateId: null,
      evidenceIds: Object.freeze(
        passed.flatMap((item) => item.evidence.map((review) => review.evidenceId)),
      ),
      reason: "Multiple candidates satisfy the gate; ranking requires an application-specific preference policy.",
    });
  }

  if (!allCandidatesFullyReviewed) {
    return Object.freeze({
      disposition: "insufficient_evidence",
      candidateId: null,
      evidenceIds: Object.freeze(input.evidence.map((item) => item.evidenceId)),
      reason: "Not every candidate has conclusive evidence from all required reviewer roles.",
    });
  }

  return Object.freeze({
    disposition: "human_recording_required",
    candidateId: null,
    evidenceIds: Object.freeze(input.evidence.map((item) => item.evidenceId)),
    reason: "All synthetic candidates were fully reviewed and none satisfied the acceptance gate.",
  });
}
