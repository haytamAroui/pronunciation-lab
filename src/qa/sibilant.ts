import type { RenderArtifact } from "../core/model.js";
import { createAcousticQaResult } from "../governance/qa.js";
import type { AcousticQaResult } from "../governance/model.js";
import { downmixToMono, type DecodedPcmAudio } from "./pcm.js";

export interface SInitialEvidencePolicy {
  algorithmVersion: string;
  minimumSampleRateHz: number;
  minimumDurationMs: number;
  analysisWindowMs: number;
  frameSizeSamples: number;
  hopSizeSamples: number;
  activeRmsThreshold: number;
  minimumCentroidHz: number;
  minimumHighBandRatio: number;
  highBandStartHz: number;
  minimumZeroCrossingRate: number;
  minimumPositiveFrames: number;
  minimumConsecutivePositiveFrames: number;
}

export const DEFAULT_S_INITIAL_EVIDENCE_POLICY: SInitialEvidencePolicy = Object.freeze({
  algorithmVersion: "s-initial-spectral-evidence/1.0.0",
  minimumSampleRateHz: 16_000,
  minimumDurationMs: 120,
  analysisWindowMs: 300,
  frameSizeSamples: 256,
  hopSizeSamples: 128,
  activeRmsThreshold: 0.008,
  minimumCentroidHz: 3_500,
  minimumHighBandRatio: 0.42,
  highBandStartHz: 4_000,
  minimumZeroCrossingRate: 0.12,
  minimumPositiveFrames: 3,
  minimumConsecutivePositiveFrames: 2,
});

export interface SibilantFrameEvidence {
  startMs: number;
  endMs: number;
  rms: number;
  zeroCrossingRate: number;
  spectralCentroidHz: number;
  highBandRatio: number;
  supportsSibilantHypothesis: boolean;
}

export interface SInitialEvidenceObservation {
  algorithmVersion: string;
  searchStartMs: number;
  searchEndMs: number;
  estimatedSegmentStartMs?: number;
  estimatedSegmentEndMs?: number;
  positiveFrameCount: number;
  maxConsecutivePositiveFrames: number;
  frames: readonly SibilantFrameEvidence[];
}

export interface SInitialEvidenceAnalysis {
  result: AcousticQaResult;
  observation: SInitialEvidenceObservation;
}

function frameRms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (const sample of frame) sum += sample * sample;
  return Math.sqrt(sum / frame.length);
}

function zeroCrossingRate(frame: Float32Array): number {
  if (frame.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < frame.length; i += 1) {
    const previous = frame[i - 1] ?? 0;
    const current = frame[i] ?? 0;
    if ((previous < 0 && current >= 0) || (previous >= 0 && current < 0)) crossings += 1;
  }
  return crossings / (frame.length - 1);
}

function hamming(index: number, length: number): number {
  if (length <= 1) return 1;
  return 0.54 - 0.46 * Math.cos((2 * Math.PI * index) / (length - 1));
}

function spectralEvidence(input: {
  frame: Float32Array;
  sampleRateHz: number;
  highBandStartHz: number;
}): { centroidHz: number; highBandRatio: number } {
  const n = input.frame.length;
  const maxBin = Math.floor(n / 2);
  let weightedFrequency = 0;
  let magnitudeSum = 0;
  let powerSum = 0;
  let highBandPower = 0;

  for (let bin = 1; bin <= maxBin; bin += 1) {
    let real = 0;
    let imaginary = 0;
    for (let i = 0; i < n; i += 1) {
      const sample = (input.frame[i] ?? 0) * hamming(i, n);
      const angle = (-2 * Math.PI * bin * i) / n;
      real += sample * Math.cos(angle);
      imaginary += sample * Math.sin(angle);
    }
    const magnitude = Math.hypot(real, imaginary);
    const power = magnitude * magnitude;
    const frequency = (bin * input.sampleRateHz) / n;
    weightedFrequency += frequency * magnitude;
    magnitudeSum += magnitude;
    powerSum += power;
    if (frequency >= input.highBandStartHz) highBandPower += power;
  }

  return {
    centroidHz: magnitudeSum === 0 ? 0 : weightedFrequency / magnitudeSum,
    highBandRatio: powerSum === 0 ? 0 : highBandPower / powerSum,
  };
}

