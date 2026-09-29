# Operational Metrics R1

## Principle

Pronunciation Lab does not invent success or failure percentages.

Every rate is derived from an explicit source population:

- technical rejection rate = failed technical-QA results / all technical-QA results;
- acoustic flag rate = flagged acoustic-QA results / all acoustic-QA results;
- acoustic abstention rate = abstentions / all acoustic-QA results;
- native-linguistic rejection rate = failed native-linguistic reviews / all native-linguistic reviews;
- clinical rejection rate = failed clinical reviews / all clinical reviews;
- human-recording escalation rate = selection decisions requiring human recording / all observed selection decisions.

When a denominator is zero, the metric value is `null`. The library never reports `0%` when no observations exist.

## Inputs

`createOperationalMetricsSnapshot()` consumes the governed evidence already produced by the pipeline:

- `TechnicalQaResult[]`;
- `AcousticQaResult[]`;
- `CandidateReviewEvidence[]`;
- timestamped `SelectionObservation[]`;
- `HumanRecordingEscalation[]`;
- the append-only release ledger;
- the append-only rejection ledger.

The ledgers are verified before metrics are calculated. Duplicate QA/evidence/selection/escalation identities are rejected instead of being counted twice.

## Human-recording measurement

Two separate facts are reported:

1. how often selection ended in `human_recording_required`;
2. whether those required-selection sessions have a materialized `HumanRecordingEscalation`.

This avoids conflating "the synthetic experiment failed" with "a recording workflow was actually created."

## Time windows

Snapshots can use:

```text
startInclusive <= observation < endExclusive
```

Rates use only observations inside that window.

Release and rejection ledgers are always verified as complete chains before their events are filtered by the metrics window.

## Snapshot integrity

Each snapshot contains a deterministic SHA-256 fingerprint and can be serialized with canonical JSON.

The fingerprint detects accidental or unauthorized content changes after snapshot creation. It is not a digital signature and does not establish origin authenticity.

## Interpretation

These metrics are operational evidence, not clinical performance claims.

For example, a high acoustic flag rate means the configured acoustic adapter is flagging many analyzed artifacts. It does not by itself prove that the renderer is clinically poor, and a low flag rate does not prove pronunciation correctness.

The first `nl-BE /s/ initial` experiment should use these measurements to compare machine observations with blind linguistic and clinical decisions before any acoustic thresholds are generalized.
