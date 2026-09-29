# Multilingual /s/ Initial Audio Pilot R1

This experiment contains the first generated audio candidates spanning:

- **nl-BE**: sap, sok, soep, sop, suf, som
- **fr-BE**: sac, soupe, savon, soleil, souris, salade
- **en-US**: sock, soup, sun, soap, seal, seven
- **Arabic MSA candidate set**: سَمَك, سَرير, سَفينة, سُكَّر, سَيّارة, سَماء

There are 24 generated WAV candidates in the run archive.

## Important authority boundary

Every file is:

```text
authority = experiment_only
reviewState = unreviewed_synthetic_candidate
```

None is a native-reviewed or clinical reference.

The technical checks only verify basic audio integrity. They do **not** establish pronunciation correctness.

## Renderer details

The pilot was generated with local **eSpeak 1.48.15**, 130 WPM, pitch 50, amplitude 100.

- nl-BE currently uses eSpeak `nl`; this is not a Belgian-Dutch-specific voice.
- fr-BE uses eSpeak `fr-be`.
- en-US uses eSpeak `en-us`.
- the runtime has no Arabic voice. Arabic therefore uses explicit target-directed eSpeak phoneme sequences rendered through `fa` as a cross-locale experimental fallback.

The Arabic output is particularly important to treat as a **candidate only**. Its phoneme sequence is controlled, but its voice/acoustic realization is not an Arabic reference model.

## Technical QA

The generated run performed PCM16 WAV checks aligned with Pronunciation Lab's technical policy:

- sample rate in range;
- mono PCM16;
- 100–15000 ms duration;
- non-silent RMS;
- DC offset <= 0.1;
- clipping ratio <= 0.001;
- no hard waveform boundary.

All **24/24** candidates passed these technical checks.

Technical pass means only that the WAV is structurally/audio-technically usable.

## Reproduce

Requires `espeak` on PATH:

```bash
npm run audio:pilot:espeak
```

Generated binaries live under:

```text
experiments/multilingual-s-initial-r1/audio/
```

The audio directory and local manifest are intentionally ignored by Git. Generated artifacts should enter governed storage/review rather than silently becoming repository authority.

## Next gate

For each language:

```text
generated candidate
  -> native linguistic review
  -> clinical/task-suitability review where required
  -> governed release
```

For Arabic, replace the cross-locale fallback with an actual Arabic-capable renderer or human recording before any reference release is considered.
