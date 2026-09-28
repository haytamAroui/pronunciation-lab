import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeSInitialEvidence,
  analyzeTechnicalAudio,
  createDecodedPcmAudio,
  decodePcmWav,
} from "../src/index.js";

function encodePcm16Wav(input: {
  sampleRateHz: number;
  channels: number;
  samples: Float32Array;
}): Uint8Array {
  const dataLength = input.samples.length * 2;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) bytes[offset + i] = value.charCodeAt(i);
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, input.channels, true);
  view.setUint32(24, input.sampleRateHz, true);
  view.setUint32(28, input.sampleRateHz * input.channels * 2, true);
  view.setUint16(32, input.channels * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataLength, true);

  for (let i = 0; i < input.samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(0.999969, input.samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }
  return bytes;
}

function makeSInitialLikeAudio(sampleRateHz = 24_000): Float32Array {
  const durationSeconds = 0.55;
  const total = Math.floor(sampleRateHz * durationSeconds);
  const samples = new Float32Array(total);
  const silenceEnd = Math.floor(sampleRateHz * 0.04);
  const sEnd = Math.floor(sampleRateHz * 0.19);

  for (let i = silenceEnd; i < sEnd; i += 1) {
    const t = i / sampleRateHz;
    samples[i] =
      0.18 * Math.sin(2 * Math.PI * 5_500 * t) +
      0.12 * Math.sin(2 * Math.PI * 7_500 * t);
  }
  for (let i = sEnd; i < total - Math.floor(sampleRateHz * 0.03); i += 1) {
    const t = i / sampleRateHz;
    samples[i] = 0.2 * Math.sin(2 * Math.PI * 220 * t);
  }
  return samples;
}

function makeLowFrequencyOnset(sampleRateHz = 24_000): Float32Array {
  const total = Math.floor(sampleRateHz * 0.5);
  const samples = new Float32Array(total);
  const start = Math.floor(sampleRateHz * 0.04);
  for (let i = start; i < total - Math.floor(sampleRateHz * 0.03); i += 1) {
    const t = i / sampleRateHz;
    samples[i] = 0.2 * Math.sin(2 * Math.PI * 220 * t);
  }
  return samples;
}

describe("PCM/WAV technical QA", () => {
  it("decodes Azure-style 24 kHz 16-bit mono RIFF PCM and passes a clean fixture", () => {
    const source = makeSInitialLikeAudio();
    const wav = encodePcm16Wav({ sampleRateHz: 24_000, channels: 1, samples: source });
    const decoded = decodePcmWav(wav);

    assert.equal(decoded.sampleRateHz, 24_000);
    assert.equal(decoded.channels, 1);
    assert.equal(decoded.source.sampleFormat, "pcm_signed_16");

    const analysis = analyzeTechnicalAudio({
      artifact: { artifactId: "artifact:clean" },
      audio: decoded,
      checkedAt: "2026-09-28T20:00:00.000Z",
    });
    assert.equal(analysis.result.status, "pass");
    assert.ok(analysis.metrics.rms > 0);
    assert.equal(
      analysis.result.checks.find((check) => check.name === "clipping_in_range")?.passed,
      true,
    );
  });

  it("blocks a clipped decoded signal", () => {
    const samples = new Float32Array(24_000 * 0.3);
    samples.fill(1);
    const audio = createDecodedPcmAudio({ sampleRateHz: 24_000, channels: 1, samples });
    const analysis = analyzeTechnicalAudio({
      artifact: { artifactId: "artifact:clipped" },
      audio,
      checkedAt: "2026-09-28T20:00:00.000Z",
    });

    assert.equal(analysis.result.status, "fail");
    assert.equal(
      analysis.result.checks.find((check) => check.name === "clipping_in_range")?.passed,
      false,
    );
  });

  it("fails closed on non-WAV compressed bytes rather than pretending they were decoded", () => {
    assert.throws(
      () => decodePcmWav(new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0])),
      /WAV_TOO_SHORT|WAV_INVALID_RIFF_HEADER/u,
    );
  });
});

describe("advisory /s/-initial acoustic evidence", () => {
  it("locates strong high-frequency onset evidence without claiming pronunciation correctness", () => {
    const audio = createDecodedPcmAudio({
      sampleRateHz: 24_000,
      channels: 1,
      samples: makeSInitialLikeAudio(),
    });

    const analysis = analyzeSInitialEvidence({
      artifact: { artifactId: "artifact:s-like" },
      audio,
      checkedAt: "2026-09-28T20:01:00.000Z",
    });

    assert.equal(analysis.result.status, "target_likely_located");
    assert.ok((analysis.result.confidence ?? 0) > 0);
    assert.ok(analysis.observation.positiveFrameCount >= 3);
    assert.ok(analysis.observation.estimatedSegmentStartMs !== undefined);
  });

  it("flags an active low-frequency onset when configured sibilant evidence is weak", () => {
    const audio = createDecodedPcmAudio({
      sampleRateHz: 24_000,
      channels: 1,
      samples: makeLowFrequencyOnset(),
    });

    const analysis = analyzeSInitialEvidence({
      artifact: { artifactId: "artifact:low-frequency" },
      audio,
      checkedAt: "2026-09-28T20:01:00.000Z",
    });

    assert.equal(analysis.result.status, "flagged");
    assert.ok(analysis.result.flags.includes("S_INITIAL_EVIDENCE_WEAK"));
  });

  it("abstains when the recording has no reliably active onset region", () => {
    const audio = createDecodedPcmAudio({
      sampleRateHz: 24_000,
      channels: 1,
      samples: new Float32Array(24_000 * 0.4),
    });

    const analysis = analyzeSInitialEvidence({
      artifact: { artifactId: "artifact:silent" },
      audio,
      checkedAt: "2026-09-28T20:01:00.000Z",
    });

    assert.equal(analysis.result.status, "abstain");
    assert.equal(analysis.result.reason, "no_reliably_active_onset_region");
  });

  it("abstains at sample rates that cannot support the configured high-frequency evidence band", () => {
    const audio = createDecodedPcmAudio({
      sampleRateHz: 8_000,
      channels: 1,
      samples: new Float32Array(8_000 * 0.4).fill(0.1),
    });

    const analysis = analyzeSInitialEvidence({
      artifact: { artifactId: "artifact:8khz" },
      audio,
      checkedAt: "2026-09-28T20:01:00.000Z",
    });

    assert.equal(analysis.result.status, "abstain");
    assert.ok(analysis.result.flags.includes("INSUFFICIENT_SAMPLE_RATE"));
  });
});
