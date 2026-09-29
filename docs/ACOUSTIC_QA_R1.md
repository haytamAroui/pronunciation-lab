# Acoustic QA R1

## Purpose

Pronunciation Lab's acoustic layer is a **machine evidence layer**, not an approval layer.

It can:

- decode supported PCM WAV artifacts;
- inspect technical audio integrity;
- attempt to locate acoustic evidence expected for a configured target class;
- report measurements;
- flag weak evidence;
- abstain when the signal or configuration is insufficient.

It cannot:

- declare pronunciation correct;
- declare a child-therapy model suitable;
- replace native-linguistic review;
- replace clinical review;
- release an artifact.

## Decoded PCM boundary

The built-in decoder currently supports RIFF/WAVE with:

- signed PCM 16-bit;
- signed PCM 24-bit;
- signed PCM 32-bit;
- IEEE float 32-bit.

This directly covers Azure's registered `riff-24khz-16bit-mono-pcm` output.

Compressed audio such as MP3 is **not** inspected as if it were PCM. A consumer must decode compressed audio and call `createDecodedPcmAudio()`, or render a PCM candidate for QA.

## Technical QA

`analyzeTechnicalAudio()` produces blocking `TechnicalQaResult` evidence from decoded PCM.

Current checks cover:

- non-empty PCM;
- finite samples;
- sample-rate range;
- channel-count range;
- duration range;
- effective silence;
- DC offset;
- clipping ratio;
- obvious hard boundary cuts.

Thresholds are explicit and versionable by the consumer through `TechnicalAudioPolicy`.

A technical failure blocks release under the governed release policy.

## /s/ onset evidence adapter

`analyzeSInitialEvidence()` is the first target-specific acoustic adapter.

It searches the first active region of the signal and computes frame-level:

- RMS;
- zero-crossing rate;
- spectral centroid;
- high-frequency energy ratio.

The adapter then returns one of:

```text
target_likely_located
flagged
abstain
```

`target_likely_located` means only that the configured signal features were found with enough frame-level support. It does **not** mean that /s/ was linguistically correct, clinically suitable, or suitable for a child to imitate.

`flagged` means analyzable audio was present but the configured /s/-onset evidence was weak.

`abstain` is used when the analyzer lacks enough signal, sample rate, duration, or analyzable frames.

## Why no ASR gate

R1 does not use ASR as an approval criterion. Word recognition can succeed even when a target phoneme is acoustically unsuitable for the intended reference use. ASR can be added later only as a coarse anomaly signal and must remain advisory.

## Next

Before generalizing this adapter to other phoneme classes:

1. run it against the narrow native-reviewed `nl-BE /s/ initial` experiment;
2. compare machine observations with blind native-linguistic and clinical decisions;
3. measure false flags and false reassurance;
4. revise thresholds from observed data;
5. only then decide whether to extend the acoustic adapter catalog.
