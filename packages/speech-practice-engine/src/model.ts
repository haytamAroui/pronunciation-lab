export type ArticulationManner =
  | "fricative"
  | "stop"
  | "nasal"
  | "affricate"
  | "approximant"
  | "lateral"
  | "rhotic"
  | "vowel"
  | "other";

export type MotorContinuity =
  | "sustainable"
  | "closure_release"
  | "context_dependent";

export interface ReviewedArticulationProfile {
  schemaVersion: "1.0.0";
  profileId: string;
  locale: string;
  targetPhone: string;
  targetClass: string;
  manner: ArticulationManner;
  continuity: MotorContinuity;
  cueEvidenceRefs: readonly string[];
  review: Readonly<{
    status: "reviewed";
    evidenceRefs: readonly string[];
    reviewedAt: string;
  }>;
  authority: "reviewed_practice_profile";
}

export type PracticeMotorAction =
  | "sustain"
  | "pulse"
  | "transition_cv"
  | "transition_vc"
  | "lexical";

export interface PracticeIntentUnit {
  unitId: string;
  action: PracticeMotorAction;
  displayText: string;
  ipa: string;
  repetitions: number;
  pauseMs: number;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface SpeechPracticeIntent {
  schemaVersion: "1.0.0";
  intentId: string;
  locale: string;
  targetPhone: string;
  profileId: string;
  units: readonly PracticeIntentUnit[];
  authority: "authored_practice_intent";
}

export interface CanonicalPronunciationTargetDraft {
  targetId: string;
  locale: string;
  text: string;
  canonicalIpa: string;
  role: "pronunciation_reference";
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}
