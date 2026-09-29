import { buildRenderArtifact } from "../core/artifact.js";
import { buildCandidate } from "../core/candidate.js";
import { fingerprint, sha256 } from "../core/fingerprint.js";
import type {
  CanonicalPronunciationTarget,
  PronunciationCandidate,
  RenderArtifact,
} from "../core/model.js";
import type { CandidateSelectionResult } from "../policy/selection.js";
import type { BlindReviewSession } from "../review/blindSession.js";

export interface HumanRecordingEscalation {
  schemaVersion: "1.0.0";
  escalationId: string;
  targetId: string;
  sourceSessionId: string;
  syntheticCandidateIds: readonly string[];
  evidenceIds: readonly string[];
  reason: string;
  requestedAt: string;
  authority: "workflow_escalation_only";
}

export interface HumanRecordingProtocol {
  schemaVersion: "1.0.0";
  protocolId: string;
  version: string;
  locale: string;
  targetClass: string;
  instructionsRef: string;
  requireUsageAuthorization: boolean;
}

export interface HumanRecordingSource {
  recordingRef: string;
  speakerRef: string;
  speakerLocale: string;
  recordedAt: string;
  protocol: HumanRecordingProtocol;
  usageAuthorizationRef?: string;
}

export interface IngestedHumanRecording {
  schemaVersion: "1.0.0";
  ingestionId: string;
  escalationId: string;
  candidate: PronunciationCandidate;
  artifact: RenderArtifact;
  provenance: Readonly<{
    recordingRef: string;
    speakerRef: string;
    speakerLocale: string;
    recordedAt: string;
    protocolId: string;
    protocolVersion: string;
    usageAuthorizationRef?: string;
    sourceAudioSha256: string;
    ingestedAt: string;
  }>;
  authority: "candidate_evidence_only";
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}

function validTimestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
}

export function createHumanRecordingEscalation(input: {
  selection: CandidateSelectionResult;
  session: BlindReviewSession;
  candidates: readonly PronunciationCandidate[];
  targetId: string;
  requestedAt: string;
}): HumanRecordingEscalation {
  required(input.targetId, "targetId");
  validTimestamp(input.requestedAt, "requestedAt");

  if (input.selection.disposition !== "human_recording_required") {
    throw new Error("Human recording escalation requires human_recording_required disposition");
  }
  if (input.session.targetId !== input.targetId) {
    throw new Error("Blind review session target does not match escalation target");
  }
  if (input.selection.evidenceIds.length === 0) {
    throw new Error("Human recording escalation requires conclusive human review evidence");
  }

  const byId = new Map(input.candidates.map((candidate) => [candidate.candidateId, candidate] as const));
  const syntheticCandidateIds: string[] = [];

  for (const assignment of input.session.assignments) {
    const candidate = byId.get(assignment.candidateId);
    if (!candidate) {
      throw new Error(`Missing candidate for blind assignment ${assignment.candidateId}`);
    }
    if (candidate.renderer.kind !== "tts") {
      throw new Error("Human recording escalation can only follow an all-synthetic review session");
    }
    syntheticCandidateIds.push(candidate.candidateId);
  }

  if (syntheticCandidateIds.length === 0) {
    throw new Error("Human recording escalation requires at least one synthetic candidate");
  }

  const evidenceIds = Object.freeze([...new Set(input.selection.evidenceIds)].sort());
  const candidateIds = Object.freeze([...new Set(syntheticCandidateIds)].sort());
  const escalationFingerprint = fingerprint({
    targetId: input.targetId,
    sourceSessionId: input.session.sessionId,
    syntheticCandidateIds: candidateIds,
    evidenceIds,
    reason: input.selection.reason,
    requestedAt: input.requestedAt,
  });

  return Object.freeze({
    schemaVersion: "1.0.0",
    escalationId: `human-escalation:${escalationFingerprint.slice("sha256:".length)}`,
    targetId: input.targetId,
    sourceSessionId: input.session.sessionId,
    syntheticCandidateIds: candidateIds,
    evidenceIds,
    reason: input.selection.reason,
    requestedAt: input.requestedAt,
    authority: "workflow_escalation_only",
  });
}

export function createHumanRecordingProtocol(
  input: Omit<HumanRecordingProtocol, "schemaVersion">,
): HumanRecordingProtocol {
  required(input.protocolId, "protocolId");
  required(input.version, "version");
  required(input.locale, "locale");
  required(input.targetClass, "targetClass");
  required(input.instructionsRef, "instructionsRef");

  return Object.freeze({
    schemaVersion: "1.0.0",
    ...input,
  });
}

