import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adjudicatePronunciationReadings,
  createPronunciationReadingProposal,
  createPronunciationSourceEvidence,
  createReviewerAuthorityRecord,
  createTargetRegistryRecordFromReadingSet,
} from "../src/index.js";

describe("pronunciation source authority", () => {
  const official = createPronunciationSourceEvidence({
    sourceType: "official",
    sourceRef: "https://example.test/pronunciation",
    sourceLabel: "Official pronunciation page",
    locale: "en-US",
    text: "example",
    readingIpa: "/ɪɡˈzæmpəl/",
    strength: "direct",
    observedAt: "2026-09-29T12:00:00.000Z",
  });
  const dictionary = createPronunciationSourceEvidence({
    sourceType: "dictionary",
    sourceRef: "dictionary:test",
    locale: "en-US",
    text: "example",
    readingIpa: "/ɪɡˈzæmpəl/",
    strength: "strong",
    observedAt: "2026-09-29T12:01:00.000Z",
  });

  it("aggregates matching sources into a proposal without granting authority", () => {
    const proposal = createPronunciationReadingProposal({
      locale: "en-US",
      text: "example",
      ipa: "/ɪɡˈzæmpəl/",
      evidence: [official, dictionary],
    });
    assert.equal(proposal.sourceEvidenceIds.length, 2);
    assert.equal(proposal.authority, "reading_proposal_only");
  });

  it("requires native-linguistic adjudication before canonical target creation", () => {
    const proposal = createPronunciationReadingProposal({
      locale: "en-US",
      text: "example",
      ipa: "/ɪɡˈzæmpəl/",
      evidence: [official, dictionary],
    });
    const authority = createReviewerAuthorityRecord({
      reviewerId: "reviewer:en-us:1",
      role: "native_linguistic",
      localeScopes: ["en-US"],
      qualificationRefs: ["credential:test"],
      authorizedAt: "2026-09-29T11:00:00.000Z",
    });
    const set = adjudicatePronunciationReadings({
      proposals: [proposal],
      decisions: [{ proposalId: proposal.proposalId, disposition: "canonical" }],
      outcome: "canonicalized",
      reviewerAuthority: authority,
      adjudicatedAt: "2026-09-29T13:00:00.000Z",
    });
    const record = createTargetRegistryRecordFromReadingSet({
      readingSet: set,
      targetId: "en-US:example",
      registryVersion: "1.0.0",
      role: "pronunciation_reference",
    });
    assert.equal(record.approval.status, "native_reviewed");
    assert.equal(record.target.canonicalIpa, "/ɪɡˈzæmpəl/");
  });

  it("can explicitly preserve a contested reading set without producing a canonical target", () => {
    const altEvidence = createPronunciationSourceEvidence({
      sourceType: "community_usage",
      sourceRef: "community:test",
      locale: "en-US",
      text: "example",
      readingIpa: "/ɛɡˈzæmpəl/",
      strength: "moderate",
      observedAt: "2026-09-29T12:02:00.000Z",
    });
    const a = createPronunciationReadingProposal({
      locale: "en-US",
      text: "example",
      ipa: "/ɪɡˈzæmpəl/",
      evidence: [official],
    });
    const b = createPronunciationReadingProposal({
      locale: "en-US",
      text: "example",
      ipa: "/ɛɡˈzæmpəl/",
      evidence: [altEvidence],
    });
    const authority = createReviewerAuthorityRecord({
      reviewerId: "reviewer:en-us:2",
      role: "native_linguistic",
      localeScopes: ["en-US"],
      qualificationRefs: ["credential:test"],
      authorizedAt: "2026-09-29T11:00:00.000Z",
    });
    const set = adjudicatePronunciationReadings({
      proposals: [a, b],
      decisions: [
        { proposalId: a.proposalId, disposition: "accepted_variant" },
        { proposalId: b.proposalId, disposition: "accepted_variant" },
      ],
      outcome: "contested",
      reviewerAuthority: authority,
      adjudicatedAt: "2026-09-29T13:00:00.000Z",
    });
    assert.equal(set.outcome, "contested");
    assert.throws(
      () =>
        createTargetRegistryRecordFromReadingSet({
          readingSet: set,
          targetId: "en-US:example",
          registryVersion: "1.0.0",
          role: "pronunciation_reference",
        }),
      /canonicalized/u,
    );
  });
});
