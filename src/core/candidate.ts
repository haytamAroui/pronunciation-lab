import { fingerprint } from "./fingerprint.js";
import type {
  CanonicalPronunciationTarget,
  PronunciationCandidate,
  RendererSpec,
} from "./model.js";

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}

export function validateCanonicalTarget(target: CanonicalPronunciationTarget): readonly string[] {
  const issues: string[] = [];
  if (!target.targetId.trim()) issues.push("TARGET_ID_MISSING");
  if (!target.locale.trim()) issues.push("TARGET_LOCALE_MISSING");
  if (!target.text.normalize("NFC").trim()) issues.push("TARGET_TEXT_MISSING");
  if (target.canonicalIpa !== null && !target.canonicalIpa.trim()) {
    issues.push("TARGET_CANONICAL_IPA_EMPTY");
  }
  return Object.freeze(issues);
}

export function validateRenderer(renderer: RendererSpec): readonly string[] {
  const issues: string[] = [];
  if (renderer.kind === "human") {
    if (!renderer.recordingRef.trim()) issues.push("HUMAN_RECORDING_REF_MISSING");
    if (!renderer.speakerRef.trim()) issues.push("HUMAN_SPEAKER_REF_MISSING");
    if (!renderer.speakerLocale.trim()) issues.push("HUMAN_SPEAKER_LOCALE_MISSING");
    return Object.freeze(issues);
  }

  if (!renderer.provider.trim()) issues.push("PROVIDER_MISSING");
  if (!renderer.voiceId.trim()) issues.push("VOICE_ID_MISSING");
  if (!Number.isFinite(renderer.ratePercent)) issues.push("RATE_INVALID");
  if (!Number.isFinite(renderer.pitchPercent)) issues.push("PITCH_INVALID");

  const pronunciation = renderer.pronunciation;
  if (
    (pronunciation.mode === "canonical_ipa" || pronunciation.mode === "reviewed_provider_mapping") &&
    !pronunciation.phoneString.trim()
  ) {
    issues.push("PHONE_STRING_MISSING");
  }
  if (pronunciation.mode === "reviewed_provider_mapping" && !pronunciation.evidenceRef?.trim()) {
    issues.push("REVIEWED_MAPPING_EVIDENCE_MISSING");
  }
  if (pronunciation.mode === "provider_lexicon" && !pronunciation.lexiconRef.trim()) {
    issues.push("LEXICON_REF_MISSING");
  }
  return Object.freeze(issues);
}

export function buildCandidate(input: {
  target: CanonicalPronunciationTarget;
  renderer: RendererSpec;
}): PronunciationCandidate {
  const targetIssues = validateCanonicalTarget(input.target);
  const rendererIssues = validateRenderer(input.renderer);
  const issues = [...targetIssues, ...rendererIssues];
  if (issues.length > 0) throw new Error(`Invalid pronunciation candidate: ${issues.join(",")}`);

  assertNonEmpty(input.target.targetId, "targetId");
  const candidateFingerprint = fingerprint({
    schemaVersion: "1.0.0",
    target: input.target,
    renderer: input.renderer,
  });

  return Object.freeze({
    schemaVersion: "1.0.0",
    candidateId: `candidate:${candidateFingerprint.slice("sha256:".length)}`,
    candidateFingerprint,
    target: Object.freeze({ ...input.target, metadata: Object.freeze({ ...input.target.metadata }) }),
    renderer: Object.freeze({ ...input.renderer }) as RendererSpec,
    authority: "experiment_only",
  });
}
