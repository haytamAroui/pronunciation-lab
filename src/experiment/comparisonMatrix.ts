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
 * can be represented without inferred alignment. Single-token targets may use
 * canonicalIpa directly; multi-word targets require explicit authored spans.
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

  const authoredSpans = target.canonicalPronunciationSpans;
  const isSingleToken = !/\s/u.test(target.text.trim());
  const phoneString = target.canonicalIpa?.trim().replace(/^\//u, "").replace(/\/$/u, "");

  if (authoredSpans || (phoneString && isSingleToken)) {
    for (const ratePercent of rates) {
      candidates.push(
        buildCandidate({
          target,
          renderer: {
            kind: "tts",
            provider: "azure_speech",
            voiceId: options.azureVoiceId,
            pronunciation: authoredSpans
              ? {
                  mode: "canonical_ipa",
                  alphabet: "ipa",
                  spans: authoredSpans,
                }
              : {
                  mode: "canonical_ipa",
                  alphabet: "ipa",
                  phoneString: phoneString!,
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
