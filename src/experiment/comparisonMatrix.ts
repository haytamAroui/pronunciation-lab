import { buildCandidate } from "../core/candidate.js";
import type {
  CanonicalPronunciationTarget,
  PronunciationCandidate,
} from "../core/model.js";

export interface MicrosoftComparisonMatrixOptions {
  edgeVoiceId: string;
  azureVoiceId: string;
  rates?: readonly number[];
  pitchPercent?: number;
  matchedOutputFormat?: string;
}

/**
 * Builds the standard comparison used to answer whether provider-default
 * synthesis is enough or Azure pronunciation control adds measurable value.
 *
 * Edge contributes only provider-default candidates. Azure contributes one
 * provider-default baseline plus canonical-IPA candidates when canonical IPA
 * exists. The caller may supply any locale/voice combination.
 */
export function buildMicrosoftComparisonMatrix(
  target: CanonicalPronunciationTarget,
  options: MicrosoftComparisonMatrixOptions,
): readonly PronunciationCandidate[] {
  const pitchPercent = options.pitchPercent ?? 0;
  const rates = options.rates ?? Object.freeze([0, -8, -15]);
  const outputFormat = options.matchedOutputFormat ?? "audio-24khz-48kbitrate-mono-mp3";

  const candidates: PronunciationCandidate[] = [
    buildCandidate({
      target,
      renderer: {
        kind: "tts",
        provider: "edge_tts",
        voiceId: options.edgeVoiceId,
        pronunciation: { mode: "provider_default" },
        ratePercent: 0,
        pitchPercent,
        outputFormat,
      },
    }),
    buildCandidate({
      target,
      renderer: {
        kind: "tts",
        provider: "azure_speech",
        voiceId: options.azureVoiceId,
        pronunciation: { mode: "provider_default" },
        ratePercent: 0,
        pitchPercent,
        outputFormat,
      },
    }),
  ];

  if (target.canonicalIpa) {
    const phoneString = target.canonicalIpa.trim().replace(/^\//u, "").replace(/\/$/u, "");
    for (const ratePercent of rates) {
      candidates.push(
        buildCandidate({
          target,
          renderer: {
            kind: "tts",
            provider: "azure_speech",
            voiceId: options.azureVoiceId,
            pronunciation: {
              mode: "canonical_ipa",
              alphabet: "ipa",
              phoneString,
            },
            ratePercent,
            pitchPercent,
            outputFormat,
          },
        }),
      );
    }
  }

  return Object.freeze(candidates);
}
