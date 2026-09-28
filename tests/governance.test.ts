import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCandidate,
  buildRenderArtifact,
  createAcousticQaResult,
  createArtifactReviewBindingFingerprint,
  createBlindSession,
  createGovernedCandidatePlan,
  createReleasedReference,
  createRendererEligibilityRecord,
  createRenderingProfile,
  createTargetRegistryRecord,
  createTechnicalQaResult,
  hasActiveReleaseForArtifact,
  routeRejection,
  type CandidateReviewEvidence,
  type CanonicalPronunciationTarget,
} from "../src/index.js";

const target: CanonicalPronunciationTarget = Object.freeze({
  targetId: "test:nl-BE:sok",
  locale: "nl-BE",
  text: "sok",
  canonicalIpa: "/sɔk/",
  role: "pronunciation_reference",
  metadata: Object.freeze({ targetClass: "s_initial" }),
});

const renderer = Object.freeze({
  kind: "tts" as const,
  rendererId: "edge_tts",
  rendererVersion: "edge-tts:test-version",
});

function makeFixture(profileVersion = "1.0.0", targetVersion = "1.0.0") {
  const targetRecord = createTargetRegistryRecord({
    target,
    registryVersion: targetVersion,
    approval: {
      status: "native_reviewed",
      evidenceIds: ["target-review:native-001"],
      approvedAt: "2026-09-28T18:00:00.000Z",
      reviewerRole: "native_linguistic",
    },
  });
  const profile = createRenderingProfile({
    profileId: "profile:nl-BE:s-initial:child-reference",
    version: profileVersion,
    locale: "nl-BE",
    targetClass: "s_initial",
    intent: {
      rate: "natural",
      salience: "enhanced_without_exaggeration",
      childImitationModel: true,
    },
  });
  const eligibility = createRendererEligibilityRecord({
    renderer,
    locale: "nl-BE",
    targetClass: "s_initial",
    controlMode: "provider_default",
    status: "eligible_for_candidate_generation",
    rationale: "Eligible only to generate a review candidate; no pronunciation approval is implied.",
  });
  const candidate = buildCandidate({
    target,
    renderer: {
      kind: "tts",
      provider: "edge_tts",
      voiceId: "nl-BE-DenaNeural",
      pronunciation: { mode: "provider_default" },
      ratePercent: 0,
      pitchPercent: 0,
    },
  });
  const plan = createGovernedCandidatePlan({
    targetRecord,
    renderingProfile: profile,
    eligibility,
    candidate,
    renderer,
  });
  const artifact = buildRenderArtifact({
    candidate,
    bytes: new Uint8Array([1, 2, 3, 4]),
    mediaType: "audio/mpeg",
    createdAt: "2026-09-28T18:05:00.000Z",
  });
  const technicalQa = createTechnicalQaResult({
    artifactId: artifact.artifactId,
    checkedAt: "2026-09-28T18:06:00.000Z",
    checks: [{ name: "decode", passed: true }],
  });
  const acousticQa = createAcousticQaResult({
    artifactId: artifact.artifactId,
    status: "abstain",
    reason: "insufficient_alignment_confidence",
    checkedAt: "2026-09-28T18:07:00.000Z",
  });
  const session = createBlindSession({
    sessionId: "session:governance-001",
    createdAt: "2026-09-28T18:08:00.000Z",
    targetId: target.targetId,
    candidateIds: [candidate.candidateId],
  });
  return { targetRecord, profile, eligibility, candidate, plan, artifact, technicalQa, acousticQa, session };
}

function evidence(
  fixture: ReturnType<typeof makeFixture>,
  role: "native_linguistic" | "clinical",
  suffix: string,
): CandidateReviewEvidence {
  const blindLabel = fixture.session.assignments[0]!.blindLabel;
  return Object.freeze({
    schemaVersion: "1.0.0",
    evidenceId: `evidence:${suffix}`,
    sessionId: fixture.session.sessionId,
    blindLabel,
    artifactBindingFingerprint: createArtifactReviewBindingFingerprint({
      sessionId: fixture.session.sessionId,
      blindLabel,
      candidateId: fixture.candidate.candidateId,
      artifactId: fixture.artifact.artifactId,
      audioSha256: fixture.artifact.audioSha256,
    }),
    reviewerId: `reviewer:${suffix}`,
    reviewerRole: role,
    reviewedAt: "2026-09-28T18:10:00.000Z",
    dimensions: Object.freeze([
      Object.freeze({
        dimension: role === "native_linguistic" ? "linguistic_correctness" as const : "task_suitability" as const,
        decision: "pass" as const,
      }),
    ]),
    criticalFlags: Object.freeze([]),
    overallDecision: "pass",
  });
}

