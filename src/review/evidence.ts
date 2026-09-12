export type ReviewDimension =
  | "linguistic_correctness"
  | "target_clarity"
  | "naturalness"
  | "task_suitability"
  | "custom";

export type ReviewDecision = "pass" | "fail" | "abstain";

export interface CandidateReviewEvidence {
  schemaVersion: "1.0.0";
  evidenceId: string;
  sessionId: string;
  blindLabel: string;
  reviewerId: string;
  reviewerRole: string;
  reviewedAt: string;
  dimensions: readonly {
    dimension: ReviewDimension;
    score?: number;
    decision?: ReviewDecision;
    note?: string;
  }[];
  criticalFlags: readonly string[];
  overallDecision: ReviewDecision;
}

export function validateReviewEvidence(evidence: CandidateReviewEvidence): readonly string[] {
  const issues: string[] = [];
  if (!evidence.evidenceId.trim()) issues.push("EVIDENCE_ID_MISSING");
  if (!evidence.sessionId.trim()) issues.push("SESSION_ID_MISSING");
  if (!evidence.blindLabel.trim()) issues.push("BLIND_LABEL_MISSING");
  if (!evidence.reviewerId.trim()) issues.push("REVIEWER_ID_MISSING");
  if (!evidence.reviewerRole.trim()) issues.push("REVIEWER_ROLE_MISSING");
  if (!Number.isFinite(Date.parse(evidence.reviewedAt))) issues.push("REVIEWED_AT_INVALID");
  if (evidence.dimensions.length === 0) issues.push("DIMENSIONS_EMPTY");

  for (const dimension of evidence.dimensions) {
    if (dimension.score !== undefined && (!Number.isFinite(dimension.score) || dimension.score < 1 || dimension.score > 5)) {
      issues.push("DIMENSION_SCORE_OUT_OF_RANGE");
    }
    if (dimension.score === undefined && dimension.decision === undefined) {
      issues.push("DIMENSION_REQUIRES_SCORE_OR_DECISION");
    }
  }
  if (evidence.criticalFlags.length > 0 && evidence.overallDecision === "pass") {
    issues.push("CRITICAL_FLAG_CANNOT_PASS");
  }
  return Object.freeze(issues);
}
