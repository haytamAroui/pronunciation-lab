import { canonicalJson, fingerprint } from "../core/fingerprint.js";
import type { TargetRegistryRecord } from "../governance/model.js";
import {
  assertReviewerAuthorizedAt,
  verifyReviewerAuthorityRecord,
  type ReviewerAuthorityRecord,
} from "../governance/reviewerAuthority.js";
import {
  createNlBeSInitialNativeReviewPacket,
  createReviewedNlBeSInitialTargetRecord,
  submitNlBeSInitialNativeTargetReview,
  verifyNlBeSInitialTargetReviewEvidence,
  type NlBeSInitialNativeReviewPacket,
  type NlBeSInitialTargetReviewEvidence,
  type NlBeSInitialTargetReviewSubmission,
  type TargetReviewAnswer,
  type TargetReviewDecision,
} from "./nlBeSInitialReview.js";

const REVIEW_BUNDLE_INSTRUCTIONS_VERSION = "1.0.0" as const;

export interface NlBeSInitialNativeReviewBundle {
  schemaVersion: "1.0.0";
  bundleId: string;
  createdAt: string;
  instructionsVersion: typeof REVIEW_BUNDLE_INSTRUCTIONS_VERSION;
  packet: NlBeSInitialNativeReviewPacket;
  reviewerAuthority: ReviewerAuthorityRecord;
  bundleFingerprint: string;
  authority: "portable_review_bundle_only";
}

export interface NlBeSInitialNativeReviewResponseItem {
  itemId: string;
  reviewedAt: string;
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

export interface NlBeSInitialNativeReviewResponse {
  schemaVersion: "1.0.0";
  bundleId: string;
  packetId: string;
  reviewerAuthorityId: string;
  submittedAt: string;
  items: readonly NlBeSInitialNativeReviewResponseItem[];
  responseFingerprint: string;
  authority: "native_review_response_only";
}

export interface NlBeSInitialNativeReviewResponseTemplate {
  schemaVersion: "1.0.0";
  bundleId: string;
  packetId: string;
  reviewerAuthorityId: string;
  items: readonly Readonly<{
    itemId: string;
    text: string;
    reviewedAt: null;
    lexicalSuitability: null;
    canonicalIpa: string;
    initialSConfirmed: null;
    singletonOnsetConfirmed: null;
    followingPhone: string;
    syllableCount: number;
    stressIndex: number;
    ambiguityAcceptable: null;
    conceptImageSuitable: null;
    overallDecision: null;
    note: string;
  }>[];
  authority: "review_response_template_only";
}

export interface NlBeSInitialNativeReviewImportResult {
  schemaVersion: "1.0.0";
  bundleId: string;
  responseFingerprint: string;
  evidence: readonly NlBeSInitialTargetReviewEvidence[];
  promotedTargets: readonly TargetRegistryRecord[];
  blockedItems: readonly Readonly<{
    itemId: string;
    decision: "fail" | "abstain";
    evidenceId: string;
  }>[];
  readyForCandidateGeneration: boolean;
  authority: "review_import_result_only";
}

function requireTimestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
}

function bundlePayload(input: Omit<NlBeSInitialNativeReviewBundle, "bundleId" | "bundleFingerprint" | "authority">): unknown {
  return {
    schemaVersion: input.schemaVersion,
    createdAt: input.createdAt,
    instructionsVersion: input.instructionsVersion,
    packet: input.packet,
    reviewerAuthority: input.reviewerAuthority,
  };
}

function responsePayload(input: Omit<NlBeSInitialNativeReviewResponse, "responseFingerprint" | "authority">): unknown {
  return {
    schemaVersion: input.schemaVersion,
    bundleId: input.bundleId,
    packetId: input.packetId,
    reviewerAuthorityId: input.reviewerAuthorityId,
    submittedAt: input.submittedAt,
    items: input.items,
  };
}

function freezeResponseItem(
  item: NlBeSInitialNativeReviewResponseItem,
): NlBeSInitialNativeReviewResponseItem {
  return Object.freeze({ ...item });
}