function passingEvidence(fixture: ReturnType<typeof makeFixture>) {
  return [
    evidence(fixture, "native_linguistic", "linguistic"),
    evidence(fixture, "clinical", "clinical"),
  ];
}

describe("governed release pipeline", () => {
  it("never allows machine QA alone to create a release", () => {
    const fixture = makeFixture();
    assert.throws(
      () =>
        createReleasedReference({
          plan: fixture.plan,
          artifact: fixture.artifact,
          technicalQa: fixture.technicalQa,
          acousticQa: fixture.acousticQa,
          session: fixture.session,
          evidence: [],
          releasedAt: "2026-09-28T18:12:00.000Z",
        }),
      /explicit passing native_linguistic review/u,
    );
  });

  it("allows acoustic QA to abstain when both human authorities pass for the exact artifact", () => {
    const fixture = makeFixture();
    const release = createReleasedReference({
      plan: fixture.plan,
      artifact: fixture.artifact,
      technicalQa: fixture.technicalQa,
      acousticQa: fixture.acousticQa,
      session: fixture.session,
      evidence: passingEvidence(fixture),
      releasedAt: "2026-09-28T18:12:00.000Z",
    });

    assert.equal(release.acousticQaStatus, "abstain");
    assert.equal(release.authority, "human_approved_release");
    assert.equal(hasActiveReleaseForArtifact({ artifact: fixture.artifact, releases: [release] }), true);
  });

  it("blocks reuse of human review for different bytes from the same candidate", () => {
    const fixture = makeFixture();
    const differentArtifact = buildRenderArtifact({
      candidate: fixture.candidate,
      bytes: new Uint8Array([9, 9, 9, 9]),
      mediaType: "audio/mpeg",
      createdAt: "2026-09-28T18:11:00.000Z",
    });
    const technicalQa = createTechnicalQaResult({
      artifactId: differentArtifact.artifactId,
      checkedAt: "2026-09-28T18:11:10.000Z",
      checks: [{ name: "decode", passed: true }],
    });
    const acousticQa = createAcousticQaResult({
      artifactId: differentArtifact.artifactId,
      status: "abstain",
      reason: "not_analyzed",
      checkedAt: "2026-09-28T18:11:20.000Z",
    });

    assert.throws(
      () =>
        createReleasedReference({
          plan: fixture.plan,
          artifact: differentArtifact,
          technicalQa,
          acousticQa,
          session: fixture.session,
          evidence: passingEvidence(fixture),
          releasedAt: "2026-09-28T18:12:00.000Z",
        }),
      /does not bind to the release artifact bytes/u,
    );
  });

  it("blocks release when technical QA fails", () => {
    const fixture = makeFixture();
    const failedTechnicalQa = createTechnicalQaResult({
      artifactId: fixture.artifact.artifactId,
      checkedAt: "2026-09-28T18:06:00.000Z",
      checks: [{ name: "no_clipping", passed: false }],
    });
    assert.throws(
      () =>
        createReleasedReference({
          plan: fixture.plan,
          artifact: fixture.artifact,
          technicalQa: failedTechnicalQa,
          acousticQa: fixture.acousticQa,
          session: fixture.session,
          evidence: passingEvidence(fixture),
          releasedAt: "2026-09-28T18:12:00.000Z",
        }),
      /Technical QA is blocking/u,
    );
  });

  it("creates a different release when target or profile version changes", () => {
    const first = makeFixture("1.0.0", "1.0.0");
    const second = makeFixture("1.0.1", "1.0.1");
    const release = (fixture: ReturnType<typeof makeFixture>) =>
      createReleasedReference({
        plan: fixture.plan,
        artifact: fixture.artifact,
        technicalQa: fixture.technicalQa,
        acousticQa: fixture.acousticQa,
        session: fixture.session,
        evidence: passingEvidence(fixture),
        releasedAt: "2026-09-28T18:12:00.000Z",
      });

    assert.notEqual(release(first).releaseId, release(second).releaseId);
  });

  it("routes structured rejection reasons to the owning layer", () => {
    assert.equal(routeRejection("ipa_error"), "target_registry");
    assert.equal(routeRejection("rate_unsuitable"), "rendering_profile");
    assert.equal(routeRejection("renderer_artifact"), "rerender_or_change_renderer");
    assert.equal(routeRejection("child_model_unsuitable"), "human_clinical_redesign");
  });
});
