import { createHash } from "node:crypto";
import type {
  AuthoredSyllableStructure,
  CanonicalPronunciationTargetDraft,
  PracticeIntentUnit,
  ReviewedArticulationProfile,
  SpeechPracticeIntent,
  SyllableCountClass,
  SyllableCoverage,
} from "./model.js";

function id(prefix: string, value: unknown): string {
  const digest = createHash("sha256").update(JSON.stringify(value)).digest("hex");
  return `${prefix}:${digest}`;
}

function nonEmpty(value: string, label: string): void {
  if (!value.normalize("NFC").trim()) throw new Error(`${label} is required`);
}

export function classifySyllableCount(count: number): SyllableCountClass {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("syllable count must be a positive integer");
  }
  if (count === 1) return "monosyllable";
  if (count === 2) return "disyllable";
  if (count === 3) return "trisyllable";
  return "polysyllable";
}

function normalizeSyllableStructure(
  structure: AuthoredSyllableStructure,
): AuthoredSyllableStructure {
  const syllableClass = classifySyllableCount(structure.count);
  void syllableClass;

  if (structure.syllables) {
    if (structure.syllables.length !== structure.count) {
      throw new Error("SYLLABLE_SEGMENT_COUNT_MISMATCH");
    }
    for (const syllable of structure.syllables) {
      nonEmpty(syllable, "syllable");
    }
  }

  if (
    structure.stressSyllableIndex !== undefined &&
    structure.stressSyllableIndex !== null &&
    (!Number.isInteger(structure.stressSyllableIndex) ||
      structure.stressSyllableIndex < 0 ||
      structure.stressSyllableIndex >= structure.count)
  ) {
    throw new Error("STRESS_SYLLABLE_INDEX_OUT_OF_RANGE");
  }

  return Object.freeze({
    count: structure.count,
    ...(structure.syllables
      ? { syllables: Object.freeze(structure.syllables.map((value) => value.normalize("NFC").trim())) }
      : {}),
    ...(structure.stressSyllableIndex !== undefined
      ? { stressSyllableIndex: structure.stressSyllableIndex }
      : {}),
  });
}

function validateUnit(unit: PracticeIntentUnit, profile: ReviewedArticulationProfile): void {
  nonEmpty(unit.unitId, "unitId");
  nonEmpty(unit.displayText, "displayText");
  nonEmpty(unit.ipa, "ipa");
  if (!Number.isInteger(unit.repetitions) || unit.repetitions < 1 || unit.repetitions > 12) {
    throw new Error("repetitions must be an integer between 1 and 12");
  }
  if (!Number.isInteger(unit.pauseMs) || unit.pauseMs < 0 || unit.pauseMs > 10_000) {
    throw new Error("pauseMs must be an integer between 0 and 10000");
  }
  if (unit.action === "sustain" && profile.continuity !== "sustainable") {
    throw new Error(`SUSTAIN_NOT_ALLOWED_FOR_PROFILE:${profile.profileId}`);
  }
  if (unit.action === "lexical" && !unit.syllableStructure) {
    throw new Error(`LEXICAL_UNIT_REQUIRES_AUTHORED_SYLLABLE_STRUCTURE:${unit.unitId}`);
  }
  if (unit.syllableStructure) normalizeSyllableStructure(unit.syllableStructure);
}

export function createReviewedArticulationProfile(
  input: Omit<ReviewedArticulationProfile, "schemaVersion" | "profileId" | "authority"> & {
    profileId?: string;
  },
): ReviewedArticulationProfile {
  nonEmpty(input.locale, "locale");
  nonEmpty(input.targetPhone, "targetPhone");
  nonEmpty(input.targetClass, "targetClass");
  if (!Number.isFinite(Date.parse(input.review.reviewedAt))) {
    throw new Error("reviewedAt must be an ISO timestamp");
  }
  if (input.review.evidenceRefs.length === 0) {
    throw new Error("Reviewed articulation profile requires review evidence");
  }
  if (input.cueEvidenceRefs.length === 0) {
    throw new Error("Reviewed articulation profile requires cue evidence references");
  }

  const payload = {
    locale: input.locale,
    targetPhone: input.targetPhone,
    targetClass: input.targetClass,
    manner: input.manner,
    continuity: input.continuity,
    cueEvidenceRefs: [...input.cueEvidenceRefs],
    review: {
      status: "reviewed" as const,
      evidenceRefs: [...input.review.evidenceRefs],
      reviewedAt: input.review.reviewedAt,
    },
  };

  return Object.freeze({
    schemaVersion: "1.0.0",
    profileId: input.profileId ?? id("articulation-profile", payload),
    ...payload,
    cueEvidenceRefs: Object.freeze(payload.cueEvidenceRefs),
    review: Object.freeze({
      ...payload.review,
      evidenceRefs: Object.freeze(payload.review.evidenceRefs),
    }),
    authority: "reviewed_practice_profile",
  });
}

