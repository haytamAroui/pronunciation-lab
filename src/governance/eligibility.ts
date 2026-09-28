import { fingerprint } from "../core/fingerprint.js";
import type { RendererEligibilityRecord } from "./model.js";

export function createRendererEligibilityRecord(
  input: Omit<
    RendererEligibilityRecord,
    "schemaVersion" | "eligibilityId" | "authority" | "evidenceRefs"
  > & { evidenceRefs?: readonly string[] },
): RendererEligibilityRecord {
  if (!input.renderer.rendererId.trim()) throw new Error("rendererId is required");
  if (!input.renderer.rendererVersion.trim()) throw new Error("rendererVersion is required");
  if (!input.locale.trim()) throw new Error("locale is required");
  if (!input.targetClass.trim()) throw new Error("targetClass is required");
  if (!input.rationale.trim()) throw new Error("rationale is required");

  const eligibilityFingerprint = fingerprint({
    renderer: input.renderer,
    locale: input.locale,
    targetClass: input.targetClass,
    controlMode: input.controlMode,
    status: input.status,
    rationale: input.rationale,
    evidenceRefs: input.evidenceRefs ?? [],
  });

  return Object.freeze({
    schemaVersion: "1.0.0",
    eligibilityId: `eligibility:${eligibilityFingerprint.slice("sha256:".length)}`,
    renderer: Object.freeze({ ...input.renderer }),
    locale: input.locale,
    targetClass: input.targetClass,
    controlMode: input.controlMode,
    status: input.status,
    rationale: input.rationale,
    ...(input.evidenceRefs
      ? { evidenceRefs: Object.freeze([...input.evidenceRefs]) }
      : {}),
    authority: "capability_only_not_pronunciation_approval",
  });
}

export function assertEligibleForCandidateGeneration(
  eligibility: RendererEligibilityRecord,
): void {
  if (eligibility.status !== "eligible_for_candidate_generation") {
    throw new Error("Renderer is not eligible for candidate generation");
  }
}
