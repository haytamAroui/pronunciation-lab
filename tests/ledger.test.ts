import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeReleasesFromLedger,
  appendRejection,
  appendRelease,
  hasActiveReleaseForArtifactInLedger,
  retireRelease,
  verifyRejectionLedger,
  verifyReleaseLedger,
  type ReleasedReference,
} from "../src/index.js";

const release: ReleasedReference = Object.freeze({
  schemaVersion: "1.0.0",
  releaseId: "release:test",
  targetId: "test:nl-BE:sok",
  targetRegistryVersion: "1.0.0",
  artifactId: "artifact:test",
  audioSha256: `sha256:${"a".repeat(64)}`,
  candidateId: "candidate:test",
  renderingProfileId: "profile:test",
  renderingProfileVersion: "1.0.0",
  rendererIdentity: "edge_tts",
  rendererVersion: "edge-tts:test",
  linguisticReviewEvidenceIds: Object.freeze(["evidence:linguistic"]),
  clinicalReviewEvidenceIds: Object.freeze(["evidence:clinical"]),
  technicalQaId: "technical-qa:test",
  acousticQaId: "acoustic-qa:test",
  acousticQaStatus: "abstain",
  releasedAt: "2026-09-28T18:00:00.000Z",
  releaseManifestFingerprint: `sha256:${"b".repeat(64)}`,
  status: "active",
  authority: "human_approved_release",
});

describe("append-only ledgers", () => {
  it("hash-chains release and retirement events without mutating history", () => {
    const first = appendRelease({ ledger: [], release });
    const second = retireRelease({
      ledger: first,
      releaseId: release.releaseId,
      reason: "superseded by a newly reviewed artifact",
      evidenceRefs: ["review:replacement"],
      occurredAt: "2026-09-28T19:00:00.000Z",
    });

    assert.equal(first.length, 1);
    assert.equal(second.length, 2);
    assert.equal(second[1]!.previousEventFingerprint, second[0]!.eventFingerprint);
    assert.deepEqual(verifyReleaseLedger(second), []);
    assert.deepEqual(activeReleasesFromLedger(second), []);
    assert.equal(
      hasActiveReleaseForArtifactInLedger({
        artifact: { artifactId: release.artifactId, audioSha256: release.audioSha256 },
        ledger: second,
      }),
      false,
    );
  });

  it("rejects duplicate release IDs and duplicate retirement events", () => {
    const ledger = appendRelease({ ledger: [], release });
    assert.throws(() => appendRelease({ ledger, release }), /already exists/u);

    const retired = retireRelease({
      ledger,
      releaseId: release.releaseId,
      reason: "replacement",
      occurredAt: "2026-09-28T19:00:00.000Z",
    });
    assert.throws(
      () =>
        retireRelease({
          ledger: retired,
          releaseId: release.releaseId,
          reason: "again",
          occurredAt: "2026-09-28T19:01:00.000Z",
        }),
      /already retired/u,
    );
  });

  it("records rejection ownership deterministically in a tamper-evident chain", () => {
    const first = appendRejection({
      ledger: [],
      source: "native_linguistic",
      targetId: "test:nl-BE:sok",
      candidateId: "candidate:test",
      artifactId: "artifact:test",
      reason: "phoneme_realization_error",
      evidenceRefs: ["evidence:native"],
      occurredAt: "2026-09-28T18:30:00.000Z",
    });
    const second = appendRejection({
      ledger: first,
      source: "clinical",
      targetId: "test:nl-BE:sok",
      candidateId: "candidate:test",
      artifactId: "artifact:test",
      reason: "rate_unsuitable",
      evidenceRefs: ["evidence:clinical"],
      occurredAt: "2026-09-28T18:31:00.000Z",
    });

    assert.equal(second[0]!.owner, "rerender_or_change_renderer");
    assert.equal(second[1]!.owner, "rendering_profile");
    assert.equal(second[1]!.previousEventFingerprint, second[0]!.eventFingerprint);
    assert.deepEqual(verifyRejectionLedger(second), []);
  });

  it("detects tampering in a release ledger snapshot", () => {
    const ledger = appendRelease({ ledger: [], release });
    const tampered = [
      {
        ...ledger[0]!,
        occurredAt: "2026-09-29T00:00:00.000Z",
      },
    ];
    assert.ok(
      verifyReleaseLedger(tampered).some((issue) => issue.startsWith("EVENT_FINGERPRINT_MISMATCH")),
    );
  });
});
