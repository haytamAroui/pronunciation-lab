# Human Recording Fallback R1

## Purpose

Human recording is a first-class renderer path, not an emergency file replacement.

The fallback exists for the case where a complete synthetic experiment has been reviewed by the required human roles and no synthetic candidate satisfies the acceptance gate.

```text
fully reviewed synthetic experiment
  -> human_recording_required
  -> governed escalation
  -> protocol-bound recording
  -> immutable source hash
  -> human candidate
  -> immutable artifact
  -> technical QA
  -> advisory acoustic QA
  -> blind native-linguistic review
  -> blind clinical review
  -> normal release manifest
```

A human recording does **not** bypass the release gates.

## Escalation

`createHumanRecordingEscalation()` requires:

- a `human_recording_required` selection result;
- the originating blind-review session;
- every reviewed candidate;
- an all-synthetic candidate set;
- conclusive human evidence IDs.

This prevents an incomplete or ambiguous synthetic experiment from silently escalating to recording.

The escalation itself has no release authority.

## Recording protocol

`HumanRecordingProtocol` versions the production instructions that materially affect the reference recording:

- protocol ID and version;
- locale;
- target class;
- instructions reference;
- whether usage-authorization evidence is mandatory.

Pronunciation Lab stores stable references, not unnecessary personal data.

## Ingestion

`ingestHumanRecording()` hashes the source bytes **before** creating the candidate.

That SHA-256 is embedded in the human renderer specification:

```text
HumanRendererSpec.sourceAudioSha256
```

The candidate fingerprint therefore changes when the recording bytes change.

The same bytes are then converted into the immutable render artifact. Ingestion fails if the source hash and artifact hash diverge.

Provenance includes:

- recording reference;
- speaker reference;
- speaker locale;
- recorded timestamp;
- protocol ID/version;
- optional usage-authorization reference;
- exact source SHA-256;
- ingestion timestamp.

## Governance identity

Governed human candidates use:

```text
renderer.kind = human
renderer.rendererId = human_recording
renderer.rendererVersion = <recording protocol version>
controlMode = human_recording
```

Eligibility still means only that the candidate may enter the review pipeline. It does not approve the speaker, pronunciation, or clinical suitability.

## Review and release

After ingestion, human recordings use the **same** governed candidate-plan, technical-QA, acoustic-QA, blind native-linguistic, clinical-review, and release-manifest path as synthetic audio.

There is no shortcut from `human` to `released`.

## Next

The remaining R1 governance work is:

1. release-manifest serialization and verification for consumers such as SoundSteps;
2. operational metrics/counters;
3. the native-reviewed `nl-BE /s/ initial` experiment fixture and calibration data.
