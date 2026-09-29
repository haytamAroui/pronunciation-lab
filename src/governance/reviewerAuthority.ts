import { fingerprint } from "../core/fingerprint.js";

export type ReviewerAuthorityRole = "native_linguistic" | "clinical";

export interface ReviewerAuthorityRecord {
  schemaVersion: "1.0.0";
  authorityId: string;
  authorityGrantFingerprint: string;
  recordFingerprint: string;
  reviewerId: string;
  role: ReviewerAuthorityRole;
  localeScopes: readonly string[];
  targetClassScopes?: readonly string[];
  qualificationRefs: readonly string[];
  authorizedAt: string;
  expiresAt?: string;
  status: "active" | "retired";
  retiredAt?: string;
  retirementReason?: string;
  authority: "reviewer_authorization_only";
}

function required(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}

function timestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
}

function normalized(values: readonly string[], label: string): readonly string[] {
  const cleaned = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
  if (cleaned.length === 0) throw new Error(`${label} requires at least one value`);
  return Object.freeze(cleaned);
}

function grantPayload(input: {
  reviewerId: string;
  role: ReviewerAuthorityRole;
  localeScopes: readonly string[];
  targetClassScopes?: readonly string[];
  qualificationRefs: readonly string[];
  authorizedAt: string;
  expiresAt?: string;
}): unknown {
  return {
    reviewerId: input.reviewerId,
    role: input.role,
    localeScopes: input.localeScopes,
    targetClassScopes: input.targetClassScopes ?? null,
    qualificationRefs: input.qualificationRefs,
    authorizedAt: input.authorizedAt,
    expiresAt: input.expiresAt ?? null,
  };
}

function recordPayload(input: {
  authorityId: string;
  authorityGrantFingerprint: string;
  status: "active" | "retired";
  retiredAt?: string;
  retirementReason?: string;
}): unknown {
  return {
    authorityId: input.authorityId,
    authorityGrantFingerprint: input.authorityGrantFingerprint,
    status: input.status,
    retiredAt: input.retiredAt ?? null,
    retirementReason: input.retirementReason ?? null,
  };
}

export function createReviewerAuthorityRecord(input: {
  reviewerId: string;
  role: ReviewerAuthorityRole;
  localeScopes: readonly string[];
  targetClassScopes?: readonly string[];
  qualificationRefs: readonly string[];
  authorizedAt: string;
  expiresAt?: string;
}): ReviewerAuthorityRecord {
  required(input.reviewerId, "reviewerId");
  timestamp(input.authorizedAt, "authorizedAt");
  if (input.expiresAt !== undefined) {
    timestamp(input.expiresAt, "expiresAt");
    if (Date.parse(input.expiresAt) <= Date.parse(input.authorizedAt)) {
      throw new Error("expiresAt must be after authorizedAt");
    }
  }

  const localeScopes = normalized(input.localeScopes, "localeScopes");
  const targetClassScopes = input.targetClassScopes
    ? normalized(input.targetClassScopes, "targetClassScopes")
    : undefined;
  const qualificationRefs = normalized(input.qualificationRefs, "qualificationRefs");

  const grant = {
    reviewerId: input.reviewerId,
    role: input.role,
    localeScopes,
    ...(targetClassScopes ? { targetClassScopes } : {}),
    qualificationRefs,
    authorizedAt: input.authorizedAt,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  };
  const authorityGrantFingerprint = fingerprint(grantPayload(grant));
  const authorityId = `reviewer-authority:${authorityGrantFingerprint.slice("sha256:".length)}`;
  const recordFingerprint = fingerprint(
    recordPayload({
      authorityId,
      authorityGrantFingerprint,
      status: "active",
    }),
  );

  return Object.freeze({
    schemaVersion: "1.0.0",
    authorityId,
    authorityGrantFingerprint,
    recordFingerprint,
    ...grant,
    status: "active",
    authority: "reviewer_authorization_only",
  });
}

export function retireReviewerAuthorityRecord(input: {
  authority: ReviewerAuthorityRecord;
  retiredAt: string;
  retirementReason: string;
}): ReviewerAuthorityRecord {
  timestamp(input.retiredAt, "retiredAt");
  required(input.retirementReason, "retirementReason");
  if (input.authority.status === "retired") {
    throw new Error("Reviewer authority is already retired");
  }
  if (Date.parse(input.retiredAt) < Date.parse(input.authority.authorizedAt)) {
    throw new Error("retiredAt cannot precede authorizedAt");
  }

  const recordFingerprint = fingerprint(
    recordPayload({
      authorityId: input.authority.authorityId,
      authorityGrantFingerprint: input.authority.authorityGrantFingerprint,
      status: "retired",
      retiredAt: input.retiredAt,
      retirementReason: input.retirementReason,
    }),
  );

  return Object.freeze({
    ...input.authority,
    status: "retired",
    retiredAt: input.retiredAt,
    retirementReason: input.retirementReason,
    recordFingerprint,
  });
}

