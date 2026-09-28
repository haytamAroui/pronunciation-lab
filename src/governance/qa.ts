import { fingerprint } from "../core/fingerprint.js";
import type {
  AcousticQaResult,
  TechnicalQaCheck,
  TechnicalQaResult,
} from "./model.js";

function validTimestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
}

export function createTechnicalQaResult(input: {
  artifactId: string;
  checks: readonly TechnicalQaCheck[];
  checkedAt: string;
}): TechnicalQaResult {
  if (!input.artifactId.trim()) throw new Error("artifactId is required");
  if (input.checks.length === 0) throw new Error("Technical QA requires at least one check");
  validTimestamp(input.checkedAt, "checkedAt");

  for (const check of input.checks) {
    if (!check.name.trim()) throw new Error("Technical QA check name is required");
  }

  const status = input.checks.every((check) => check.passed) ? "pass" : "fail";
  const checks = Object.freeze(input.checks.map((check) => Object.freeze({ ...check })));
  const qaFingerprint = fingerprint({
    artifactId: input.artifactId,
    status,
    checks,
    checkedAt: input.checkedAt,
  });

  return Object.freeze({
    schemaVersion: "1.0.0",
    qaId: `technical-qa:${qaFingerprint.slice("sha256:".length)}`,
    artifactId: input.artifactId,
    status,
    checks,
    checkedAt: input.checkedAt,
    authority: "machine_filter_only",
  });
}

export function createAcousticQaResult(input: {
  artifactId: string;
  status: AcousticQaResult["status"];
  confidence?: number;
  reason?: string;
  flags?: readonly string[];
  checkedAt: string;
}): AcousticQaResult {
  if (!input.artifactId.trim()) throw new Error("artifactId is required");
  validTimestamp(input.checkedAt, "checkedAt");

  if (
    input.confidence !== undefined &&
    (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)
  ) {
    throw new Error("Acoustic QA confidence must be between 0 and 1");
  }
  if (input.status === "target_likely_located" && input.confidence === undefined) {
    throw new Error("target_likely_located requires confidence");
  }
  if (input.status === "abstain" && !input.reason?.trim()) {
    throw new Error("Acoustic QA abstention requires a reason");
  }

  const flags = Object.freeze([...(input.flags ?? [])]);
  const qaFingerprint = fingerprint({
    artifactId: input.artifactId,
    status: input.status,
    confidence: input.confidence ?? null,
    reason: input.reason ?? null,
    flags,
    checkedAt: input.checkedAt,
  });

  return Object.freeze({
    schemaVersion: "1.0.0",
    qaId: `acoustic-qa:${qaFingerprint.slice("sha256:".length)}`,
    artifactId: input.artifactId,
    status: input.status,
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    flags,
    checkedAt: input.checkedAt,
    authority: "machine_advisory_only",
  });
}
