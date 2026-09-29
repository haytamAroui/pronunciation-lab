import { fingerprint } from "../core/fingerprint.js";
import type { CanonicalPronunciationTarget, PronunciationRole } from "../core/model.js";
import {
  assertReviewerAuthorizedAt,
  type ReviewerAuthorityRecord,
} from "../governance/reviewerAuthority.js";
import { createTargetRegistryRecord } from "../governance/registry.js";
import type { TargetRegistryRecord } from "../governance/model.js";
import {
  verifyPronunciationSourceEvidence,
  type PronunciationSourceEvidence,
} from "./sourceEvidence.js";

export type ReadingDisposition = "canonical" | "accepted_variant" | "rejected";
export type ReadingSetOutcome = "canonicalized" | "contested" | "unresolved";

export interface PronunciationReadingProposal {
  schemaVersion: "1.0.0";
  proposalId: string;
  proposalFingerprint: string;
  locale: string;
  text: string;
  ipa: string;
  sourceEvidenceIds: readonly string[];
  authority: "reading_proposal_only";
}

export interface PronunciationReadingDecision {
  proposalId: string;
  disposition: ReadingDisposition;
  reason?: string;
}

export interface PronunciationReadingSet {
  schemaVersion: "1.0.0";
  readingSetId: string;
  readingSetFingerprint: string;
  locale: string;
  text: string;
  outcome: ReadingSetOutcome;
  entries: readonly Readonly<{
    proposal: PronunciationReadingProposal;
    disposition: ReadingDisposition;
    reason?: string;
  }>[];
  reviewerId: string;
  reviewerAuthorityId: string;
  adjudicatedAt: string;
  authority: "native_linguistic_adjudication";
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}

function proposalPayload(input: {
  locale: string;
  text: string;
  ipa: string;
  sourceEvidenceIds: readonly string[];
}): unknown {
  return {
    locale: input.locale,
    text: input.text,
    ipa: input.ipa,
    sourceEvidenceIds: [...input.sourceEvidenceIds].sort(),
  };
}

export function createPronunciationReadingProposal(input: {
  locale: string;
  text: string;
  ipa: string;
  evidence: readonly PronunciationSourceEvidence[];
}): PronunciationReadingProposal {
  required(input.locale, "locale");
  required(input.text, "text");
  required(input.ipa, "ipa");
  if (input.evidence.length === 0) throw new Error("Reading proposal requires source evidence");

  const ids = new Set<string>();
  for (const evidence of input.evidence) {
    const issues = verifyPronunciationSourceEvidence(evidence);
    if (issues.length > 0) {
      throw new Error(`Invalid pronunciation source evidence: ${issues.join(",")}`);
    }
    if (evidence.locale !== input.locale || evidence.text !== input.text || evidence.readingIpa !== input.ipa) {
      throw new Error("Source evidence does not match reading proposal");
    }
    if (ids.has(evidence.evidenceId)) throw new Error("Duplicate source evidence");
    ids.add(evidence.evidenceId);
  }

  const sourceEvidenceIds = Object.freeze([...ids].sort());
  const proposalFingerprint = fingerprint(
    proposalPayload({
      locale: input.locale,
      text: input.text,
      ipa: input.ipa,
      sourceEvidenceIds,
    }),
  );

  return Object.freeze({
    schemaVersion: "1.0.0",
    proposalId: `reading-proposal:${proposalFingerprint.slice("sha256:".length)}`,
    proposalFingerprint,
    locale: input.locale,
    text: input.text,
    ipa: input.ipa,
    sourceEvidenceIds,
    authority: "reading_proposal_only",
  });
}

export function verifyPronunciationReadingProposal(
  proposal: PronunciationReadingProposal,
): readonly string[] {
  const issues: string[] = [];
  if (!proposal.locale.trim()) issues.push("LOCALE_MISSING");
  if (!proposal.text.trim()) issues.push("TEXT_MISSING");
  if (!proposal.ipa.trim()) issues.push("IPA_MISSING");
  if (proposal.sourceEvidenceIds.length === 0) issues.push("SOURCE_EVIDENCE_EMPTY");

  const expected = fingerprint(
    proposalPayload({
      locale: proposal.locale,
      text: proposal.text,
      ipa: proposal.ipa,
      sourceEvidenceIds: proposal.sourceEvidenceIds,
    }),
  );
  if (proposal.proposalFingerprint !== expected) issues.push("PROPOSAL_FINGERPRINT_MISMATCH");
  const expectedId = `reading-proposal:${expected.slice("sha256:".length)}`;
  if (proposal.proposalId !== expectedId) issues.push("PROPOSAL_ID_MISMATCH");
  return Object.freeze(issues);
}