export function createNlBeSInitialNativeReviewBundle(input: {
  reviewerAuthority: ReviewerAuthorityRecord;
  createdAt: string;
}): NlBeSInitialNativeReviewBundle {
  requireTimestamp(input.createdAt, "createdAt");
  const authorityIssues = verifyReviewerAuthorityRecord(input.reviewerAuthority);
  if (authorityIssues.length > 0) {
    throw new Error(`Invalid reviewer authority: ${authorityIssues.join(",")}`);
  }

  assertReviewerAuthorizedAt({
    authority: input.reviewerAuthority,
    reviewerId: input.reviewerAuthority.reviewerId,
    role: "native_linguistic",
    locale: "nl-BE",
    targetClass: "s_initial_singleton",
    at: input.createdAt,
  });

  const packet = createNlBeSInitialNativeReviewPacket();
  const base = {
    schemaVersion: "1.0.0" as const,
    createdAt: input.createdAt,
    instructionsVersion: REVIEW_BUNDLE_INSTRUCTIONS_VERSION,
    packet,
    reviewerAuthority: input.reviewerAuthority,
  };
  const bundleFingerprint = fingerprint(bundlePayload(base));

  return Object.freeze({
    ...base,
    bundleId: `native-review-bundle:${bundleFingerprint.slice("sha256:".length)}`,
    bundleFingerprint,
    authority: "portable_review_bundle_only",
  });
}

export function verifyNlBeSInitialNativeReviewBundle(
  bundle: NlBeSInitialNativeReviewBundle,
): readonly string[] {
  const issues: string[] = [];
  if (bundle.schemaVersion !== "1.0.0") issues.push("SCHEMA_VERSION_UNSUPPORTED");
  if (!Number.isFinite(Date.parse(bundle.createdAt))) issues.push("CREATED_AT_INVALID");
  if (bundle.instructionsVersion !== REVIEW_BUNDLE_INSTRUCTIONS_VERSION) {
    issues.push("INSTRUCTIONS_VERSION_UNSUPPORTED");
  }

  const expectedPacket = createNlBeSInitialNativeReviewPacket();
  if (fingerprint(bundle.packet) !== fingerprint(expectedPacket)) {
    issues.push("REVIEW_PACKET_MISMATCH");
  }

  issues.push(
    ...verifyReviewerAuthorityRecord(bundle.reviewerAuthority).map(
      (issue) => `REVIEWER_AUTHORITY_INVALID:${issue}`,
    ),
  );

  const expectedFingerprint = fingerprint(
    bundlePayload({
      schemaVersion: bundle.schemaVersion,
      createdAt: bundle.createdAt,
      instructionsVersion: bundle.instructionsVersion,
      packet: bundle.packet,
      reviewerAuthority: bundle.reviewerAuthority,
    }),
  );
  if (bundle.bundleFingerprint !== expectedFingerprint) {
    issues.push("BUNDLE_FINGERPRINT_MISMATCH");
  }
  const expectedId = `native-review-bundle:${expectedFingerprint.slice("sha256:".length)}`;
  if (bundle.bundleId !== expectedId) issues.push("BUNDLE_ID_MISMATCH");

  return Object.freeze(issues);
}

export function serializeNlBeSInitialNativeReviewBundle(
  bundle: NlBeSInitialNativeReviewBundle,
): string {
  const issues = verifyNlBeSInitialNativeReviewBundle(bundle);
  if (issues.length > 0) {
    throw new Error(`Cannot serialize invalid review bundle: ${issues.join(",")}`);
  }
  return `${canonicalJson(bundle)}\n`;
}

export function createNlBeSInitialNativeReviewResponseTemplate(
  bundle: NlBeSInitialNativeReviewBundle,
): NlBeSInitialNativeReviewResponseTemplate {
  const issues = verifyNlBeSInitialNativeReviewBundle(bundle);
  if (issues.length > 0) {
    throw new Error(`Cannot create template from invalid review bundle: ${issues.join(",")}`);
  }

  return Object.freeze({
    schemaVersion: "1.0.0",
    bundleId: bundle.bundleId,
    packetId: bundle.packet.packetId,
    reviewerAuthorityId: bundle.reviewerAuthority.authorityId,
    items: Object.freeze(
      bundle.packet.items.map((item) =>
        Object.freeze({
          itemId: item.itemId,
          text: item.text,
          reviewedAt: null,
          lexicalSuitability: null,
          canonicalIpa: item.referenceIpaCandidate,
          initialSConfirmed: null,
          singletonOnsetConfirmed: null,
          followingPhone: item.referenceFollowingPhone,
          syllableCount: item.referenceSyllableCount,
          stressIndex: 0,
          ambiguityAcceptable: null,
          conceptImageSuitable: null,
          overallDecision: null,
          note: "",
        }),
      ),
    ),
    authority: "review_response_template_only",
  });
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/gu, "\\|").replace(/\n/gu, " ");
}

