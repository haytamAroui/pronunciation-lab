import { fingerprint } from "../core/fingerprint.js";
import type { PronunciationCandidate } from "../core/model.js";
import { assertEligibleForCandidateGeneration } from "./eligibility.js";
import type {
  GovernedCandidatePlan,
  RendererEligibilityRecord,
  RendererIdentity,
  RenderingProfile,
  TargetRegistryRecord,
} from "./model.js";

function targetFingerprint(value: unknown): string {
  return fingerprint(value);
}

export function createGovernedCandidatePlan(input: {
  targetRecord: TargetRegistryRecord;
  renderingProfile: RenderingProfile;
  eligibility: RendererEligibilityRecord;
  candidate: PronunciationCandidate;
  renderer: RendererIdentity;
}): GovernedCandidatePlan {
  if (input.targetRecord.approval.status !== "native_reviewed") {
    throw new Error("Candidate generation requires a native-reviewed target registry record");
  }
  if (input.renderingProfile.locale !== input.targetRecord.target.locale) {
    throw new Error("Rendering profile locale does not match target locale");
  }
  if (input.eligibility.locale !== input.targetRecord.target.locale) {
    throw new Error("Renderer eligibility locale does not match target locale");
  }
  if (input.eligibility.targetClass !== input.renderingProfile.targetClass) {
    throw new Error("Renderer eligibility target class does not match rendering profile");
  }

  assertEligibleForCandidateGeneration(input.eligibility);

  if (targetFingerprint(input.candidate.target) !== targetFingerprint(input.targetRecord.target)) {
    throw new Error("Candidate target does not match the versioned target registry record");
  }
  if (
    input.renderer.rendererId !== input.eligibility.renderer.rendererId ||
    input.renderer.rendererVersion !== input.eligibility.renderer.rendererVersion ||
    input.renderer.kind !== input.eligibility.renderer.kind
  ) {
    throw new Error("Renderer identity does not match the eligibility record");
  }

  const candidateControlMode =
    input.candidate.renderer.kind === "human"
      ? "human_recording"
      : input.candidate.renderer.pronunciation.mode;
  if (candidateControlMode !== input.eligibility.controlMode) {
    throw new Error("Candidate control mode is not covered by the eligibility record");
  }

  if (input.candidate.renderer.kind !== input.renderer.kind) {
    throw new Error("Candidate renderer kind does not match renderer identity");
  }
  if (
    input.candidate.renderer.kind === "tts" &&
    input.candidate.renderer.provider !== input.renderer.rendererId
  ) {
    throw new Error("TTS candidate provider does not match renderer identity");
  }

  const planFingerprint = fingerprint({
    targetId: input.targetRecord.target.targetId,
    targetRegistryVersion: input.targetRecord.registryVersion,
    renderingProfileId: input.renderingProfile.profileId,
    renderingProfileVersion: input.renderingProfile.version,
    renderer: input.renderer,
    eligibilityId: input.eligibility.eligibilityId,
    candidateId: input.candidate.candidateId,
    candidateFingerprint: input.candidate.candidateFingerprint,
  });

  return Object.freeze({
    schemaVersion: "1.0.0",
    planId: `governed-plan:${planFingerprint.slice("sha256:".length)}`,
    planFingerprint,
    targetId: input.targetRecord.target.targetId,
    targetRegistryVersion: input.targetRecord.registryVersion,
    renderingProfileId: input.renderingProfile.profileId,
    renderingProfileVersion: input.renderingProfile.version,
    renderer: Object.freeze({ ...input.renderer }),
    eligibilityId: input.eligibility.eligibilityId,
    candidateId: input.candidate.candidateId,
    candidateFingerprint: input.candidate.candidateFingerprint,
    authority: "experiment_only",
  });
}
