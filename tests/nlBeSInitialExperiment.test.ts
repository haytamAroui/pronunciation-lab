import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNlBeSInitialCandidateMatrices,
  createNlBeSInitialDraftRegistry,
  createReviewedNlBeSInitialTargetRecord,
  NL_BE_S_INITIAL_DRAFT_ITEMS,
  NL_BE_S_INITIAL_EXPERIMENT_ID,
  NL_BE_S_INITIAL_REVIEW_CHECKLIST,
  SOUNDSTEPS_SOURCE_COMMIT,
} from "../src/index.js";

describe("nl-BE /s/ initial R1 experiment", () => {
  it("contains exactly 12 explicit singleton-onset authoring items", () => {
    assert.equal(NL_BE_S_INITIAL_DRAFT_ITEMS.length, 12);
    assert.equal(new Set(NL_BE_S_INITIAL_DRAFT_ITEMS.map((item) => item.itemId)).size, 12);
    assert.equal(new Set(NL_BE_S_INITIAL_DRAFT_ITEMS.map((item) => item.text)).size, 12);

    for (const item of NL_BE_S_INITIAL_DRAFT_ITEMS) {
      assert.equal(item.targetPhoneme, "/s/");
      assert.equal(item.wordPosition, "initial");
      assert.equal(item.syllableRole, "onset");
      assert.equal(item.clusterType, "singleton");
      assert.equal(item.reviewStatus, "pending_native_review");
    }
  });

  it("pins the six existing SoundSteps authored preview words to an exact repository commit", () => {
    const imported = NL_BE_S_INITIAL_DRAFT_ITEMS.filter(
      (item) => item.source === "soundsteps_authored_preview",
    );
    assert.deepEqual(
      imported.map((item) => item.text),
      ["sap", "sok", "soep", "sop", "suf", "som"],
    );
    assert.equal(SOUNDSTEPS_SOURCE_COMMIT.length, 40);
    assert.ok(imported.every((item) => item.sourceRefs[0]!.includes(SOUNDSTEPS_SOURCE_COMMIT)));
  });

  it("keeps all imported and reference-candidate IPA outside native authority by default", () => {
    const registry = createNlBeSInitialDraftRegistry();
    assert.equal(registry.length, 12);
    assert.ok(registry.every((record) => record.approval.status === "draft"));
    assert.ok(
      registry.every(
        (record) => record.target.metadata.experimentId === NL_BE_S_INITIAL_EXPERIMENT_ID,
      ),
    );
    assert.ok(NL_BE_S_INITIAL_REVIEW_CHECKLIST.length >= 8);
  });

  it("blocks renderer matrices until every target has explicit native-linguistic approval", () => {
    const draft = createNlBeSInitialDraftRegistry();
    assert.throws(
      () =>
        buildNlBeSInitialCandidateMatrices({
          targetRecords: draft,
          comparison: {
            edgeVoiceId: "nl-BE-DenaNeural",
            azureVoiceId: "nl-BE-DenaNeural",
          },
        }),
      /not native-reviewed/u,
    );
  });

  it("can build a deterministic 12-target comparison only after explicit approvals are supplied", () => {
    const reviewed = NL_BE_S_INITIAL_DRAFT_ITEMS.map((item, index) =>
      createReviewedNlBeSInitialTargetRecord({
        itemId: item.itemId,
        canonicalIpa: item.referenceIpaCandidate,
        evidenceIds: [`native-review:test:${index}`],
        approvedAt: "2026-09-29T02:00:00.000Z",
        registryVersion: "1.0.0-test",
      }),
    );

    const matrices = buildNlBeSInitialCandidateMatrices({
      targetRecords: reviewed,
      comparison: {
        edgeVoiceId: "nl-BE-DenaNeural",
        azureVoiceId: "nl-BE-DenaNeural",
        rates: [0, -8, -15],
      },
    });

    assert.equal(matrices.length, 12);
    assert.ok(matrices.every((matrix) => matrix.candidates.length === 5));
    assert.equal(matrices.flatMap((matrix) => matrix.candidates).length, 60);
    assert.ok(
      matrices
        .flatMap((matrix) => matrix.candidates)
        .every((candidate) => candidate.authority === "experiment_only"),
    );
  });
});
