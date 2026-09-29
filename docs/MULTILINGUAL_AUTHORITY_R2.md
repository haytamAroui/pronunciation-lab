# Multilingual Pronunciation Authority R2

## Goal

R2 strengthens the front and back of Pronunciation Lab without changing the core invariant:

> Machines may propose, filter, locate, flag, or abstain. Humans approve governed pronunciation references.

The new layers are inspired by useful patterns seen in pronunciation dictionaries, deterministic phonemizers, and multi-consumer audio systems, but they remain compatible with the existing human-authorized release pipeline.

## Source provenance

`PronunciationSourceEvidence` represents one sourced claim about how a written item is pronounced.

Supported source categories:

- official;
- dictionary;
- linguistic reference;
- corpus;
- native reviewer;
- community usage;
- other.

Every record contains locale, text, IPA reading, source reference, evidence strength, observation time, and a deterministic fingerprint.

It has **source-evidence authority only**. It cannot create a canonical target by itself.

Bulk evidence can be imported/exported with a deterministic TSV format:

```text
locale
text
ipa
source_type
source_ref
source_label
strength
observed_at
notes
```

This lets a project maintain a reviewable pronunciation evidence dataset as a single source of truth without treating that dataset as clinical approval.

## Multiple readings

`PronunciationReadingProposal` aggregates one or more matching evidence records for a candidate reading.

A scoped native-linguistic reviewer can adjudicate a set as:

- `canonicalized` — exactly one canonical reading, optional accepted variants;
- `contested` — at least two accepted variants and no forced canonical winner;
- `unresolved` — no canonical reading yet.

Only a `canonicalized` set can create a native-reviewed target registry record.

This prevents a dictionary, LLM, phonemizer, or popularity count from silently becoming pronunciation authority.

## English

The English adapter accepts a caller-supplied CMU/ARPAbet-style lexicon.

Pronunciation Lab does **not** bundle a third-party dictionary. The deployment chooses and licenses its lexicon.

The adapter:

- parses standard `WORD  PHONES` and `WORD(2)  PHONES` variants;
- converts common ARPAbet phones to approximate IPA;
- preserves multiple lexicon variants as separate proposals;
- flags stress placement as unsyllabified because ARPAbet does not provide a full syllable parse;
- abstains on lexicon misses or unsupported phones;
- never grants canonical authority.

## Arabic MSA

The Arabic adapter is a fresh conservative rule implementation for diacritized Modern Standard Arabic.

It supports:

- common MSA consonants;
- short vowels;
- long vowels from vowel+mater sequences;
- tanwin;
- shadda/gemination;
- sukun;
- dagger alif;
- alif maqsura;
- word-initial definite article;
- sun-letter assimilation;
- moon-letter realization.

It intentionally becomes `partial` or `abstain` when the spelling is not sufficient to determine a safe proposal, including:

- missing internal vowel diacritics;
- context-dependent bare ta marbuta;
- unresolved bare alif;
- unsupported characters.

The Arabic adapter is not copied from the CC BY-NC Arabic-Phonetiser project. It is an independent implementation and remains proposal-only.

## Released pronunciation catalog

`createReleasedPronunciationCatalog()` converts the existing append-only release ledger plus target registry into a generic downstream catalog.

Each entry exposes:

- target ID and registry version;
- locale and text;
- canonical IPA;
- optional reading-set provenance;
- exact release ID/fingerprint;
- exact artifact ID/SHA-256;
- renderer identity/version;
- linguistic and clinical evidence IDs;
- release timestamp.

The catalog is deterministic, fingerprinted, searchable, and consumer-neutral.

It can be used by:

```text
SoundSteps
Niveli
CLI
MCP server
website/API
research tooling
```

without any of those consumers redefining which artifact was actually approved.

## What R2 deliberately does not copy

The repository comparison also surfaced patterns that do not belong in Pronunciation Lab core:

- AI-generated 0–100 pronunciation scores;
- an LLM acting as sole phonetic or clinical authority;
- waveform-shape similarity presented as pronunciation correctness;
- provider success treated as linguistic approval.

Those can exist in experimental or consumer layers only if their authority remains explicitly bounded.
