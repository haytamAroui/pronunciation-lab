# Governed Release Pipeline R1

> Machines filter. Humans approve.

This document records the first implementation slice of the governed Pronunciation Lab pipeline.

## Hard invariants

1. No machine-generated metric can transition an artifact into an approved or released state.
2. Renderer eligibility means only `eligible_for_candidate_generation`; it never means a renderer can pronounce a target correctly.
3. Technical QA is a blocking machine filter.
4. Acoustic QA is advisory and may abstain. An abstention does not silently become a failure or a pass.
5. Release requires explicit passing evidence from both `native_linguistic` and `clinical` human review roles.
6. A release is bound to the exact artifact ID and audio SHA-256.
7. Target-registry version, rendering-profile version, and renderer version are part of release identity.
8. Releases are immutable records. A changed target, profile, renderer, or audio artifact produces a different release record.
9. A consumer such as SoundSteps should expose an artifact only when its exact artifact ID + SHA-256 is present in an active release manifest.

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
  -> Clinical Suitability Review
  -> ReleasedReference manifest
```

The existing candidate and provider layers remain reusable and experiment-oriented. The new governance layer adds explicit promotion controls without allowing provider output, CI, ASR, alignment, or acoustic metrics to grant authority.

## Rejection routing

Structured rejection reasons route back to the responsible layer:

- target / IPA / locale / stress problems -> Target Registry;
- rate / salience / over-articulation / prosody problems -> Rendering Profile;
- realization / renderer / clipping / truncation problems -> rerender or change renderer;
- child-model suitability problems -> human/clinical redesign.

This prevents the anti-pattern `reject -> regenerate -> regenerate -> regenerate` and makes failure modes measurable.

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

- persist append-only release/rejection ledgers;
- add a blind review UI that hides provider, voice, rate, acoustic metrics, and ASR until submission;
- add separate clinical suitability capture;
- add technical audio analyzers;
- add acoustic QA adapters that report confidence or abstain rather than claiming certainty;
- add human-recording escalation/ingestion;
- add release-manifest serialization/verification for SoundSteps;
- add measurement counters for technical rejection, acoustic flags, linguistic rejection, clinical rejection, and human-recording escalation.
