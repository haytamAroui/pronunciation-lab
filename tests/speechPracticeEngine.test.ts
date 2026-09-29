import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AZURE_SPEECH_PRACTICE_CAPABILITIES,
  EDGE_SPEECH_PRACTICE_CAPABILITIES,
  LocalSpeechModelAdapter,
  bindSpeechPracticeProgramToRenderer,
  composeSpeechPracticePcmWav,
  createLocalSpeechPracticeCapabilities,
  createSpeechPracticeProgram,
  createStructuredRepetitionUnit,
  decodePcmWav,
} from "../src/index.js";

function pcm16Wav(samples: readonly number[], sampleRateHz = 1000): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) bytes[offset + i] = value.charCodeAt(i);
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRateHz, true);
  view.setUint32(28, sampleRateHz * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((value, i) => view.setInt16(44 + i * 2, value, true));
  return bytes;
}

const phonemeProgram = createSpeechPracticeProgram({
  locale: "nl-BE",
  targetPhone: "s",
  targetClass: "s_initial_singleton",
  audience: "child_imitation",
  units: [
    createStructuredRepetitionUnit({
      unitId: "isolated-s",
      kind: "phoneme",
      text: "s",
      ipa: "s",
      targetPhone: "s",
      targetPosition: "isolated",
      count: 3,
      interRepetitionPauseMs: 650,
      pauseBeforeMs: 300,
      pauseAfterMs: 400,
    }),
  ],
});

describe("speech-practice articulation engine", () => {
  it("models repeated phoneme practice as one controlled render reused on a timed sequence", () => {
    const plan = bindSpeechPracticeProgramToRenderer({
      program: phonemeProgram,
      capabilities: AZURE_SPEECH_PRACTICE_CAPABILITIES,
      binding: {
        providerId: "azure_speech",
        rendererVersion: "test",
        voiceId: "nl-BE-DenaNeural",
        outputFormat: "riff-24khz-16bit-mono-pcm",
      },
    });

    assert.equal(plan.requests.length, 1);
    assert.equal(plan.requests[0]!.input.mode, "ipa");
    assert.equal(plan.requests[0]!.candidate.renderer.kind, "tts");
    if (plan.requests[0]!.candidate.renderer.kind === "tts") {
      assert.equal(plan.requests[0]!.candidate.renderer.pronunciation.mode, "canonical_ipa");
    }

    const renders = plan.timeline.filter((event) => event.kind === "render");
    const silences = plan.timeline.filter((event) => event.kind === "silence");
    assert.equal(renders.length, 3);
    assert.equal(new Set(renders.map((event) => event.requestId)).size, 1);
    assert.deepEqual(
      silences.map((event) => event.durationMs),
      [300, 650, 650, 400],
    );
  });

  it("does not turn isolated phoneme practice into ordinary Edge text TTS", () => {
    assert.throws(
      () =>
        bindSpeechPracticeProgramToRenderer({
          program: phonemeProgram,
          capabilities: EDGE_SPEECH_PRACTICE_CAPABILITIES,
          binding: {
            providerId: "edge_tts",
            rendererVersion: "7.2.8",
            voiceId: "nl-BE-DenaNeural",
          },
        }),
      /UNIT_KIND_UNSUPPORTED|UNIT_REQUIRES_IPA_CONTROL/u,
    );
  });

  it("still allows Edge for natural word-level units", () => {
    const program = createSpeechPracticeProgram({
      locale: "nl-BE",
      targetPhone: "s",
      targetClass: "s_initial_singleton",
      audience: "child_imitation",
      units: [
        createStructuredRepetitionUnit({
          unitId: "word-sok",
          kind: "word",
          text: "sok",
          ipa: "sɔk",
          targetPhone: "s",
          targetPosition: "onset",
          count: 2,
          interRepetitionPauseMs: 700,
          controlRequirement: "provider_default_allowed",
          delivery: "natural",
          pace: "natural",
        }),
      ],
    });
    const plan = bindSpeechPracticeProgramToRenderer({
      program,
      capabilities: EDGE_SPEECH_PRACTICE_CAPABILITIES,
      binding: {
        providerId: "edge_tts",
        rendererVersion: "7.2.8",
        voiceId: "nl-BE-DenaNeural",
      },
    });

    assert.equal(plan.requests.length, 1);
    assert.equal(plan.requests[0]!.input.mode, "text");
  });

  it("can target a future local phonetic model without changing the practice program", () => {
    const capabilities = createLocalSpeechPracticeCapabilities({
      rendererId: "local_phonetic_model",
      rendererVersion: "0.1.0",
      supportsText: true,
      supportsIpa: true,
    });
    const plan = bindSpeechPracticeProgramToRenderer({
      program: phonemeProgram,
      capabilities,
      binding: {
        providerId: "local_phonetic_model",
        rendererVersion: "0.1.0",
        voiceId: "child-reference-a",
        outputFormat: "audio/wav",
      },
    });

    const adapter = new LocalSpeechModelAdapter({
      providerId: "local_phonetic_model",
      modelId: "local-model",
      modelVersion: "0.1.0",
      supportedOutputFormats: ["audio/wav"],
      supportsIpa: true,
      supportsText: true,
    });
    const request = plan.requests[0]!;
    const providerPlan = adapter.plan({
      target: request.candidate.target,
      candidate: request.candidate,
    });
    assert.equal(providerPlan.providerId, "local_phonetic_model");
    assert.equal(
      (providerPlan.payload as { input: { mode: string } }).input.mode,
      "ipa",
    );
  });

  it("composes exact repeated render units with explicit silence instead of re-synthesizing text", () => {
    const plan = bindSpeechPracticeProgramToRenderer({
      program: phonemeProgram,
      capabilities: AZURE_SPEECH_PRACTICE_CAPABILITIES,
      binding: {
        providerId: "azure_speech",
        rendererVersion: "test",
        voiceId: "nl-BE-DenaNeural",
        outputFormat: "riff-24khz-16bit-mono-pcm",
      },
    });
    const requestId = plan.requests[0]!.requestId;
    const source = pcm16Wav([1000, 2000, 3000, 4000], 1000);
    const composed = composeSpeechPracticePcmWav({
      plan,
      renderedWavByRequestId: new Map([[requestId, source]]),
    });
    const decoded = decodePcmWav(composed.bytes);

    assert.equal(composed.sampleRateHz, 1000);
    assert.equal(composed.eventBoundaries.filter((x) => x.kind === "render").length, 3);
    assert.equal(
      Math.round(composed.durationMs),
      300 + 4 + 650 + 4 + 650 + 4 + 400,
    );
    assert.equal(decoded.frames, Math.round(composed.durationMs));
  });
});
