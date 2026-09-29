import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifySyllableCount,
  createReviewedArticulationProfile,
  createSpeechPracticeIntent,
  emitCanonicalPronunciationTargetDrafts,
  summarizeLexicalSyllableCoverage,
} from "../src/index.js";

describe("speech-practice engine boundary", () => {
  const sProfile = createReviewedArticulationProfile({
    locale: "nl-BE",
    targetPhone: "s",
    targetClass: "s_initial_singleton",
    manner: "fricative",
    continuity: "sustainable",
    cueEvidenceRefs: ["practice-cue-review:nl-BE:s:r1"],
    review: {
      status: "reviewed",
      evidenceRefs: ["profile-review:nl-BE:s:r1"],
      reviewedAt: "2026-09-29T15:00:00.000Z",
    },
  });

  it("authors motor intent without choosing a renderer", () => {
    const intent = createSpeechPracticeIntent({
      profile: sProfile,
      units: [
        {
          unitId: "s-hold",
          action: "sustain",
          displayText: "s",
          ipa: "s",
          repetitions: 3,
          pauseMs: 650,
        },
        {
          unitId: "sa",
          action: "transition_cv",
          displayText: "sa",
          ipa: "sa",
          repetitions: 3,
          pauseMs: 550,
        },
      ],
    });

    const drafts = emitCanonicalPronunciationTargetDrafts({ profile: sProfile, intent });
    assert.equal(drafts.length, 2);
    assert.equal(drafts[0]!.canonicalIpa, "s");
    assert.equal(drafts[0]!.metadata.motorAction, "sustain");
    assert.equal("provider" in drafts[0]!, false);
    assert.equal("voiceId" in drafts[0]!, false);
  });

  it("prevents sustained authoring for closure-release profiles", () => {
    const stopProfile = createReviewedArticulationProfile({
      locale: "nl-BE",
      targetPhone: "t",
      targetClass: "stop",
      manner: "stop",
      continuity: "closure_release",
      cueEvidenceRefs: ["practice-cue-review:nl-BE:t:r1"],
      review: {
        status: "reviewed",
        evidenceRefs: ["profile-review:nl-BE:t:r1"],
        reviewedAt: "2026-09-29T15:00:00.000Z",
      },
    });

    assert.throws(
      () =>
        createSpeechPracticeIntent({
          profile: stopProfile,
          units: [
            {
              unitId: "t-hold",
              action: "sustain",
              displayText: "t",
              ipa: "t",
              repetitions: 3,
              pauseMs: 650,
            },
          ],
        }),
      /SUSTAIN_NOT_ALLOWED_FOR_PROFILE/u,
    );
  });

  it("classifies authored lexical words into 1, 2, 3, and 4+ syllable buckets", () => {
    assert.equal(classifySyllableCount(1), "monosyllable");
    assert.equal(classifySyllableCount(2), "disyllable");
    assert.equal(classifySyllableCount(3), "trisyllable");
    assert.equal(classifySyllableCount(4), "polysyllable");
    assert.equal(classifySyllableCount(7), "polysyllable");
  });

  it("carries authored syllable structure into target drafts without inferring it from spelling", () => {
    const intent = createSpeechPracticeIntent({
      profile: sProfile,
      units: [
        {
          unitId: "sun",
          action: "lexical",
          displayText: "sun",
          ipa: "sʌn",
          repetitions: 2,
          pauseMs: 700,
          syllableStructure: {
            count: 1,
            syllables: ["sun"],
            stressSyllableIndex: 0,
          },
        },
        {
          unitId: "sunny",
          action: "lexical",
          displayText: "sunny",
          ipa: "ˈsʌni",
          repetitions: 2,
          pauseMs: 700,
          syllableStructure: {
            count: 2,
            syllables: ["sun", "ny"],
            stressSyllableIndex: 0,
          },
        },
        {
          unitId: "saturday",
          action: "lexical",
          displayText: "Saturday",
          ipa: "ˈsætərdeɪ",
          repetitions: 1,
          pauseMs: 800,
          syllableStructure: {
            count: 3,
            syllables: ["Sat", "ur", "day"],
            stressSyllableIndex: 0,
          },
        },
        {
          unitId: "salamander",
          action: "lexical",
          displayText: "salamander",
          ipa: "ˌsæləˈmændər",
          repetitions: 1,
          pauseMs: 900,
          syllableStructure: {
            count: 4,
            syllables: ["sal", "a", "man", "der"],
            stressSyllableIndex: 2,
          },
        },
      ],
    });

    const coverage = summarizeLexicalSyllableCoverage(intent);
    assert.deepEqual(coverage, {
      monosyllable: 1,
      disyllable: 1,
      trisyllable: 1,
      polysyllable: 1,
    });

    const drafts = emitCanonicalPronunciationTargetDrafts({ profile: sProfile, intent });
    assert.deepEqual(
      drafts.map((draft) => [draft.text, draft.metadata.syllableCount, draft.metadata.syllableClass]),
      [
        ["sun", 1, "monosyllable"],
        ["sunny", 2, "disyllable"],
        ["Saturday", 3, "trisyllable"],
        ["salamander", 4, "polysyllable"],
      ],
    );
  });

  it("requires syllable structure for lexical units and validates authored segmentation", () => {
    assert.throws(
      () =>
        createSpeechPracticeIntent({
          profile: sProfile,
          units: [
            {
              unitId: "sok",
              action: "lexical",
              displayText: "sok",
              ipa: "sɔk",
              repetitions: 2,
              pauseMs: 700,
            },
          ],
        }),
      /LEXICAL_UNIT_REQUIRES_AUTHORED_SYLLABLE_STRUCTURE/u,
    );

    assert.throws(
      () =>
        createSpeechPracticeIntent({
          profile: sProfile,
          units: [
            {
              unitId: "bad-segmentation",
              action: "lexical",
              displayText: "banana",
              ipa: "bəˈnænə",
              repetitions: 1,
              pauseMs: 700,
              syllableStructure: {
                count: 3,
                syllables: ["ba", "nana"],
                stressSyllableIndex: 1,
              },
            },
          ],
        }),
      /SYLLABLE_SEGMENT_COUNT_MISMATCH/u,
    );
  });
});
