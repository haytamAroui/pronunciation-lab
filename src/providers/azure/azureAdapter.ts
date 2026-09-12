import { fingerprint } from "../../core/fingerprint.js";
import type { PronunciationCandidate } from "../../core/model.js";
import type {
  PronunciationProviderAdapter,
  ProviderCapabilities,
  ProviderRenderPlan,
} from "../provider.js";

export const AZURE_CAPABILITIES: ProviderCapabilities = Object.freeze({
  providerId: "azure_speech",
  providerDefault: true,
  rateControl: true,
  pitchControl: true,
  inlineAlphabets: Object.freeze(["ipa", "sapi", "ups"]),
  reviewedProviderMapping: true,
  providerLexicon: true,
  supportedOutputFormats: Object.freeze([
    "riff-24khz-16bit-mono-pcm",
    "audio-24khz-48kbitrate-mono-mp3",
  ]),
});

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function signedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}%`;
}

function pronunciationMarkup(candidate: PronunciationCandidate): string {
  if (candidate.renderer.kind !== "tts") throw new Error("Azure requires a TTS candidate");
  const instruction = candidate.renderer.pronunciation;
  const text = escapeXml(candidate.target.text.normalize("NFC"));
  if (instruction.mode === "provider_default") return text;
  if (instruction.mode === "provider_lexicon") return text;
  return `<phoneme alphabet="${instruction.alphabet}" ph="${escapeXml(instruction.phoneString)}">${text}</phoneme>`;
}

export class AzureSpeechAdapter implements PronunciationProviderAdapter {
  readonly capabilities = AZURE_CAPABILITIES;

  plan({ candidate }: { target: PronunciationCandidate["target"]; candidate: PronunciationCandidate }): ProviderRenderPlan {
    if (candidate.renderer.kind !== "tts" || candidate.renderer.provider !== "azure_speech") {
      throw new Error("Azure adapter received a non-Azure candidate");
    }
    const renderer = candidate.renderer;
    const instruction = renderer.pronunciation;
    if (instruction.mode === "provider_lexicon" && !instruction.lexiconRef.trim()) {
      throw new Error("Azure lexicon rendering requires lexiconRef");
    }
    if (
      (instruction.mode === "canonical_ipa" || instruction.mode === "reviewed_provider_mapping") &&
      !this.capabilities.inlineAlphabets.includes(instruction.alphabet)
    ) {
      throw new Error(`Azure adapter does not support ${instruction.alphabet} inline pronunciation`);
    }

    const outputFormat = renderer.outputFormat ?? "riff-24khz-16bit-mono-pcm";
    if (!this.capabilities.supportedOutputFormats.includes(outputFormat)) {
      throw new Error(`Azure output format is not registered: ${outputFormat}`);
    }

    const lexicon =
      instruction.mode === "provider_lexicon"
        ? `<lexicon uri="${escapeXml(instruction.lexiconRef)}"/>`
        : "";
    const spoken = pronunciationMarkup(candidate);
    const ssml = [
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeXml(candidate.target.locale)}">`,
      `<voice name="${escapeXml(renderer.voiceId)}">`,
      lexicon,
      `<prosody rate="${signedPercent(renderer.ratePercent)}" pitch="${signedPercent(renderer.pitchPercent)}">${spoken}</prosody>`,
      `</voice>`,
      `</speak>`,
    ].join("");

    return Object.freeze({
      providerId: "azure_speech",
      targetId: candidate.target.targetId,
      voiceId: renderer.voiceId,
      pronunciation: instruction,
      ratePercent: renderer.ratePercent,
      pitchPercent: renderer.pitchPercent,
      outputFormat,
      payload: ssml,
      requestFingerprint: fingerprint({ provider: "azure_speech", outputFormat, ssml }),
    } as ProviderRenderPlan & { requestFingerprint: string });
  }
}