export function ingestHumanRecording(input: {
  escalation: HumanRecordingEscalation;
  target: CanonicalPronunciationTarget;
  source: HumanRecordingSource;
  bytes: Uint8Array;
  mediaType: string;
  ingestedAt: string;
}): IngestedHumanRecording {
  if (input.escalation.targetId !== input.target.targetId) {
    throw new Error("Escalation target does not match human recording target");
  }
  required(input.source.recordingRef, "recordingRef");
  required(input.source.speakerRef, "speakerRef");
  required(input.source.speakerLocale, "speakerLocale");
  required(input.mediaType, "mediaType");
  validTimestamp(input.source.recordedAt, "recordedAt");
  validTimestamp(input.ingestedAt, "ingestedAt");

  if (input.source.protocol.locale !== input.target.locale) {
    throw new Error("Human recording protocol locale does not match target locale");
  }
  if (input.source.speakerLocale !== input.target.locale) {
    throw new Error("Human recording speaker locale does not match target locale");
  }
  if (
    input.source.protocol.requireUsageAuthorization &&
    !input.source.usageAuthorizationRef?.trim()
  ) {
    throw new Error("Human recording protocol requires usage authorization evidence");
  }
  if (input.bytes.byteLength === 0) {
    throw new Error("Human recording bytes cannot be empty");
  }

  const sourceAudioSha256 = sha256(input.bytes);
  const candidate = buildCandidate({
    target: input.target,
    renderer: {
      kind: "human",
      recordingRef: input.source.recordingRef,
      speakerRef: input.source.speakerRef,
      speakerLocale: input.source.speakerLocale,
      sourceAudioSha256,
    },
  });

  const artifact = buildRenderArtifact({
    candidate,
    bytes: input.bytes,
    mediaType: input.mediaType,
    createdAt: input.ingestedAt,
    providerResponseMetadata: Object.freeze({
      sourceKind: "human_recording",
      protocolId: input.source.protocol.protocolId,
      protocolVersion: input.source.protocol.version,
      recordedAt: input.source.recordedAt,
    }),
  });

  if (artifact.audioSha256 !== sourceAudioSha256) {
    throw new Error("Human recording artifact hash does not match source recording hash");
  }

  const provenance = Object.freeze({
    recordingRef: input.source.recordingRef,
    speakerRef: input.source.speakerRef,
    speakerLocale: input.source.speakerLocale,
    recordedAt: input.source.recordedAt,
    protocolId: input.source.protocol.protocolId,
    protocolVersion: input.source.protocol.version,
    ...(input.source.usageAuthorizationRef
      ? { usageAuthorizationRef: input.source.usageAuthorizationRef }
      : {}),
    sourceAudioSha256,
    ingestedAt: input.ingestedAt,
  });

  const ingestionFingerprint = fingerprint({
    escalationId: input.escalation.escalationId,
    candidateId: candidate.candidateId,
    candidateFingerprint: candidate.candidateFingerprint,
    artifactId: artifact.artifactId,
    audioSha256: artifact.audioSha256,
    provenance,
  });

  return Object.freeze({
    schemaVersion: "1.0.0",
    ingestionId: `human-ingestion:${ingestionFingerprint.slice("sha256:".length)}`,
    escalationId: input.escalation.escalationId,
    candidate,
    artifact,
    provenance,
    authority: "candidate_evidence_only",
  });
}

export function verifyHumanRecordingIngestion(
  ingestion: IngestedHumanRecording,
): readonly string[] {
  const issues: string[] = [];
  if (ingestion.candidate.renderer.kind !== "human") {
    issues.push("HUMAN_INGESTION_CANDIDATE_NOT_HUMAN");
    return Object.freeze(issues);
  }

  const sourceHash = ingestion.candidate.renderer.sourceAudioSha256;
  if (!sourceHash) issues.push("HUMAN_SOURCE_HASH_MISSING");
  if (sourceHash !== ingestion.artifact.audioSha256) {
    issues.push("HUMAN_SOURCE_ARTIFACT_HASH_MISMATCH");
  }
  if (sourceHash !== ingestion.provenance.sourceAudioSha256) {
    issues.push("HUMAN_SOURCE_PROVENANCE_HASH_MISMATCH");
  }
  if (ingestion.candidate.renderer.recordingRef !== ingestion.provenance.recordingRef) {
    issues.push("HUMAN_RECORDING_REF_MISMATCH");
  }
  if (ingestion.candidate.renderer.speakerRef !== ingestion.provenance.speakerRef) {
    issues.push("HUMAN_SPEAKER_REF_MISMATCH");
  }
  if (ingestion.candidate.renderer.speakerLocale !== ingestion.provenance.speakerLocale) {
    issues.push("HUMAN_SPEAKER_LOCALE_MISMATCH");
  }

  return Object.freeze(issues);
}
