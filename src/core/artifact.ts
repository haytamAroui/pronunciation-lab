import { fingerprint, sha256 } from "./fingerprint.js";
import type { PronunciationCandidate, RenderArtifact } from "./model.js";

export function buildRenderArtifact(input: {
  candidate: PronunciationCandidate;
  bytes: Uint8Array;
  mediaType: string;
  createdAt: string;
  providerRequestFingerprint?: string;
  providerResponseMetadata?: Readonly<Record<string, string | number | boolean | null>>;
}): RenderArtifact {
  if (!input.mediaType.trim()) throw new Error("mediaType is required");
  if (!Number.isFinite(Date.parse(input.createdAt))) throw new Error("createdAt must be an ISO timestamp");
  const audioSha256 = sha256(input.bytes);
  const artifactFingerprint = fingerprint({
    candidateId: input.candidate.candidateId,
    candidateFingerprint: input.candidate.candidateFingerprint,
    audioSha256,
    mediaType: input.mediaType,
    byteLength: input.bytes.byteLength,
    providerRequestFingerprint: input.providerRequestFingerprint ?? null,
    providerResponseMetadata: input.providerResponseMetadata ?? null,
  });

  const base: RenderArtifact = {
    schemaVersion: "1.0.0",
    artifactId: `artifact:${artifactFingerprint.slice("sha256:".length)}`,
    candidateId: input.candidate.candidateId,
    candidateFingerprint: input.candidate.candidateFingerprint,
    audioSha256,
    mediaType: input.mediaType,
    byteLength: input.bytes.byteLength,
    createdAt: input.createdAt,
  };

  return Object.freeze({
    ...base,
    ...(input.providerRequestFingerprint
      ? { providerRequestFingerprint: input.providerRequestFingerprint }
      : {}),
    ...(input.providerResponseMetadata
      ? { providerResponseMetadata: Object.freeze({ ...input.providerResponseMetadata }) }
      : {}),
  });
}
