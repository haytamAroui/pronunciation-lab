import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createNlBeSInitialNativeReviewBundle,
  createNlBeSInitialNativeReviewResponse,
  createNlBeSInitialNativeReviewResponseTemplate,
  createReviewerAuthorityRecord,
  importNlBeSInitialNativeReviewResponse,
  renderNlBeSInitialNativeReviewSheetMarkdown,
  serializeNlBeSInitialNativeReviewBundle,
  verifyNlBeSInitialNativeReviewBundle,
  verifyNlBeSInitialNativeReviewResponse,
  type NlBeSInitialNativeReviewResponseItem,
} from "../src/index.js";

const reviewerAuthority = createReviewerAuthorityRecord({
  reviewerId: "reviewer:native-nl-001",
  role: "native_linguistic",
  localeScopes: ["nl-BE"],
  targetClassScopes: ["s_initial_singleton"],
  qualificationRefs: ["credential:native-nl-BE:test"],
  authorizedAt: "2026-09-29T08:00:00.000Z",
});

function bundle() {
  return createNlBeSInitialNativeReviewBundle({
    reviewerAuthority,
    createdAt: "2026-09-29T09:00:00.000Z",
  });
}

function passingItems(): NlBeSInitialNativeReviewResponseItem[] {
  const reviewBundle = bundle();
  return reviewBundle.packet.items.map((item) => ({
    itemId: item.itemId,
    reviewedAt: "2026-09-29T10:00:00.000Z",
    lexicalSuitability: "yes" as const,
    canonicalIpa: item.referenceIpaCandidate,
    initialSConfirmed: "yes" as const,
    singletonOnsetConfirmed: "yes" as const,
    followingPhone: item.referenceFollowingPhone,
    syllableCount: item.referenceSyllableCount,
    stressIndex: 0,
    ambiguityAcceptable: "yes" as const,
    conceptImageSuitable: "yes" as const,
    overallDecision: "pass" as const,
    note: "test-only simulated native answer",
  }));
}

describe("nl-BE /s/ initial portable review bundle", () => {
  it("creates a deterministic bundle pinned to packet and reviewer authority", () => {
    const reviewBundle = bundle();

    assert.deepEqual(verifyNlBeSInitialNativeReviewBundle(reviewBundle), []);
    assert.match(reviewBundle.bundleId, /^native-review-bundle:/u);
    assert.equal(reviewBundle.packet.items.length, 12);
    assert.equal(
      reviewBundle.reviewerAuthority.authorityId,
      reviewerAuthority.authorityId,
    );
    assert.equal(serializeNlBeSInitialNativeReviewBundle(reviewBundle).endsWith("\n"), true);
  });

  it("renders a human-readable sheet without creating approval evidence", () => {
    const reviewBundle = bundle();
    const markdown = renderNlBeSInitialNativeReviewSheetMarkdown(reviewBundle);

    assert.match(markdown, /Reference IPA and phonetic metadata are hints only/u);
    assert.match(markdown, /\| sap \|/u);
    assert.match(markdown, /editing this Markdown file alone does not create approval evidence/u);
  });

  it("creates a JSON response template with explicit empty review decisions", () => {
    const template = createNlBeSInitialNativeReviewResponseTemplate(bundle());

    assert.equal(template.items.length, 12);
    assert.equal(template.items[0]!.reviewedAt, null);
    assert.equal(template.items[0]!.overallDecision, null);
    assert.notEqual(template.items[0]!.canonicalIpa, "");
  });

  it("imports a complete authorized passing response into 12 reviewed targets", () => {
    const reviewBundle = bundle();
    const response = createNlBeSInitialNativeReviewResponse({
      bundle: reviewBundle,
      submittedAt: "2026-09-29T11:00:00.000Z",
      items: passingItems(),
    });

    assert.deepEqual(
      verifyNlBeSInitialNativeReviewResponse({ bundle: reviewBundle, response }),
      [],
    );

    const result = importNlBeSInitialNativeReviewResponse({
      bundle: reviewBundle,
      response,
      registryVersion: "1.0.0-review-test",
    });

    assert.equal(result.evidence.length, 12);
    assert.equal(result.promotedTargets.length, 12);
    assert.equal(result.blockedItems.length, 0);
    assert.equal(result.readyForCandidateGeneration, true);
  });

  it("preserves failed review decisions as evidence but does not promote them", () => {
    const reviewBundle = bundle();
    const items = passingItems();
    items[6] = {
      ...items[6]!,
      lexicalSuitability: "no",
      overallDecision: "fail",
      note: "not suitable for the intended child set",
    };
    const response = createNlBeSInitialNativeReviewResponse({
      bundle: reviewBundle,
      submittedAt: "2026-09-29T11:00:00.000Z",
      items,
    });

    const result = importNlBeSInitialNativeReviewResponse({
      bundle: reviewBundle,
      response,
      registryVersion: "1.0.0-review-test",
    });

    assert.equal(result.evidence.length, 12);
    assert.equal(result.promotedTargets.length, 11);
    assert.equal(result.blockedItems.length, 1);
    assert.equal(result.blockedItems[0]!.decision, "fail");
    assert.equal(result.readyForCandidateGeneration, false);
  });

  it("detects bundle and response tampering", () => {
    const reviewBundle = bundle();
    const tamperedBundle = {
      ...reviewBundle,
      packet: {
        ...reviewBundle.packet,
        locale: "fr-BE" as "nl-BE",
      },
    };
    assert.ok(
      verifyNlBeSInitialNativeReviewBundle(tamperedBundle).includes(
        "REVIEW_PACKET_MISMATCH",
      ),
    );

    const response = createNlBeSInitialNativeReviewResponse({
      bundle: reviewBundle,
      submittedAt: "2026-09-29T11:00:00.000Z",
      items: passingItems(),
    });
    const tamperedResponse = {
      ...response,
      items: response.items.map((item, index) =>
        index === 0 ? { ...item, canonicalIpa: "/tampered/" } : item,
      ),
    };
    assert.ok(
      verifyNlBeSInitialNativeReviewResponse({
        bundle: reviewBundle,
        response: tamperedResponse,
      }).includes("RESPONSE_FINGERPRINT_MISMATCH"),
    );
  });
});