function consecutiveMaximum(values: readonly boolean[]): number {
  let best = 0;
  let current = 0;
  for (const value of values) {
    current = value ? current + 1 : 0;
    if (current > best) best = current;
  }
  return best;
}

function emptyObservation(
  policy: SInitialEvidencePolicy,
  searchStartMs = 0,
  searchEndMs = 0,
): SInitialEvidenceObservation {
  return Object.freeze({
    algorithmVersion: policy.algorithmVersion,
    searchStartMs,
    searchEndMs,
    positiveFrameCount: 0,
    maxConsecutivePositiveFrames: 0,
    frames: Object.freeze([]),
  });
}

export function analyzeSInitialEvidence(input: {
  artifact: Pick<RenderArtifact, "artifactId">;
  audio: DecodedPcmAudio;
  checkedAt: string;
  policy?: SInitialEvidencePolicy;
}): SInitialEvidenceAnalysis {
  const policy = input.policy ?? DEFAULT_S_INITIAL_EVIDENCE_POLICY;

  if (input.audio.sampleRateHz < policy.minimumSampleRateHz) {
    return Object.freeze({
      result: createAcousticQaResult({
        artifactId: input.artifact.artifactId,
        status: "abstain",
        reason: "sample_rate_below_sibilant_analysis_minimum",
        flags: ["INSUFFICIENT_SAMPLE_RATE"],
        checkedAt: input.checkedAt,
      }),
      observation: emptyObservation(policy),
    });
  }
  if (input.audio.durationMs < policy.minimumDurationMs) {
    return Object.freeze({
      result: createAcousticQaResult({
        artifactId: input.artifact.artifactId,
        status: "abstain",
        reason: "audio_too_short_for_s_initial_analysis",
        flags: ["INSUFFICIENT_DURATION"],
        checkedAt: input.checkedAt,
      }),
      observation: emptyObservation(policy),
    });
  }
  if (policy.frameSizeSamples < 32 || policy.hopSizeSamples < 1) {
    throw new Error("Invalid s-initial acoustic policy frame configuration");
  }

  const mono = downmixToMono(input.audio);
  const frameSize = policy.frameSizeSamples;
  const hop = policy.hopSizeSamples;

  let firstActiveStart: number | null = null;
  for (let start = 0; start + frameSize <= mono.length; start += hop) {
    const frame = mono.slice(start, start + frameSize);
    if (frameRms(frame) >= policy.activeRmsThreshold) {
      firstActiveStart = start;
      break;
    }
  }

  if (firstActiveStart === null) {
    return Object.freeze({
      result: createAcousticQaResult({
        artifactId: input.artifact.artifactId,
        status: "abstain",
        reason: "no_reliably_active_onset_region",
        flags: ["NO_ACTIVE_ONSET"],
        checkedAt: input.checkedAt,
      }),
      observation: emptyObservation(policy),
    });
  }

  const analysisSamples = Math.round((policy.analysisWindowMs / 1000) * input.audio.sampleRateHz);
  const searchEndSample = Math.min(mono.length, firstActiveStart + analysisSamples);
  const frames: SibilantFrameEvidence[] = [];

  for (
    let start = firstActiveStart;
    start + frameSize <= searchEndSample;
    start += hop
  ) {
    const frame = mono.slice(start, start + frameSize);
    const rms = frameRms(frame);
    const zcr = zeroCrossingRate(frame);
    const spectral = spectralEvidence({
      frame,
      sampleRateHz: input.audio.sampleRateHz,
      highBandStartHz: policy.highBandStartHz,
    });
    const supports =
      rms >= policy.activeRmsThreshold &&
      zcr >= policy.minimumZeroCrossingRate &&
      spectral.centroidHz >= policy.minimumCentroidHz &&
      spectral.highBandRatio >= policy.minimumHighBandRatio;

    frames.push(
      Object.freeze({
        startMs: (start / input.audio.sampleRateHz) * 1000,
        endMs: ((start + frameSize) / input.audio.sampleRateHz) * 1000,
        rms,
        zeroCrossingRate: zcr,
        spectralCentroidHz: spectral.centroidHz,
        highBandRatio: spectral.highBandRatio,
        supportsSibilantHypothesis: supports,
      }),
    );
  }

  if (frames.length < policy.minimumPositiveFrames) {
    return Object.freeze({
      result: createAcousticQaResult({
        artifactId: input.artifact.artifactId,
        status: "abstain",
        reason: "insufficient_analyzable_frames",
        flags: ["INSUFFICIENT_FRAMES"],
        checkedAt: input.checkedAt,
      }),
      observation: Object.freeze({
        ...emptyObservation(
          policy,
          (firstActiveStart / input.audio.sampleRateHz) * 1000,
          (searchEndSample / input.audio.sampleRateHz) * 1000,
        ),
        frames: Object.freeze(frames),
      }),
    });
  }

  const positives = frames.map((frame) => frame.supportsSibilantHypothesis);
  const positiveFrameCount = positives.filter(Boolean).length;
  const maxConsecutivePositiveFrames = consecutiveMaximum(positives);
  const positiveFrames = frames.filter((frame) => frame.supportsSibilantHypothesis);

  const enoughEvidence =
    positiveFrameCount >= policy.minimumPositiveFrames &&
    maxConsecutivePositiveFrames >= policy.minimumConsecutivePositiveFrames;

  const observationBase = {
    algorithmVersion: policy.algorithmVersion,
    searchStartMs: (firstActiveStart / input.audio.sampleRateHz) * 1000,
    searchEndMs: (searchEndSample / input.audio.sampleRateHz) * 1000,
    positiveFrameCount,
    maxConsecutivePositiveFrames,
    frames: Object.freeze(frames),
  };

  if (!enoughEvidence) {
    return Object.freeze({
      result: createAcousticQaResult({
        artifactId: input.artifact.artifactId,
        status: "flagged",
        reason: "expected_s_initial_evidence_not_located_with_configured_thresholds",
        flags: ["S_INITIAL_EVIDENCE_WEAK"],
        checkedAt: input.checkedAt,
      }),
      observation: Object.freeze(observationBase),
    });
  }

  const firstPositive = positiveFrames[0]!;
  const lastPositive = positiveFrames[positiveFrames.length - 1]!;
  const meanCentroid =
    positiveFrames.reduce((sum, frame) => sum + frame.spectralCentroidHz, 0) /
    positiveFrames.length;
  const meanHighBandRatio =
    positiveFrames.reduce((sum, frame) => sum + frame.highBandRatio, 0) /
    positiveFrames.length;
  const meanZcr =
    positiveFrames.reduce((sum, frame) => sum + frame.zeroCrossingRate, 0) /
    positiveFrames.length;

  const frameSupport = Math.min(
    1,
    positiveFrameCount / Math.max(policy.minimumPositiveFrames * 2, 1),
  );
  const centroidSupport = Math.min(1, meanCentroid / (policy.minimumCentroidHz * 1.5));
  const highBandSupport = Math.min(
    1,
    meanHighBandRatio / Math.min(1, policy.minimumHighBandRatio * 1.5),
  );
  const zcrSupport = Math.min(1, meanZcr / Math.min(1, policy.minimumZeroCrossingRate * 2));
  const confidence =
    Math.round(
      ((frameSupport + centroidSupport + highBandSupport + zcrSupport) / 4) * 1000,
    ) / 1000;

  return Object.freeze({
    result: createAcousticQaResult({
      artifactId: input.artifact.artifactId,
      status: "target_likely_located",
      confidence,
      flags: [],
      checkedAt: input.checkedAt,
    }),
    observation: Object.freeze({
      ...observationBase,
      estimatedSegmentStartMs: firstPositive.startMs,
      estimatedSegmentEndMs: lastPositive.endMs,
    }),
  });
}
