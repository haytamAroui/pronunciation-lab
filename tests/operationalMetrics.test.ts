import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendRejection,
  appendRelease,
  createAcousticQaResult,
  createOperationalMetricsSnapshot,
  createTechnicalQaResult,
  serializeOperationalMetricsSnapshot,
  verifyOperationalMetricsSnapshot,
  type CandidateReviewEvidence,
  type HumanRecordingEscalation,
  type ReleasedReference,
  type SelectionObservation,
} from "../src/index.js";

function review(
  id: string,
  role: "native_linguistic" | "clinical",
  decision: "pass" | "fail" | "abstain",
  reviewedAt: string,
): CandidateReviewEvidence {
  return Object.freeze({
    schemaVersion: "1.0.0",
    evidenceId: id,
    sessionId: "session:metrics",
    blindLabel: "A",
    reviewerId: `reviewer:${id}`,
    reviewerRole: role,
    reviewedAt,
    dimensions: Object.freeze([
      Object.freeze({
        dimension: role === "native_linguistic"
          ? "linguistic_correctness" as const
          : "task_suitability" as const,
        decision,
      }),
    ]),
    criticalFlags: Object.freeze(decision === "fail" ? ["rejected"] : []),
    overallDecision: decision,
  });
}

const release: ReleasedReference = Object.freeze({
  schemaVersion: "1.0.0",
  releaseId: "release:metrics",
  targetId: "nl-BE:s_initial:sok",
  targetRegistryVersion: "1.0.0",
  artifactId: "artifact:released",
  audioSha256: `sha256:${"a".repeat(64)}`,
  candidateId: "candidate:released",
  renderingProfileId: "profile:s",
  renderingProfileVersion: "1.0.0",
  rendererIdentity: "azure_speech",
  rendererVersion: "azure:test",
  linguisticReviewEvidenceIds: Object.freeze(["evidence:native-pass"]),
  clinicalReviewEvidenceIds: Object.freeze(["evidence:clinical-pass"]),
  technicalQaId: "technical-qa:released",
  acousticQaId: "acoustic-qa:released",
  acousticQaStatus: "target_likely_located",
  releasedAt: "2026-09-29T00:20:00.000Z",
  releaseManifestFingerprint: `sha256:${"b".repeat(64)}`,
  status: "active",
  authority: "human_approved_release",
});

const selectionObservations: readonly SelectionObservation[] = Object.freeze([
  Object.freeze({
    observationId: "selection:1",
    targetId: "nl-BE:s_initial:sok",
    sessionId: "session:preferred",
    decidedAt: "2026-09-29T00:10:00.000Z",
    result: Object.freeze({
      disposition: "preferred_candidate" as const,
      candidateId: "candidate:1",
      evidenceIds: Object.freeze(["evidence:1"]),
      reason: "passed",
    }),
  }),
  Object.freeze({
    observationId: "selection:2",
    targetId: "nl-BE:s_initial:sap",
    sessionId: "session:human",
    decidedAt: "2026-09-29T00:11:00.000Z",
    result: Object.freeze({
      disposition: "human_recording_required" as const,
      candidateId: null,
      evidenceIds: Object.freeze(["evidence:2"]),
      reason: "all synthetic candidates failed",
    }),
  }),
  Object.freeze({
    observationId: "selection:3",
    targetId: "nl-BE:s_initial:soep",
    sessionId: "session:insufficient",
    decidedAt: "2026-09-29T00:12:00.000Z",
    result: Object.freeze({
      disposition: "insufficient_evidence" as const,
      candidateId: null,
      evidenceIds: Object.freeze([]),
      reason: "review pending",
    }),
  }),
]);

const escalation: HumanRecordingEscalation = Object.freeze({
  schemaVersion: "1.0.0",
  escalationId: "human-escalation:metrics",
  targetId: "nl-BE:s_initial:sap",
  sourceSessionId: "session:human",
  syntheticCandidateIds: Object.freeze(["candidate:a", "candidate:b"]),
  evidenceIds: Object.freeze(["evidence:2"]),
  reason: "all synthetic candidates failed",
  requestedAt: "2026-09-29T00:13:00.000Z",
  authority: "workflow_escalation_only",
});

