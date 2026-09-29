# Speech Practice Engine

A companion package to Pronunciation Lab.

It owns **reviewed articulation profiles and authored motor-pattern intent**. It does not choose a TTS provider, synthesize audio, run acoustic QA, approve artifacts, or release child-facing references.

Dependency direction:

```text
application / SoundSteps
  -> speech-practice-engine
  -> canonical pronunciation target drafts
  -> pronunciation-lab
  -> renderer candidates / QA / blind review / governed release
```

## R1 boundary

The package provides contracts for reviewed articulation profiles, sustainable versus closure-release motor behavior, explicit sustain/pulse/CV/VC/lexical motor actions, repetition/pause intent, and authored syllable structure.

It deliberately does **not** ship a broad phoneme inventory or infer a treatment progression. The first empirical target remains the reviewed nl-BE /s/ pilot. New profiles and patterns should be added only after review and evidence.

An articulation profile must carry explicit review evidence before it can author practice intent. Emitted target drafts still require Pronunciation Lab's normal target, renderer, QA, human-review, and release gates.

## Lexical syllable structure

Lexical practice words must now carry an explicit authored syllable structure. The engine never guesses syllables from spelling.

The generic count buckets are:

| Count | Class |
| --- | --- |
| 1 | `monosyllable` |
| 2 | `disyllable` |
| 3 | `trisyllable` |
| 4+ | `polysyllable` |

Example authored metadata:

```ts
{
  unitId: "lexical-example",
  action: "lexical",
  displayText: "avocado",
  ipa: "...",
  repetitions: 1,
  pauseMs: 900,
  syllableStructure: {
    count: 4,
    syllables: ["a", "vo", "ca", "do"],
    stressSyllableIndex: 2
  }
}
```

The segmentation and stress are authored evidence and must be reviewed for the locale. They are not produced by an automatic orthographic syllabifier.

`summarizeLexicalSyllableCoverage()` can report whether an authored practice set contains 1-, 2-, 3-, and 4+-syllable lexical items. It reports coverage only; it does not decide clinical progression.

## Non-claims

This package does not diagnose, select treatment, infer a practice road from spelling, infer syllable count from spelling, or claim that a motor pattern is clinically suitable merely because it is representable.
