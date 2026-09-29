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

The package provides contracts for reviewed articulation profiles, sustainable versus closure-release motor behavior, explicit sustain/pulse/CV/VC/lexical motor actions, and repetition/pause intent.

It deliberately does **not** ship a broad phoneme inventory or infer a treatment progression. The first empirical target remains the reviewed nl-BE /s/ pilot. New profiles and patterns should be added only after review and evidence.

An articulation profile must carry explicit review evidence before it can author practice intent. Emitted target drafts still require Pronunciation Lab's normal target, renderer, QA, human-review, and release gates.

## Non-claims

This package does not diagnose, select treatment, infer a practice road from spelling, or claim that a motor pattern is clinically suitable merely because it is representable.
