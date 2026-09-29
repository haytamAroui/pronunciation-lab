import type { SpeechPracticeRendererCapabilities } from "./model.js";

export const EDGE_SPEECH_PRACTICE_CAPABILITIES: SpeechPracticeRendererCapabilities =
  Object.freeze({
    rendererId: "edge_tts",
    rendererVersion: "edge-tts",
    supportedInputModes: Object.freeze(["text"]),
    supportedUnitKinds: Object.freeze(["word", "phrase", "sentence"]),
    supportedAlphabets: Object.freeze([]),
    rateControl: true,
    pitchControl: false,
    canReuseArtifact: true,
    authority: "capability_only_not_pronunciation_approval",
  });

export const AZURE_SPEECH_PRACTICE_CAPABILITIES: SpeechPracticeRendererCapabilities =
  Object.freeze({
    rendererId: "azure_speech",
    rendererVersion: "azure-speech",
    supportedInputModes: Object.freeze(["text", "ipa"]),
    supportedUnitKinds: Object.freeze([
      "phoneme",
      "syllable",
      "word",
      "phrase",
      "sentence",
    ]),
    supportedAlphabets: Object.freeze(["ipa", "sapi", "ups"]),
    rateControl: true,
    pitchControl: true,
    canReuseArtifact: true,
    authority: "capability_only_not_pronunciation_approval",
  });

export function createLocalSpeechPracticeCapabilities(input: {
  rendererId: string;
  rendererVersion: string;
  supportsText?: boolean;
  supportsIpa?: boolean;
  supportedUnitKinds?: SpeechPracticeRendererCapabilities["supportedUnitKinds"];
  rateControl?: boolean;
  pitchControl?: boolean;
  canReuseArtifact?: boolean;
}): SpeechPracticeRendererCapabilities {
  if (!input.rendererId.trim()) throw new Error("rendererId is required");
  if (!input.rendererVersion.trim()) throw new Error("rendererVersion is required");
  const supportedInputModes = [
    ...(input.supportsText ?? true ? ["text" as const] : []),
    ...(input.supportsIpa ?? true ? ["ipa" as const] : []),
  ];
  if (supportedInputModes.length === 0) {
    throw new Error("Local practice renderer must support text, IPA, or both");
  }

  return Object.freeze({
    rendererId: input.rendererId,
    rendererVersion: input.rendererVersion,
    supportedInputModes: Object.freeze(supportedInputModes),
    supportedUnitKinds: Object.freeze(
      input.supportedUnitKinds ?? [
        "phoneme",
        "syllable",
        "word",
        "phrase",
        "sentence",
      ],
    ),
    supportedAlphabets: Object.freeze(
      supportedInputModes.includes("ipa") ? ["ipa"] : [],
    ),
    rateControl: input.rateControl ?? true,
    pitchControl: input.pitchControl ?? true,
    canReuseArtifact: input.canReuseArtifact ?? true,
    authority: "capability_only_not_pronunciation_approval",
  });
}
