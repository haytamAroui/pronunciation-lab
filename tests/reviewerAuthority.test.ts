import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertReviewerAuthorizedAt,
  createReviewerAuthorityRecord,
  retireReviewerAuthorityRecord,
  verifyReviewerAuthorityRecord,
} from "../src/index.js";

describe("reviewer authority", () => {
  it("creates a verifiable scoped authority record", () => {
    const authority = createReviewerAuthorityRecord({
      reviewerId: "reviewer:native-nl-001",
      role: "native_linguistic",
      localeScopes: ["nl-BE"],
      targetClassScopes: ["s_initial_singleton"],
      qualificationRefs: ["credential:native-nl-BE:001"],
      authorizedAt: "2026-09-29T08:00:00.000Z",
    });

    assert.deepEqual(verifyReviewerAuthorityRecord(authority), []);
    assert.doesNotThrow(() =>
      assertReviewerAuthorizedAt({
        authority,
        reviewerId: "reviewer:native-nl-001",
        role: "native_linguistic",
        locale: "nl-BE",
        targetClass: "s_initial_singleton",
        at: "2026-09-29T09:00:00.000Z",
      }),
    );
  });

  it("rejects role and locale scope mismatches", () => {
    const authority = createReviewerAuthorityRecord({
      reviewerId: "reviewer:native-nl-001",
      role: "native_linguistic",
      localeScopes: ["nl-BE"],
      qualificationRefs: ["credential:native-nl-BE:001"],
      authorizedAt: "2026-09-29T08:00:00.000Z",
    });

    assert.throws(
      () =>
        assertReviewerAuthorizedAt({
          authority,
          reviewerId: authority.reviewerId,
          role: "clinical",
          locale: "nl-BE",
          at: "2026-09-29T09:00:00.000Z",
        }),
      /role mismatch/u,
    );
    assert.throws(
      () =>
        assertReviewerAuthorizedAt({
          authority,
          reviewerId: authority.reviewerId,
          role: "native_linguistic",
          locale: "fr-BE",
          at: "2026-09-29T09:00:00.000Z",
        }),
      /does not cover locale/u,
    );
  });

  it("preserves historical validity before retirement but blocks reviews after retirement", () => {
    const active = createReviewerAuthorityRecord({
      reviewerId: "reviewer:slp-001",
      role: "clinical",
      localeScopes: ["nl-BE"],
      qualificationRefs: ["credential:clinical:001"],
      authorizedAt: "2026-09-29T08:00:00.000Z",
    });
    const retired = retireReviewerAuthorityRecord({
      authority: active,
      retiredAt: "2026-09-29T12:00:00.000Z",
      retirementReason: "authorization ended",
    });

    assert.doesNotThrow(() =>
      assertReviewerAuthorizedAt({
        authority: retired,
        reviewerId: retired.reviewerId,
        role: "clinical",
        locale: "nl-BE",
        at: "2026-09-29T11:00:00.000Z",
      }),
    );
    assert.throws(
      () =>
        assertReviewerAuthorizedAt({
          authority: retired,
          reviewerId: retired.reviewerId,
          role: "clinical",
          locale: "nl-BE",
          at: "2026-09-29T12:30:00.000Z",
        }),
      /retired/u,
    );
  });
});
