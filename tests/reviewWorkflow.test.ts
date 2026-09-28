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
  it("does not expose provider, voice, rate, candidate ID, acoustic QA, or ASR in the blind packet", () => {
    const { packet } = fixture("native_linguistic");
    const json = JSON.stringify(packet);

    assert.doesNotMatch(json, /azure_speech/u);
    assert.doesNotMatch(json, /DenaNeural/u);
    assert.doesNotMatch(json, /ratePercent/u);
    assert.doesNotMatch(json, /candidate:/u);
    assert.doesNotMatch(json, /acoustic/u);
    assert.doesNotMatch(json, /ASR|asr/u);
    assert.match(json, /playback:opaque-001/u);
    assert.match(json, /initial · onset/u);
  });

  it("captures a strict native-linguistic pass only when every mandatory answer supports pass", () => {
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

    assert.throws(
      () =>
        submitNativeLinguisticReview({
          packet,
          blindLabel,
          reviewerId: "reviewer:native-002",
          reviewedAt: "2026-09-28T18:06:00.000Z",
          submission: {
            correctTarget: "yes",
            naturalLocale: "yes",
            distorted: "yes",
            overArticulated: "no",
            overallDecision: "pass",
          },
        }),
      /mandatory answers/u,
    );
  });

  it("keeps clinical suitability separate from linguistic validity", () => {
    const { packet } = fixture("clinical");
    const blindLabel = packet.items[0]!.blindLabel;

    const evidence = submitClinicalSuitabilityReview({
      packet,
      blindLabel,
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
    assert.ok(evidence.dimensions.some((dimension) => dimension.dimension === "task_suitability"));
  });

  it("requires a structured rejection reason for failed review", () => {
    const { packet } = fixture("clinical");
    const blindLabel = packet.items[0]!.blindLabel;

    assert.throws(
      () =>
        submitClinicalSuitabilityReview({
          packet,
          blindLabel,
          reviewerId: "reviewer:slp-002",
          reviewedAt: "2026-09-28T18:08:00.000Z",
          submission: {
            goodModelForImitation: "no",
            targetSufficientlySalient: "yes",
            rateAppropriate: "yes",
            naturalNotExaggerated: "yes",
            comfortableToModelToChild: "no",
            overallDecision: "fail",
          },
        }),
      /structured rejection reason/u,
    );
  });

  it("reveals provider/configuration and machine QA only after evidence has been submitted", () => {
    const { candidate, artifact, session, packet, technicalQa, acousticQa } = fixture("native_linguistic");
    const blindLabel = packet.items[0]!.blindLabel;
    const evidence = submitNativeLinguisticReview({
      packet,
      blindLabel,
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

    const reveal = revealPostReviewAnalysis({
      session,
      evidence,
      candidate,
      artifact,
      technicalQa,
      acousticQa,
    });

    assert.equal(reveal.candidate.candidateId, candidate.candidateId);
    assert.equal(reveal.acousticQa.status, "target_likely_located");
    assert.equal(
      reveal.candidate.renderer.kind === "tts" ? reveal.candidate.renderer.provider : null,
      "azure_speech",
    );
  });
});
