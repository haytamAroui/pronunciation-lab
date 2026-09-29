# Pronunciation Lab

Provider-neutral pronunciation rendering, multilingual pronunciation authority, benchmarking, blind review, and evidence tooling.

Pronunciation Lab sits **above** speech-synthesis providers and **below** consuming products such as SoundSteps or Niveli. It can now manage sourced pronunciation evidence, contested readings, proposal-only English/Arabic phonemization, controlled render candidates, exact artifact provenance, human review, and governed release catalogs without allowing a provider, phonemizer, LLM, or CI job to grant linguistic or clinical authority.

## Core invariant

> **Machines filter and propose. Humans approve.**

A normal TTS integration answers:

```text
text -> provider -> audio
```

Pronunciation Lab answers:

```text
source evidence / phonemizer proposals
        ↓
native-linguistic reading adjudication
        ↓
canonical target
        ↓
renderer candidates
        ↓
immutable artifact + SHA-256
        ↓
technical QA
        ↓
advisory acoustic QA / abstention
        ↓
blind native-linguistic review
        ↓
blind clinical review
        ↓
governed release
        ↓
consumer catalog / SoundSteps manifest
```

## Package

```text
@haytamaroui/pronunciation-lab
```

The package is npm-ready but is not published to the public registry yet.

Install from GitHub:

```bash
npm install github:haytamAroui/pronunciation-lab
```

## Stable subpath exports

```ts
import { buildCandidate } from "@haytamaroui/pronunciation-lab/core";
import {
  createPronunciationSourceEvidence,
  adjudicatePronunciationReadings,
} from "@haytamaroui/pronunciation-lab/authority";
import {
  phonemizeArabicMsaWord,
  phonemizeEnglishWordFromArpabet,
} from "@haytamaroui/pronunciation-lab/phonemizers";
import {
  createReleasedPronunciationCatalog,
  searchReleasedPronunciationCatalog,
} from "@haytamaroui/pronunciation-lab/catalog";
import { AzureSpeechAdapter } from "@haytamaroui/pronunciation-lab/azure";
import { EdgeTtsAdapter } from "@haytamaroui/pronunciation-lab/edge";
import { createBlindSession } from "@haytamaroui/pronunciation-lab/review";
```

## Multilingual authority

Pronunciation sources are evidence, not truth.

`PronunciationSourceEvidence` can represent an official source, dictionary, linguistic reference, corpus, native reviewer, community usage, or another source. Multiple readings can be preserved and explicitly adjudicated as canonical, accepted variants, contested, or unresolved.

Only an authorized native-linguistic adjudication may create a canonical target registry record.

## Proposal-only phonemizers

### English

The English adapter accepts a deployment-supplied CMU/ARPAbet-style dictionary, preserves alternate entries, converts common phones to approximate IPA, and abstains when the word or phone inventory is unsupported.

No external English dictionary is bundled, so the consuming deployment controls licensing and source provenance.

### Arabic

The Arabic MSA adapter is a fresh conservative rule engine for diacritized Arabic. It supports core consonants/vowels, long vowels, tanwin, shadda, sukun, alif maqsura, dagger alif, and sun/moon definite-article behavior.

Unvocalized or context-dependent forms become `partial` or `abstain`; they are never silently promoted.

## Governed release

Released references still require:

1. a native-reviewed target;
2. renderer eligibility;
3. immutable artifact bytes;
4. passing technical QA;
5. advisory acoustic QA that may abstain;
6. exact-artifact blind native-linguistic review;
7. exact-artifact blind clinical review;
8. authorized reviewer records;
9. append-only release provenance.

Human recordings use the same gates as TTS candidates.

## Consumer catalog

The generic release catalog exposes active approved pronunciation references with their locale, canonical IPA, exact artifact SHA-256, renderer identity, human evidence IDs, and optional reading-set provenance.

The same catalog can feed a CLI, MCP server, API, website, SoundSteps, Niveli, or another product without duplicating pronunciation authority.

## Repository layout

```text
src/
  authority/             sourced readings, adjudication, TSV import/export
  phonemizers/           proposal-only English ARPAbet + Arabic MSA
  core/                  targets, candidates, fingerprints, artifacts
  governance/            target registry, reviewer authority, release ledgers
  providers/             Azure + Edge adapters
  qa/                    PCM technical QA + /s/-initial acoustic evidence
  review/                blind exact-artifact human review
  human/                 governed human-recording fallback
  experiment/            comparison matrices + nl-BE /s/ R1
  catalog/               consumer-neutral governed release catalog
  consumer/              SoundSteps-specific release manifest
  metrics/               evidence-derived operational metrics
```

## Scope boundaries

Pronunciation Lab does **not**:

- diagnose speech disorders;
- select treatment;
- let a phonemizer define canonical IPA by itself;
- let an LLM or acoustic model approve pronunciation correctness;
- treat waveform similarity as pronunciation correctness;
- treat provider success as clinical suitability;
- automatically approve child-facing audio.

See [Multilingual Pronunciation Authority R2](docs/MULTILINGUAL_AUTHORITY_R2.md) and [Governed Release Pipeline R1](docs/GOVERNED_RELEASE_PIPELINE.md).

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run pack:check
```

## License

The package remains `UNLICENSED` until an explicit public license is chosen.
