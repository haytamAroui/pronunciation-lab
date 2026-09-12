import {
  AzureSpeechAdapter,
  EdgeTtsAdapter,
  buildCandidate,
  createBlindSession,
  type CanonicalPronunciationTarget,
} from "../src/index.js";

const target: CanonicalPronunciationTarget = Object.freeze({
  targetId: "example:nl-BE:sok",
  locale: "nl-BE",
  text: "sok",
  canonicalIpa: "/sɔk/",
  role: "pronunciation_reference",
  metadata: Object.freeze({ source: "example" }),
});

const candidates = [
  buildCandidate({
    target,
    renderer: {
      kind: "tts",
      provider: "edge_tts",
      voiceId: "nl-BE-DenaNeural",
      pronunciation: { mode: "provider_default" },
      ratePercent: 0,
      pitchPercent: 0,
    },
  }),
  buildCandidate({
    target,
    renderer: {
      kind: "tts",
      provider: "azure_speech",
      voiceId: "nl-BE-DenaNeural",
      pronunciation: { mode: "provider_default" },
      ratePercent: 0,
      pitchPercent: 0,
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    },
  }),
  ...[0, -8, -15].map((ratePercent) =>
    buildCandidate({
      target,
      renderer: {
        kind: "tts" as const,
        provider: "azure_speech",
        voiceId: "nl-BE-DenaNeural",
        pronunciation: { mode: "canonical_ipa" as const, alphabet: "ipa" as const, phoneString: "sɔk" },
        ratePercent,
        pitchPercent: 0,
        outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      },
    }),
  ),
];

const azure = new AzureSpeechAdapter();
const edge = new EdgeTtsAdapter();

for (const candidate of candidates) {
  if (candidate.renderer.kind !== "tts") continue;
  const adapter = candidate.renderer.provider === "azure_speech" ? azure : edge;
  const plan = adapter.plan({ target, candidate });
  console.log(candidate.candidateId, plan.providerId, plan.outputFormat);
}

console.log(
  createBlindSession({
    sessionId: "example-review-001",
    createdAt: "2026-09-13T00:00:00.000Z",
    targetId: target.targetId,
    candidateIds: candidates.map((candidate) => candidate.candidateId),
  }),
);
