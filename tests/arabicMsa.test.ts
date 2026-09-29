import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { phonemizeArabicMsaWord } from "../src/index.js";

describe("Arabic MSA proposal-only phonemizer", () => {
  it("handles fully vocalized short and long vowels conservatively", () => {
    const result = phonemizeArabicMsaWord({ text: "كِتَابٌ" });
    assert.equal(result.ipa, "kitaːbun");
    assert.equal(result.status, "complete");
    assert.equal(result.authority, "phonemizer_proposal_only");
  });

  it("handles sun-letter definite-article assimilation without granting authority", () => {
    const result = phonemizeArabicMsaWord({ text: "الشَّمْسُ" });
    assert.equal(result.ipa, "ʔaʃʃamsu");
    assert.ok(result.flags.includes("definite_article_sun_assimilation_applied"));
    assert.equal(result.status, "complete");
  });

  it("handles moon-letter definite article", () => {
    const result = phonemizeArabicMsaWord({ text: "الْقَمَرُ" });
    assert.equal(result.ipa, "ʔalqamaru");
    assert.ok(result.flags.includes("definite_article_moon_applied"));
  });

  it("returns partial evidence when internal vowels are not written", () => {
    const result = phonemizeArabicMsaWord({ text: "كتب" });
    assert.equal(result.status, "partial");
    assert.ok(result.flags.some((flag) => flag.startsWith("missing_vowel_diacritic:")));
  });

  it("abstains on unsupported non-Arabic input instead of guessing", () => {
    const result = phonemizeArabicMsaWord({ text: "test" });
    assert.equal(result.status, "abstain");
    assert.equal(result.ipa, null);
  });

  it("flags bare ta marbuta as context-dependent", () => {
    const result = phonemizeArabicMsaWord({ text: "مَدْرَسَة" });
    assert.equal(result.status, "partial");
    assert.ok(result.flags.some((flag) => flag.startsWith("ta_marbuta_context_required:")));
  });
});
