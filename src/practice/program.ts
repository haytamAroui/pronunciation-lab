import { fingerprint } from "../core/fingerprint.js";
import type {
  SpeechPracticeProgram,
  SpeechPracticeRepetition,
  SpeechPracticeUnit,
} from "./model.js";

function requireNonEmpty(value: string, label: string): void {
  if (!value.normalize("NFC").trim()) throw new Error(`${label} is required`);
}

function validatePause(value: number | undefined, label: string): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`${label} must be an integer between 0 and 10000 ms`);
  }
}

function validateRepetition(repetition: SpeechPracticeRepetition): void {
  if (!Number.isInteger(repetition.count) || repetition.count < 1 || repetition.count > 12) {
    throw new Error("repetition.count must be an integer between 1 and 12");
  }
  if (
    !Number.isInteger(repetition.interRepetitionPauseMs) ||
    repetition.interRepetitionPauseMs < 0 ||
    repetition.interRepetitionPauseMs > 10_000
  ) {
    throw new Error("interRepetitionPauseMs must be an integer between 0 and 10000 ms");
  }
}

function normalizeUnit(unit: SpeechPracticeUnit): SpeechPracticeUnit {
  requireNonEmpty(unit.unitId, "unitId");
  requireNonEmpty(unit.text, "text");
  requireNonEmpty(unit.targetPhone, "targetPhone");
  if (unit.ipa !== null) requireNonEmpty(unit.ipa, "ipa");
  if (unit.kind === "phoneme" && unit.ipa === null) {
    throw new Error("phoneme practice units require explicit IPA");
  }
  if (unit.controlRequirement === "phonetic_control_required" && unit.ipa === null) {
    throw new Error("phonetic_control_required units require explicit IPA");
  }
  validateRepetition(unit.repetition);
  validatePause(unit.pauseBeforeMs, "pauseBeforeMs");
  validatePause(unit.pauseAfterMs, "pauseAfterMs");

  return Object.freeze({
    ...unit,
    text: unit.text.normalize("NFC"),
    ipa: unit.ipa?.trim() ?? null,
    targetPhone: unit.targetPhone.trim(),
    repetition: Object.freeze({ ...unit.repetition }),
    ...(unit.metadata ? { metadata: Object.freeze({ ...unit.metadata }) } : {}),
  });
}

export function createSpeechPracticeProgram(input: {
  locale: string;
  targetPhone: string;
  targetClass: string;
  audience: SpeechPracticeProgram["audience"];
  units: readonly SpeechPracticeUnit[];
}): SpeechPracticeProgram {
  requireNonEmpty(input.locale, "locale");
  requireNonEmpty(input.targetPhone, "targetPhone");
  requireNonEmpty(input.targetClass, "targetClass");
  if (input.units.length === 0) throw new Error("Speech practice program requires at least one unit");

  const ids = new Set<string>();
  const units = Object.freeze(
    input.units.map((unit) => {
      const normalized = normalizeUnit(unit);
      if (normalized.targetPhone !== input.targetPhone.trim()) {
        throw new Error(`Unit ${normalized.unitId} targetPhone does not match program targetPhone`);
      }
      if (ids.has(normalized.unitId)) throw new Error(`Duplicate unitId ${normalized.unitId}`);
      ids.add(normalized.unitId);
      return normalized;
    }),
  );

  const payload = {
    schemaVersion: "1.0.0" as const,
    locale: input.locale,
    targetPhone: input.targetPhone.trim(),
    targetClass: input.targetClass,
    audience: input.audience,
    units,
  };
  const programFingerprint = fingerprint(payload);

  return Object.freeze({
    ...payload,
    programId: `speech-practice:${programFingerprint.slice("sha256:".length)}`,
    programFingerprint,
    authority: "authored_practice_intent_only",
  });
}

export function createStructuredRepetitionUnit(input: {
  unitId: string;
  kind: SpeechPracticeUnit["kind"];
  text: string;
  ipa: string;
  targetPhone: string;
  targetPosition: SpeechPracticeUnit["targetPosition"];
  count: number;
  interRepetitionPauseMs: number;
  mode?: SpeechPracticeRepetition["mode"];
  delivery?: SpeechPracticeUnit["delivery"];
  pace?: SpeechPracticeUnit["pace"];
  controlRequirement?: SpeechPracticeUnit["controlRequirement"];
  pauseBeforeMs?: number;
  pauseAfterMs?: number;
  metadata?: SpeechPracticeUnit["metadata"];
}): SpeechPracticeUnit {
  const controlRequirement =
    input.controlRequirement ??
    (input.kind === "phoneme" || input.kind === "syllable"
      ? "phonetic_control_required"
      : "phonetic_control_preferred");

  return normalizeUnit({
    unitId: input.unitId,
    kind: input.kind,
    text: input.text,
    ipa: input.ipa,
    targetPhone: input.targetPhone,
    targetPosition: input.targetPosition,
    delivery: input.delivery ?? "clear",
    pace: input.pace ?? "careful",
    controlRequirement,
    repetition: {
      count: input.count,
      interRepetitionPauseMs: input.interRepetitionPauseMs,
      mode: input.mode ?? "reuse_same_artifact",
    },
    ...(input.pauseBeforeMs !== undefined ? { pauseBeforeMs: input.pauseBeforeMs } : {}),
    ...(input.pauseAfterMs !== undefined ? { pauseAfterMs: input.pauseAfterMs } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}
