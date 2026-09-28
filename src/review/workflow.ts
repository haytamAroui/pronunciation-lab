import { fingerprint } from "../core/fingerprint.js";
import type {
  CanonicalPronunciationTarget,
  PronunciationCandidate,
  RenderArtifact,
} from "../core/model.js";
import type {
  AcousticQaResult,
  TechnicalQaResult,
} from "../governance/model.js";
import type { RejectionReason } from "../governance/rejection.js";
import type { BlindReviewSession } from "./blindSession.js";
import type {
  CandidateReviewEvidence,
  ReviewDecision,
} from "./evidence.js";

export type GovernedReviewerRole = "native_linguistic" | "clinical";
export type ReviewAnswer = "yes" | "no" | "abstain";

export interface AuthoredTargetCue {
  targetSymbol: string;
  positionLabel: string;
}

export interface BlindPlaybackBinding {
  candidateId: string;
  artifactId: string;
  audioSha256: string;
  playbackRef: string;
}

export interface BlindReviewPacket {
  schemaVersion: "1.0.0";
  packetId: string;
  sessionId: string;
  reviewerRole: GovernedReviewerRole;
  target: Readonly<{
    targetId: string;
    text: string;
    canonicalIpa: string | null;
    locale: string;
    cue: AuthoredTargetCue;
  }>;
  items: readonly Readonly<{
    blindLabel: string;
    playbackRef: string;
    reviewBindingFingerprint: string;
  }>[];
  authority: "blind_human_review";
}

export interface NativeLinguisticSubmission {
  correctTarget: ReviewAnswer;
  naturalLocale: ReviewAnswer;
  distorted: ReviewAnswer;
  overArticulated: ReviewAnswer;
  overallDecision: ReviewDecision;
  rejectionReason?: RejectionReason;
  note?: string;
}

export interface ClinicalSuitabilitySubmission {
  goodModelForImitation: ReviewAnswer;
  targetSufficientlySalient: ReviewAnswer;
  rateAppropriate: ReviewAnswer;
  naturalNotExaggerated: ReviewAnswer;
  comfortableToModelToChild: ReviewAnswer;
  overallDecision: ReviewDecision;
  rejectionReason?: RejectionReason;
  note?: string;
}

export interface PostReviewReveal {
  schemaVersion: "1.0.0";
  sessionId: string;
  blindLabel: string;
  evidenceId: string;
  candidate: PronunciationCandidate;
  artifact: RenderArtifact;
  technicalQa: TechnicalQaResult;
  acousticQa: AcousticQaResult;
}

const SHA256 = /^sha256:[0-9a-f]{64}$/u;

function requireText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}

export function createArtifactReviewBindingFingerprint(input: {
  sessionId: string;
  blindLabel: string;
  candidateId: string;
  artifactId: string;
  audioSha256: string;
}): string {
  requireText(input.sessionId, "sessionId");
  requireText(input.blindLabel, "blindLabel");
  requireText(input.candidateId, "candidateId");
  requireText(input.artifactId, "artifactId");
  if (!SHA256.test(input.audioSha256)) throw new Error("audioSha256 must be an exact SHA-256 digest");

  return fingerprint({
    bindingType: "blind_artifact_review",
    sessionId: input.sessionId,
    blindLabel: input.blindLabel,
    candidateId: input.candidateId,
    artifactId: input.artifactId,
    audioSha256: input.audioSha256,
  });
}

function validateSessionBinding(input: {
  session: BlindReviewSession;
  bindings: readonly BlindPlaybackBinding[];
}): void {
  const expectedCandidateIds = new Set(input.session.assignments.map((item) => item.candidateId));
  const boundCandidateIds = new Set(input.bindings.map((item) => item.candidateId));

  if (input.bindings.length !== input.session.assignments.length) {
    throw new Error("Every blind assignment requires exactly one playback binding");
  }
  if (boundCandidateIds.size !== input.bindings.length) {
    throw new Error("Duplicate candidate playback bindings are not allowed");
  }
  for (const candidateId of expectedCandidateIds) {
    if (!boundCandidateIds.has(candidateId)) {
      throw new Error(`Missing playback binding for candidate ${candidateId}`);
    }
  }
}

