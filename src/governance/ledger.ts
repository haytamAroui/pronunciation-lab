import { fingerprint } from "../core/fingerprint.js";
import type { RenderArtifact } from "../core/model.js";
import type { RejectionOwner, RejectionReason } from "./rejection.js";
import { routeRejection } from "./rejection.js";
import type { ReleasedReference } from "./model.js";

interface LedgerEnvelopeBase {
  schemaVersion: "1.0.0";
  sequence: number;
  eventId: string;
  occurredAt: string;
  previousEventFingerprint: string | null;
  eventFingerprint: string;
}

export type ReleaseLedgerEvent =
  | Readonly<
      LedgerEnvelopeBase & {
        eventType: "released";
        release: ReleasedReference;
      }
    >
  | Readonly<
      LedgerEnvelopeBase & {
        eventType: "retired";
        releaseId: string;
        reason: string;
        evidenceRefs: readonly string[];
      }
    >;

export type RejectionSource =
  | "technical_qa"
  | "acoustic_qa"
  | "native_linguistic"
  | "clinical"
  | "operator";

export interface RejectionLedgerEntry extends LedgerEnvelopeBase {
  eventType: "rejected";
  source: RejectionSource;
  targetId: string;
  candidateId?: string;
  artifactId?: string;
  reason: RejectionReason;
  owner: RejectionOwner;
  evidenceRefs: readonly string[];
  note?: string;
}

function requireTimestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
}

function previousFingerprint(
  ledger: readonly { eventFingerprint: string }[],
): string | null {
  return ledger.length === 0 ? null : ledger[ledger.length - 1]!.eventFingerprint;
}

function eventId(prefix: string, eventFingerprint: string): string {
  return `${prefix}:${eventFingerprint.slice("sha256:".length)}`;
}

function computeReleaseEventFingerprint(input:
  | {
      sequence: number;
      occurredAt: string;
      previousEventFingerprint: string | null;
      eventType: "released";
      release: ReleasedReference;
    }
  | {
      sequence: number;
      occurredAt: string;
      previousEventFingerprint: string | null;
      eventType: "retired";
      releaseId: string;
      reason: string;
      evidenceRefs: readonly string[];
    }
): string {
  return fingerprint(input);
}

export function appendRelease(input: {
  ledger: readonly ReleaseLedgerEvent[];
  release: ReleasedReference;
  occurredAt?: string;
}): readonly ReleaseLedgerEvent[] {
  const occurredAt = input.occurredAt ?? input.release.releasedAt;
  requireTimestamp(occurredAt, "occurredAt");

  if (
    input.ledger.some(
      (event) => event.eventType === "released" && event.release.releaseId === input.release.releaseId,
    )
  ) {
    throw new Error(`Release ${input.release.releaseId} already exists in the ledger`);
  }

  const sequence = input.ledger.length + 1;
  const previousEventFingerprint = previousFingerprint(input.ledger);
  const eventFingerprint = computeReleaseEventFingerprint({
    sequence,
    occurredAt,
    previousEventFingerprint,
    eventType: "released",
    release: input.release,
  });

  const event: ReleaseLedgerEvent = Object.freeze({
    schemaVersion: "1.0.0",
    sequence,
    eventId: eventId("release-event", eventFingerprint),
    occurredAt,
    previousEventFingerprint,
    eventFingerprint,
    eventType: "released",
    release: input.release,
  });

  return Object.freeze([...input.ledger, event]);
}

