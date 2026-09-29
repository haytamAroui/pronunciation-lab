# Governed Release Pipeline R1

> Machines filter. Humans approve.

## Hard invariants

1. No machine-generated metric can transition an artifact into an approved or released state.
2. Renderer eligibility means only `eligible_for_candidate_generation`.
3. Technical QA is blocking; acoustic QA is advisory and may abstain.
4. Release requires explicit passing native-linguistic and clinical human evidence.
5. Human review evidence is bound to the exact artifact ID + audio SHA-256 through an opaque blind binding fingerprint.
6. Different bytes from the same candidate require new human review.
7. Releases and rejections are append-only governed records.
8. Human recordings do not bypass QA or human review.
9. SoundSteps export only includes explicit active releases and records the exact release-ledger head.
10. SoundSteps must still verify the actual bundled WAV SHA-256.
11. Operational rates always expose their numerator and denominator; no-observation rates are `null`.

## Implemented flow

```text
Target Registry
  -> Rendering Profile
  -> Renderer Eligibility
  -> Governed Candidate Plan
  -> Immutable Render Artifact
  -> Technical Audio QA
  -> Acoustic QA (advisory / abstain)
  -> Blind Native-Linguistic Review (exact artifact binding)
  -> Blind Clinical Review (exact artifact binding)
  -> Selection / Human Recording Escalation if needed
  -> ReleasedReference
  -> Append-only Release Ledger
  -> SoundSteps Consumer Manifest
  -> SoundSteps runtime release registry
  -> exact bundled-WAV hash check

Governed evidence + ledgers
  -> Operational Metrics Snapshot
  -> explicit numerators / denominators / null when no data
```

See:

- [ACOUSTIC_QA_R1.md](./ACOUSTIC_QA_R1.md)
- [HUMAN_RECORDING_FALLBACK.md](./HUMAN_RECORDING_FALLBACK.md)
- [SOUNDSTEPS_RELEASE_MANIFEST.md](./SOUNDSTEPS_RELEASE_MANIFEST.md)
- [OPERATIONAL_METRICS_R1.md](./OPERATIONAL_METRICS_R1.md)

## Remaining evidence work

The R1 architecture is now implemented. The next work is empirical rather than another broad architecture layer:

- author and native-review the narrow `nl-BE /s/ initial` experiment set;
- run real candidate artifacts through the full governed pipeline;
- compare acoustic observations against blind linguistic and clinical decisions;
- calibrate acoustic thresholds from those results;
- only then consider additional target classes or phoneme families.
