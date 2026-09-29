# Fingerprint Canonicalization V2 Migration Plan

## Status

Pronunciation Lab currently uses the compatibility algorithm identified as:

```text
v1-localeCompare
```

Object keys are recursively sorted with JavaScript `String.localeCompare()` before JSON serialization.

That behavior is now **frozen for compatibility**.

## Why it cannot be silently fixed

Fingerprints participate in:

- candidate IDs;
- render artifact IDs;
- target/review evidence IDs;
- release manifest fingerprints;
- append-only release and rejection ledger hashes;
- operational snapshot fingerprints;
- downstream consumer manifests.

Changing the comparator in place would make previously valid records recompute to different identifiers and could make historical hash chains appear corrupted.

Therefore no patch may replace `localeCompare()` inside the v1 implementation.

## V2 goal

V2 should use a locale-independent total ordering for object keys, for example a documented Unicode/code-unit comparator with fixed behavior across supported runtimes.

V2 must be introduced as a new algorithm, never as a modification of v1.

## Required migration sequence

1. Add explicit `canonicalJsonV2()` and `fingerprintV2()` functions.
2. Add `fingerprintVersion` to every new persisted record schema that derives identity from canonical JSON.
3. Treat records without a version as `v1-localeCompare`.
4. Keep v1 verification available indefinitely for existing ledgers and artifacts.
5. Add golden vectors containing ASCII and non-ASCII keys and run them on every supported Node runtime.
6. Start new v2 chains explicitly. Do not recompute or rewrite existing ledger events.
7. If continuity between a v1 ledger and a v2 ledger is required, create an explicit migration/bridge record that stores the immutable v1 head fingerprint and the new v2 chain genesis identifier.
8. Update downstream consumers to verify the algorithm declared by each record rather than assuming one global algorithm.
9. Only make v2 the default in a versioned package/schema release after dual-verification tooling exists.

## Prohibited migration

Do not:

- replace `localeCompare()` with a new comparator in the existing `canonicalJson()`;
- regenerate historical IDs;
- rewrite append-only ledger events;
- silently normalize old records into v2;
- mix v1 and v2 events in one chain without an explicit version/bridge rule.

## Acceptance criteria for V2

- identical golden vectors on all supported Node/ICU builds;
- old v1 ledgers still verify byte-for-byte;
- v2 records self-identify their fingerprint algorithm;
- mixed-version verification is explicit and tested;
- downstream manifests preserve the exact version used for each release.