describe("operational metrics", () => {
  it("derives every rate from an explicit source population", () => {
    const technicalQaResults = [
      createTechnicalQaResult({
        artifactId: "artifact:t1",
        checks: [{ name: "decode", passed: true }],
        checkedAt: "2026-09-29T00:01:00.000Z",
      }),
      createTechnicalQaResult({
        artifactId: "artifact:t2",
        checks: [{ name: "decode", passed: false }],
        checkedAt: "2026-09-29T00:02:00.000Z",
      }),
    ];
    const acousticQaResults = [
      createAcousticQaResult({
        artifactId: "artifact:a1",
        status: "target_likely_located",
        confidence: 0.9,
        checkedAt: "2026-09-29T00:03:00.000Z",
      }),
      createAcousticQaResult({
        artifactId: "artifact:a2",
        status: "flagged",
        reason: "weak evidence",
        checkedAt: "2026-09-29T00:04:00.000Z",
      }),
      createAcousticQaResult({
        artifactId: "artifact:a3",
        status: "abstain",
        reason: "insufficient signal",
        checkedAt: "2026-09-29T00:05:00.000Z",
      }),
    ];
    const humanReviewEvidence = [
      review("evidence:native-pass", "native_linguistic", "pass", "2026-09-29T00:06:00.000Z"),
      review("evidence:native-fail", "native_linguistic", "fail", "2026-09-29T00:07:00.000Z"),
      review("evidence:clinical-pass", "clinical", "pass", "2026-09-29T00:08:00.000Z"),
      review("evidence:clinical-abstain", "clinical", "abstain", "2026-09-29T00:09:00.000Z"),
    ];

    const releaseLedger = appendRelease({ ledger: [], release });
    const rejectionLedger = appendRejection({
      ledger: [],
      source: "native_linguistic",
      targetId: "nl-BE:s_initial:sok",
      artifactId: "artifact:t2",
      reason: "phoneme_realization_error",
      evidenceRefs: ["evidence:native-fail"],
      occurredAt: "2026-09-29T00:15:00.000Z",
    });

    const snapshot = createOperationalMetricsSnapshot({
      generatedAt: "2026-09-29T00:30:00.000Z",
      technicalQaResults,
      acousticQaResults,
      humanReviewEvidence,
      selectionObservations,
      humanRecordingEscalations: [escalation],
      releaseLedger,
      rejectionLedger,
    });

    assert.equal(snapshot.technicalQa.rejectionRate.value, 0.5);
    assert.equal(snapshot.acousticQa.flagRate.value, 1 / 3);
    assert.equal(snapshot.acousticQa.abstainRate.value, 1 / 3);
    assert.equal(snapshot.humanReviews.nativeLinguistic.rejectionRate.value, 0.5);
    assert.equal(snapshot.humanReviews.clinical.rejectionRate.value, 0);
    assert.equal(snapshot.humanReviews.clinical.abstainRate.value, 0.5);
    assert.equal(snapshot.selections.humanRecordingEscalationRate.value, 1 / 3);
    assert.equal(snapshot.humanRecording.materializedRequiredSelections, 1);
    assert.equal(snapshot.humanRecording.unmaterializedRequiredSelections, 0);
    assert.equal(snapshot.releases.currentlyActiveReleases, 1);
    assert.equal(snapshot.rejections.bySource.native_linguistic, 1);
    assert.deepEqual(verifyOperationalMetricsSnapshot(snapshot), []);
  });

  it("uses null instead of inventing a percentage when a denominator is zero", () => {
    const snapshot = createOperationalMetricsSnapshot({
      generatedAt: "2026-09-29T00:30:00.000Z",
      technicalQaResults: [],
      acousticQaResults: [],
      humanReviewEvidence: [],
      selectionObservations: [],
      humanRecordingEscalations: [],
      releaseLedger: [],
      rejectionLedger: [],
    });

    assert.equal(snapshot.technicalQa.rejectionRate.value, null);
    assert.equal(snapshot.acousticQa.flagRate.value, null);
    assert.equal(snapshot.humanReviews.nativeLinguistic.rejectionRate.value, null);
    assert.equal(snapshot.selections.humanRecordingEscalationRate.value, null);
  });

  it("supports a reproducible time window and canonical serialization", () => {
    const technicalQaResults = [
      createTechnicalQaResult({
        artifactId: "artifact:before",
        checks: [{ name: "decode", passed: false }],
        checkedAt: "2026-09-28T23:59:59.000Z",
      }),
      createTechnicalQaResult({
        artifactId: "artifact:inside",
        checks: [{ name: "decode", passed: true }],
        checkedAt: "2026-09-29T00:05:00.000Z",
      }),
    ];

    const snapshot = createOperationalMetricsSnapshot({
      generatedAt: "2026-09-29T01:00:00.000Z",
      window: {
        startInclusive: "2026-09-29T00:00:00.000Z",
        endExclusive: "2026-09-29T01:00:00.000Z",
      },
      technicalQaResults,
      acousticQaResults: [],
      humanReviewEvidence: [],
      selectionObservations: [],
      humanRecordingEscalations: [],
      releaseLedger: [],
      rejectionLedger: [],
    });

    assert.equal(snapshot.technicalQa.total, 1);
    assert.equal(snapshot.technicalQa.fail, 0);
    assert.equal(serializeOperationalMetricsSnapshot(snapshot).endsWith("\n"), true);
  });

  it("rejects duplicate source identities rather than inflating counters", () => {
    const qa = createTechnicalQaResult({
      artifactId: "artifact:dup",
      checks: [{ name: "decode", passed: true }],
      checkedAt: "2026-09-29T00:01:00.000Z",
    });

    assert.throws(
      () =>
        createOperationalMetricsSnapshot({
          generatedAt: "2026-09-29T00:30:00.000Z",
          technicalQaResults: [qa, qa],
          acousticQaResults: [],
          humanReviewEvidence: [],
          selectionObservations: [],
          humanRecordingEscalations: [],
          releaseLedger: [],
          rejectionLedger: [],
        }),
      /duplicate identity/u,
    );
  });
});
