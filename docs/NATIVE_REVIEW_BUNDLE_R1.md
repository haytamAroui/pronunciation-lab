# Native Review Bundle R1

## Purpose

The nl-BE /s/ experiment cannot move from draft targets to renderer candidates until a real authorized native-linguistic review exists.

This layer makes that review portable without weakening the authority gate.

## Bundle creation

`createNlBeSInitialNativeReviewBundle()` combines:

- the exact 12-item target review packet;
- its packet ID;
- a scoped native-linguistic reviewer-authority record;
- creation timestamp;
- instructions version;
- deterministic bundle fingerprint.

The reviewer authority must already cover:

```text
role = native_linguistic
locale = nl-BE
targetClass = s_initial_singleton
```

at bundle-creation time.

## Human-readable sheet

`renderNlBeSInitialNativeReviewSheetMarkdown()` produces a reviewer-friendly Markdown sheet.

It intentionally states that:

- reference IPA values are hints;
- the reviewer must confirm or correct them independently;
- editing the Markdown alone does not create approval evidence.

The Markdown is a convenience surface, not the authority record.

## Response template

`createNlBeSInitialNativeReviewResponseTemplate()` creates a JSON-shaped template with all 12 item IDs and reference hints.

Decision fields are empty/null. No approval is preselected.

For each item the reviewer must provide:

- review timestamp;
- lexical suitability;
- canonical IPA;
- initial /s/ confirmation;
- singleton-onset confirmation;
- following phone;
- syllable count;
- stress index;
- ambiguity decision;
- concept/image suitability;
- overall pass/fail/abstain;
- optional note.

## Response finalization

`createNlBeSInitialNativeReviewResponse()` requires exactly the 12 expected items, orders them according to the pinned packet, and produces a deterministic response fingerprint.

That fingerprint is tamper-evidence, not a digital signature. Reviewer authenticity still depends on the trusted workflow that controls the reviewer-authority record and receives the completed response.

## Import

`importNlBeSInitialNativeReviewResponse()`:

1. verifies bundle integrity;
2. verifies response integrity and exact packet/authority binding;
3. revalidates reviewer authority at each individual review timestamp;
4. creates fingerprinted target-review evidence for all 12 decisions;
5. promotes only `pass` items into `native_reviewed` target-registry records;
6. preserves failed/abstained decisions as evidence;
7. reports whether all 12 items are ready for candidate generation.

If one item fails or abstains, the import result is **not** ready for the 60-candidate experiment. The failed item must be replaced/reviewed; it is never silently dropped.

## No fabricated review

Tests use simulated reviewer answers to exercise the code path. Those fixtures are not product evidence and must never be copied into a production review bundle or release ledger.