export function adjudicatePronunciationReadings(input: {
  proposals: readonly PronunciationReadingProposal[];
  decisions: readonly PronunciationReadingDecision[];
  outcome: ReadingSetOutcome;
  reviewerAuthority: ReviewerAuthorityRecord;
  adjudicatedAt: string;
  targetClass?: string;
}): PronunciationReadingSet {
  if (input.proposals.length === 0) throw new Error("Reading adjudication requires proposals");
  if (!Number.isFinite(Date.parse(input.adjudicatedAt))) {
    throw new Error("adjudicatedAt must be an ISO timestamp");
  }

  const first = input.proposals[0]!;
  const proposalById = new Map<string, PronunciationReadingProposal>();
  for (const proposal of input.proposals) {
    const issues = verifyPronunciationReadingProposal(proposal);
    if (issues.length > 0) throw new Error(`Invalid reading proposal: ${issues.join(",")}`);
    if (proposal.locale !== first.locale || proposal.text !== first.text) {
      throw new Error("All reading proposals must target the same locale and text");
    }
    if (proposalById.has(proposal.proposalId)) throw new Error("Duplicate reading proposal");
    proposalById.set(proposal.proposalId, proposal);
  }

  assertReviewerAuthorizedAt({
    authority: input.reviewerAuthority,
    reviewerId: input.reviewerAuthority.reviewerId,
    role: "native_linguistic",
    locale: first.locale,
    ...(input.targetClass !== undefined ? { targetClass: input.targetClass } : {}),
    at: input.adjudicatedAt,
  });

  if (input.decisions.length !== input.proposals.length) {
    throw new Error("Every reading proposal requires exactly one decision");
  }
  const decisions = new Map<string, PronunciationReadingDecision>();
  for (const decision of input.decisions) {
    if (!proposalById.has(decision.proposalId)) throw new Error("Decision references unknown proposal");
    if (decisions.has(decision.proposalId)) throw new Error("Duplicate reading decision");
    if (decision.reason !== undefined) required(decision.reason, "decision.reason");
    decisions.set(decision.proposalId, decision);
  }

  const entries = Object.freeze(
    input.proposals.map((proposal) => {
      const decision = decisions.get(proposal.proposalId);
      if (!decision) throw new Error("Missing reading decision");
      return Object.freeze({
        proposal,
        disposition: decision.disposition,
        ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
      });
    }),
  );

  const canonicalCount = entries.filter((entry) => entry.disposition === "canonical").length;
  const acceptedVariantCount = entries.filter(
    (entry) => entry.disposition === "accepted_variant",
  ).length;

  if (input.outcome === "canonicalized" && canonicalCount !== 1) {
    throw new Error("Canonicalized reading set requires exactly one canonical reading");
  }
  if (input.outcome === "contested" && (canonicalCount !== 0 || acceptedVariantCount < 2)) {
    throw new Error("Contested reading set requires at least two accepted variants and no canonical reading");
  }
  if (input.outcome === "unresolved" && canonicalCount !== 0) {
    throw new Error("Unresolved reading set cannot contain a canonical reading");
  }

  const readingSetFingerprint = fingerprint({
    locale: first.locale,
    text: first.text,
    outcome: input.outcome,
    entries: entries.map((entry) => ({
      proposalId: entry.proposal.proposalId,
      disposition: entry.disposition,
      reason: entry.reason ?? null,
    })),
    reviewerId: input.reviewerAuthority.reviewerId,
    reviewerAuthorityId: input.reviewerAuthority.authorityId,
    adjudicatedAt: input.adjudicatedAt,
  });

  return Object.freeze({
    schemaVersion: "1.0.0",
    readingSetId: `reading-set:${readingSetFingerprint.slice("sha256:".length)}`,
    readingSetFingerprint,
    locale: first.locale,
    text: first.text,
    outcome: input.outcome,
    entries,
    reviewerId: input.reviewerAuthority.reviewerId,
    reviewerAuthorityId: input.reviewerAuthority.authorityId,
    adjudicatedAt: input.adjudicatedAt,
    authority: "native_linguistic_adjudication",
  });
}

export function createTargetRegistryRecordFromReadingSet(input: {
  readingSet: PronunciationReadingSet;
  targetId: string;
  registryVersion: string;
  role: PronunciationRole;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}): TargetRegistryRecord {
  if (input.readingSet.outcome !== "canonicalized") {
    throw new Error("Canonical target creation requires a canonicalized reading set");
  }
  const canonical = input.readingSet.entries.find((entry) => entry.disposition === "canonical");
  if (!canonical) throw new Error("Canonical reading missing");

  const target: CanonicalPronunciationTarget = {
    targetId: input.targetId,
    locale: input.readingSet.locale,
    text: input.readingSet.text,
    canonicalIpa: canonical.proposal.ipa,
    role: input.role,
    metadata: Object.freeze({
      ...(input.metadata ?? {}),
      readingSetId: input.readingSet.readingSetId,
      readingSetFingerprint: input.readingSet.readingSetFingerprint,
    }),
  };

  return createTargetRegistryRecord({
    target,
    registryVersion: input.registryVersion,
    approval: {
      status: "native_reviewed",
      evidenceIds: canonical.proposal.sourceEvidenceIds,
      reviewerAuthorityIds: [input.readingSet.reviewerAuthorityId],
      approvedAt: input.readingSet.adjudicatedAt,
      reviewerRole: "native_linguistic",
    },
  });
}