export function createSpeechPracticeIntent(input: {
  profile: ReviewedArticulationProfile;
  units: readonly PracticeIntentUnit[];
}): SpeechPracticeIntent {
  if (input.units.length === 0) throw new Error("Practice intent requires at least one unit");
  const seen = new Set<string>();
  const units = input.units.map((unit) => {
    validateUnit(unit, input.profile);
    if (seen.has(unit.unitId)) throw new Error(`Duplicate unitId ${unit.unitId}`);
    seen.add(unit.unitId);
    return Object.freeze({
      ...unit,
      displayText: unit.displayText.normalize("NFC"),
      ipa: unit.ipa.trim(),
      ...(unit.syllableStructure
        ? { syllableStructure: normalizeSyllableStructure(unit.syllableStructure) }
        : {}),
      ...(unit.metadata ? { metadata: Object.freeze({ ...unit.metadata }) } : {}),
    });
  });

  const payload = {
    locale: input.profile.locale,
    targetPhone: input.profile.targetPhone,
    profileId: input.profile.profileId,
    units: units.map((unit) => ({
      unitId: unit.unitId,
      action: unit.action,
      displayText: unit.displayText,
      ipa: unit.ipa,
      repetitions: unit.repetitions,
      pauseMs: unit.pauseMs,
      syllableStructure: unit.syllableStructure ?? null,
      metadata: unit.metadata ?? null,
    })),
  };

  return Object.freeze({
    schemaVersion: "1.0.0",
    intentId: id("speech-practice-intent", payload),
    locale: input.profile.locale,
    targetPhone: input.profile.targetPhone,
    profileId: input.profile.profileId,
    units: Object.freeze(units),
    authority: "authored_practice_intent",
  });
}

export function summarizeLexicalSyllableCoverage(
  intent: SpeechPracticeIntent,
): Readonly<SyllableCoverage> {
  const coverage: SyllableCoverage = {
    monosyllable: 0,
    disyllable: 0,
    trisyllable: 0,
    polysyllable: 0,
  };

  for (const unit of intent.units) {
    if (unit.action !== "lexical") continue;
    if (!unit.syllableStructure) {
      throw new Error(`LEXICAL_UNIT_REQUIRES_AUTHORED_SYLLABLE_STRUCTURE:${unit.unitId}`);
    }
    coverage[classifySyllableCount(unit.syllableStructure.count)] += 1;
  }

  return Object.freeze({ ...coverage });
}

export function emitCanonicalPronunciationTargetDrafts(input: {
  profile: ReviewedArticulationProfile;
  intent: SpeechPracticeIntent;
}): readonly CanonicalPronunciationTargetDraft[] {
  if (input.intent.profileId !== input.profile.profileId) {
    throw new Error("Practice intent/profile mismatch");
  }
  if (input.intent.locale !== input.profile.locale || input.intent.targetPhone !== input.profile.targetPhone) {
    throw new Error("Practice intent target mismatch");
  }

  return Object.freeze(
    input.intent.units.map((unit) => {
      const syllableCount = unit.syllableStructure?.count ?? null;
      const syllableClass =
        unit.syllableStructure !== undefined
          ? classifySyllableCount(unit.syllableStructure.count)
          : null;
      const stressSyllableIndex =
        unit.syllableStructure?.stressSyllableIndex ?? null;

      return Object.freeze({
        targetId: `practice:${input.intent.intentId}:${unit.unitId}`,
        locale: input.intent.locale,
        text: unit.displayText,
        canonicalIpa: unit.ipa,
        role: "pronunciation_reference" as const,
        metadata: Object.freeze({
          practiceIntentId: input.intent.intentId,
          articulationProfileId: input.profile.profileId,
          targetPhone: input.profile.targetPhone,
          targetClass: input.profile.targetClass,
          motorAction: unit.action,
          repetitions: unit.repetitions,
          pauseMs: unit.pauseMs,
          syllableCount,
          syllableClass,
          stressSyllableIndex,
          practiceAuthority: "draft_requires_pronunciation_lab_review",
        }),
      });
    }),
  );
}
