export type PronunciationRole =
  | "pronunciation_reference"
  | "listening_reference"
  | "connected_speech"
  | "instructional_narration"
  | "custom";

export interface PronunciationSpan {
  /** Exact authored grapheme token represented by this pronunciation span. */
  text: string;
  /** Provider-facing phone string for this span only. */
  phoneString: string;
}

export interface CanonicalPronunciationTarget {
  targetId: string;
  locale: string;
  text: string;
  canonicalIpa: string | null;
  /**
   * Explicit authored token-level IPA for multi-word targets.
   * Pronunciation Lab never derives these spans from spelling or whitespace.
   */
  canonicalPronunciationSpans?: readonly PronunciationSpan[];
  role: PronunciationRole;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export type PronunciationMode =
  | "provider_default"
  | "canonical_ipa"
  | "reviewed_provider_mapping"
  | "provider_lexicon";

export type PhoneticAlphabet = "ipa" | "sapi" | "ups" | "x-sampa";

export interface ProviderDefaultPronunciation {
  mode: "provider_default";
}

export interface InlinePronunciation {
  mode: "canonical_ipa" | "reviewed_provider_mapping";
  alphabet: PhoneticAlphabet;
  /** Legacy/single-span form. Multi-word targets must use spans. */
  phoneString?: string;
  /** Explicit authored per-token pronunciation. No alignment inference is performed. */
  spans?: readonly PronunciationSpan[];
  evidenceRef?: string;
}

export interface ProviderLexiconPronunciation {
  mode: "provider_lexicon";
  lexiconRef: string;
  evidenceRef?: string;
}

export type PronunciationInstruction =
  | ProviderDefaultPronunciation
  | InlinePronunciation
  | ProviderLexiconPronunciation;

export interface TtsRendererSpec {
  kind: "tts";
  provider: string;
  voiceId: string;
  pronunciation: PronunciationInstruction;
  ratePercent: number;
  pitchPercent: number;
  outputFormat?: string;
  providerOptions?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface HumanRendererSpec {
  kind: "human";
  recordingRef: string;
  speakerRef: string;
  speakerLocale: string;
  sourceAudioSha256?: string;
}

export type RendererSpec = TtsRendererSpec | HumanRendererSpec;

export interface PronunciationCandidate {
  schemaVersion: "1.0.0";
  candidateId: string;
  candidateFingerprint: string;
  target: CanonicalPronunciationTarget;
  renderer: RendererSpec;
  authority: "experiment_only";
}

export interface RenderArtifact {
  schemaVersion: "1.0.0";
  artifactId: string;
  candidateId: string;
  candidateFingerprint: string;
  audioSha256: string;
  mediaType: string;
  byteLength: number;
  createdAt: string;
  providerRequestFingerprint?: string;
  providerResponseMetadata?: Readonly<Record<string, string | number | boolean | null>>;
}