export function createBlindReviewPacket(input: {
  session: BlindReviewSession;
  reviewerRole: GovernedReviewerRole;
  target: CanonicalPronunciationTarget;
  cue: AuthoredTargetCue;
  bindings: readonly BlindPlaybackBinding[];
}): BlindReviewPacket {
  if (input.session.targetId !== input.target.targetId) {
    throw new Error("Blind session target does not match review target");
  }
  requireText(input.cue.targetSymbol, "cue.targetSymbol");
  requireText(input.cue.positionLabel, "cue.positionLabel");
  validateSessionBinding({ session: input.session, bindings: input.bindings });

  for (const binding of input.bindings) {
    requireText(binding.artifactId, "binding.artifactId");
    requireText(binding.playbackRef, "binding.playbackRef");
    if (!SHA256.test(binding.audioSha256)) {
      throw new Error("binding.audioSha256 must be an exact SHA-256 digest");
    }
  }

  const bindingByCandidate = new Map(
    input.bindings.map((binding) => [binding.candidateId, binding] as const),
  );
  const items = Object.freeze(
    input.session.assignments.map((assignment) => {
      const binding = bindingByCandidate.get(assignment.candidateId);
      if (!binding) throw new Error("Blind review binding invariant failed");
      return Object.freeze({
        blindLabel: assignment.blindLabel,
        playbackRef: binding.playbackRef,
        reviewBindingFingerprint: createArtifactReviewBindingFingerprint({
          sessionId: input.session.sessionId,
          blindLabel: assignment.blindLabel,
          candidateId: assignment.candidateId,
          artifactId: binding.artifactId,
          audioSha256: binding.audioSha256,
        }),
      });
    }),
  );

  const target = Object.freeze({
    targetId: input.target.targetId,
    text: input.target.text,
    canonicalIpa: input.target.canonicalIpa,
    locale: input.target.locale,
    cue: Object.freeze({ ...input.cue }),
  });

  const packetFingerprint = fingerprint({
    sessionId: input.session.sessionId,
    reviewerRole: input.reviewerRole,
    target,
    items,
  });

  return Object.freeze({
    schemaVersion: "1.0.0",
    packetId: `review-packet:${packetFingerprint.slice("sha256:".length)}`,
    sessionId: input.session.sessionId,
    reviewerRole: input.reviewerRole,
    target,
    items,
    authority: "blind_human_review",
  });
}

function validateOverallDecision(input: {
  overallDecision: ReviewDecision;
  passingAnswers: readonly boolean[];
  rejectionReason?: RejectionReason;
  note?: string;
}): void {
  if (input.note !== undefined && !input.note.trim()) throw new Error("note cannot be empty");
  if (input.overallDecision === "pass" && !input.passingAnswers.every(Boolean)) {
    throw new Error("A passing review requires all mandatory answers to support pass");
  }
  if (input.overallDecision === "fail" && input.rejectionReason === undefined) {
    throw new Error("A failing review requires a structured rejection reason");
  }
}

