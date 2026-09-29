import { fingerprint } from "../core/fingerprint.js";
import type { PronunciationCandidate } from "../core/model.js";
import type {
  PronunciationProviderAdapter,
  ProviderCapabilities,
  ProviderMaterializationResult,
  ProviderRenderPlan,
} from "../providers/provider.js";

export interface LocalSpeechModelBackend {
  render(
    payload: Readonly<Record<string, unknown>>,
  ): Promise<ProviderMaterializationResult>;
}

export interface LocalSpeechModelAdapterConfig {
  providerId: string;
  modelId: string;
  modelVersion: string;
  supportedOutputFormats: readonly string[];
  supportsText?: boolean;
  supportsIpa?: boolean;
  rateControl?: boolean;
  pitchControl?: boolean;
  backend?: LocalSpeechModelBackend;
}

export class LocalSpeechModelAdapter implements PronunciationProviderAdapter {
  readonly capabilities: ProviderCapabilities;
  readonly #config: LocalSpeechModelAdapterConfig;

  constructor(config: LocalSpeechModelAdapterConfig) {
    if (!config.providerId.trim()) throw new Error("providerId is required");
    if (!config.modelId.trim()) throw new Error("modelId is required");
    if (!config.modelVersion.trim()) throw new Error("modelVersion is required");
    if (config.supportedOutputFormats.length === 0) {
      throw new Error("Local speech model requires at least one output format");
    }
    const supportsText = config.supportsText ?? true;
    const supportsIpa = config.supportsIpa ?? true;
    if (!supportsText && !supportsIpa) {
      throw new Error("Local speech model must support text, IPA, or both");
    }

    this.#config = Object.freeze({
      ...config,
      supportedOutputFormats: Object.freeze([...config.supportedOutputFormats]),
    });
    this.capabilities = Object.freeze({
      providerId: config.providerId,
      providerDefault: supportsText,
      rateControl: config.rateControl ?? true,
      pitchControl: config.pitchControl ?? true,
      inlineAlphabets: Object.freeze(supportsIpa ? ["ipa"] : []),
      reviewedProviderMapping: false,
      providerLexicon: false,
      supportedOutputFormats: Object.freeze([...config.supportedOutputFormats]),
    });
  }

  plan({ candidate }: { target: PronunciationCandidate["target"]; candidate: PronunciationCandidate }): ProviderRenderPlan {
    if (candidate.renderer.kind !== "tts" || candidate.renderer.provider !== this.#config.providerId) {
      throw new Error("Local speech model adapter received a candidate for another provider");
    }
    const pronunciation = candidate.renderer.pronunciation;
    if (pronunciation.mode === "provider_default" && !this.capabilities.providerDefault) {
      throw new Error("LOCAL_MODEL_TEXT_INPUT_UNSUPPORTED");
    }
    if (pronunciation.mode === "canonical_ipa") {
      if (!this.capabilities.inlineAlphabets.includes("ipa")) {
        throw new Error("LOCAL_MODEL_IPA_INPUT_UNSUPPORTED");
      }
      if (!pronunciation.phoneString?.trim()) {
        throw new Error("LOCAL_MODEL_IPA_PHONE_STRING_REQUIRED");
      }
    } else if (pronunciation.mode !== "provider_default") {
      throw new Error("LOCAL_MODEL_PRONUNCIATION_MODE_UNSUPPORTED");
    }
    if (!this.capabilities.rateControl && candidate.renderer.ratePercent !== 0) {
      throw new Error("LOCAL_MODEL_RATE_CONTROL_UNSUPPORTED");
    }
    if (!this.capabilities.pitchControl && candidate.renderer.pitchPercent !== 0) {
      throw new Error("LOCAL_MODEL_PITCH_CONTROL_UNSUPPORTED");
    }

    const outputFormat =
      candidate.renderer.outputFormat ?? this.capabilities.supportedOutputFormats[0]!;
    if (!this.capabilities.supportedOutputFormats.includes(outputFormat)) {
      throw new Error(`Local model output format is not registered: ${outputFormat}`);
    }

    const payload = Object.freeze({
      kind: "local_speech_model_request",
      modelId: this.#config.modelId,
      modelVersion: this.#config.modelVersion,
      locale: candidate.target.locale,
      voiceId: candidate.renderer.voiceId,
      input:
        pronunciation.mode === "canonical_ipa"
          ? Object.freeze({
              mode: "ipa",
              alphabet: "ipa",
              phoneString: pronunciation.phoneString!,
              displayText: candidate.target.text,
            })
          : Object.freeze({
              mode: "text",
              text: candidate.target.text,
            }),
      controls: Object.freeze({
        ratePercent: candidate.renderer.ratePercent,
        pitchPercent: candidate.renderer.pitchPercent,
      }),
      outputFormat,
      providerOptions: candidate.renderer.providerOptions ?? Object.freeze({}),
    });

    return Object.freeze({
      providerId: this.#config.providerId,
      targetId: candidate.target.targetId,
      voiceId: candidate.renderer.voiceId,
      pronunciation,
      ratePercent: candidate.renderer.ratePercent,
      pitchPercent: candidate.renderer.pitchPercent,
      outputFormat,
      payload,
      validationRefs: Object.freeze([
        `local-model:${this.#config.modelId}@${this.#config.modelVersion}`,
      ]),
      requestFingerprint: fingerprint(payload),
    } as ProviderRenderPlan & { requestFingerprint: string });
  }

  async materialize(
    plan: ProviderRenderPlan,
  ): Promise<ProviderMaterializationResult> {
    if (!this.#config.backend) {
      throw new Error("LOCAL_MODEL_BACKEND_NOT_CONFIGURED");
    }
    if (!plan.payload || typeof plan.payload === "string") {
      throw new Error("Local model plan payload must be structured");
    }
    return this.#config.backend.render(plan.payload);
  }
}
