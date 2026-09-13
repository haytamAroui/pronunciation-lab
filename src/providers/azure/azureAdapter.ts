import { fingerprint } from "../../core/fingerprint.js";
import type { PronunciationCandidate, PronunciationSpan } from "../../core/model.js";
import type {
  PronunciationProviderAdapter,
  ProviderCapabilities,
  ProviderRenderPlan,
} from "../provider.js";
import { validateAzureLexiconRef } from "./lexicon.js";
import { assertAzurePhoneStringSupported } from "./phoneticInventory.js";

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

function normalizeCoverageText(value: string): string {
  return value.normalize("NFC").trim().split(/\s+/u).join(" ");
}

function assertSpanCoverage(targetText: string, spans: readonly PronunciationSpan[]): void {
  const authored = spans.map((span) => span.text.normalize("NFC").trim()).join(" ");
  if (authored !== normalizeCoverageText(targetText)) {
    throw new Error("INLINE_PRONUNCIATION_SPANS_DO_NOT_COVER_TARGET");
  }
}

function phonemeElement(alphabet: string, phoneString: string, text: string): string {
  return `<phoneme alphabet="${escapeXml(alphabet)}" ph="${escapeXml(phoneString)}">${escapeXml(text)}</phoneme>`;
}

function pronunciationMarkup(candidate: PronunciationCandidate): {
  markup: string;
  validationRefs: readonly string[];
} {
  if (candidate.renderer.kind !== "tts") throw new Error("Azure requires a TTS candidate");
  const instruction = candidate.renderer.pronunciation;
  const text = candidate.target.text.normalize("NFC");

  if (instruction.mode === "provider_default" || instruction.mode === "provider_lexicon") {
    return Object.freeze({ markup: escapeXml(text), validationRefs: Object.freeze([]) });
  }

  if (!AZURE_CAPABILITIES.inlineAlphabets.includes(instruction.alphabet)) {
    throw new Error(`Azure adapter does not support ${instruction.alphabet} inline pronunciation`);
  }

  const validationRefs = new Set<string>();
  if (instruction.spans) {
    assertSpanCoverage(text, instruction.spans);
    const markup = instruction.spans
      .map((span) => {
        const ref = assertAzurePhoneStringSupported({
          locale: candidate.target.locale,
          alphabet: instruction.alphabet,
          phoneString: span.phoneString,
        });
        if (ref) validationRefs.add(ref);
        return phonemeElement(instruction.alphabet, span.phoneString, span.text.normalize("NFC").trim());
      })
      .join(" ");
    return Object.freeze({ markup, validationRefs: Object.freeze([...validationRefs]) });
  }

  const phoneString = instruction.phoneString?.trim();
  if (!phoneString) throw new Error("INLINE_PRONUNCIATION_MISSING");
  if (/\s/u.test(text.trim())) {
    throw new Error("INLINE_PRONUNCIATION_SPANS_REQUIRED_FOR_MULTIWORD_TARGET");
  }
  const ref = assertAzurePhoneStringSupported({
    locale: candidate.target.locale,
    alphabet: instruction.alphabet,
    phoneString,
  });
  if (ref) validationRefs.add(ref);
  return Object.freeze({
    markup: phonemeElement(instruction.alphabet, phoneString, text),
    validationRefs: Object.freeze([...validationRefs]),
  });
}

export class AzureSpeechAdapter implements PronunciationProviderAdapter {
  readonly capabilities = AZURE_CAPABILITIES;

  plan({ candidate }: { target: PronunciationCandidate["target"]; candidate: PronunciationCandidate }): ProviderRenderPlan {
    if (candidate.renderer.kind !== "tts" || candidate.renderer.provider !== "azure_speech") {
      throw new Error("Azure adapter received a non-Azure candidate");
    }
    const renderer = candidate.renderer;
    const instruction = renderer.pronunciation;

    if (instruction.mode === "provider_lexicon") {
      const issues = validateAzureLexiconRef(instruction.lexiconRef);
      if (issues.length > 0) throw new Error(issues.join(","));
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
      `<prosody rate="${signedPercent(renderer.ratePercent)}" pitch="${signedPercent(renderer.pitchPercent)}">${spoken.markup}</prosody>`,
      `</voice>`,
      `</speak>`,
    ].join("");

    const validationRefs = spoken.validationRefs;
    const requestFingerprint = fingerprint({
      provider: "azure_speech",
      outputFormat,
      ssml,
      validationRefs,
    });

    return Object.freeze({
      providerId: "azure_speech",
      targetId: candidate.target.targetId,
      voiceId: renderer.voiceId,
      pronunciation: instruction,
      ratePercent: renderer.ratePercent,
      pitchPercent: renderer.pitchPercent,
      outputFormat,
      payload: ssml,
      ...(validationRefs.length > 0 ? { validationRefs } : {}),
      requestFingerprint,
    } as ProviderRenderPlan & { requestFingerprint: string });
  }
}