export function renderNlBeSInitialNativeReviewSheetMarkdown(
  bundle: NlBeSInitialNativeReviewBundle,
): string {
  const issues = verifyNlBeSInitialNativeReviewBundle(bundle);
  if (issues.length > 0) {
    throw new Error(`Cannot render invalid review bundle: ${issues.join(",")}`);
  }

  const lines: string[] = [
    "# nl-BE /s/ Initial Native Review",
    "",
    `Bundle: \`${bundle.bundleId}\``,
    `Packet: \`${bundle.packet.packetId}\``,
    `Reviewer: \`${bundle.reviewerAuthority.reviewerId}\``,
    `Reviewer authority: \`${bundle.reviewerAuthority.authorityId}\``,
    "",
    "> Reference IPA and phonetic metadata are hints only. Confirm or correct them independently.",
    "",
    "## Checklist",
    "",
    ...bundle.packet.checklist.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Items",
    "",
    "| # | Word | Reference IPA | Following phone | Syllables | Decision | Reviewed IPA |",
    "| ---: | --- | --- | --- | ---: | --- | --- |",
    ...bundle.packet.items.map(
      (item, index) =>
        `| ${index + 1} | ${escapeMarkdown(item.text)} | ${escapeMarkdown(item.referenceIpaCandidate)} | ${escapeMarkdown(item.referenceFollowingPhone)} | ${item.referenceSyllableCount} |  |  |`,
    ),
    "",
    "For each item, record: lexical suitability, initial /s/, singleton onset, following phone, syllable count, stress index, ambiguity, concept/image suitability, overall decision, and optional note.",
    "",
    "A passing decision requires every mandatory yes/no check to pass. The returned review data must be imported through Pronunciation Lab; editing this Markdown file alone does not create approval evidence.",
    "",
  ];

  return lines.join("\n");
}

function validateResponseCoverage(input: {
  bundle: NlBeSInitialNativeReviewBundle;
  items: readonly NlBeSInitialNativeReviewResponseItem[];
}): void {
  if (input.items.length !== input.bundle.packet.items.length) {
    throw new Error(`Review response requires exactly ${input.bundle.packet.items.length} items`);
  }
  const seen = new Set<string>();
  for (const item of input.items) {
    if (seen.has(item.itemId)) throw new Error(`Duplicate review item ${item.itemId}`);
    seen.add(item.itemId);
  }
  for (const expected of input.bundle.packet.items) {
    if (!seen.has(expected.itemId)) throw new Error(`Missing review item ${expected.itemId}`);
  }
}

export function createNlBeSInitialNativeReviewResponse(input: {
  bundle: NlBeSInitialNativeReviewBundle;
  submittedAt: string;
  items: readonly NlBeSInitialNativeReviewResponseItem[];
}): NlBeSInitialNativeReviewResponse {
  const bundleIssues = verifyNlBeSInitialNativeReviewBundle(input.bundle);
  if (bundleIssues.length > 0) {
    throw new Error(`Cannot respond to invalid review bundle: ${bundleIssues.join(",")}`);
  }
  requireTimestamp(input.submittedAt, "submittedAt");
  validateResponseCoverage({ bundle: input.bundle, items: input.items });

  const byId = new Map(input.items.map((item) => [item.itemId, item] as const));
  const ordered = Object.freeze(
    input.bundle.packet.items.map((expected) => {
      const item = byId.get(expected.itemId)!;
      requireTimestamp(item.reviewedAt, `reviewedAt:${item.itemId}`);
      if (Date.parse(item.reviewedAt) > Date.parse(input.submittedAt)) {
        throw new Error(`Review time cannot be after submittedAt for ${item.itemId}`);
      }
      return freezeResponseItem(item);
    }),
  );

  const base = {
    schemaVersion: "1.0.0" as const,
    bundleId: input.bundle.bundleId,
    packetId: input.bundle.packet.packetId,
    reviewerAuthorityId: input.bundle.reviewerAuthority.authorityId,
    submittedAt: input.submittedAt,
    items: ordered,
  };
  const responseFingerprint = fingerprint(responsePayload(base));

  return Object.freeze({
    ...base,
    responseFingerprint,
    authority: "native_review_response_only",
  });
}

