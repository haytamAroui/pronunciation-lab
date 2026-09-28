import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCandidate,
  createBlindSession,
  createGovernedCandidatePlan,
  createHumanRecordingEscalation,
  createHumanRecordingProtocol,
  createRendererEligibilityRecord,
  createRenderingProfile,
  createTargetRegistryRecord,
  ingestHumanRecording,
  selectCandidate,
  verifyHumanRecordingIngestion,
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

function review(
  sessionId: string,
  blindLabel: string,
  role: "native_linguistic" | "clinical",
  suffix: string,
): CandidateReviewEvidence {
  return Object.freeze({
    schemaVersion: "1.0.0",
    evidenceId: `evidence:${suffix}`,
    sessionId,
    blindLabel,
    reviewerId: `reviewer:${suffix}`,
    reviewerRole: role,
    reviewedAt: "2026-09-28T20:00:00.000Z",
    dimensions: Object.freeze([
      Object.freeze({
        dimension: role === "native_linguistic" ? "linguistic_correctness" as const : "task_suitability" as const,
        decision: "fail" as const,
      }),
    ]),
    criticalFlags: Object.freeze(["candidate_rejected"]),
    overallDecision: "fail",
  });
}

function failedSyntheticExperiment() {
  const candidates = [
    buildCandidate({
      target,
      renderer: {
        kind: "tts",
        provider: "edge_tts",
        voiceId: "nl-BE-DenaNeural",
        pronunciation: { mode: "provider_default" },
        ratePercent: 0,
        pitchPercent: 0,
      },
    }),
    buildCandidate({
      target,
      renderer: {
        kind: "tts",
        provider: "azure_speech",
        voiceId: "nl-BE-DenaNeural",
        pronunciation: { mode: "canonical_ipa", alphabet: "ipa", phoneString: "sɔk" },
        ratePercent: -8,
        pitchPercent: 0,
      },
    }),
  ];

  const session = createBlindSession({
    sessionId: "session:synthetic-all-fail",
    targetId: target.targetId,
    candidateIds: candidates.map((candidate) => candidate.candidateId),
    createdAt: "2026-09-28T20:01:00.000Z",
  });

  const evidence = session.assignments.flatMap((assignment, index) => [
    review(session.sessionId, assignment.blindLabel, "native_linguistic", `native-${index}`),
    review(session.sessionId, assignment.blindLabel, "clinical", `clinical-${index}`),
  ]);

  const selection = selectCandidate({ session, evidence });
  return { candidates, session, evidence, selection };
}

