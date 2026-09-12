# Pronunciation Lab

Provider-neutral pronunciation rendering, benchmarking, blind review, and evidence tooling.

Pronunciation Lab sits **above** speech-synthesis providers. It keeps linguistic targets independent from any provider, plans comparable render candidates, fingerprints exact configurations and artifacts, blinds candidates for human evaluation, and records evidence without allowing a synthesis provider or CI job to grant linguistic or clinical authority.

## Package status

The repository is now structured as the npm package:

```text
@haytamaroui/pronunciation-lab
```

It is **npm-ready but not published to the public npm registry yet**. The GitHub repository remains the source of truth.

For an authenticated private-GitHub environment, another project can install it directly from this repository:

```bash
npm install github:haytamAroui/pronunciation-lab
```

The package has a `prepare` hook, so Git installs compile `src/` into `dist/` automatically.

When a tagged release is created, consumers should pin it instead of following `main`, for example:

```bash
npm install github:haytamAroui/pronunciation-lab#v0.1.0
```

A later public-registry release can use the same package name without changing consumer imports.

## Imports

Use the root package when broad access is convenient:

```ts
import {
  buildCandidate,
  createBlindSession,
  createMicrosoftComparisonMatrix,
} from "@haytamaroui/pronunciation-lab";
```

Or use stable subpath exports so applications only depend on the layer they need:

```ts
import { buildCandidate } from "@haytamaroui/pronunciation-lab/core";
import { AzureSpeechProvider } from "@haytamaroui/pronunciation-lab/azure";
import { EdgeTtsProvider } from "@haytamaroui/pronunciation-lab/edge";
import { createBlindSession } from "@haytamaroui/pronunciation-lab/review";
import { createMicrosoftComparisonMatrix } from "@haytamaroui/pronunciation-lab/experiment";
import { selectCandidate } from "@haytamaroui/pronunciation-lab/policy";
```

## Why this exists

A normal TTS integration answers:

```text
text -> provider -> audio
```

Pronunciation Lab answers a different question:

```text
canonical pronunciation target
  -> provider capabilities
  -> controlled render candidates
  -> immutable artifacts
  -> blind human review
  -> evidence-backed decision
```

The project is intentionally application-neutral. Speech-practice products, language-learning apps, dictionaries, accessibility pipelines, education tools, and research projects can define their own release policy on top.

## Core rules

1. **The provider is never linguistic authority.** Canonical pronunciation remains application-owned input.
2. **Provider capabilities are explicit.** An adapter cannot claim IPA, lexicon, rate, or other controls it does not support.
3. **Rendering identity is immutable.** Provider, voice, locale, pronunciation mode, phone string, rate, and other material inputs are fingerprinted.
4. **Artifacts are evidence, not approval.** Successful synthesis proves only that synthesis succeeded.
5. **Blind review hides configuration.** Reviewers evaluate candidate audio without seeing provider, voice, rate, or pronunciation mode.
6. **No forced winner.** An experiment may conclude that no synthetic candidate is acceptable and require a human recording.
7. **Policies live above the core.** A clinical product can require stricter review than a general language-learning product without changing the engine.

## Initial provider model

| Capability | Azure Speech | Edge TTS |
| --- | ---: | ---: |
| Provider-default pronunciation | yes | yes |
| Rate control | yes | yes |
| Pitch control | yes | yes |
| Inline IPA planning | yes | no |
| Reviewed provider mapping | yes | no |
| Provider lexicon planning | yes | no |
| Official provider API path | yes | no — optional local `edge-tts` CLI integration |

Edge is deliberately modeled as a **default/prosody renderer**, not as an IPA renderer. Azure exposes richer pronunciation controls through its official Speech API. A consuming application can also compare or ingest human recordings as independent evidence without letting them redefine the canonical target.

## Repository layout

```text
src/
  core/                 canonical targets, candidates, fingerprints, artifacts
  providers/
    azure/               Azure planning + official REST materialization
    edge/                Edge capability model + optional local CLI materialization
  experiment/            reusable comparison matrices
  review/                blind sessions and review evidence
  policy/                generic evidence-based selection
  index.ts

examples/
  provider-comparison.ts

tests/
```

## Minimal example

```ts
import {
  buildCandidate,
  createBlindSession,
  type CanonicalPronunciationTarget,
} from "@haytamaroui/pronunciation-lab";

const target: CanonicalPronunciationTarget = {
  targetId: "demo:nl-BE:sok",
  locale: "nl-BE",
  text: "sok",
  canonicalIpa: "/sɔk/",
  role: "pronunciation_reference",
  metadata: {},
};

const candidate = buildCandidate({
  target,
  renderer: {
    kind: "tts",
    provider: "azure_speech",
    voiceId: "nl-BE-DenaNeural",
    pronunciation: {
      mode: "canonical_ipa",
      phoneString: "sɔk",
      alphabet: "ipa",
    },
    ratePercent: -8,
    pitchPercent: 0,
  },
});

const session = createBlindSession({
  sessionId: "review-001",
  createdAt: new Date().toISOString(),
  candidateIds: [candidate.candidateId],
});
```

## Intended experiment flow

```text
1. consuming application exports canonical targets
2. Pronunciation Lab plans candidates
3. provider adapters materialize candidate audio
4. artifact hashes bind exact output to exact candidate identity
5. review session assigns blinded labels
6. humans score linguistic correctness / naturalness / task suitability
7. policy resolves preferred candidate, insufficient evidence, or human-required
8. consuming application decides whether and how to promote that evidence
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run pack:check
npm run example
```

`npm run pack:check` validates the files and metadata that would be included in an npm package without publishing anything.

## Publishing boundary

The package is currently versioned `0.1.0` and remains `UNLICENSED`. That is deliberate: no public open-source license has been chosen yet.

Before a public npm release, decide the license and confirm ownership of the npm scope `@haytamaroui`. Public publication should be an explicit release action, not an automatic consequence of CI.

## Scope boundary

Pronunciation Lab does **not** diagnose speech disorders, select treatment, infer phonemes from spelling, or decide that audio is clinically safe. It supplies provider-neutral rendering and review evidence. The consuming application owns linguistic authoring, reviewer qualifications, clinical policy, and release decisions.

## SoundSteps boundary

SoundSteps can consume this package, but Pronunciation Lab must not import SoundSteps curriculum, child runtime, 53-module catalog, practice-road, or child-release concepts.

```text
SoundSteps
    -> @haytamaroui/pronunciation-lab

@haytamaroui/pronunciation-lab
    -/-> SoundSteps
```

This keeps the pronunciation engine reusable by other projects.
