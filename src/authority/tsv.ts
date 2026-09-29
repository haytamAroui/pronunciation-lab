import {
  createPronunciationSourceEvidence,
  type PronunciationSourceEvidence,
  type PronunciationSourceType,
  type SourceEvidenceStrength,
} from "./sourceEvidence.js";

const SOURCE_TYPES = new Set<PronunciationSourceType>([
  "official",
  "dictionary",
  "linguistic_reference",
  "corpus",
  "native_reviewer",
  "community_usage",
  "other",
]);

const STRENGTHS = new Set<SourceEvidenceStrength>([
  "direct",
  "strong",
  "moderate",
  "weak",
  "unknown",
]);

const HEADER = [
  "locale",
  "text",
  "ipa",
  "source_type",
  "source_ref",
  "source_label",
  "strength",
  "observed_at",
  "notes",
].join("\t");

function cleanField(value: string, label: string): string {
  if (value.includes("\t") || value.includes("\n") || value.includes("\r")) {
    throw new Error(`${label} cannot contain tabs or newlines`);
  }
  return value;
}

export function parsePronunciationSourceEvidenceTsv(
  content: string,
): readonly PronunciationSourceEvidence[] {
  const lines = content.split(/\r?\n/u);
  const output: PronunciationSourceEvidence[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]!;
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    if (raw === HEADER) continue;

    const columns = raw.split("\t");
    if (columns.length !== 9) {
      throw new Error(`TSV line ${index + 1} must contain exactly 9 columns`);
    }
    const [
      locale,
      text,
      ipa,
      sourceTypeRaw,
      sourceRef,
      sourceLabel,
      strengthRaw,
      observedAt,
      notes,
    ] = columns as [string, string, string, string, string, string, string, string, string];

    if (!SOURCE_TYPES.has(sourceTypeRaw as PronunciationSourceType)) {
      throw new Error(`TSV line ${index + 1} has unsupported source_type ${sourceTypeRaw}`);
    }
    if (!STRENGTHS.has(strengthRaw as SourceEvidenceStrength)) {
      throw new Error(`TSV line ${index + 1} has unsupported strength ${strengthRaw}`);
    }

    output.push(
      createPronunciationSourceEvidence({
        sourceType: sourceTypeRaw as PronunciationSourceType,
        sourceRef,
        ...(sourceLabel ? { sourceLabel } : {}),
        locale,
        text,
        readingIpa: ipa,
        strength: strengthRaw as SourceEvidenceStrength,
        observedAt,
        ...(notes ? { notes } : {}),
      }),
    );
  }

  return Object.freeze(output);
}

export function serializePronunciationSourceEvidenceTsv(
  evidence: readonly PronunciationSourceEvidence[],
): string {
  const rows = evidence.map((item) =>
    [
      cleanField(item.locale, "locale"),
      cleanField(item.text, "text"),
      cleanField(item.readingIpa, "ipa"),
      cleanField(item.sourceType, "source_type"),
      cleanField(item.sourceRef, "source_ref"),
      cleanField(item.sourceLabel ?? "", "source_label"),
      cleanField(item.strength, "strength"),
      cleanField(item.observedAt, "observed_at"),
      cleanField(item.notes ?? "", "notes"),
    ].join("\t"),
  );
  return `${HEADER}\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
}
