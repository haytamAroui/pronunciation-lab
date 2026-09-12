import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AzureSpeechAdapter,
  EdgeTtsAdapter,
  buildCandidate,
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

describe("provider capability boundaries", () => {
  it("plans Azure canonical IPA with prosody", () => {
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
    const plan = new AzureSpeechAdapter().plan({ target, candidate });
    assert.equal(plan.providerId, "azure_speech");
    assert.equal(plan.ratePercent, -8);
    assert.match(String(plan.payload), /<phoneme alphabet="ipa" ph="sɔk">sok<\/phoneme>/u);
  });

  it("accepts Edge provider-default rendering", () => {
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
    const plan = new EdgeTtsAdapter().plan({ target, candidate });
    assert.equal(plan.providerId, "edge_tts");
  });

  it("fails closed when Edge is asked to render IPA", () => {
    const candidate = buildCandidate({
      target,
      renderer: {
        kind: "tts",
        provider: "edge_tts",
        voiceId: "nl-BE-DenaNeural",
        pronunciation: { mode: "canonical_ipa", alphabet: "ipa", phoneString: "sɔk" },
        ratePercent: 0,
        pitchPercent: 0,
      },
    });
    assert.throws(
      () => new EdgeTtsAdapter().plan({ target, candidate }),
      /EDGE_PRONUNCIATION_OVERRIDE_UNSUPPORTED/u,
    );
  });
});
