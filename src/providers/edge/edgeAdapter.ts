import type { PronunciationCandidate } from "../../core/model.js";
import type {
  PronunciationProviderAdapter,
  ProviderCapabilities,
  ProviderRenderPlan,
} from "../provider.js";

export const EDGE_CAPABILITIES: ProviderCapabilities = Object.freeze({
  providerId: "edge_tts",
  providerDefault: true,
  rateControl: true,
  pitchControl: true,
  inlineAlphabets: Object.freeze([]),
  reviewedProviderMapping: false,
  providerLexicon: false,
  supportedOutputFormats: Object.freeze(["audio-24khz-48kbitrate-mono-mp3"]),
});

function signedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}%`;
}

/**
 * Planning adapter for the commonly used `edge-tts` CLI boundary.
 * It deliberately exposes no IPA/phoneme/lexicon mode. Materialization can be
 * supplied by an application-specific process runner so the core package does
 * not depend on an undocumented Microsoft endpoint.
 */
export class EdgeTtsAdapter implements PronunciationProviderAdapter {
  readonly capabilities = EDGE_CAPABILITIES;

  plan({ candidate }: { target: PronunciationCandidate["target"]; candidate: PronunciationCandidate }): ProviderRenderPlan {
    if (candidate.renderer.kind !== "tts" || candidate.renderer.provider !== "edge_tts") {
      throw new Error("Edge adapter received a non-Edge candidate");
    }
    const renderer = candidate.renderer;
    if (renderer.pronunciation.mode !== "provider_default") {
      throw new Error("EDGE_PRONUNCIATION_OVERRIDE_UNSUPPORTED");
    }

    const outputFormat = renderer.outputFormat ?? "audio-24khz-48kbitrate-mono-mp3";
    if (!this.capabilities.supportedOutputFormats.includes(outputFormat)) {
      throw new Error(`Edge output format is not registered: ${outputFormat}`);
    }

    return Object.freeze({
      providerId: "edge_tts",
      targetId: candidate.target.targetId,
      voiceId: renderer.voiceId,
      pronunciation: renderer.pronunciation,
      ratePercent: renderer.ratePercent,
      pitchPercent: renderer.pitchPercent,
      outputFormat,
      payload: Object.freeze({
        executable: "edge-tts",
        args: Object.freeze([
          "--voice",
          renderer.voiceId,
          "--text",
          candidate.target.text,
          "--rate",
          signedPercent(renderer.ratePercent),
          "--pitch",
          signedPercent(renderer.pitchPercent),
        ]),
      }),
    });
  }
}
