import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertRenderArtifactIntegrity,
  buildCandidate,
  buildRenderArtifact,
  verifyRenderArtifact,
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

describe("candidate identity", () => {
  it("is stable for equal rendering specifications and changes with material settings", () => {
    const make = (ratePercent: number) =>
      buildCandidate({
        target,
        renderer: {
          kind: "tts",
          provider: "azure_speech",
          voiceId: "nl-BE-DenaNeural",
          pronunciation: { mode: "canonical_ipa", alphabet: "ipa", phoneString: "sɔk" },
          ratePercent,
          pitchPercent: 0,
        },
      });

    assert.equal(make(-8).candidateId, make(-8).candidateId);
    assert.notEqual(make(-8).candidateId, make(-15).candidateId);
  });

  it("binds artifact hash and candidate identity and re-verifies them", () => {
    const candidate = buildCandidate({
      target,
      renderer: {
        kind: "tts",
        provider: "edge_tts",
        voiceId: "nl-BE-DenaNeural",
        pronunciation: { mode: "provider_default" },
        ratePercent: 0,
        pitchPercent: 0,
      },
    });
    const bytes = new Uint8Array([1, 2, 3]);
    const artifact = buildRenderArtifact({
      candidate,
      bytes,
      mediaType: "audio/mpeg",
      createdAt: "2026-09-13T00:00:00.000Z",
    });
    assert.equal(artifact.candidateId, candidate.candidateId);
    assert.match(artifact.audioSha256, /^sha256:[0-9a-f]{64}$/u);
    assert.deepEqual(verifyRenderArtifact({ artifact, candidate, bytes }), []);
    assert.doesNotThrow(() => assertRenderArtifactIntegrity({ artifact, candidate, bytes }));
  });

  it("detects changed audio bytes during artifact verification", () => {
    const candidate = buildCandidate({
      target,
      renderer: {
        kind: "tts",
        provider: "edge_tts",
        voiceId: "nl-BE-DenaNeural",
        pronunciation: { mode: "provider_default" },
        ratePercent: 0,
        pitchPercent: 0,
      },
    });
    const artifact = buildRenderArtifact({
      candidate,
      bytes: new Uint8Array([1, 2, 3]),
      mediaType: "audio/mpeg",
      createdAt: "2026-09-13T00:00:00.000Z",
    });
    const issues = verifyRenderArtifact({ artifact, candidate, bytes: new Uint8Array([1, 2, 4]) });
    assert.ok(issues.includes("ARTIFACT_AUDIO_SHA256_MISMATCH"));
    assert.ok(issues.includes("ARTIFACT_ID_MISMATCH"));
  });
});