export function verifyReviewerAuthorityRecord(
  authority: ReviewerAuthorityRecord,
): readonly string[] {
  const issues: string[] = [];
  try {
    const localeScopes = [...authority.localeScopes].sort();
    const targetClassScopes = authority.targetClassScopes
      ? [...authority.targetClassScopes].sort()
      : undefined;
    const qualificationRefs = [...authority.qualificationRefs].sort();
    const expectedGrant = fingerprint(
      grantPayload({
        reviewerId: authority.reviewerId,
        role: authority.role,
        localeScopes,
        ...(targetClassScopes ? { targetClassScopes } : {}),
        qualificationRefs,
        authorizedAt: authority.authorizedAt,
        ...(authority.expiresAt ? { expiresAt: authority.expiresAt } : {}),
      }),
    );
    if (expectedGrant !== authority.authorityGrantFingerprint) {
      issues.push("AUTHORITY_GRANT_FINGERPRINT_MISMATCH");
    }
    const expectedId = `reviewer-authority:${expectedGrant.slice("sha256:".length)}`;
    if (expectedId !== authority.authorityId) issues.push("AUTHORITY_ID_MISMATCH");

    const expectedRecord = fingerprint(
      recordPayload({
        authorityId: authority.authorityId,
        authorityGrantFingerprint: authority.authorityGrantFingerprint,
        status: authority.status,
        ...(authority.retiredAt ? { retiredAt: authority.retiredAt } : {}),
        ...(authority.retirementReason
          ? { retirementReason: authority.retirementReason }
          : {}),
      }),
    );
    if (expectedRecord !== authority.recordFingerprint) {
      issues.push("AUTHORITY_RECORD_FINGERPRINT_MISMATCH");
    }
  } catch {
    issues.push("AUTHORITY_RECORD_INVALID");
  }

  if (!authority.reviewerId.trim()) issues.push("REVIEWER_ID_MISSING");
  if (authority.localeScopes.length === 0) issues.push("LOCALE_SCOPE_EMPTY");
  if (authority.qualificationRefs.length === 0) issues.push("QUALIFICATION_REFS_EMPTY");
  if (!Number.isFinite(Date.parse(authority.authorizedAt))) issues.push("AUTHORIZED_AT_INVALID");
  if (
    authority.expiresAt !== undefined &&
    !Number.isFinite(Date.parse(authority.expiresAt))
  ) {
    issues.push("EXPIRES_AT_INVALID");
  }
  if (authority.status === "retired") {
    if (!authority.retiredAt || !Number.isFinite(Date.parse(authority.retiredAt))) {
      issues.push("RETIRED_AT_INVALID");
    }
    if (!authority.retirementReason?.trim()) issues.push("RETIREMENT_REASON_MISSING");
  }

  return Object.freeze(issues);
}

export function assertReviewerAuthorizedAt(input: {
  authority: ReviewerAuthorityRecord;
  reviewerId: string;
  role: ReviewerAuthorityRole;
  locale: string;
  targetClass?: string;
  at: string;
}): void {
  const issues = verifyReviewerAuthorityRecord(input.authority);
  if (issues.length > 0) {
    throw new Error(`Invalid reviewer authority: ${issues.join(",")}`);
  }
  timestamp(input.at, "review time");

  if (input.authority.reviewerId !== input.reviewerId) {
    throw new Error("Reviewer authority does not belong to reviewer");
  }
  if (input.authority.role !== input.role) {
    throw new Error("Reviewer authority role mismatch");
  }
  if (!input.authority.localeScopes.includes(input.locale)) {
    throw new Error(`Reviewer authority does not cover locale ${input.locale}`);
  }
  if (
    input.authority.targetClassScopes &&
    (!input.targetClass || !input.authority.targetClassScopes.includes(input.targetClass))
  ) {
    throw new Error("Reviewer authority does not cover target class");
  }

  const at = Date.parse(input.at);
  if (at < Date.parse(input.authority.authorizedAt)) {
    throw new Error("Reviewer authority was not active at review time");
  }
  if (input.authority.expiresAt && at >= Date.parse(input.authority.expiresAt)) {
    throw new Error("Reviewer authority had expired at review time");
  }
  if (
    input.authority.status === "retired" &&
    input.authority.retiredAt &&
    at >= Date.parse(input.authority.retiredAt)
  ) {
    throw new Error("Reviewer authority was retired at review time");
  }
}