export function retireRelease(input: {
  ledger: readonly ReleaseLedgerEvent[];
  releaseId: string;
  reason: string;
  evidenceRefs?: readonly string[];
  occurredAt: string;
}): readonly ReleaseLedgerEvent[] {
  if (!input.releaseId.trim()) throw new Error("releaseId is required");
  if (!input.reason.trim()) throw new Error("Retirement reason is required");
  requireTimestamp(input.occurredAt, "occurredAt");

  const released = input.ledger.some(
    (event) => event.eventType === "released" && event.release.releaseId === input.releaseId,
  );
  if (!released) throw new Error(`Unknown release: ${input.releaseId}`);

  const alreadyRetired = input.ledger.some(
    (event) => event.eventType === "retired" && event.releaseId === input.releaseId,
  );
  if (alreadyRetired) throw new Error(`Release ${input.releaseId} is already retired`);

  const evidenceRefs = Object.freeze([...(input.evidenceRefs ?? [])]);
  const sequence = input.ledger.length + 1;
  const previousEventFingerprint = previousFingerprint(input.ledger);
  const eventFingerprint = computeReleaseEventFingerprint({
    sequence,
    occurredAt: input.occurredAt,
    previousEventFingerprint,
    eventType: "retired",
    releaseId: input.releaseId,
    reason: input.reason,
    evidenceRefs,
  });

  const event: ReleaseLedgerEvent = Object.freeze({
    schemaVersion: "1.0.0",
    sequence,
    eventId: eventId("release-event", eventFingerprint),
    occurredAt: input.occurredAt,
    previousEventFingerprint,
    eventFingerprint,
    eventType: "retired",
    releaseId: input.releaseId,
    reason: input.reason,
    evidenceRefs,
  });

  return Object.freeze([...input.ledger, event]);
}

export function activeReleasesFromLedger(
  ledger: readonly ReleaseLedgerEvent[],
): readonly ReleasedReference[] {
  const retired = new Set(
    ledger
      .filter((event): event is Extract<ReleaseLedgerEvent, { eventType: "retired" }> =>
        event.eventType === "retired",
      )
      .map((event) => event.releaseId),
  );

  return Object.freeze(
    ledger
      .filter((event): event is Extract<ReleaseLedgerEvent, { eventType: "released" }> =>
        event.eventType === "released",
      )
      .map((event) => event.release)
      .filter((release) => !retired.has(release.releaseId)),
  );
}

export function hasActiveReleaseForArtifactInLedger(input: {
  artifact: Pick<RenderArtifact, "artifactId" | "audioSha256">;
  ledger: readonly ReleaseLedgerEvent[];
}): boolean {
  return activeReleasesFromLedger(input.ledger).some(
    (release) =>
      release.artifactId === input.artifact.artifactId &&
      release.audioSha256 === input.artifact.audioSha256,
  );
}

export function verifyReleaseLedger(
  ledger: readonly ReleaseLedgerEvent[],
): readonly string[] {
  const issues: string[] = [];
  const seenReleaseIds = new Set<string>();
  const retiredReleaseIds = new Set<string>();

  ledger.forEach((event, index) => {
    const expectedSequence = index + 1;
    const expectedPrevious = index === 0 ? null : ledger[index - 1]!.eventFingerprint;
    if (event.sequence !== expectedSequence) issues.push(`SEQUENCE_MISMATCH:${event.eventId}`);
    if (event.previousEventFingerprint !== expectedPrevious) {
      issues.push(`PREVIOUS_FINGERPRINT_MISMATCH:${event.eventId}`);
    }

    const expectedFingerprint =
      event.eventType === "released"
        ? computeReleaseEventFingerprint({
            sequence: event.sequence,
            occurredAt: event.occurredAt,
            previousEventFingerprint: event.previousEventFingerprint,
            eventType: "released",
            release: event.release,
          })
        : computeReleaseEventFingerprint({
            sequence: event.sequence,
            occurredAt: event.occurredAt,
            previousEventFingerprint: event.previousEventFingerprint,
            eventType: "retired",
            releaseId: event.releaseId,
            reason: event.reason,
            evidenceRefs: event.evidenceRefs,
          });

    if (event.eventFingerprint !== expectedFingerprint) {
      issues.push(`EVENT_FINGERPRINT_MISMATCH:${event.eventId}`);
    }
    if (event.eventId !== eventId("release-event", expectedFingerprint)) {
      issues.push(`EVENT_ID_MISMATCH:${event.eventId}`);
    }

    if (event.eventType === "released") {
      if (seenReleaseIds.has(event.release.releaseId)) {
        issues.push(`DUPLICATE_RELEASE:${event.release.releaseId}`);
      }
      seenReleaseIds.add(event.release.releaseId);
    } else {
      if (!seenReleaseIds.has(event.releaseId)) {
        issues.push(`RETIREMENT_BEFORE_RELEASE:${event.releaseId}`);
      }
      if (retiredReleaseIds.has(event.releaseId)) {
        issues.push(`DUPLICATE_RETIREMENT:${event.releaseId}`);
      }
      retiredReleaseIds.add(event.releaseId);
    }
  });

  return Object.freeze(issues);
}