describe("human recording escalation and ingestion", () => {
  it("creates an escalation only after all-synthetic reviewed candidates require human recording", () => {
    const fixture = failedSyntheticExperiment();
    assert.equal(fixture.selection.disposition, "human_recording_required");

    const escalation = createHumanRecordingEscalation({
      selection: fixture.selection,
      session: fixture.session,
      candidates: fixture.candidates,
      targetId: target.targetId,
      requestedAt: "2026-09-28T20:10:00.000Z",
    });

    assert.equal(escalation.authority, "workflow_escalation_only");
    assert.equal(escalation.syntheticCandidateIds.length, 2);
    assert.ok(escalation.evidenceIds.length >= 4);
  });

  it("does not escalate when evidence is insufficient", () => {
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
    const session = createBlindSession({
      sessionId: "session:incomplete",
      targetId: target.targetId,
      candidateIds: [candidate.candidateId],
      createdAt: "2026-09-28T20:01:00.000Z",
    });
    const selection = selectCandidate({ session, evidence: [] });

    assert.throws(
      () =>
        createHumanRecordingEscalation({
          selection,
          session,
          candidates: [candidate],
          targetId: target.targetId,
          requestedAt: "2026-09-28T20:10:00.000Z",
        }),
      /requires human_recording_required disposition/u,
    );
  });

  it("hash-binds source recording bytes into both candidate identity and artifact", () => {
    const fixture = failedSyntheticExperiment();
    const escalation = createHumanRecordingEscalation({
      selection: fixture.selection,
      session: fixture.session,
      candidates: fixture.candidates,
      targetId: target.targetId,
      requestedAt: "2026-09-28T20:10:00.000Z",
    });
    const protocol = createHumanRecordingProtocol({
      protocolId: "protocol:clinical-reference-isolated-word",
      version: "1.0.0",
      locale: "nl-BE",
      targetClass: "s_initial",
      instructionsRef: "docs://human-recording-protocol/s-initial-v1",
      requireUsageAuthorization: true,
    });
    const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4, 5]);

    const ingestion = ingestHumanRecording({
      escalation,
      target,
      source: {
        recordingRef: "recording:sok:001",
        speakerRef: "speaker:adult-reference-001",
        speakerLocale: "nl-BE",
        recordedAt: "2026-09-28T20:20:00.000Z",
        protocol,
        usageAuthorizationRef: "rights:recording:sok:001",
      },
      bytes,
      mediaType: "audio/wav",
      ingestedAt: "2026-09-28T20:21:00.000Z",
    });

    assert.equal(ingestion.candidate.renderer.kind, "human");
    if (ingestion.candidate.renderer.kind !== "human") throw new Error("expected human renderer");
    assert.equal(ingestion.candidate.renderer.sourceAudioSha256, ingestion.artifact.audioSha256);
    assert.equal(ingestion.provenance.sourceAudioSha256, ingestion.artifact.audioSha256);
    assert.deepEqual(verifyHumanRecordingIngestion(ingestion), []);
  });

  it("requires usage authorization when the recording protocol requires it", () => {
    const fixture = failedSyntheticExperiment();
    const escalation = createHumanRecordingEscalation({
      selection: fixture.selection,
      session: fixture.session,
      candidates: fixture.candidates,
      targetId: target.targetId,
      requestedAt: "2026-09-28T20:10:00.000Z",
    });
    const protocol = createHumanRecordingProtocol({
      protocolId: "protocol:clinical-reference-isolated-word",
      version: "1.0.0",
      locale: "nl-BE",
      targetClass: "s_initial",
      instructionsRef: "docs://human-recording-protocol/s-initial-v1",
      requireUsageAuthorization: true,
    });

    assert.throws(
      () =>
        ingestHumanRecording({
          escalation,
          target,
          source: {
            recordingRef: "recording:sok:002",
            speakerRef: "speaker:adult-reference-002",
            speakerLocale: "nl-BE",
            recordedAt: "2026-09-28T20:20:00.000Z",
            protocol,
          },
          bytes: new Uint8Array([1, 2, 3]),
          mediaType: "audio/wav",
          ingestedAt: "2026-09-28T20:21:00.000Z",
        }),
      /requires usage authorization evidence/u,
    );
  });

  it("allows an ingested human recording into the same governed plan path", () => {
    const fixture = failedSyntheticExperiment();
    const escalation = createHumanRecordingEscalation({
      selection: fixture.selection,
      session: fixture.session,
      candidates: fixture.candidates,
      targetId: target.targetId,
      requestedAt: "2026-09-28T20:10:00.000Z",
    });
    const protocol = createHumanRecordingProtocol({
      protocolId: "protocol:clinical-reference-isolated-word",
      version: "1.0.0",
      locale: "nl-BE",
      targetClass: "s_initial",
      instructionsRef: "docs://human-recording-protocol/s-initial-v1",
      requireUsageAuthorization: false,
    });
    const ingestion = ingestHumanRecording({
      escalation,
      target,
      source: {
        recordingRef: "recording:sok:003",
        speakerRef: "speaker:adult-reference-003",
        speakerLocale: "nl-BE",
        recordedAt: "2026-09-28T20:20:00.000Z",
        protocol,
      },
      bytes: new Uint8Array([1, 3, 5, 7, 9]),
      mediaType: "audio/wav",
      ingestedAt: "2026-09-28T20:21:00.000Z",
    });

    const targetRecord = createTargetRegistryRecord({
      target,
      registryVersion: "1.0.0",
      approval: {
        status: "native_reviewed",
        evidenceIds: ["target-review:native-001"],
        approvedAt: "2026-09-28T19:00:00.000Z",
        reviewerRole: "native_linguistic",
      },
    });
    const renderingProfile = createRenderingProfile({
      profileId: "profile:nl-BE:s-initial:child-reference",
      version: "1.0.0",
      locale: "nl-BE",
      targetClass: "s_initial",
      intent: {
        rate: "natural",
        salience: "enhanced_without_exaggeration",
        childImitationModel: true,
      },
    });
    const renderer = Object.freeze({
      kind: "human" as const,
      rendererId: "human_recording",
      rendererVersion: protocol.version,
    });
    const eligibility = createRendererEligibilityRecord({
      renderer,
      locale: "nl-BE",
      targetClass: "s_initial",
      controlMode: "human_recording",
      status: "eligible_for_candidate_generation",
      rationale: "Governed human recording candidate created after synthetic escalation.",
      evidenceRefs: [escalation.escalationId],
    });

    const plan = createGovernedCandidatePlan({
      targetRecord,
      renderingProfile,
      eligibility,
      candidate: ingestion.candidate,
      renderer,
    });

    assert.equal(plan.candidateId, ingestion.candidate.candidateId);
    assert.equal(plan.renderer.kind, "human");
  });
});
