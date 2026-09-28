export type RejectionReason =
  | "target_definition_error"
  | "ipa_error"
  | "locale_mismatch"
  | "phoneme_realization_error"
  | "stress_error"
  | "renderer_artifact"
  | "audio_clipping"
  | "audio_truncation"
  | "rate_unsuitable"
  | "over_articulation"
  | "target_not_salient"
  | "unnatural_prosody"
  | "child_model_unsuitable";

export type RejectionOwner =
  | "target_registry"
  | "rendering_profile"
  | "rerender_or_change_renderer"
  | "human_clinical_redesign";

export const REJECTION_OWNER: Readonly<Record<RejectionReason, RejectionOwner>> = Object.freeze({
  target_definition_error: "target_registry",
  ipa_error: "target_registry",
  locale_mismatch: "target_registry",
  stress_error: "target_registry",
  rate_unsuitable: "rendering_profile",
  over_articulation: "rendering_profile",
  target_not_salient: "rendering_profile",
  unnatural_prosody: "rendering_profile",
  phoneme_realization_error: "rerender_or_change_renderer",
  renderer_artifact: "rerender_or_change_renderer",
  audio_clipping: "rerender_or_change_renderer",
  audio_truncation: "rerender_or_change_renderer",
  child_model_unsuitable: "human_clinical_redesign",
});

export function routeRejection(reason: RejectionReason): RejectionOwner {
  return REJECTION_OWNER[reason];
}
