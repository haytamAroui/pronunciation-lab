import { canonicalJson, fingerprint } from "../core/fingerprint.js";
import type {
  RejectionLedgerEntry,
  ReleaseLedgerEvent,
} from "../governance/ledger.js";
import {
  activeReleasesFromLedger,
  verifyRejectionLedger,
  verifyReleaseLedger,
} from "../governance/ledger.js";
import type {
  AcousticQaResult,
  TechnicalQaResult,
} from "../governance/model.js";
import type { HumanRecordingEscalation } from "../human/recording.js";
import type { CandidateSelectionResult } from "../policy/selection.js";
import {
  validateReviewEvidence,
  type CandidateReviewEvidence,
  type ReviewDecision,
} from "../review/evidence.js";

export interface OperationalMetricsWindow {
  startInclusive?: string;
  endExclusive?: string;
}

export interface SelectionObservation {
  observationId: string;
  targetId: string;
  sessionId: string;
  decidedAt: string;
  result: CandidateSelectionResult;
}

export interface MetricRate {
  numerator: number;
  denominator: number;
  /** Ratio in the range 0..1, or null when the denominator is zero. */
  value: number | null;
}

export interface DecisionMetrics {
  total: number;
  pass: number;
  fail: number;
  abstain: number;
  rejectionRate: MetricRate;
  abstainRate: MetricRate;
}

export interface OperationalMetricsSnapshot {
  schemaVersion: "1.0.0";
  generatedAt: string;
  window: Readonly<{
    startInclusive: string | null;
    endExclusive: string | null;
  }>;
  technicalQa: Readonly<{
    total: number;
    pass: number;
    fail: number;
    rejectionRate: MetricRate;
  }>;
  acousticQa: Readonly<{
    total: number;
    targetLikelyLocated: number;
    flagged: number;
    abstain: number;
    flagRate: MetricRate;
    abstainRate: MetricRate;
  }>;
  humanReviews: Readonly<{
    nativeLinguistic: DecisionMetrics;
    clinical: DecisionMetrics;
    otherRoleReviewCount: number;
  }>;
  selections: Readonly<{
    total: number;
    preferredCandidate: number;
    insufficientEvidence: number;
    rejected: number;
    humanRecordingRequired: number;
    humanRecordingEscalationRate: MetricRate;
  }>;
  humanRecording: Readonly<{
    escalationEventsInWindow: number;
    requiredSelectionsObserved: number;
    materializedRequiredSelections: number;
    unmaterializedRequiredSelections: number;
  }>;
  releases: Readonly<{
    releaseEventsInWindow: number;
    retirementEventsInWindow: number;
    currentlyActiveReleases: number;
  }>;
  rejections: Readonly<{
    totalEventsInWindow: number;
    bySource: Readonly<Record<string, number>>;
    byReason: Readonly<Record<string, number>>;
  }>;
  sourceCardinality: Readonly<{
    technicalQaResults: number;
    acousticQaResults: number;
    humanReviewEvidence: number;
    selectionObservations: number;
    humanRecordingEscalations: number;
    releaseLedgerEvents: number;
    rejectionLedgerEvents: number;
  }>;
  snapshotFingerprint: string;
}

function requireTimestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
}

function normalizedWindow(window?: OperationalMetricsWindow): {
  startInclusive: string | null;
  endExclusive: string | null;
} {
  const startInclusive = window?.startInclusive ?? null;
  const endExclusive = window?.endExclusive ?? null;

  if (startInclusive !== null) requireTimestamp(startInclusive, "window.startInclusive");
  if (endExclusive !== null) requireTimestamp(endExclusive, "window.endExclusive");
  if (
    startInclusive !== null &&
    endExclusive !== null &&
    Date.parse(startInclusive) >= Date.parse(endExclusive)
  ) {
    throw new Error("window.startInclusive must be before window.endExclusive");
  }

  return { startInclusive, endExclusive };
}

function inWindow(
  timestamp: string,
  window: Readonly<{ startInclusive: string | null; endExclusive: string | null }>,
): boolean {
  requireTimestamp(timestamp, "observation timestamp");
  const value = Date.parse(timestamp);
  if (window.startInclusive !== null && value < Date.parse(window.startInclusive)) return false;
  if (window.endExclusive !== null && value >= Date.parse(window.endExclusive)) return false;
  return true;
}

function metricRate(numerator: number, denominator: number): MetricRate {
  return Object.freeze({
    numerator,
    denominator,
    value: denominator === 0 ? null : numerator / denominator,
  });
}

function assertUnique<T>(
  values: readonly T[],
  key: (value: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const id = key(value);
    if (!id.trim()) throw new Error(`${label} contains an empty identity`);
    if (seen.has(id)) throw new Error(`${label} contains duplicate identity ${id}`);
    seen.add(id);
  }
}