export function verifyNlBeSInitialNativeReviewResponse(input: {
  bundle: NlBeSInitialNativeReviewBundle;
  response: NlBeSInitialNativeReviewResponse;
}): readonly string[] {
  const issues: string[] = [];
  issues.push(
    ...verifyNlBeSInitialNativeReviewBundle(input.bundle).map(
      (issue) => `BUNDLE_INVALID:${issue}`,
    ),
  );

  if (input.response.schemaVersion !== "1.0.0") issues.push("SCHEMA_VERSION_UNSUPPORTED");
  if (input.response.bundleId !== input.bundle.bundleId) issues.push("BUNDLE_ID_MISMATCH");
  if (input.response.packetId !== input.bundle.packet.packetId) issues.push("PACKET_ID_MISMATCH");
  if (
    input.response.reviewerAuthorityId !== input.bundle.reviewerAuthority.authorityId
  ) {
    issues.push("REVIEWER_AUTHORITY_ID_MISMATCH");
  }
  if (!Number.isFinite(Date.parse(input.response.submittedAt))) {
    issues.push("SUBMITTED_AT_INVALID");
  }

  try {
    validateResponseCoverage({ bundle: input.bundle, items: input.response.items });
  } catch {
    issues.push("ITEM_COVERAGE_INVALID");
  }

  const expectedFingerprint = fingerprint(
    responsePayload({
      schemaVersion: input.response.schemaVersion,
      bundleId: input.response.bundleId,
      packetId: input.response.packetId,
      reviewerAuthorityId: input.response.reviewerAuthorityId,
      submittedAt: input.response.submittedAt,
      items: input.response.items,
    }),
  );
  if (input.response.responseFingerprint !== expectedFingerprint) {
    issues.push("RESPONSE_FINGERPRINT_MISMATCH");
  }

  return Object.freeze(issues);
}

function toSubmission(
  item: NlBeSInitialNativeReviewResponseItem,
): NlBeSInitialTargetReviewSubmission {
  return {
    lexicalSuitability: item.lexicalSuitability,
    canonicalIpa: item.canonicalIpa,
    initialSConfirmed: item.initialSConfirmed,
    singletonOnsetConfirmed: item.singletonOnsetConfirmed,
    followingPhone: item.followingPhone,
    syllableCount: item.syllableCount,
    stressIndex: item.stressIndex,
    ambiguityAcceptable: item.ambiguityAcceptable,
    conceptImageSuitable: item.conceptImageSuitable,
    overallDecision: item.overallDecision,
    ...(item.note !== undefined ? { note: item.note } : {}),
  };
}

export function importNlBeSInitialNativeReviewResponse(input: {
  bundle: NlBeSInitialNativeReviewBundle;
  response: NlBeSInitialNativeReviewResponse;
  registryVersion: string;
}): NlBeSInitialNativeReviewImportResult {
  const responseIssues = verifyNlBeSInitialNativeReviewResponse({
    bundle: input.bundle,
    response: input.response,
  });
  if (responseIssues.length > 0) {
    throw new Error(`Invalid native review response: ${responseIssues.join(",")}`);
  }
  if (!input.registryVersion.trim()) throw new Error("registryVersion is required");

  const evidence = Object.freeze(
    input.response.items.map((item) =>
      submitNlBeSInitialNativeTargetReview({
        packet: input.bundle.packet,
        itemId: item.itemId,
        reviewerAuthority: input.bundle.reviewerAuthority,
        reviewedAt: item.reviewedAt,
        submission: toSubmission(item),
      }),
    ),
  );

  for (const item of evidence) {
    const issues = verifyNlBeSInitialTargetReviewEvidence(item);
    if (issues.length > 0) {
      throw new Error(`Imported review evidence is invalid: ${issues.join(",")}`);
    }
  }

  const promotedTargets = Object.freeze(
    evidence
      .filter((item) => item.overallDecision === "pass")
      .map((item) =>
        createReviewedNlBeSInitialTargetRecord({
          reviewEvidence: item,
          registryVersion: input.registryVersion,
        }),
      ),
  );

  const blockedItems = Object.freeze(
    evidence
      .filter(
        (item): item is NlBeSInitialTargetReviewEvidence & {
          overallDecision: "fail" | "abstain";
        } => item.overallDecision !== "pass",
      )
      .map((item) =>
        Object.freeze({
          itemId: item.itemId,
          decision: item.overallDecision,
          evidenceId: item.evidenceId,
        }),
      ),
  );

  return Object.freeze({
    schemaVersion: "1.0.0",
    bundleId: input.bundle.bundleId,
    responseFingerprint: input.response.responseFingerprint,
    evidence,
    promotedTargets,
    blockedItems,
    readyForCandidateGeneration:
      promotedTargets.length === input.bundle.packet.items.length && blockedItems.length === 0,
    authority: "review_import_result_only",
  });
}
