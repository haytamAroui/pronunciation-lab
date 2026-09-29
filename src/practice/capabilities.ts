import type { PhoneticAlphabet } from "../core/model.js";
import type {
  SpeechPracticeInputMode,
  SpeechPracticeRendererCapabilities,
  SpeechPracticeUnitKind,
} from "./model.js";

const EDGE_INPUT_MODES: readonly SpeechPracticeInputMode[] = Object.freeze(["text"]);
const EDGE_UNIT_KINDS: readonly SpeechPracticeUnitKind[] = Object.freeze([
  "word",
  "phrase",
  "sentence",
]);

export const EDGE_SPEECH_PRACTICE_CAPABILITIES: SpeechPracticeRendererCapabilities =
  Object.freeze({
    rendererId: "edge_tts",
    rendererVersion: "edge-tts",
    supportedInputModes: EDGE_INPUT_MODES,
    supportedUnitKinds: EDGE_UNIT_KINDS,
    supportedAlphabets: Object.freeze([]),
    rateControl: true,
    pitchControl: false,
    canReuseArtifact: true,
    authority: "capability_only_not_pronunciation_approval",
  });

const AZURE_INPUT_MODES: readonly SpeechPracticeInputMode[] = Object.freeze([
  "text",
  "ipa",
]);
const AZURE_UNIT_KINDS: readonly SpeechPracticeUnitKind[] = Object.freeze([
  "phoneme",
  "syllable",
  "word",
  "phrase",
  "sentence",
]);
const AZURE_ALPHABETS: readonly PhoneticAlphabet[] = Object.freeze(["ipa"]);

export const AZURE_SPEECH_PRACTICE_CAPABILITIES: SpeechPracticeRendererCapabilities =
  Object.freeze({
    rendererId: "azure_speech",
    rendererVersion: "azure-speech",
    supportedInputModes: AZURE_INPUT_MODES,
    supportedUnitKinds: AZURE_UNIT_KINDS,
    supportedAlphabets: AZURE_ALPHABETS,
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
  const supportedInputModes: SpeechPracticeInputMode[] = [];
  if (input.supportsText ?? true) supportedInputModes.push("text");
  if (input.supportsIpa ?? true) supportedInputModes.push("ipa");
  if (supportedInputModes.length === 0) {
    throw new Error("Local practice renderer must support text, IPA, or both");
  }

  const defaultUnitKinds: readonly SpeechPracticeUnitKind[] = Object.freeze([
    "phoneme",
    "syllable",
    "word",
    "phrase",
    "sentence",
  ]);
  const supportedUnitKinds: readonly SpeechPracticeUnitKind[] =
    input.supportedUnitKinds ?? defaultUnitKinds;
  const supportedAlphabets: readonly PhoneticAlphabet[] =
    supportedInputModes.includes("ipa") ? Object.freeze(["ipa"]) : Object.freeze([]);

  return Object.freeze({
    rendererId: input.rendererId,
    rendererVersion: input.rendererVersion,
    supportedInputModes: Object.freeze([...supportedInputModes]),
    supportedUnitKinds: Object.freeze([...supportedUnitKinds]),
    supportedAlphabets,
    rateControl: input.rateControl ?? true,
    pitchControl: input.pitchControl ?? true,
    canReuseArtifact: input.canReuseArtifact ?? true,
    authority: "capability_only_not_pronunciation_approval",
  });
}
