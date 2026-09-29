# SoundSteps Release Manifest Boundary

Pronunciation Lab does not replace SoundSteps' existing runtime release registry. It provides the upstream governed authority record that SoundSteps can verify before adding a static runtime asset.

## SoundSteps contract observed in the app

SoundSteps already requires a runtime release row with:

- release ID;
- locale;
- content kind;
- canonical content reference;
- 8-character source fingerprint;
- exact audio SHA-256;
- canonical WAV asset path;
- purpose;
- review state.

For target-reference audio, SoundSteps requires `clinical_reference_approved`, and its build step re-hashes the actual bundled WAV.

## Export chain

```text
exact reviewed artifact
  -> Pronunciation Lab ReleasedReference
  -> append-only release ledger
  -> SoundSteps consumer manifest
  -> SoundSteps runtimeAudioReleaseRegistry shape
  -> SoundSteps exact bundled-WAV SHA check
```

No SoundSteps content identity is inferred from a provider, file name, spelling, or locale. The caller supplies an explicit binding from a Pronunciation Lab release to SoundSteps `contentRef` and source fingerprint.

## Exact-artifact review binding

Blind review submissions now carry an opaque `artifactBindingFingerprint` derived from:

- session ID;
- blind label;
- candidate ID;
- artifact ID;
- exact audio SHA-256.

The reviewer does not see those identifiers. The review packet only exposes the blind label, playback reference, target information, and opaque binding token.

A release fails if its human evidence was captured for different bytes, even when the candidate configuration is identical.

## Manifest integrity

The SoundSteps manifest contains:

- consumer = `soundsteps`;
- generation timestamp;
- exact release-ledger head fingerprint;
- sorted entries;
- manifest SHA-256.

Verification can optionally receive the current Pronunciation Lab ledger. It then rejects stale manifests when a release is retired, the ledger head changes, or any target/profile/renderer/artifact identity differs.

The fingerprint is an integrity mechanism, not a digital signature. Authenticity still depends on obtaining the manifest and ledger head from a trusted release process.

## Compatibility adapter

`toSoundStepsRuntimeAudioReleases()` emits the shape used by SoundSteps' current `runtimeAudioReleaseRegistry.ts`:

```text
purpose = target_reference
reviewState = clinical_reference_approved
```

SoundSteps should continue performing its existing file-byte SHA-256 validation before generating Metro static `require(...)` entries.
