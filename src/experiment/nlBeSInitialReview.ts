import { fingerprint } from "../core/fingerprint.js";
import {
  assertReviewerAuthorizedAt,
  type ReviewerAuthorityRecord,
} from "../governance/reviewerAuthority.js";
import type { TargetRegistryRecord } from "../governance/model.js";
import { createTargetRegistryRecord } from "../governance/registry.js";
import {
  NL_BE_S_INITIAL_DRAFT_ITEMS,
  NL_BE_S_INITIAL_EXPERIMENT_ID,
  NL_BE_S_INITIAL_REVIEW_CHECKLIST,
} from "./nlBeSInitial.js";

export type TargetReviewAnswer = "yes" | "no" | "abstain";
export type TargetReviewDecision = "pass" | "fail" | "abstain";

export interface NlBeSInitialNativeReviewPacket {
  schemaVersion: "1.0.0";
  packetId: string;
  experimentId: typeof NL_BE_S_INITIAL_EXPERIMENT_ID;
  locale: "nl-BE";
  targetClass: "s_initial_singleton";
  checklist: readonly string[];
  items: readonly Readonly<{
    itemId: string;
    text: string;
    referenceIpaCandidate: string;
    referenceFollowingPhone: string;
    referenceSyllableCount: number;
    sourceRefs: readonly string[];
    contentNotes: string;
  }>[];
  authority: "target_authoring_review_only";
}

export interface NlBeSInitialTargetReviewSubmission {
  lexicalSuitability: TargetReviewAnswer;
  canonicalIpa: string;
  initialSConfirmed: TargetReviewAnswer;
  singletonOnsetConfirmed: TargetReviewAnswer;
  followingPhone: string;
  syllableCount: number;
  stressIndex: number;
  ambiguityAcceptable: TargetReviewAnswer;
  conceptImageSuitable: TargetReviewAnswer;
  overallDecision: TargetReviewDecision;
  note?: string;
}

export interface NlBeSInitialTargetReviewEvidence {
  schemaVersion: "1.0.0";
  evidenceId: string;
  packetId: string;
  itemId: string;
  text: string;
  reviewerId: string;
  reviewerAuthorityId: string;
  reviewedAt: string;
  canonicalIpa: string;
  followingPhone: string;
  syllableCount: number;
  stressIndex: number;
  answers: Readonly<{
    lexicalSuitability: TargetReviewAnswer;
    initialSConfirmed: TargetReviewAnswer;
    singletonOnsetConfirmed: TargetReviewAnswer;
    ambiguityAcceptable: TargetReviewAnswer;
    conceptImageSuitable: TargetReviewAnswer;
  }>;
  overallDecision: TargetReviewDecision;
  note?: string;
  authority: "native_target_authoring_evidence";
}

function payload(evidence: Omit<NlBeSInitialTargetReviewEvidence, "evidenceId">): unknown {
  return evidence;
}

export function createNlBeSInitialNativeReviewPacket(): NlBeSInitialNativeReviewPacket {
  const items = Object.freeze(
    NL_BE_S_INITIAL_DRAFT_ITEMS.map((item) =>
      Object.freeze({
        itemId: item.itemId,
        text: item.text,
        referenceIpaCandidate: item.referenceIpaCandidate,
        referenceFollowingPhone: item.referenceFollowingPhone,
        referenceSyllableCount: item.referenceSyllableCount,
        sourceRefs: Object.freeze([...item.sourceRefs]),
        contentNotes: item.contentNotes,
      }),
    ),
  );
  const packetCore = {
    experimentId: NL_BE_S_INITIAL_EXPERIMENT_ID,
    locale: "nl-BE" as const,
    targetClass: "s_initial_singleton" as const,
    checklist: NL_BE_S_INITIAL_REVIEW_CHECKLIST,
    items,
  };
  const packetFingerprint = fingerprint(packetCore);

  return Object.freeze({
    schemaVersion: "1.0.0",
    packetId: `target-review-packet:${packetFingerprint.slice("sha256:".length)}`,
    ...packetCore,
    authority: "target_authoring_review_only",
  });
}

function allPassing(submission: NlBeSInitialTargetReviewSubmission): boolean {
  return (
    submission.lexicalSuitability === "yes" &&
    submission.initialSConfirmed === "yes" &&
    submission.singletonOnsetConfirmed === "yes" &&
    submission.ambiguityAcceptable === "yes" &&
    submission.conceptImageSuitable === "yes"
  );
}

