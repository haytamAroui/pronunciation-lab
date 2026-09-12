import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMicrosoftComparisonMatrix,
  createBlindSession,
  selectCandidate,
  type CandidateReviewEvidence,
  type CanonicalPronunciationTarget,
} from "../src/index.js";

const target: CanonicalPronunciationTarget = Object.freeze({
  targetId: "test:nl-BE:sok",
  locale: "nl-BE",
  text: "sok",
  canonicalIpa: "/sɔk/",
  role: "pronunciation_reference",
  metadata: Object.freeze({}),
});

function evidence(
  sessionId: string,
  blindLabel: string,
  reviewerRole: string,
  overallDecision: "pass" | "fail" | "abstain",
  suffix: string,
): CandidateReviewEvidence {
  return Object.freeze({
    schemaVersion: "1.0.0",
    evidenceId: `evidence:${suffix}`,
    sessionId,
    blindLabel,
    reviewerId: `reviewer:${reviewerRole}:${suffix}`,
    reviewerRole,
    reviewedAt: "2026-09-13T00:00:00.000Z",
    dimensions: Object.freeze([
      Object.freeze({ dimension: "linguistic_correctness" as const, score: overallDecision === "pass" ? 5 : 2 }),
    ]),
    criticalFlags: Object.freeze([]),
    overallDecision,
  });
}

describe("comparison and review policy", () => {
  it("builds Edge default + Azure default + three Azure IPA candidates", () => {
    const candidates = buildMicrosoftComparisonMatrix(target, {
      edgeVoiceId: "nl-BE-DenaNeural",
      azureVoiceId: "nl-BE-DenaNeural",
    });
    assert.equal(candidates.length, 5);
    assert.equal(
      candidates.filter((item) => item.renderer.kind === "tts" && item.renderer.provider === "edge_tts").length,
      1,
    );
    assert.equal(
      candidates.filter(
        (item) => item.renderer.kind === "tts" && item.renderer.pronunciation.mode === "canonical_ipa",
      ).length,
      3,
    );
  });

  it("returns human_recording_required when every synthetic candidate is fully reviewed and fails", () => {
    const candidates = buildMicrosoftComparisonMatrix(target, {
      edgeVoiceId: "nl-BE-DenaNeural",
      azureVoiceId: "nl-BE-DenaNeural",
      rates: [0],
    });
    const session = createBlindSession({
      sessionId: "session:all-fail",
      createdAt: "2026-09-13T00:00:00.000Z",
      targetId: target.targetId,
      candidateIds: candidates.map((item) => item.candidateId),
    });
    const reviews = session.assignments.flatMap((assignment, index) => [
      evidence(session.sessionId, assignment.blindLabel, "native_linguistic", "fail", `native-${index}`),
      evidence(session.sessionId, assignment.blindLabel, "clinical", "fail", `clinical-${index}`),
    ]);
    assert.equal(selectCandidate({ session, evidence: reviews }).disposition, "human_recording_required");
  });

  it("does not force a winner when two candidates pass", () => {
    const candidates = buildMicrosoftComparisonMatrix(target, {
      edgeVoiceId: "nl-BE-DenaNeural",
      azureVoiceId: "nl-BE-DenaNeural",
      rates: [],
    });
    const session = createBlindSession({
      sessionId: "session:tie",
      createdAt: "2026-09-13T00:00:00.000Z",
      targetId: target.targetId,
      candidateIds: candidates.map((item) => item.candidateId),
    });
    const reviews = session.assignments.flatMap((assignment, index) => [
      evidence(session.sessionId, assignment.blindLabel, "native_linguistic", "pass", `native-${index}`),
      evidence(session.sessionId, assignment.blindLabel, "clinical", "pass", `clinical-${index}`),
    ]);
    assert.equal(selectCandidate({ session, evidence: reviews }).disposition, "insufficient_evidence");
  });
});
