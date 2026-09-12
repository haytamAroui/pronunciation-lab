# Pronunciation Lab

Provider-neutral pronunciation rendering, benchmarking, and evidence tooling.

Pronunciation Lab sits **above** speech-synthesis providers. It keeps linguistic targets independent from any provider, plans comparable render candidates, fingerprints exact configurations and artifacts, blinds candidates for human evaluation, and records evidence without allowing a synthesis provider or CI job to grant linguistic or clinical authority.

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

The project is intentionally application-neutral. Speech-therapy products, language-learning apps, dictionaries, accessibility pipelines, education tools, and research projects can define their own release policy on top.

## Core rules

1. **The provider is never linguistic authority.** Canonical pronunciation remains application-owned input.
2. **Provider capabilities are explicit.** An adapter cannot claim IPA, lexicon, rate, or other controls it does not support.
3. **Rendering identity is immutable.** Provider, voice, locale, pronunciation mode, phone string, rate, and other material inputs are fingerprinted.
4. **Artifacts are evidence, not approval.** Successful synthesis proves only that synthesis succeeded.
5. **Blind review hides configuration.** Reviewers evaluate candidate audio without seeing provider, voice, rate, or pronunciation mode.
6. **No forced winner.** An experiment may conclude that no synthetic candidate is acceptable and require a human recording.
7. **Policies live above the core.** A clinical product can require stricter review than a general language-learning product without changing the engine.

## Initial provider model

| Capability | Azure Speech | Edge TTS | Human recording |
| --- | ---: | ---: | ---: |
| Provider-default pronunciation | yes | yes | n/a |
| Rate control | yes | yes | n/a |
| Pitch control | yes | yes | n/a |
| Inline IPA planning | yes | no | n/a |
| Reviewed provider mapping | yes | no | n/a |
| Provider lexicon planning | yes | no | n/a |
| Recording ingestion | no | no | yes |

Edge is deliberately modeled as a **default/prosody renderer**, not as an IPA renderer. Azure can expose richer pronunciation controls through its official Speech API. Human recordings remain a separate candidate class.

## Repository layout

```text
src/
  core/                 canonical targets, candidates, fingerprints
  providers/            provider contracts and adapters
    azure/
    edge/
    human/
  review/               blind sessions and evidence
  policy/               generic evidence-based selection
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
} from "pronunciation-lab";

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
    pronunciation: { mode: "canonical_ipa", phoneString: "sɔk", alphabet: "ipa" },
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
1. application exports canonical targets
2. Pronunciation Lab plans candidates
3. provider adapters materialize candidate audio
4. artifact hashes bind exact output to exact candidate identity
5. review session assigns blinded labels
6. humans score linguistic correctness / naturalness / task suitability
7. policy resolves preferred candidate, insufficient evidence, or human-required
8. consuming application decides whether and how to promote that evidence
```

## Scope boundary

Pronunciation Lab does **not** diagnose speech disorders, select treatment, infer phonemes from spelling, or decide that audio is clinically safe. It supplies provider-neutral rendering and review evidence. The consuming application owns linguistic authoring, reviewer qualifications, clinical policy, and release decisions.

## Status

Initial extraction from concepts proven in SoundSteps. The standalone repository intentionally removes SoundSteps curriculum, child-runtime, module, and release-policy dependencies.