function decisionMetrics(
  evidence: readonly CandidateReviewEvidence[],
  role: string,
  window: Readonly<{ startInclusive: string | null; endExclusive: string | null }>,
): DecisionMetrics {
  const reviews = evidence.filter(
    (item) => item.reviewerRole === role && inWindow(item.reviewedAt, window),
  );
  const count = (decision: ReviewDecision) =>
    reviews.filter((item) => item.overallDecision === decision).length;
  const pass = count("pass");
  const fail = count("fail");
  const abstain = count("abstain");

  return Object.freeze({
    total: reviews.length,
    pass,
    fail,
    abstain,
    rejectionRate: metricRate(fail, reviews.length),
    abstainRate: metricRate(abstain, reviews.length),
  });
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function snapshotPayload(
  snapshot: Omit<OperationalMetricsSnapshot, "snapshotFingerprint">,
): unknown {
  return {
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    window: snapshot.window,
    technicalQa: snapshot.technicalQa,
    acousticQa: snapshot.acousticQa,
    humanReviews: snapshot.humanReviews,
    selections: snapshot.selections,
    humanRecording: snapshot.humanRecording,
    releases: snapshot.releases,
    rejections: snapshot.rejections,
    sourceCardinality: snapshot.sourceCardinality,
  };
}

export function createOperationalMetricsSnapshot(input: {
  generatedAt: string;
  window?: OperationalMetricsWindow;
  technicalQaResults: readonly TechnicalQaResult[];
  acousticQaResults: readonly AcousticQaResult[];
  humanReviewEvidence: readonly CandidateReviewEvidence[];
  selectionObservations: readonly SelectionObservation[];
  humanRecordingEscalations: readonly HumanRecordingEscalation[];
  releaseLedger: readonly ReleaseLedgerEvent[];
  rejectionLedger: readonly RejectionLedgerEntry[];
}): OperationalMetricsSnapshot {
  requireTimestamp(input.generatedAt, "generatedAt");
  const window = Object.freeze(normalizedWindow(input.window));

  assertUnique(input.technicalQaResults, (item) => item.qaId, "technicalQaResults");
  assertUnique(input.acousticQaResults, (item) => item.qaId, "acousticQaResults");
  assertUnique(input.humanReviewEvidence, (item) => item.evidenceId, "humanReviewEvidence");
  assertUnique(input.selectionObservations, (item) => item.observationId, "selectionObservations");
  assertUnique(
    input.humanRecordingEscalations,
    (item) => item.escalationId,
    "humanRecordingEscalations",
  );

  const releaseIssues = verifyReleaseLedger(input.releaseLedger);
  if (releaseIssues.length > 0) {
    throw new Error(`Invalid release ledger: ${releaseIssues.join(",")}`);
  }
  const rejectionIssues = verifyRejectionLedger(input.rejectionLedger);
  if (rejectionIssues.length > 0) {
    throw new Error(`Invalid rejection ledger: ${rejectionIssues.join(",")}`);
  }

  for (const review of input.humanReviewEvidence) {
    const issues = validateReviewEvidence(review);
    if (issues.length > 0) {
      throw new Error(`Invalid review evidence ${review.evidenceId}: ${issues.join(",")}`);
    }
  }
  for (const selection of input.selectionObservations) {
    if (!selection.targetId.trim()) throw new Error("selection targetId is required");
    if (!selection.sessionId.trim()) throw new Error("selection sessionId is required");
    requireTimestamp(selection.decidedAt, "selection.decidedAt");
  }
  for (const escalation of input.humanRecordingEscalations) {
    requireTimestamp(escalation.requestedAt, "escalation.requestedAt");
  }

  const technical = input.technicalQaResults.filter((item) => inWindow(item.checkedAt, window));
  const technicalFail = technical.filter((item) => item.status === "fail").length;
  const technicalPass = technical.length - technicalFail;

  const acoustic = input.acousticQaResults.filter((item) => inWindow(item.checkedAt, window));
  const acousticLocated = acoustic.filter((item) => item.status === "target_likely_located").length;
  const acousticFlagged = acoustic.filter((item) => item.status === "flagged").length;
  const acousticAbstain = acoustic.filter((item) => item.status === "abstain").length;

  const nativeLinguistic = decisionMetrics(input.humanReviewEvidence, "native_linguistic", window);
  const clinical = decisionMetrics(input.humanReviewEvidence, "clinical", window);
  const otherRoleReviewCount = input.humanReviewEvidence.filter(
    (item) =>
      item.reviewerRole !== "native_linguistic" &&
      item.reviewerRole !== "clinical" &&
      inWindow(item.reviewedAt, window),
  ).length;

  const selections = input.selectionObservations.filter((item) => inWindow(item.decidedAt, window));
  const preferredCandidate = selections.filter(
    (item) => item.result.disposition === "preferred_candidate",
  ).length;
  const insufficientEvidence = selections.filter(
    (item) => item.result.disposition === "insufficient_evidence",
  ).length;
  const rejected = selections.filter((item) => item.result.disposition === "rejected").length;
  const humanRecordingRequiredSelections = selections.filter(
    (item) => item.result.disposition === "human_recording_required",
  );

  const escalationEventsInWindow = input.humanRecordingEscalations.filter((item) =>
    inWindow(item.requestedAt, window),
  ).length;
  const escalatedSessionIds = new Set(
    input.humanRecordingEscalations.map((item) => item.sourceSessionId),
  );
  const materializedRequiredSelections = humanRecordingRequiredSelections.filter((item) =>
    escalatedSessionIds.has(item.sessionId),
  ).length;

  const releaseEventsInWindow = input.releaseLedger.filter(
    (event) => event.eventType === "released" && inWindow(event.occurredAt, window),
  ).length;
  const retirementEventsInWindow = input.releaseLedger.filter(
    (event) => event.eventType === "retired" && inWindow(event.occurredAt, window),
  ).length;

  const rejectionEvents = input.rejectionLedger.filter((event) =>
    inWindow(event.occurredAt, window),
  );
  const bySource: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  for (const event of rejectionEvents) {
    increment(bySource, event.source);
    increment(byReason, event.reason);
  }

  const base: Omit<OperationalMetricsSnapshot, "snapshotFingerprint"> = {
    schemaVersion: "1.0.0",
    generatedAt: input.generatedAt,
    window,
    technicalQa: Object.freeze({
      total: technical.length,
      pass: technicalPass,
      fail: technicalFail,
      rejectionRate: metricRate(technicalFail, technical.length),
    }),
    acousticQa: Object.freeze({
      total: acoustic.length,
      targetLikelyLocated: acousticLocated,
      flagged: acousticFlagged,
      abstain: acousticAbstain,
      flagRate: metricRate(acousticFlagged, acoustic.length),
      abstainRate: metricRate(acousticAbstain, acoustic.length),
    }),
    humanReviews: Object.freeze({
      nativeLinguistic,
      clinical,
      otherRoleReviewCount,
    }),
    selections: Object.freeze({
      total: selections.length,
      preferredCandidate,
      insufficientEvidence,
      rejected,
      humanRecordingRequired: humanRecordingRequiredSelections.length,
      humanRecordingEscalationRate: metricRate(
        humanRecordingRequiredSelections.length,
        selections.length,
      ),
    }),
    humanRecording: Object.freeze({
      escalationEventsInWindow,
      requiredSelectionsObserved: humanRecordingRequiredSelections.length,
      materializedRequiredSelections,
      unmaterializedRequiredSelections:
        humanRecordingRequiredSelections.length - materializedRequiredSelections,
    }),
    releases: Object.freeze({
      releaseEventsInWindow,
      retirementEventsInWindow,
      currentlyActiveReleases: activeReleasesFromLedger(input.releaseLedger).length,
    }),
    rejections: Object.freeze({
      totalEventsInWindow: rejectionEvents.length,
      bySource: Object.freeze({ ...bySource }),
      byReason: Object.freeze({ ...byReason }),
    }),
    sourceCardinality: Object.freeze({
      technicalQaResults: input.technicalQaResults.length,
      acousticQaResults: input.acousticQaResults.length,
      humanReviewEvidence: input.humanReviewEvidence.length,
      selectionObservations: input.selectionObservations.length,
      humanRecordingEscalations: input.humanRecordingEscalations.length,
      releaseLedgerEvents: input.releaseLedger.length,
      rejectionLedgerEvents: input.rejectionLedger.length,
    }),
  };

  return Object.freeze({
    ...base,
    snapshotFingerprint: fingerprint(snapshotPayload(base)),
  });
}

export function verifyOperationalMetricsSnapshot(
  snapshot: OperationalMetricsSnapshot,
): readonly string[] {
  const issues: string[] = [];
  if (snapshot.schemaVersion !== "1.0.0") issues.push("SCHEMA_VERSION_UNSUPPORTED");
  if (!Number.isFinite(Date.parse(snapshot.generatedAt))) issues.push("GENERATED_AT_INVALID");
  if (
    snapshot.window.startInclusive !== null &&
    !Number.isFinite(Date.parse(snapshot.window.startInclusive))
  ) {
    issues.push("WINDOW_START_INVALID");
  }
  if (
    snapshot.window.endExclusive !== null &&
    !Number.isFinite(Date.parse(snapshot.window.endExclusive))
  ) {
    issues.push("WINDOW_END_INVALID");
  }

  const expected = fingerprint(
    snapshotPayload({
      schemaVersion: snapshot.schemaVersion,
      generatedAt: snapshot.generatedAt,
      window: snapshot.window,
      technicalQa: snapshot.technicalQa,
      acousticQa: snapshot.acousticQa,
      humanReviews: snapshot.humanReviews,
      selections: snapshot.selections,
      humanRecording: snapshot.humanRecording,
      releases: snapshot.releases,
      rejections: snapshot.rejections,
      sourceCardinality: snapshot.sourceCardinality,
    }),
  );
  if (snapshot.snapshotFingerprint !== expected) {
    issues.push("SNAPSHOT_FINGERPRINT_MISMATCH");
  }

  return Object.freeze(issues);
}

export function serializeOperationalMetricsSnapshot(
  snapshot: OperationalMetricsSnapshot,
): string {
  const issues = verifyOperationalMetricsSnapshot(snapshot);
  if (issues.length > 0) {
    throw new Error(`Cannot serialize invalid metrics snapshot: ${issues.join(",")}`);
  }
  return `${canonicalJson(snapshot)}\n`;
}
