import type { PhoneticAlphabet, PronunciationCandidate } from "../core/model.js";

export type SpeechPracticeUnitKind =
  | "phoneme"
  | "syllable"
  | "word"
  | "phrase"
  | "sentence";

export type SpeechPracticeTargetPosition =
  | "isolated"
  | "onset"
  | "nucleus"
  | "coda"
  | "cluster"
  | "connected";

export type SpeechPracticeDelivery =
  | "natural"
  | "clear"
  | "target_focused";

export type SpeechPracticePace =
  | "natural"
  | "careful"
  | "slower_careful";

export type SpeechPracticeControlRequirement =
  | "phonetic_control_required"
  | "phonetic_control_preferred"
  | "provider_default_allowed";

export type SpeechPracticeRepetitionMode =
  | "reuse_same_artifact"
  | "rerender_each";

export interface SpeechPracticeRepetition {
  count: number;
  interRepetitionPauseMs: number;
  mode: SpeechPracticeRepetitionMode;
}

export interface SpeechPracticeUnit {
  unitId: string;
  kind: SpeechPracticeUnitKind;
  text: string;
  ipa: string | null;
  targetPhone: string;
  targetPosition: SpeechPracticeTargetPosition;
  delivery: SpeechPracticeDelivery;
  pace: SpeechPracticePace;
  controlRequirement: SpeechPracticeControlRequirement;
  repetition: SpeechPracticeRepetition;
  pauseBeforeMs?: number;
  pauseAfterMs?: number;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface SpeechPracticeProgram {
  schemaVersion: "1.0.0";
  programId: string;
  programFingerprint: string;
  locale: string;
  targetPhone: string;
  targetClass: string;
  audience: "child_imitation" | "adult_practice" | "general";
  units: readonly SpeechPracticeUnit[];
  authority: "authored_practice_intent_only";
}

export type SpeechPracticeInputMode = "text" | "ipa";

export interface SpeechPracticeRendererCapabilities {
  rendererId: string;
  rendererVersion: string;
  supportedInputModes: readonly SpeechPracticeInputMode[];
  supportedUnitKinds: readonly SpeechPracticeUnitKind[];
  supportedAlphabets: readonly PhoneticAlphabet[];
  rateControl: boolean;
  pitchControl: boolean;
  canReuseArtifact: boolean;
  authority: "capability_only_not_pronunciation_approval";
}

export interface SpeechPracticeRendererBinding {
  providerId: string;
  rendererVersion: string;
  voiceId: string;
  outputFormat?: string;
  ratePercentByPace?: Readonly<Record<SpeechPracticePace, number>>;
  pitchPercent?: number;
}

export interface SpeechPracticeRenderRequest {
  schemaVersion: "1.0.0";
  requestId: string;
  programId: string;
  sourceUnitId: string;
  repetitionIndex: number | null;
  locale: string;
  targetPhone: string;
  unitKind: SpeechPracticeUnitKind;
  targetPosition: SpeechPracticeTargetPosition;
  delivery: SpeechPracticeDelivery;
  pace: SpeechPracticePace;
  input: Readonly<
    | {
        mode: "text";
        text: string;
      }
    | {
        mode: "ipa";
        text: string;
        alphabet: "ipa";
        phoneString: string;
      }
  >;
  binding: SpeechPracticeRendererBinding;
  candidate: PronunciationCandidate;
  authority: "experiment_only";
}

export type SpeechPracticeTimelineEvent =
  | Readonly<{
      kind: "render";
      requestId: string;
      sourceUnitId: string;
      repetitionOrdinal: number;
    }>
  | Readonly<{
      kind: "silence";
      durationMs: number;
      reason: "before_unit" | "between_repetitions" | "after_unit";
    }>;

export interface BoundSpeechPracticePlan {
  schemaVersion: "1.0.0";
  planId: string;
  planFingerprint: string;
  programId: string;
  rendererId: string;
  rendererVersion: string;
  voiceId: string;
  requests: readonly SpeechPracticeRenderRequest[];
  timeline: readonly SpeechPracticeTimelineEvent[];
  authority: "experiment_only";
}

export interface ComposedPracticeAudio {
  bytes: Uint8Array;
  mediaType: "audio/wav";
  sampleRateHz: number;
  channels: 1;
  durationMs: number;
  eventBoundaries: readonly Readonly<{
    eventIndex: number;
    kind: SpeechPracticeTimelineEvent["kind"];
    startFrame: number;
    endFrame: number;
    requestId?: string;
  }>[];
}