function makeEvidence(input: {
  packet: BlindReviewPacket;
  blindLabel: string;
  reviewerId: string;
  reviewedAt: string;
  role: GovernedReviewerRole;
  overallDecision: ReviewDecision;
  dimensions: CandidateReviewEvidence["dimensions"];
  criticalFlags: readonly string[];
  rejectionReason?: RejectionReason;
  note?: string;
}): CandidateReviewEvidence {
  requireText(input.reviewerId, "reviewerId");
  if (!Number.isFinite(Date.parse(input.reviewedAt))) {
    throw new Error("reviewedAt must be an ISO timestamp");
  }
  if (input.packet.reviewerRole !== input.role) {
    throw new Error("Review packet role does not match submission role");
  }
  const item = input.packet.items.find((candidate) => candidate.blindLabel === input.blindLabel);
  if (!item) {
    throw new Error(`Unknown blind label: ${input.blindLabel}`);
  }

  const evidenceFingerprint = fingerprint({
    sessionId: input.packet.sessionId,
    packetId: input.packet.packetId,
    blindLabel: input.blindLabel,
    artifactBindingFingerprint: item.reviewBindingFingerprint,
    reviewerId: input.reviewerId,
    reviewedAt: input.reviewedAt,
    role: input.role,
    overallDecision: input.overallDecision,
    dimensions: input.dimensions,
    criticalFlags: input.criticalFlags,
    rejectionReason: input.rejectionReason ?? null,
    note: input.note ?? null,
  });

  return Object.freeze({
    schemaVersion: "1.0.0",
    evidenceId: `evidence:${evidenceFingerprint.slice("sha256:".length)}`,
    sessionId: input.packet.sessionId,
    blindLabel: input.blindLabel,
    artifactBindingFingerprint: item.reviewBindingFingerprint,
    reviewerId: input.reviewerId,
    reviewerRole: input.role,
    reviewedAt: input.reviewedAt,
    dimensions: Object.freeze(input.dimensions.map((dimension) => Object.freeze({ ...dimension }))),
    criticalFlags: Object.freeze([...input.criticalFlags]),
    overallDecision: input.overallDecision,
  });
}

export function submitNativeLinguisticReview(input: {
  packet: BlindReviewPacket;
  blindLabel: string;
  reviewerId: string;
  reviewedAt: string;
  submission: NativeLinguisticSubmission;
}): CandidateReviewEvidence {
  const s = input.submission;
  validateOverallDecision({
    overallDecision: s.overallDecision,
    passingAnswers: [
      s.correctTarget === "yes",
      s.naturalLocale === "yes",
      s.distorted === "no",
      s.overArticulated === "no",
    ],
    ...(s.rejectionReason !== undefined ? { rejectionReason: s.rejectionReason } : {}),
    ...(s.note !== undefined ? { note: s.note } : {}),
  });

  const criticalFlags = [
    ...(s.correctTarget === "no" ? ["incorrect_target"] : []),
    ...(s.naturalLocale === "no" ? ["locale_mismatch"] : []),
    ...(s.distorted === "yes" ? ["distorted"] : []),
    ...(s.overArticulated === "yes" ? ["over_articulated"] : []),
  ];

  return makeEvidence({
    packet: input.packet,
    blindLabel: input.blindLabel,
    reviewerId: input.reviewerId,
    reviewedAt: input.reviewedAt,
    role: "native_linguistic",
    overallDecision: s.overallDecision,
    dimensions: [
      { dimension: "linguistic_correctness", decision: answerToDecision(s.correctTarget) },
      { dimension: "naturalness", decision: answerToDecision(s.naturalLocale) },
      { dimension: "target_clarity", decision: inverseAnswerToDecision(s.distorted) },
      { dimension: "custom", decision: inverseAnswerToDecision(s.overArticulated), note: "over_articulation" },
    ],
    criticalFlags,
    ...(s.rejectionReason !== undefined ? { rejectionReason: s.rejectionReason } : {}),
    ...(s.note !== undefined ? { note: s.note } : {}),
  });
}

