import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createReviewedArticulationProfile,
  createSpeechPracticeIntent,
  emitCanonicalPronunciationTargetDrafts,
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
});
