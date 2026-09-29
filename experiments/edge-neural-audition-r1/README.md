# Edge Neural Voice Audition R1

This replaces the rejected eSpeak pilot with native Microsoft Edge neural voices.

## Voice assignments

| Locale | Voice | Audition words |
| --- | --- | --- |
| nl-BE | `nl-BE-DenaNeural` | sok, soep, sap |
| fr-BE | `fr-BE-CharlineNeural` | sac, soupe, souris |
| en-US | `en-US-AnaNeural` | sock, soup, seven |
| ar-SA | `ar-SA-ZariyahNeural` | سَمَك, سَرير, سُكَّر |

The experiment intentionally generates only three words per voice before any larger batch. The goal is to judge timbre, locale fit, /s/ realization, rate, and child-model suitability before scaling.

All generated files remain:

```text
authority = experiment_only
reviewState = unreviewed_voice_audition
```

Passing technical QA does not approve pronunciation.

## Generation

Generation runs in GitHub Actions because `edge-tts` requires network access.

The workflow:

1. installs `edge-tts`;
2. verifies that all four named voices are present in `edge-tts --list-voices`;
3. renders source MP3;
4. converts to mono 24 kHz PCM16 WAV;
5. computes SHA-256 for source MP3 and normalized WAV;
6. runs technical WAV QA;
7. commits the audition artifacts and exact manifest back to this branch.

## Voice rationale

- Dena is a native Belgian-Dutch neural voice.
- Charline is a native Belgian-French neural voice.
- Ana is an English (US) neural voice listed by Microsoft as a female child voice.
- Zariyah is a native Saudi-Arabic female neural voice used for the MSA-oriented Arabic audition.

Voice availability does not imply pronunciation approval. Each language still requires native review, and child-model suitability remains a separate human/clinical decision.
