import type { RenderArtifact } from "../core/model.js";
import { createTechnicalQaResult } from "../governance/qa.js";
import type { TechnicalQaResult } from "../governance/model.js";
import type { DecodedPcmAudio } from "./pcm.js";

export interface TechnicalAudioPolicy {
  minSampleRateHz: number;
  maxSampleRateHz: number;
  maxChannels: number;
  minDurationMs: number;
  maxDurationMs: number;
  minRms: number;
  maxAbsoluteDcOffset: number;
  clippingThreshold: number;
  maxClippedSampleRatio: number;
  maxBoundaryAmplitude: number;
}

export const DEFAULT_TECHNICAL_AUDIO_POLICY: TechnicalAudioPolicy = Object.freeze({
  minSampleRateHz: 16_000,
  maxSampleRateHz: 96_000,
  maxChannels: 2,
  minDurationMs: 100,
  maxDurationMs: 15_000,
  minRms: 0.002,
  maxAbsoluteDcOffset: 0.1,
  clippingThreshold: 0.999,
  maxClippedSampleRatio: 0.001,
  maxBoundaryAmplitude: 0.98,
});

export interface TechnicalAudioMetrics {
  peakAbsoluteAmplitude: number;
  rms: number;
  dcOffset: number;
  clippedSampleRatio: number;
  firstSampleAbsoluteAmplitude: number;
  lastSampleAbsoluteAmplitude: number;
}

export interface TechnicalAudioAnalysis {
  result: TechnicalQaResult;
  metrics: TechnicalAudioMetrics;
}

function metrics(audio: DecodedPcmAudio, clippingThreshold: number): TechnicalAudioMetrics {
  if (audio.samples.length === 0) {
    return Object.freeze({
      peakAbsoluteAmplitude: 0,
      rms: 0,
      dcOffset: 0,
      clippedSampleRatio: 0,
      firstSampleAbsoluteAmplitude: 0,
      lastSampleAbsoluteAmplitude: 0,
    });
  }

  let peak = 0;
  let sum = 0;
  let sumSquares = 0;
  let clipped = 0;

  for (const sample of audio.samples) {
    const absolute = Math.abs(sample);
    if (absolute > peak) peak = absolute;
    if (absolute >= clippingThreshold) clipped += 1;
    sum += sample;
    sumSquares += sample * sample;
  }

  return Object.freeze({
    peakAbsoluteAmplitude: peak,
    rms: Math.sqrt(sumSquares / audio.samples.length),
    dcOffset: sum / audio.samples.length,
    clippedSampleRatio: clipped / audio.samples.length,
    firstSampleAbsoluteAmplitude: Math.abs(audio.samples[0] ?? 0),
    lastSampleAbsoluteAmplitude: Math.abs(audio.samples[audio.samples.length - 1] ?? 0),
  });
}

export function analyzeTechnicalAudio(input: {
  artifact: Pick<RenderArtifact, "artifactId">;
  audio: DecodedPcmAudio;
  checkedAt: string;
  policy?: TechnicalAudioPolicy;
}): TechnicalAudioAnalysis {
  const policy = input.policy ?? DEFAULT_TECHNICAL_AUDIO_POLICY;
  const observed = metrics(input.audio, policy.clippingThreshold);
  const finite = [...input.audio.samples].every(Number.isFinite);

  const checks = [
    {
      name: "pcm_non_empty",
      passed: input.audio.frames > 0,
      detail: `frames=${input.audio.frames}`,
    },
    {
      name: "finite_samples",
      passed: finite,
    },
    {
      name: "sample_rate_supported",
      passed:
        input.audio.sampleRateHz >= policy.minSampleRateHz &&
        input.audio.sampleRateHz <= policy.maxSampleRateHz,
      detail: `sampleRateHz=${input.audio.sampleRateHz}`,
    },
    {
      name: "channel_count_supported",
      passed: input.audio.channels >= 1 && input.audio.channels <= policy.maxChannels,
      detail: `channels=${input.audio.channels}`,
    },
    {
      name: "duration_in_range",
      passed:
        input.audio.durationMs >= policy.minDurationMs &&
        input.audio.durationMs <= policy.maxDurationMs,
      detail: `durationMs=${input.audio.durationMs.toFixed(2)}`,
    },
    {
      name: "not_effectively_silent",
      passed: observed.rms >= policy.minRms,
      detail: `rms=${observed.rms.toFixed(6)}`,
    },
    {
      name: "dc_offset_in_range",
      passed: Math.abs(observed.dcOffset) <= policy.maxAbsoluteDcOffset,
      detail: `dcOffset=${observed.dcOffset.toFixed(6)}`,
    },
    {
      name: "clipping_in_range",
      passed: observed.clippedSampleRatio <= policy.maxClippedSampleRatio,
      detail: `clippedSampleRatio=${observed.clippedSampleRatio.toFixed(6)}`,
    },
    {
      name: "no_hard_boundary_cut",
      passed:
        observed.firstSampleAbsoluteAmplitude <= policy.maxBoundaryAmplitude &&
        observed.lastSampleAbsoluteAmplitude <= policy.maxBoundaryAmplitude,
      detail:
        `first=${observed.firstSampleAbsoluteAmplitude.toFixed(6)};` +
        `last=${observed.lastSampleAbsoluteAmplitude.toFixed(6)}`,
    },
  ] as const;

  return Object.freeze({
    result: createTechnicalQaResult({
      artifactId: input.artifact.artifactId,
      checks,
      checkedAt: input.checkedAt,
    }),
    metrics: observed,
  });
}
