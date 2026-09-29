import { createHash } from "node:crypto";
import type {
  CanonicalPronunciationTargetDraft,
  PracticeIntentUnit,
  ReviewedArticulationProfile,
  SpeechPracticeIntent,
} from "./model.js";

function id(prefix: string, value: unknown): string {
  const digest = createHash("sha256").update(JSON.stringify(value)).digest("hex");
  return `${prefix}:${digest}`;
}

function nonEmpty(value: string, label: string): void {
  if (!value.normalize("NFC").trim()) throw new Error(`${label} is required`);
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
    input.intent.units.map((unit) =>
      Object.freeze({
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
          practiceAuthority: "draft_requires_pronunciation_lab_review",
        }),
      }),
    ),
  );
}
