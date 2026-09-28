import { validateCanonicalTarget } from "../core/candidate.js";
import type {
  RenderingProfile,
  TargetRegistryApproval,
  TargetRegistryRecord,
} from "./model.js";
import type { CanonicalPronunciationTarget } from "../core/model.js";

function required(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}

export function createTargetRegistryRecord(input: {
  target: CanonicalPronunciationTarget;
  registryVersion: string;
  approval: TargetRegistryApproval;
}): TargetRegistryRecord {
  required(input.registryVersion, "registryVersion");
  const targetIssues = validateCanonicalTarget(input.target);
  if (targetIssues.length > 0) {
    throw new Error(`Invalid target registry record: ${targetIssues.join(",")}`);
  }

  if (input.approval.status === "native_reviewed") {
    if (input.approval.evidenceIds.length === 0) {
      throw new Error("Native-reviewed targets require at least one linguistic evidence ID");
    }
    if (!Number.isFinite(Date.parse(input.approval.approvedAt))) {
      throw new Error("approvedAt must be an ISO timestamp");
    }
  }

  const target = Object.freeze({
    ...input.target,
    ...(input.target.canonicalPronunciationSpans
      ? {
          canonicalPronunciationSpans: Object.freeze(
            input.target.canonicalPronunciationSpans.map((span) => Object.freeze({ ...span })),
          ),
        }
      : {}),
    metadata: Object.freeze({ ...input.target.metadata }),
  });

  const approval =
    input.approval.status === "native_reviewed"
      ? Object.freeze({
          ...input.approval,
          evidenceIds: Object.freeze([...input.approval.evidenceIds]),
        })
      : Object.freeze({ ...input.approval });

  return Object.freeze({
    schemaVersion: "1.0.0",
    target,
    registryVersion: input.registryVersion,
    approval,
  });
}

export function createRenderingProfile(
  input: Omit<RenderingProfile, "schemaVersion">,
): RenderingProfile {
  required(input.profileId, "profileId");
  required(input.version, "version");
  required(input.locale, "locale");
  required(input.targetClass, "targetClass");
  if (input.intent.notes !== undefined && !input.intent.notes.trim()) {
    throw new Error("intent.notes cannot be empty when provided");
  }

  return Object.freeze({
    schemaVersion: "1.0.0",
    profileId: input.profileId,
    version: input.version,
    locale: input.locale,
    targetClass: input.targetClass,
    intent: Object.freeze({ ...input.intent }),
  });
}
