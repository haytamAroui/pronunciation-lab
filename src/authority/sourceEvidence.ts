import { fingerprint } from "../core/fingerprint.js";

export type PronunciationSourceType =
  | "official"
  | "dictionary"
  | "linguistic_reference"
  | "corpus"
  | "native_reviewer"
  | "community_usage"
  | "other";

export type SourceEvidenceStrength = "direct" | "strong" | "moderate" | "weak" | "unknown";

export interface PronunciationSourceEvidence {
  schemaVersion: "1.0.0";
  evidenceId: string;
  evidenceFingerprint: string;
  sourceType: PronunciationSourceType;
  sourceRef: string;
  sourceLabel?: string;
  locale: string;
  text: string;
  readingIpa: string;
  strength: SourceEvidenceStrength;
  observedAt: string;
  notes?: string;
  authority: "source_evidence_only";
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}

function timestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
}

function evidencePayload(input: {
  sourceType: PronunciationSourceType;
  sourceRef: string;
  sourceLabel?: string;
  locale: string;
  text: string;
  readingIpa: string;
  strength: SourceEvidenceStrength;
  observedAt: string;
  notes?: string;
}): unknown {
  return {
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    sourceLabel: input.sourceLabel ?? null,
    locale: input.locale,
    text: input.text,
    readingIpa: input.readingIpa,
    strength: input.strength,
    observedAt: input.observedAt,
    notes: input.notes ?? null,
  };
}

export function createPronunciationSourceEvidence(input: {
  sourceType: PronunciationSourceType;
  sourceRef: string;
  sourceLabel?: string;
  locale: string;
  text: string;
  readingIpa: string;
  strength: SourceEvidenceStrength;
  observedAt: string;
  notes?: string;
}): PronunciationSourceEvidence {
  required(input.sourceRef, "sourceRef");
  required(input.locale, "locale");
  required(input.text, "text");
  required(input.readingIpa, "readingIpa");
  timestamp(input.observedAt, "observedAt");
  if (input.sourceLabel !== undefined) required(input.sourceLabel, "sourceLabel");
  if (input.notes !== undefined) required(input.notes, "notes");

  const evidenceFingerprint = fingerprint(evidencePayload(input));
  return Object.freeze({
    schemaVersion: "1.0.0",
    evidenceId: `pronunciation-source:${evidenceFingerprint.slice("sha256:".length)}`,
    evidenceFingerprint,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    ...(input.sourceLabel !== undefined ? { sourceLabel: input.sourceLabel } : {}),
    locale: input.locale,
    text: input.text,
    readingIpa: input.readingIpa,
    strength: input.strength,
    observedAt: input.observedAt,
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    authority: "source_evidence_only",
  });
}

export function verifyPronunciationSourceEvidence(
  evidence: PronunciationSourceEvidence,
): readonly string[] {
  const issues: string[] = [];
  if (evidence.schemaVersion !== "1.0.0") issues.push("SCHEMA_VERSION_UNSUPPORTED");
  if (!evidence.sourceRef.trim()) issues.push("SOURCE_REF_MISSING");
  if (!evidence.locale.trim()) issues.push("LOCALE_MISSING");
  if (!evidence.text.trim()) issues.push("TEXT_MISSING");
  if (!evidence.readingIpa.trim()) issues.push("READING_IPA_MISSING");
  if (!Number.isFinite(Date.parse(evidence.observedAt))) issues.push("OBSERVED_AT_INVALID");

  const expected = fingerprint(evidencePayload(evidence));
  if (expected !== evidence.evidenceFingerprint) issues.push("EVIDENCE_FINGERPRINT_MISMATCH");
  const expectedId = `pronunciation-source:${expected.slice("sha256:".length)}`;
  if (expectedId !== evidence.evidenceId) issues.push("EVIDENCE_ID_MISMATCH");

  return Object.freeze(issues);
}
