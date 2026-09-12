# Pronunciation Lab Architecture

## Boundary

Pronunciation Lab is a reusable rendering-and-evidence subsystem. It does not own a product curriculum, diagnosis, treatment selection, or application release authority.

The consuming application supplies a canonical pronunciation target:

```ts
{
  targetId,
  locale,
  text,
  canonicalIpa,
  role,
  metadata
}
```

The lab then owns only the provider-neutral steps below.

```text
Canonical target
  -> candidate matrix
  -> provider capability validation
  -> provider render plan
  -> materialized artifact + SHA-256
  -> blind review session
  -> human evidence
  -> generic selection result
```

## Packages / modules

### `core`

Owns immutable target, renderer, candidate, fingerprint, and artifact contracts.

Provider configuration is part of candidate identity. A different provider, voice, pronunciation mode, phone string, rate, pitch, output format, or provider option yields a different candidate fingerprint.

### `providers`

Adapters declare capabilities before planning.

#### Azure Speech

Current adapter capabilities:

- provider-default rendering;
- rate and pitch controls;
- inline pronunciation planning;
- reviewed provider mapping planning;
- provider lexicon planning;
- official REST API materialization.

Azure credentials exist only at materialization time and never participate in candidate identity, logs, or artifacts.

#### Edge TTS

Current adapter capabilities:

- provider-default rendering;
- rate and pitch controls;
- local `edge-tts` CLI materialization.

The adapter intentionally rejects inline phonetic overrides and lexicons. Pronunciation Lab does not call the undocumented Edge service directly; the optional CLI materializer invokes an externally installed `edge-tts` executable.

#### Human

Human recordings are represented by the core renderer contract and can be bound to immutable source-audio hashes. A future ingestion helper can add recording-protocol metadata without changing TTS provider contracts.

### `experiment`

`buildMicrosoftComparisonMatrix()` builds a useful default experiment:

```text
Edge default / natural
Azure default / natural
Azure canonical IPA / natural
Azure canonical IPA / careful
Azure canonical IPA / slower careful
```

Rates are caller-configurable. Nothing in the core claims that `0`, `-8`, or `-15` is universally optimal.

### `review`

Blind sessions deterministically re-key candidate order per session. Reviewers see labels such as A/B/C rather than provider, voice, pronunciation mode, or rate.

Review evidence is role-agnostic. A consumer may use reviewer roles such as:

- `native_linguistic`;
- `clinical`;
- `child_usability`;
- `editorial`;
- `accessibility`.

### `policy`

The default policy is deliberately conservative:

- require native-linguistic and clinical roles;
- reject candidates carrying critical flags;
- never force a winner;
- return `human_recording_required` only after all candidates are fully reviewed and none passes.

A non-clinical project should provide its own `SelectionPolicy` rather than weakening or reinterpreting evidence records.

## SoundSteps integration boundary

SoundSteps should remain responsible for:

```text
53-module catalogue
practice roads
speech-target authoring
Belgian reference-profile policy
logopedist assignment
child-facing media gates
release predicates
clinical product claims
```

A thin SoundSteps adapter may export approved/candidate lexemes into Pronunciation Lab targets and later import artifact/review evidence back into the SoundSteps production control plane.

Pronunciation Lab must not import SoundSteps source files. Dependency direction is one-way:

```text
SoundSteps -> pronunciation-lab
```

not:

```text
pronunciation-lab -> SoundSteps
```

## Other-project integration

A different project can supply any locale or canonical IPA it owns:

```text
language-learning app -> pronunciation-lab
pronunciation dictionary -> pronunciation-lab
accessibility pipeline -> pronunciation-lab
speech research tooling -> pronunciation-lab
```

The project defines the target and evidence policy; Pronunciation Lab supplies repeatable provider comparison and provenance.

## Security

- Provider credentials must never enter candidate specs or review ledgers.
- `.env` is ignored.
- Azure API keys are accepted only by the Azure materializer call.
- Generated artifacts should be stored outside Git unless the consuming project explicitly versions review fixtures.
- Review evidence should contain stable reviewer references rather than unnecessary personal data.

## Non-claims

Pronunciation Lab does not claim that:

- provider-default synthesis is linguistically correct;
- inline IPA guarantees a desired phonetic realization;
- Edge and Azure are globally identical because one comparison yielded identical bytes;
- a successful render is suitable for children;
- a blind-review winner is clinically approved unless the consuming product's qualified-review policy establishes that authority.