export function submitClinicalSuitabilityReview(input: {
  packet: BlindReviewPacket;
  blindLabel: string;
  reviewerId: string;
  reviewedAt: string;
  submission: ClinicalSuitabilitySubmission;
}): CandidateReviewEvidence {
  const s = input.submission;
  validateOverallDecision({
    overallDecision: s.overallDecision,
    passingAnswers: [
      s.goodModelForImitation === "yes",
      s.targetSufficientlySalient === "yes",
      s.rateAppropriate === "yes",
      s.naturalNotExaggerated === "yes",
      s.comfortableToModelToChild === "yes",
    ],
    ...(s.rejectionReason !== undefined ? { rejectionReason: s.rejectionReason } : {}),
    ...(s.note !== undefined ? { note: s.note } : {}),
  });

  const criticalFlags = [
    ...(s.goodModelForImitation === "no" ? ["child_model_unsuitable"] : []),
    ...(s.targetSufficientlySalient === "no" ? ["target_not_salient"] : []),
    ...(s.rateAppropriate === "no" ? ["rate_unsuitable"] : []),
    ...(s.naturalNotExaggerated === "no" ? ["unnatural_or_exaggerated"] : []),
    ...(s.comfortableToModelToChild === "no" ? ["clinician_would_not_model"] : []),
  ];

  return makeEvidence({
    packet: input.packet,
    blindLabel: input.blindLabel,
    reviewerId: input.reviewerId,
    reviewedAt: input.reviewedAt,
    role: "clinical",
    overallDecision: s.overallDecision,
    dimensions: [
      { dimension: "task_suitability", decision: answerToDecision(s.goodModelForImitation) },
      { dimension: "target_clarity", decision: answerToDecision(s.targetSufficientlySalient) },
      { dimension: "custom", decision: answerToDecision(s.rateAppropriate), note: "rate_appropriate" },
      { dimension: "naturalness", decision: answerToDecision(s.naturalNotExaggerated) },
      { dimension: "custom", decision: answerToDecision(s.comfortableToModelToChild), note: "comfortable_to_model_to_child" },
    ],
    criticalFlags,
    ...(s.rejectionReason !== undefined ? { rejectionReason: s.rejectionReason } : {}),
    ...(s.note !== undefined ? { note: s.note } : {}),
  });
}

function answerToDecision(answer: ReviewAnswer): ReviewDecision {
  if (answer === "yes") return "pass";
  if (answer === "no") return "fail";
  return "abstain";
}

function inverseAnswerToDecision(answer: ReviewAnswer): ReviewDecision {
  if (answer === "no") return "pass";
  if (answer === "yes") return "fail";
  return "abstain";
}

export function revealPostReviewAnalysis(input: {
  session: BlindReviewSession;
  evidence: CandidateReviewEvidence;
  candidate: PronunciationCandidate;
  artifact: RenderArtifact;
  technicalQa: TechnicalQaResult;
  acousticQa: AcousticQaResult;
}): PostReviewReveal {
  if (input.evidence.sessionId !== input.session.sessionId) {
    throw new Error("Review evidence does not belong to the supplied blind session");
  }
  const assignment = input.session.assignments.find(
    (item) => item.blindLabel === input.evidence.blindLabel,
  );
  if (!assignment) throw new Error("Review evidence has an unknown blind label");
  if (assignment.candidateId !== input.candidate.candidateId) {
    throw new Error("Candidate does not match the reviewed blind assignment");
  }
  if (input.artifact.candidateId !== input.candidate.candidateId) {
    throw new Error("Artifact does not match reviewed candidate");
  }
  const expectedBinding = createArtifactReviewBindingFingerprint({
    sessionId: input.session.sessionId,
    blindLabel: input.evidence.blindLabel,
    candidateId: input.candidate.candidateId,
    artifactId: input.artifact.artifactId,
    audioSha256: input.artifact.audioSha256,
  });
  if (input.evidence.artifactBindingFingerprint !== expectedBinding) {
    throw new Error("Review evidence does not bind to the supplied artifact bytes");
  }
  if (
    input.technicalQa.artifactId !== input.artifact.artifactId ||
    input.acousticQa.artifactId !== input.artifact.artifactId
  ) {
    throw new Error("QA evidence does not match reviewed artifact");
  }

  return Object.freeze({
    schemaVersion: "1.0.0",
    sessionId: input.session.sessionId,
    blindLabel: input.evidence.blindLabel,
    evidenceId: input.evidence.evidenceId,
    candidate: input.candidate,
    artifact: input.artifact,
    technicalQa: input.technicalQa,
    acousticQa: input.acousticQa,
  });
}
