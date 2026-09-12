import type {
  CanonicalPronunciationTarget,
  PronunciationCandidate,
  PronunciationInstruction,
  RenderArtifact,
} from "../core/model.js";

export interface ProviderCapabilities {
  providerId: string;
  providerDefault: boolean;
  rateControl: boolean;
  pitchControl: boolean;
  inlineAlphabets: readonly string[];
  reviewedProviderMapping: boolean;
  providerLexicon: boolean;
  supportedOutputFormats: readonly string[];
}

export interface ProviderRenderPlan {
  providerId: string;
  targetId: string;
  voiceId: string;
  pronunciation: PronunciationInstruction;
  ratePercent: number;
  pitchPercent: number;
  outputFormat: string;
  payload: string | Readonly<Record<string, unknown>>;
}

export interface ProviderMaterializationResult {
  bytes: Uint8Array;
  mediaType: string;
  providerRequestFingerprint?: string;
  responseMetadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface PronunciationProviderAdapter {
  readonly capabilities: ProviderCapabilities;

  plan(input: {
    target: CanonicalPronunciationTarget;
    candidate: PronunciationCandidate;
  }): ProviderRenderPlan;

  materialize?(
    plan: ProviderRenderPlan,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<ProviderMaterializationResult>;
}

export interface ArtifactStore {
  save(input: {
    candidate: PronunciationCandidate;
    artifact: RenderArtifact;
    bytes: Uint8Array;
  }): Promise<void>;
}
