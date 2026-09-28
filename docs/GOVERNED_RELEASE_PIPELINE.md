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
12. Human recordings are first-class candidates and do not bypass technical, linguistic, clinical, or release gates.
13. A human recording's source SHA-256 is part of candidate identity and must equal the artifact SHA-256.
14. A consumer such as SoundSteps should expose an artifact only when its exact artifact ID + SHA-256 resolves to an active release in the release ledger.

## Implemented flow

```text
Target Registry
  -> Rendering Profile
  -> Renderer Eligibility
  -> Governed Candidate Plan
  -> Immutable Render Artifact
  -> PCM decode / decoded-audio boundary
  -> Technical Audio QA (blocking)
  -> Target-specific Acoustic QA (advisory / abstain)
  -> Blind Native-Linguistic Review
  -> Blind Clinical Suitability Review
  -> ReleasedReference manifest
  -> Append-only Release Ledger

Synthetic candidates all fail complete human review
  -> human_recording_required
  -> Human Recording Escalation
  -> Protocol-bound Human Recording Ingestion
  -> same governed QA/review/release path
```

The existing candidate and provider layers remain reusable and experiment-oriented. The governance layer adds explicit promotion controls without allowing provider output, CI, ASR, alignment, or acoustic metrics to grant authority.

## Audio QA R1

The built-in QA package supports RIFF PCM decoding and deterministic technical checks. Compressed bytes are never treated as decoded audio. Consumers can either render PCM or supply decoded PCM from an external decoder.

The first acoustic adapter is deliberately narrow: `nl-BE /s/`-initial experiments can use `analyzeSInitialEvidence()` to search for high-frequency onset evidence using RMS, zero-crossing rate, spectral centroid, and high-band energy ratio. Its vocabulary is intentionally limited to `target_likely_located`, `flagged`, and `abstain`.

See [ACOUSTIC_QA_R1.md](./ACOUSTIC_QA_R1.md).

## Human recording fallback

Human recording is now a governed escalation path rather than a manual file swap.

Escalation requires a fully reviewed all-synthetic session whose selection result is `human_recording_required`. Recording ingestion is protocol-bound and the exact source SHA-256 becomes part of candidate identity. Human candidates then re-enter the same governed plan, technical QA, acoustic QA, blind review, clinical review, and release path.

See [HUMAN_RECORDING_FALLBACK.md](./HUMAN_RECORDING_FALLBACK.md).

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

It intentionally omits candidate ID, provider, voice, rate, pitch, pronunciation control mode, technical metrics, acoustic metrics, and ASR output.

## Append-only ledgers

Pronunciation Lab remains storage-neutral, so R1 provides serialization-ready hash-chained ledger contracts rather than embedding a database.

Release retirement never mutates the original release. Rejection records include the source, target/candidate/artifact references, structured reason, deterministic owner, evidence refs, and timestamp.

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

- add release-manifest serialization/verification for SoundSteps;
- add measurement counters for technical rejection, acoustic flags, linguistic rejection, clinical rejection, and human-recording escalation;
- build the native-reviewed `nl-BE /s/ initial` experiment fixture only after content review;
- calibrate acoustic thresholds from experiment evidence before adding more phoneme classes.
