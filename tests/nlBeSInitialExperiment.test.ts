import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNlBeSInitialCandidateMatrices,
  createNlBeSInitialDraftRegistry,
  createNlBeSInitialNativeReviewPacket,
  createReviewedNlBeSInitialTargetRecord,
  createReviewerAuthorityRecord,
  NL_BE_S_INITIAL_DRAFT_ITEMS,
  NL_BE_S_INITIAL_EXPERIMENT_ID,
  NL_BE_S_INITIAL_REVIEW_CHECKLIST,
  SOUNDSTEPS_SOURCE_COMMIT,
  submitNlBeSInitialNativeTargetReview,
} from "../src/index.js";

const nativeAuthority = createReviewerAuthorityRecord({
  reviewerId: "reviewer:native-nl-001",
  role: "native_linguistic",
  localeScopes: ["nl-BE"],
  targetClassScopes: ["s_initial_singleton"],
  qualificationRefs: ["credential:native-nl-BE:test"],
  authorizedAt: "2026-09-29T01:00:00.000Z",
});

describe("nl-BE /s/ initial R1 experiment", () => {
  it("contains exactly 12 explicit singleton-onset authoring items", () => {
    assert.equal(NL_BE_S_INITIAL_DRAFT_ITEMS.length, 12);
    assert.equal(new Set(NL_BE_S_INITIAL_DRAFT_ITEMS.map((item) => item.itemId)).size, 12);
    assert.equal(new Set(NL_BE_S_INITIAL_DRAFT_ITEMS.map((item) => item.text)).size, 12);

    for (const item of NL_BE_S_INITIAL_DRAFT_ITEMS) {
      assert.equal(item.targetPhoneme, "/s/");
      assert.equal(item.wordPosition, "initial");
      assert.equal(item.clusterType, "singleton");
      assert.equal(item.reviewStatus, "pending_native_review");
    }
  });

  it("pins six SoundSteps authored preview words to an exact repository commit", () => {
    const imported = NL_BE_S_INITIAL_DRAFT_ITEMS.filter(
      (item) => item.source === "soundsteps_authored_preview",
    );
    assert.deepEqual(imported.map((item) => item.text), ["sap", "sok", "soep", "sop", "suf", "som"]);
    assert.equal(SOUNDSTEPS_SOURCE_COMMIT.length, 40);
  });

  it("keeps all authoring entries draft until authorized native review exists", () => {
    const registry = createNlBeSInitialDraftRegistry();
    assert.ok(registry.every((record) => record.approval.status === "draft"));
    assert.ok(
      registry.every(
        (record) => record.target.metadata.experimentId === NL_BE_S_INITIAL_EXPERIMENT_ID,
      ),
    );
    assert.ok(NL_BE_S_INITIAL_REVIEW_CHECKLIST.length >= 8);
  });

  it("creates an explicit 12-item native-review packet", () => {
    const packet = createNlBeSInitialNativeReviewPacket();
    assert.equal(packet.items.length, 12);
    assert.equal(packet.locale, "nl-BE");
    assert.equal(packet.targetClass, "s_initial_singleton");
  });

  it("refuses a passing review when mandatory checks do not all pass", () => {
    const packet = createNlBeSInitialNativeReviewPacket();
    const item = packet.items[0]!;
    assert.throws(
      () =>
        submitNlBeSInitialNativeTargetReview({
          packet,
          itemId: item.itemId,
          reviewerAuthority: nativeAuthority,
          reviewedAt: "2026-09-29T02:00:00.000Z",
          submission: {
            lexicalSuitability: "no",
            canonicalIpa: item.referenceIpaCandidate,
            initialSConfirmed: "yes",
            singletonOnsetConfirmed: "yes",
            followingPhone: item.referenceFollowingPhone,
            syllableCount: item.referenceSyllableCount,
            stressIndex: 0,
            ambiguityAcceptable: "yes",
            conceptImageSuitable: "yes",
            overallDecision: "pass",
          },
        }),
      /mandatory answer/u,
    );
  });

  it("builds candidate matrices only after all 12 have authorized passing target reviews", () => {
    const packet = createNlBeSInitialNativeReviewPacket();
    const reviewed = packet.items.map((item, index) => {
      const evidence = submitNlBeSInitialNativeTargetReview({
        packet,
        itemId: item.itemId,
        reviewerAuthority: nativeAuthority,
        reviewedAt: "2026-09-29T02:00:00.000Z",
        submission: {
          lexicalSuitability: "yes",
          canonicalIpa: item.referenceIpaCandidate,
          initialSConfirmed: "yes",
          singletonOnsetConfirmed: "yes",
          followingPhone: item.referenceFollowingPhone,
          syllableCount: item.referenceSyllableCount,
          stressIndex: 0,
          ambiguityAcceptable: "yes",
          conceptImageSuitable: "yes",
          overallDecision: "pass",
          note: `test review ${index}`,
        },
      });
      return createReviewedNlBeSInitialTargetRecord({
        reviewEvidence: evidence,
        registryVersion: "1.0.0-test",
      });
    });

    const matrices = buildNlBeSInitialCandidateMatrices({
      targetRecords: reviewed,
      comparison: {
        edgeVoiceId: "nl-BE-DenaNeural",
        azureVoiceId: "nl-BE-DenaNeural",
        rates: [0, -8, -15],
      },
    });

    assert.equal(matrices.length, 12);
    assert.equal(matrices.flatMap((matrix) => matrix.candidates).length, 60);
    assert.ok(
      reviewed.every(
        (record) =>
          record.approval.status === "native_reviewed" &&
          record.approval.reviewerAuthorityIds?.includes(nativeAuthority.authorityId),
      ),
    );
  });
});