export function submitNlBeSInitialNativeTargetReview(input: {
  packet: NlBeSInitialNativeReviewPacket;
  itemId: string;
  reviewerAuthority: ReviewerAuthorityRecord;
  reviewedAt: string;
  submission: NlBeSInitialTargetReviewSubmission;
}): NlBeSInitialTargetReviewEvidence {
  if (!Number.isFinite(Date.parse(input.reviewedAt))) {
    throw new Error("reviewedAt must be an ISO timestamp");
  }
  const item = input.packet.items.find((candidate) => candidate.itemId === input.itemId);
  if (!item) throw new Error(`Unknown review item ${input.itemId}`);

  assertReviewerAuthorizedAt({
    authority: input.reviewerAuthority,
    reviewerId: input.reviewerAuthority.reviewerId,
    role: "native_linguistic",
    locale: input.packet.locale,
    targetClass: input.packet.targetClass,
    at: input.reviewedAt,
  });

  if (!input.submission.canonicalIpa.trim()) throw new Error("canonicalIpa is required");
  if (!input.submission.followingPhone.trim()) throw new Error("followingPhone is required");
  if (!Number.isInteger(input.submission.syllableCount) || input.submission.syllableCount < 1) {
    throw new Error("syllableCount must be a positive integer");
  }
  if (
    !Number.isInteger(input.submission.stressIndex) ||
    input.submission.stressIndex < 0 ||
    input.submission.stressIndex >= input.submission.syllableCount
  ) {
    throw new Error("stressIndex must point to a valid syllable");
  }
  if (input.submission.note !== undefined && !input.submission.note.trim()) {
    throw new Error("note cannot be empty");
  }
  if (input.submission.overallDecision === "pass" && !allPassing(input.submission)) {
    throw new Error("A passing target review requires every mandatory answer to pass");
  }

  const base = Object.freeze({
    schemaVersion: "1.0.0" as const,
    packetId: input.packet.packetId,
    itemId: item.itemId,
    text: item.text,
    reviewerId: input.reviewerAuthority.reviewerId,
    reviewerAuthorityId: input.reviewerAuthority.authorityId,
    reviewedAt: input.reviewedAt,
    canonicalIpa: input.submission.canonicalIpa,
    followingPhone: input.submission.followingPhone,
    syllableCount: input.submission.syllableCount,
    stressIndex: input.submission.stressIndex,
    answers: Object.freeze({
      lexicalSuitability: input.submission.lexicalSuitability,
      initialSConfirmed: input.submission.initialSConfirmed,
      singletonOnsetConfirmed: input.submission.singletonOnsetConfirmed,
      ambiguityAcceptable: input.submission.ambiguityAcceptable,
      conceptImageSuitable: input.submission.conceptImageSuitable,
    }),
    overallDecision: input.submission.overallDecision,
    ...(input.submission.note ? { note: input.submission.note } : {}),
    authority: "native_target_authoring_evidence" as const,
  });
  const reviewFingerprint = fingerprint(payload(base));

  return Object.freeze({
    ...base,
    evidenceId: `target-review:${reviewFingerprint.slice("sha256:".length)}`,
  });
}

export function verifyNlBeSInitialTargetReviewEvidence(
  evidence: NlBeSInitialTargetReviewEvidence,
): readonly string[] {
  const issues: string[] = [];
  const item = NL_BE_S_INITIAL_DRAFT_ITEMS.find((candidate) => candidate.itemId === evidence.itemId);
  if (!item) issues.push("UNKNOWN_ITEM");
  else if (item.text !== evidence.text) issues.push("ITEM_TEXT_MISMATCH");

  const { evidenceId: _ignored, ...base } = evidence;
  const expected = `target-review:${fingerprint(payload(base)).slice("sha256:".length)}`;
  if (expected !== evidence.evidenceId) issues.push("EVIDENCE_FINGERPRINT_MISMATCH");
  if (!evidence.reviewerAuthorityId.trim()) issues.push("REVIEWER_AUTHORITY_MISSING");
  if (!Number.isFinite(Date.parse(evidence.reviewedAt))) issues.push("REVIEWED_AT_INVALID");
  if (!evidence.canonicalIpa.trim()) issues.push("CANONICAL_IPA_MISSING");
  if (!evidence.followingPhone.trim()) issues.push("FOLLOWING_PHONE_MISSING");

  return Object.freeze(issues);
}

export function createReviewedNlBeSInitialTargetRecord(input: {
  reviewEvidence: NlBeSInitialTargetReviewEvidence;
  registryVersion: string;
}): TargetRegistryRecord {
  const issues = verifyNlBeSInitialTargetReviewEvidence(input.reviewEvidence);
  if (issues.length > 0) {
    throw new Error(`Invalid native target review evidence: ${issues.join(",")}`);
  }
  if (input.reviewEvidence.overallDecision !== "pass") {
    throw new Error("Target promotion requires a passing native target review");
  }
  const item = NL_BE_S_INITIAL_DRAFT_ITEMS.find(
    (candidate) => candidate.itemId === input.reviewEvidence.itemId,
  )!;

  return createTargetRegistryRecord({
    target: {
      targetId: item.itemId,
      locale: "nl-BE",
      text: item.text,
      canonicalIpa: input.reviewEvidence.canonicalIpa,
      role: "pronunciation_reference",
      metadata: Object.freeze({
        experimentId: NL_BE_S_INITIAL_EXPERIMENT_ID,
        targetPhoneme: "/s/",
        wordPosition: "initial",
        syllableRole: "onset",
        clusterType: "singleton",
        itemSource: item.source,
        followingPhone: input.reviewEvidence.followingPhone,
        syllableCount: input.reviewEvidence.syllableCount,
        stressIndex: input.reviewEvidence.stressIndex,
      }),
    },
    registryVersion: input.registryVersion,
    approval: {
      status: "native_reviewed",
      evidenceIds: [input.reviewEvidence.evidenceId],
      reviewerAuthorityIds: [input.reviewEvidence.reviewerAuthorityId],
      approvedAt: input.reviewEvidence.reviewedAt,
      reviewerRole: "native_linguistic",
    },
  });
}
