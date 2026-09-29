# nl-BE /s/ Initial Experiment R1

## Status

**Authoring/review queue — not release-ready.**

This experiment deliberately separates:

```text
reference candidate
    ≠
native-reviewed target
    ≠
reviewed audio artifact
    ≠
clinical reference release
```

No word in this file becomes authoritative simply because an IPA transcription is available from SoundSteps or an external dictionary.

## Scope

The R1 experiment is intentionally narrow:

- locale: `nl-BE`;
- target phoneme: `/s/`;
- word position: initial;
- syllable role: onset;
- target cluster type: singleton;
- target count: 12;
- isolated words first.

Phrases, sentences, medial/coda targets, and generalization remain outside this experiment.

## Tranche A — existing SoundSteps authored preview words

Pinned to SoundSteps main commit:

```text
8bee4fb05146f69e8e69360e370f61bc30c68d4f
```

The six current authored singleton-onset words are:

| Word | SoundSteps lexeme | Reference IPA |
| --- | --- | --- |
| sap | nl-BE_sap | /sɑp/ |
| sok | nl-BE_sok | /sɔk/ |
| soep | nl-BE_soep | /sup/ |
| sop | nl-BE_sop | /sɔp/ |
| suf | nl-BE_suf | /sʏf/ |
| som | nl-BE_som | /sɔm/ |

SoundSteps itself labels these audio/content assets as preview/synthetic material rather than native clinical release authority. Pronunciation Lab therefore imports them as **draft targets**.

## Tranche B — expansion candidates

Six additional words seed the native-review queue and broaden the following-vowel/word-shape space:

| Word | Reference IPA candidate | Why it is in the queue |
| --- | --- | --- |
| saus | /sɑus/ | one syllable, diphthongal rhyme |
| saai | /saɪ̯/ | one syllable; published Vlaanderen/Brabant variant |
| serie | /ˈseri/ | front-vowel onset, bisyllabic |
| serre | /ˈsɛːrə/ | front-vowel onset; common Flemish lexical item |
| siroop | /siˈrop/ | high-front vowel onset, bisyllabic |
| safari | /saˈfari/ | longer word shape with singleton initial /s/ candidate |

Reference sources:

- https://nl.wiktionary.org/wiki/saus
- https://nl.wiktionary.org/wiki/saai
- https://nl.wiktionary.org/wiki/serie
- https://nl.wiktionary.org/wiki/serre
- https://nl.wiktionary.org/wiki/siroop
- https://nl.wiktionary.org/wiki/safari

These are **reference hints only**. They are not treated as Belgian-Dutch clinical authority.

## Native-review gate

Before any item may enter candidate generation, a native-linguistic reviewer must explicitly confirm:

1. naturalness/familiarity for the intended Belgian-Dutch child population;
2. exact canonical nl-BE IPA;
3. initial syllable-onset `/s/`;
4. singleton target onset, not an `/s/+C` cluster;
5. following phone/environment;
6. syllable count and stress;
7. absence of problematic regional or lexical ambiguity;
8. suitability for a clear child-facing concept/image.

`createNlBeSInitialDraftRegistry()` therefore returns 12 records whose status is always `draft`.

`createReviewedNlBeSInitialTargetRecord()` requires the caller to provide the **reviewed canonical IPA and evidence IDs explicitly**. It never copies `referenceIpaCandidate` into native authority automatically.

## Candidate generation gate

`buildNlBeSInitialCandidateMatrices()` fails unless the complete 12-item set is present and every item is `native_reviewed`.

With the standard Microsoft comparison matrix:

- Edge provider-default: 1 candidate;
- Azure provider-default: 1 candidate;
- Azure canonical-IPA at 3 configured rates: 3 candidates;

that yields 5 experimental candidates per approved word, or 60 candidates for 12 words.

All remain `experiment_only`.

## Audio-analysis sequence

After rendering:

```text
artifact bytes
  -> technical QA
  -> /s/-initial acoustic evidence
  -> blind native-linguistic review
  -> blind clinical suitability review
  -> selection / human-recording fallback
  -> release only for exact approved artifact
```

The acoustic adapter is not calibrated by these reference IPA values. Threshold calibration begins only after actual reviewed artifact results exist.

## Expansion rule

Do not add medial, final, phrases, sentences, or another phoneme merely because the infrastructure supports it.

First collect enough R1 evidence to compare:

- technical failures;
- acoustic flags and abstentions;
- linguistic decisions;
- clinical decisions;
- renderer/configuration patterns;
- human-recording escalations.

Then revise the acoustic policy from observed disagreement patterns before generalizing.
