import { fingerprint, sha256 } from "./fingerprint.js";
import type { PronunciationCandidate, RenderArtifact } from "./model.js";

function computeArtifactFingerprint(input: {
  candidateId: string;
  candidateFingerprint: string;
  audioSha256: string;
  mediaType: string;
  byteLength: number;
  providerRequestFingerprint?: string | undefined;
  providerResponseMetadata?: Readonly<Record<string, string | number | boolean | null>> | undefined;
}): string {
  return fingerprint({
    candidateId: input.candidateId,
    candidateFingerprint: input.candidateFingerprint,
    audioSha256: input.audioSha256,
    mediaType: input.mediaType,
    byteLength: input.byteLength,
    providerRequestFingerprint: input.providerRequestFingerprint ?? null,
    providerResponseMetadata: input.providerResponseMetadata ?? null,
  });
}

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
  const artifactFingerprint = computeArtifactFingerprint({
    candidateId: input.candidate.candidateId,
    candidateFingerprint: input.candidate.candidateFingerprint,
    audioSha256,
    mediaType: input.mediaType,
    byteLength: input.bytes.byteLength,
    providerRequestFingerprint: input.providerRequestFingerprint,
    providerResponseMetadata: input.providerResponseMetadata,
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

export function verifyRenderArtifact(input: {
  artifact: RenderArtifact;
  candidate: PronunciationCandidate;
  bytes: Uint8Array;
}): readonly string[] {
  const issues: string[] = [];
  if (input.artifact.candidateId !== input.candidate.candidateId) issues.push("ARTIFACT_CANDIDATE_ID_MISMATCH");
  if (input.artifact.candidateFingerprint !== input.candidate.candidateFingerprint) {
    issues.push("ARTIFACT_CANDIDATE_FINGERPRINT_MISMATCH");
  }

  const audioSha256 = sha256(input.bytes);
  if (input.artifact.audioSha256 !== audioSha256) issues.push("ARTIFACT_AUDIO_SHA256_MISMATCH");
  if (input.artifact.byteLength !== input.bytes.byteLength) issues.push("ARTIFACT_BYTE_LENGTH_MISMATCH");

  const artifactFingerprint = computeArtifactFingerprint({
    candidateId: input.artifact.candidateId,
    candidateFingerprint: input.artifact.candidateFingerprint,
    audioSha256,
    mediaType: input.artifact.mediaType,
    byteLength: input.bytes.byteLength,
    providerRequestFingerprint: input.artifact.providerRequestFingerprint,
    providerResponseMetadata: input.artifact.providerResponseMetadata,
  });
  const expectedArtifactId = `artifact:${artifactFingerprint.slice("sha256:".length)}`;
  if (input.artifact.artifactId !== expectedArtifactId) issues.push("ARTIFACT_ID_MISMATCH");

  return Object.freeze(issues);
}

export function assertRenderArtifactIntegrity(input: {
  artifact: RenderArtifact;
  candidate: PronunciationCandidate;
  bytes: Uint8Array;
}): void {
  const issues = verifyRenderArtifact(input);
  if (issues.length > 0) throw new Error(`Render artifact integrity failure: ${issues.join(",")}`);
}
