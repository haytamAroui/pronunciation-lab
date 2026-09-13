import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AzureSpeechAdapter,
  buildAzurePlsLexicon,
  buildCandidate,
  validateAzureLexiconRef,
  validateAzurePhoneString,
  type CanonicalPronunciationTarget,
} from "../src/index.js";

const phraseTarget: CanonicalPronunciationTarget = Object.freeze({
  targetId: "test:nl-BE:phrase",
  locale: "nl-BE",
  text: "sok uil",
  canonicalIpa: "/sɔk œ͡yl/",
  canonicalPronunciationSpans: Object.freeze([
    Object.freeze({ text: "sok", phoneString: "sɔk" }),
    Object.freeze({ text: "uil", phoneString: "œ͡yl" }),
  ]),
  role: "connected_speech",
  metadata: Object.freeze({}),
});

const legacyPhraseTarget: CanonicalPronunciationTarget = Object.freeze({
  targetId: "test:nl-BE:legacy-phrase",
  locale: "nl-BE",
  text: "sok uil",
  canonicalIpa: "/sɔk œ͡yl/",
  role: "connected_speech",
  metadata: Object.freeze({}),
});

describe("Azure phonetic inventories", () => {
  it("accepts documented nl-BE IPA including a multi-codepoint diphthong", () => {
    const result = validateAzurePhoneString({ locale: "nl-BE", alphabet: "ipa", phoneString: "œ͡yl" });
    assert.equal(result.valid, true);
    assert.match(result.inventoryRef ?? "", /^azure:nl-BE:ipa:/u);
  });

  it("rejects a phone not present in the documented nl-BE Azure inventory", () => {
    const result = validateAzurePhoneString({ locale: "nl-BE", alphabet: "ipa", phoneString: "ɣ" });
    assert.equal(result.valid, false);
    assert.match(result.issues.join(","), /AZURE_PHONE_UNSUPPORTED_FOR_LOCALE/u);
  });

  it("accepts documented fr-BE IPA and SAPI phones", () => {
    assert.equal(validateAzurePhoneString({ locale: "fr-BE", alphabet: "ipa", phoneString: "ʁa" }).valid, true);
    assert.equal(validateAzurePhoneString({ locale: "fr-BE", alphabet: "sapi", phoneString: "r ae" }).valid, true);
  });

  it("rejects a known-locale alphabet without a registered inventory", () => {
    const result = validateAzurePhoneString({ locale: "nl-BE", alphabet: "sapi", phoneString: "s" });
    assert.deepEqual(result.issues, ["AZURE_ALPHABET_UNSUPPORTED_FOR_LOCALE"]);
  });
});

describe("Azure inline pronunciation", () => {
  it("renders one phoneme element per explicit authored span", () => {
    const candidate = buildCandidate({
      target: phraseTarget,
      renderer: {
        kind: "tts",
        provider: "azure_speech",
        voiceId: "nl-BE-DenaNeural",
        pronunciation: {
          mode: "canonical_ipa",
          alphabet: "ipa",
          spans: phraseTarget.canonicalPronunciationSpans!,
        },
        ratePercent: -8,
        pitchPercent: 0,
      },
    });
    const plan = new AzureSpeechAdapter().plan({ target: phraseTarget, candidate });
    assert.equal(typeof plan.payload, "string");
    assert.match(String(plan.payload), /<phoneme alphabet="ipa" ph="sɔk">sok<\/phoneme> <phoneme alphabet="ipa" ph="œ͡yl">uil<\/phoneme>/u);
    assert.equal(plan.validationRefs?.length, 1);
  });

  it("fails closed for a multi-word legacy phoneString", () => {
    const candidate = buildCandidate({
      target: legacyPhraseTarget,
      renderer: {
        kind: "tts",
        provider: "azure_speech",
        voiceId: "nl-BE-DenaNeural",
        pronunciation: { mode: "canonical_ipa", alphabet: "ipa", phoneString: "sɔk œ͡yl" },
        ratePercent: 0,
        pitchPercent: 0,
      },
    });
    assert.throws(
      () => new AzureSpeechAdapter().plan({ target: candidate.target, candidate }),
      /INLINE_PRONUNCIATION_SPANS_REQUIRED_FOR_MULTIWORD_TARGET/u,
    );
  });

  it("rejects spans that do not cover the authored target", () => {
    const candidate = buildCandidate({
      target: phraseTarget,
      renderer: {
        kind: "tts",
        provider: "azure_speech",
        voiceId: "nl-BE-DenaNeural",
        pronunciation: {
          mode: "canonical_ipa",
          alphabet: "ipa",
          spans: [{ text: "sok", phoneString: "sɔk" }],
        },
        ratePercent: 0,
        pitchPercent: 0,
      },
    });
    assert.throws(
      () => new AzureSpeechAdapter().plan({ target: phraseTarget, candidate }),
      /INLINE_PRONUNCIATION_SPANS_DO_NOT_COVER_TARGET/u,
    );
  });
});

describe("Azure custom lexicons", () => {
  it("validates HTTPS XML/PLS references and rejects unsafe forms", () => {
    assert.deepEqual(validateAzureLexiconRef("https://example.com/lexicon.pls?sig=abc"), []);
    assert.match(validateAzureLexiconRef("http://example.com/lexicon.pls").join(","), /REQUIRES_HTTPS/u);
    assert.match(validateAzureLexiconRef("https://example.com/lexicon.txt").join(","), /REQUIRES_XML_OR_PLS/u);
  });

  it("emits a lexicon element inside the Azure voice", () => {
    const target: CanonicalPronunciationTarget = {
      targetId: "test:lexicon",
      locale: "fr-BE",
      text: "SoundSteps",
      canonicalIpa: null,
      role: "custom",
      metadata: {},
    };
    const candidate = buildCandidate({
      target,
      renderer: {
        kind: "tts",
        provider: "azure_speech",
        voiceId: "fr-BE-CharlineNeural",
        pronunciation: { mode: "provider_lexicon", lexiconRef: "https://example.com/soundsteps.pls" },
        ratePercent: 0,
        pitchPercent: 0,
      },
    });
    const plan = new AzureSpeechAdapter().plan({ target, candidate });
    assert.match(String(plan.payload), /<voice name="fr-BE-CharlineNeural"><lexicon uri="https:\/\/example.com\/soundsteps.pls"\/>/u);
  });

  it("builds escaped PLS entries without choosing a storage backend", () => {
    const xml = buildAzurePlsLexicon({
      locale: "fr-BE",
      lexemes: [{ grapheme: "A&B", alias: "A et B" }],
    });
    assert.match(xml, /<grapheme>A&amp;B<\/grapheme><alias>A et B<\/alias>/u);
  });
});
