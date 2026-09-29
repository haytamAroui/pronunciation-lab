# Speech Practice Voice Engine R1

## Why this layer exists

Pronunciation Lab is not useful if it only stores a generated file plus the voice name.

The speech-practice layer defines **what kind of reference utterance is required** independently of the renderer that eventually creates the sound.

The provider sits below the practice intent:

```text
speech-practice intent
        ↓
provider-independent articulation program
        ↓
capability binding
        ↓
Edge / Azure / local model / future backend
        ↓
render unit(s)
        ↓
timed composition
        ↓
candidate reference audio
```

## Practice units

R1 supports:

- isolated phoneme;
- syllable;
- word;
- phrase;
- sentence.

Each unit carries:

- explicit target phone;
- explicit IPA when phonetic control is needed;
- target position;
- delivery intent: natural, clear, or target-focused;
- pace intent;
- repetition count;
- inter-repetition pause;
- whether repetitions reuse one exact artifact or are rendered independently.

This is different from asking normal TTS to read a spelling such as `s s s`.

## Repetition is audio structure, not text

For an isolated /s/ model:

```text
render /s/ once
  ↓
play exact artifact
  ↓
650 ms silence
  ↓
play exact artifact
  ↓
650 ms silence
  ↓
play exact artifact
```

The provider never receives `"s s s"` as ordinary text.

That prevents a text TTS engine from deciding to say letter names, merge tokens, or invent connected-speech prosody.

`reuse_same_artifact` is useful when consistency of the model matters. `rerender_each` is available when natural variation is intentionally desired.

## Provider capability boundary

The practice layer does not assume Edge, Azure, or any specific local model.

A renderer declares only capabilities:

- text input;
- IPA input;
- supported practice-unit kinds;
- supported phonetic alphabets;
- rate/pitch control;
- exact-artifact reuse.

### Edge

The current Edge capability profile is intentionally limited to:

```text
word
phrase
sentence
provider-default text
```

Edge is not allowed to pretend that a single grapheme is an isolated phoneme reference.

### Azure

The Azure profile can accept IPA-controlled units and is eligible to produce candidates for phoneme/syllable practice.

Eligibility still does not mean the resulting pronunciation is approved.

### Local models

`LocalSpeechModelAdapter` provides a stable contract for a future local speech model.

The practice program does not change when the backend changes. A local model can advertise IPA/text support and receive a structured payload containing the target, voice/model identity, rate/pitch controls, and requested output format.

## Composition

`composeSpeechPracticePcmWav()` builds the final practice sequence from already-rendered WAV units and exact silence durations.

The same controlled unit can therefore be reused multiple times without another synthesis call.

This is important for:

- isolated sound repetition;
- CV/VC syllable repetition;
- stable child imitation models;
- predictable pause timing;
- avoiding provider-specific repetition behavior.

## Example

```ts
const program = createSpeechPracticeProgram({
  locale: "nl-BE",
  targetPhone: "s",
  targetClass: "s_initial_singleton",
  audience: "child_imitation",
  units: [
    createStructuredRepetitionUnit({
      unitId: "isolated-s",
      kind: "phoneme",
      text: "s",
      ipa: "s",
      targetPhone: "s",
      targetPosition: "isolated",
      count: 3,
      interRepetitionPauseMs: 650,
    }),
    createStructuredRepetitionUnit({
      unitId: "syllable-sa",
      kind: "syllable",
      text: "sa",
      ipa: "sa",
      targetPhone: "s",
      targetPosition: "onset",
      count: 3,
      interRepetitionPauseMs: 550,
    }),
    createStructuredRepetitionUnit({
      unitId: "word-sok",
      kind: "word",
      text: "sok",
      ipa: "sɔk",
      targetPhone: "s",
      targetPosition: "onset",
      count: 2,
      interRepetitionPauseMs: 700,
    }),
  ],
});
```

The exact timing values are authored practice parameters, not universal clinical rules. They should be reviewed for the target population and task before release.

## Safety/authority boundary

This engine structures speech-practice reference candidates. It does not diagnose a disorder, choose treatment, or claim that generated audio is clinically suitable.

Machine capability and synthesis success remain separate from native-linguistic and task/clinical approval.
