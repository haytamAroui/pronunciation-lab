import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendRelease,
  createReleasedPronunciationCatalog,
  createTargetRegistryRecord,
  searchReleasedPronunciationCatalog,
  serializeReleasedPronunciationCatalog,
  verifyReleasedPronunciationCatalog,
  type ReleasedReference,
} from "../src/index.js";

const targetRecord = createTargetRegistryRecord({
  target: {
    targetId: "en-US:hello",
    locale: "en-US",
    text: "hello",
    canonicalIpa: "/həˈloʊ/",
    role: "pronunciation_reference",
    metadata: {
      readingSetId: "reading-set:test",
      readingSetFingerprint: `sha256:${"1".repeat(64)}`,
    },
  },
  registryVersion: "1.0.0",
  approval: {
    status: "native_reviewed",
    evidenceIds: ["source:test"],
    reviewerAuthorityIds: ["authority:test"],
    approvedAt: "2026-09-29T12:00:00.000Z",
    reviewerRole: "native_linguistic",
  },
});

const release: ReleasedReference = Object.freeze({
  schemaVersion: "1.0.0",
  releaseId: "release:test",
  targetId: "en-US:hello",
  targetRegistryVersion: "1.0.0",
  artifactId: "artifact:test",
  audioSha256: `sha256:${"a".repeat(64)}`,
  candidateId: "candidate:test",
  renderingProfileId: "profile:test",
  renderingProfileVersion: "1.0.0",
  rendererIdentity: "human_recording",
  rendererVersion: "1.0.0",
  linguisticReviewEvidenceIds: Object.freeze(["review:linguistic"]),
  clinicalReviewEvidenceIds: Object.freeze(["review:clinical"]),
  technicalQaId: "qa:technical",
  acousticQaId: "qa:acoustic",
  acousticQaStatus: "abstain",
  releasedAt: "2026-09-29T13:00:00.000Z",
  releaseManifestFingerprint: `sha256:${"b".repeat(64)}`,
  status: "active",
  authority: "human_approved_release",
});

describe("released pronunciation catalog", () => {
  it("builds a searchable consumer-neutral catalog from active governed releases", () => {
    const ledger = appendRelease({ ledger: [], release });
    const catalog = createReleasedPronunciationCatalog({
      generatedAt: "2026-09-29T14:00:00.000Z",
      releaseLedger: ledger,
      targetRecords: [targetRecord],
    });
    assert.deepEqual(verifyReleasedPronunciationCatalog(catalog), []);
    assert.equal(catalog.entries.length, 1);
    assert.equal(catalog.entries[0]!.readingSetId, "reading-set:test");
    assert.equal(searchReleasedPronunciationCatalog({ catalog, query: "hell" }).length, 1);
    assert.equal(searchReleasedPronunciationCatalog({ catalog, locale: "ar" }).length, 0);
    assert.equal(serializeReleasedPronunciationCatalog(catalog).endsWith("\n"), true);
  });
});
