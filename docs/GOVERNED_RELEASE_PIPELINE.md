# Governed Release Pipeline R1

> Machines filter. Humans approve.

This document records the implemented governed Pronunciation Lab pipeline.

## Hard invariants

1. No machine-generated metric can transition an artifact into an approved or released state.
2. Renderer eligibility means only `eligible_for_candidate_generation`; it never means a renderer can pronounce a target correctly.
3. Technical QA is a blocking machine filter.
4. Acoustic QA is advisory and may abstain. An abstention does not silently become a failure or a pass.
5. Release requires explicit passing evidence from both `native_linguistic` and `clinical` human review roles.
6. A release is bound to the exact artifact ID and audio SHA-256.
7. Target-registry version, rendering-profile version, and renderer version are part of release identity.
8. Releases are immutable records. Supersession/retirement is represented by a later ledger event, never by rewriting release history.
9. Rejections are append-only structured events with deterministic ownership routing.
10. Blind review packets never contain candidate IDs, provider identity, voice identity, rendering parameters, acoustic QA, or ASR output.
11. Provider/configuration and machine-analysis data may be revealed only after the reviewer has submitted evidence for that blind label.
12. A consumer such as SoundSteps should expose an artifact only when its exact artifact ID + SHA-256 resolves to an active release in the release ledger.

## Implemented flow

```text
Target Registry
  -> Rendering Profile
  -> Renderer Eligibility
  -> Governed Candidate Plan
  -> Immutable Render Artifact
  -> Technical QA (blocking)
  -> Acoustic QA (advisory / abstain)
  -> Blind Native-Linguistic Review
  -> Blind Clinical Suitability Review
  -> ReleasedReference manifest
  -> Append-only Release Ledger
```

The existing candidate and provider layers remain reusable and experiment-oriented. The governance layer adds explicit promotion controls without allowing provider output, CI, ASR, alignment, or acoustic metrics to grant authority.

## Blind review contract

The blind packet contains only the authored target identity needed by the reviewer plus opaque playback references:

```text
target text
canonical IPA
locale
authored target cue
blind label
opaque playback reference
```

It intentionally omits:

```text
candidate ID
provider
voice
rate
pitch
pronunciation control mode
technical metrics
acoustic metrics
ASR output
```

Native-linguistic review captures:

- correct target;
- natural locale realization;
- distortion;
- over-articulation;
- pass / fail / abstain.

Clinical suitability is separate and captures:

- good model for imitation;
- target sufficiently salient;
- rate appropriate;
- natural rather than exaggerated;
- whether the clinician would comfortably model it to a child;
- pass / fail / abstain.

A `pass` is rejected by the library unless every mandatory answer supports passing. A `fail` requires a structured rejection reason.

## Append-only ledgers

Pronunciation Lab remains storage-neutral, so R1 provides serialization-ready ledger contracts rather than embedding a database.

### Release ledger

A release ledger contains hash-chained events:

```text
released -> released -> retired -> ...
```

Every event stores its sequence number, previous event fingerprint, and event fingerprint. Retirement never mutates the original release. The active set is derived from the full history.

### Rejection ledger

Every rejection records:

- source: technical QA, acoustic QA, native linguistic, clinical, or operator;
- target and optional candidate/artifact;
- structured rejection reason;
- deterministic owner;
- evidence references;
- timestamp;
- hash-chain linkage.

This prevents the anti-pattern `reject -> regenerate -> regenerate -> regenerate` without learning why an approach failed.

## Rejection routing

Structured rejection reasons route back to the responsible layer:

- target / IPA / locale / stress problems -> Target Registry;
- rate / salience / over-articulation / prosody problems -> Rendering Profile;
- realization / renderer / clipping / truncation problems -> rerender or change renderer;
- child-model suitability problems -> human/clinical redesign.

## Initial experiment

The first real content experiment should remain narrow:

- locale: `nl-BE`;
- target: `/s/`;
- position: initial;
- no clusters;
- about 12 native-reviewed child-familiar words;
- deliberate variation of the following vowel and phonetic environment.

The word set is intentionally not hard-coded here. It must be authored and native-reviewed before entering the target registry.

Only after that phase survives end-to-end should the sequence expand to medial, final, phrases, sentences, and contextual/generalization speech.

## Next implementation slices

- add technical audio analyzers;
- add acoustic QA adapters that report confidence or abstain rather than claiming certainty;
- add human-recording escalation/ingestion;
- add release-manifest serialization/signature verification for SoundSteps;
- add measurement counters for technical rejection, acoustic flags, linguistic rejection, clinical rejection, and human-recording escalation;
- build the native-reviewed `nl-BE /s/ initial` experiment fixture only after content review.
