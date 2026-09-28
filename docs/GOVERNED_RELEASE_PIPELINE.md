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
  -> ReleasedReference
  -> Append-only Release Ledger
  -> SoundSteps Consumer Manifest
  -> SoundSteps runtime release registry
  -> exact bundled-WAV hash check
```

Synthetic candidates that all fail complete human review can escalate into the protocol-bound human-recording path, which then re-enters the same governed QA/review/release pipeline.

See:

- [ACOUSTIC_QA_R1.md](./ACOUSTIC_QA_R1.md)
- [HUMAN_RECORDING_FALLBACK.md](./HUMAN_RECORDING_FALLBACK.md)
- [SOUNDSTEPS_RELEASE_MANIFEST.md](./SOUNDSTEPS_RELEASE_MANIFEST.md)

## Remaining R1 work

- operational measurement counters for technical rejection, acoustic flags, linguistic rejection, clinical rejection, and human-recording escalation;
- native-reviewed `nl-BE /s/ initial` experiment data;
- acoustic threshold calibration from real reviewed evidence before adding more phoneme classes.
