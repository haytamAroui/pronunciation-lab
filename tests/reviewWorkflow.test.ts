import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCandidate,
  buildRenderArtifact,
  createAcousticQaResult,
  createBlindReviewPacket,
  createBlindSession,
  createTechnicalQaResult,
  revealPostReviewAnalysis,
  submitClinicalSuitabilityReview,
  submitNativeLinguisticReview,
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

function fixture(role: "native_linguistic" | "clinical") {
  const candidate = buildCandidate({
    target,
    renderer: {
      kind: "tts",
      provider: "azure_speech",
      voiceId: "nl-BE-DenaNeural",
      pronunciation: { mode: "canonical_ipa", alphabet: "ipa", phoneString: "sɔk" },
      ratePercent: -8,
      pitchPercent: 0,
    },
  });
  const artifact = buildRenderArtifact({
    candidate,
    bytes: new Uint8Array([1, 2, 3]),
    mediaType: "audio/mpeg",
    createdAt: "2026-09-28T18:00:00.000Z",
  });
  const session = createBlindSession({
    sessionId: `session:${role}`,
    createdAt: "2026-09-28T18:01:00.000Z",
    targetId: target.targetId,
    candidateIds: [candidate.candidateId],
  });
  const packet = createBlindReviewPacket({
    session,
    reviewerRole: role,
    target,
    cue: { targetSymbol: "/s/", positionLabel: "initial · onset" },
    bindings: [
      {
        candidateId: candidate.candidateId,
        artifactId: artifact.artifactId,
        audioSha256: artifact.audioSha256,
        playbackRef: "playback:opaque-001",
      },
    ],
  });
  const technicalQa = createTechnicalQaResult({
    artifactId: artifact.artifactId,
    checkedAt: "2026-09-28T18:02:00.000Z",
    checks: [{ name: "decode", passed: true }],
  });
  const acousticQa = createAcousticQaResult({
    artifactId: artifact.artifactId,
    status: "target_likely_located",
    confidence: 0.91,
    checkedAt: "2026-09-28T18:03:00.000Z",
  });
  return { candidate, artifact, session, packet, technicalQa, acousticQa };
}

describe("blind reviewer workflow", () => {
  it("keeps provider/configuration and exact artifact identity hidden in the review packet", () => {
    const { packet, artifact } = fixture("native_linguistic");
    const json = JSON.stringify(packet);

    assert.doesNotMatch(json, /azure_speech/u);
    assert.doesNotMatch(json, /DenaNeural/u);
    assert.doesNotMatch(json, /ratePercent/u);
    assert.doesNotMatch(json, /candidate:/u);
    assert.equal(json.includes(artifact.artifactId), false);
    assert.equal(json.includes(artifact.audioSha256), false);
    assert.doesNotMatch(json, /acoustic/u);
    assert.doesNotMatch(json, /ASR|asr/u);
    assert.match(json, /playback:opaque-001/u);
    assert.match(json, /reviewBindingFingerprint/u);
  });

  it("captures a strict native-linguistic pass bound to the exact artifact", () => {
    const { packet } = fixture("native_linguistic");
    const blindLabel = packet.items[0]!.blindLabel;
    const evidence = submitNativeLinguisticReview({
      packet,
      blindLabel,
      reviewerId: "reviewer:native-001",
      reviewedAt: "2026-09-28T18:05:00.000Z",
      submission: {
        correctTarget: "yes",
        naturalLocale: "yes",
        distorted: "no",
        overArticulated: "no",
        overallDecision: "pass",
      },
    });

    assert.equal(evidence.reviewerRole, "native_linguistic");
    assert.equal(evidence.overallDecision, "pass");
    assert.equal(evidence.artifactBindingFingerprint, packet.items[0]!.reviewBindingFingerprint);
  });

  it("keeps clinical suitability separate from linguistic validity", () => {
    const { packet } = fixture("clinical");
    const evidence = submitClinicalSuitabilityReview({
      packet,
      blindLabel: packet.items[0]!.blindLabel,
      reviewerId: "reviewer:slp-001",
      reviewedAt: "2026-09-28T18:07:00.000Z",
      submission: {
        goodModelForImitation: "yes",
        targetSufficientlySalient: "yes",
        rateAppropriate: "yes",
        naturalNotExaggerated: "yes",
        comfortableToModelToChild: "yes",
        overallDecision: "pass",
      },
    });

    assert.equal(evidence.reviewerRole, "clinical");
    assert.equal(evidence.overallDecision, "pass");
  });

  it("rejects post-review reveal for different bytes from the same candidate", () => {
    const { candidate, artifact, session, packet, technicalQa, acousticQa } = fixture("native_linguistic");
    const evidence = submitNativeLinguisticReview({
      packet,
      blindLabel: packet.items[0]!.blindLabel,
      reviewerId: "reviewer:native-003",
      reviewedAt: "2026-09-28T18:09:00.000Z",
      submission: {
        correctTarget: "yes",
        naturalLocale: "yes",
        distorted: "no",
        overArticulated: "no",
        overallDecision: "pass",
      },
    });
    const differentArtifact = buildRenderArtifact({
      candidate,
      bytes: new Uint8Array([9, 9, 9]),
      mediaType: "audio/mpeg",
      createdAt: "2026-09-28T18:10:00.000Z",
    });

    assert.throws(
      () =>
        revealPostReviewAnalysis({
          session,
          evidence,
          candidate,
          artifact: differentArtifact,
          technicalQa: { ...technicalQa, artifactId: differentArtifact.artifactId },
          acousticQa: { ...acousticQa, artifactId: differentArtifact.artifactId },
        }),
      /does not bind to the supplied artifact bytes/u,
    );

    assert.equal(
      revealPostReviewAnalysis({
        session,
        evidence,
        candidate,
        artifact,
        technicalQa,
        acousticQa,
      }).artifact.artifactId,
      artifact.artifactId,
    );
  });
});
