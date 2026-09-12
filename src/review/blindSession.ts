import { fingerprint } from "../core/fingerprint.js";

export interface BlindAssignment {
  blindLabel: string;
  candidateId: string;
}

export interface BlindReviewSession {
  schemaVersion: "1.0.0";
  sessionId: string;
  createdAt: string;
  targetId: string;
  assignments: readonly BlindAssignment[];
}

function label(index: number): string {
  let value = index + 1;
  let out = "";
  while (value > 0) {
    value -= 1;
    out = String.fromCharCode(65 + (value % 26)) + out;
    value = Math.floor(value / 26);
  }
  return out;
}

export function createBlindSession(input: {
  sessionId: string;
  createdAt: string;
  targetId: string;
  candidateIds: readonly string[];
}): BlindReviewSession {
  if (!input.sessionId.trim()) throw new Error("sessionId is required");
  if (!input.targetId.trim()) throw new Error("targetId is required");
  if (!Number.isFinite(Date.parse(input.createdAt))) throw new Error("createdAt must be an ISO timestamp");
  if (input.candidateIds.length === 0) throw new Error("At least one candidate is required");
  if (new Set(input.candidateIds).size !== input.candidateIds.length) {
    throw new Error("Duplicate candidate IDs are not allowed in a blind session");
  }

  const ordered = [...input.candidateIds].sort((left, right) => {
    const leftKey = fingerprint({ sessionId: input.sessionId, targetId: input.targetId, candidateId: left });
    const rightKey = fingerprint({ sessionId: input.sessionId, targetId: input.targetId, candidateId: right });
    return leftKey.localeCompare(rightKey) || left.localeCompare(right);
  });

  return Object.freeze({
    schemaVersion: "1.0.0",
    sessionId: input.sessionId,
    createdAt: input.createdAt,
    targetId: input.targetId,
    assignments: Object.freeze(
      ordered.map((candidateId, index) => Object.freeze({ blindLabel: label(index), candidateId })),
    ),
  });
}

export function unblind(session: BlindReviewSession, blindLabel: string): string {
  const assignment = session.assignments.find((item) => item.blindLabel === blindLabel);
  if (!assignment) throw new Error(`Unknown blind label: ${blindLabel}`);
  return assignment.candidateId;
}