function computeRejectionFingerprint(input: {
  sequence: number;
  occurredAt: string;
  previousEventFingerprint: string | null;
  source: RejectionSource;
  targetId: string;
  candidateId: string | null;
  artifactId: string | null;
  reason: RejectionReason;
  owner: RejectionOwner;
  evidenceRefs: readonly string[];
  note: string | null;
}): string {
  return fingerprint(input);
}

export function appendRejection(input: {
  ledger: readonly RejectionLedgerEntry[];
  source: RejectionSource;
  targetId: string;
  candidateId?: string;
  artifactId?: string;
  reason: RejectionReason;
  evidenceRefs?: readonly string[];
  note?: string;
  occurredAt: string;
}): readonly RejectionLedgerEntry[] {
  if (!input.targetId.trim()) throw new Error("targetId is required");
  if (input.candidateId !== undefined && !input.candidateId.trim()) {
    throw new Error("candidateId cannot be empty");
  }
  if (input.artifactId !== undefined && !input.artifactId.trim()) {
    throw new Error("artifactId cannot be empty");
  }
  if (input.note !== undefined && !input.note.trim()) throw new Error("note cannot be empty");
  requireTimestamp(input.occurredAt, "occurredAt");

  const evidenceRefs = Object.freeze([...(input.evidenceRefs ?? [])]);
  const owner = routeRejection(input.reason);
  const sequence = input.ledger.length + 1;
  const previousEventFingerprint = previousFingerprint(input.ledger);
  const eventFingerprint = computeRejectionFingerprint({
    sequence,
    occurredAt: input.occurredAt,
    previousEventFingerprint,
    source: input.source,
    targetId: input.targetId,
    candidateId: input.candidateId ?? null,
    artifactId: input.artifactId ?? null,
    reason: input.reason,
    owner,
    evidenceRefs,
    note: input.note ?? null,
  });

  const entry: RejectionLedgerEntry = Object.freeze({
    schemaVersion: "1.0.0",
    sequence,
    eventId: eventId("rejection-event", eventFingerprint),
    occurredAt: input.occurredAt,
    previousEventFingerprint,
    eventFingerprint,
    eventType: "rejected",
    source: input.source,
    targetId: input.targetId,
    ...(input.candidateId !== undefined ? { candidateId: input.candidateId } : {}),
    ...(input.artifactId !== undefined ? { artifactId: input.artifactId } : {}),
    reason: input.reason,
    owner,
    evidenceRefs,
    ...(input.note !== undefined ? { note: input.note } : {}),
  });

  return Object.freeze([...input.ledger, entry]);
}

export function verifyRejectionLedger(
  ledger: readonly RejectionLedgerEntry[],
): readonly string[] {
  const issues: string[] = [];

  ledger.forEach((event, index) => {
    const expectedSequence = index + 1;
    const expectedPrevious = index === 0 ? null : ledger[index - 1]!.eventFingerprint;
    if (event.sequence !== expectedSequence) issues.push(`SEQUENCE_MISMATCH:${event.eventId}`);
    if (event.previousEventFingerprint !== expectedPrevious) {
      issues.push(`PREVIOUS_FINGERPRINT_MISMATCH:${event.eventId}`);
    }
    if (event.owner !== routeRejection(event.reason)) {
      issues.push(`REJECTION_OWNER_MISMATCH:${event.eventId}`);
    }

    const expectedFingerprint = computeRejectionFingerprint({
      sequence: event.sequence,
      occurredAt: event.occurredAt,
      previousEventFingerprint: event.previousEventFingerprint,
      source: event.source,
      targetId: event.targetId,
      candidateId: event.candidateId ?? null,
      artifactId: event.artifactId ?? null,
      reason: event.reason,
      owner: event.owner,
      evidenceRefs: event.evidenceRefs,
      note: event.note ?? null,
    });
    if (event.eventFingerprint !== expectedFingerprint) {
      issues.push(`EVENT_FINGERPRINT_MISMATCH:${event.eventId}`);
    }
    if (event.eventId !== eventId("rejection-event", expectedFingerprint)) {
      issues.push(`EVENT_ID_MISMATCH:${event.eventId}`);
    }
  });

  return Object.freeze(issues);
}
