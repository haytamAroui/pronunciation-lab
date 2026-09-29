import { canonicalJson, fingerprint } from "../core/fingerprint.js";
import {
  activeReleasesFromLedger,
  verifyReleaseLedger,
  type ReleaseLedgerEvent,
} from "../governance/ledger.js";
import type { ReleasedReference } from "../governance/model.js";

export type SoundStepsAudioLocale = "nl-BE" | "fr-BE";
export type SoundStepsRuntimeAudioContentKind = "canonical_lexeme" | "authored_utterance";

export interface SoundStepsManifestBinding {
  pronunciationLabReleaseId: string;
  soundStepsReleaseId: string;
  locale: SoundStepsAudioLocale;
  contentKind: SoundStepsRuntimeAudioContentKind;
  contentRef: string;
  sourceFingerprint: string;
  assetPath: string;
}

export interface SoundStepsApprovedAudioEntry {
  pronunciationLabReleaseId: string;
  pronunciationLabReleaseFingerprint: string;
  soundStepsReleaseId: string;
  targetId: string;
  targetRegistryVersion: string;
  artifactId: string;
  audioSha256: string;
  renderingProfileId: string;
  renderingProfileVersion: string;
  rendererIdentity: string;
  rendererVersion: string;
  locale: SoundStepsAudioLocale;
  contentKind: SoundStepsRuntimeAudioContentKind;
  contentRef: string;
  sourceFingerprint: string;
  assetPath: string;
  purpose: "target_reference";
  reviewState: "clinical_reference_approved";
}

export interface SoundStepsReleaseManifest {
  schemaVersion: "1.0.0";
  consumer: "soundsteps";
  generatedAt: string;
  releaseLedgerHeadFingerprint: string | null;
  entries: readonly SoundStepsApprovedAudioEntry[];
  manifestFingerprint: string;
}

export interface SoundStepsRuntimeAudioRelease {
  releaseId: string;
  locale: SoundStepsAudioLocale;
  contentKind: SoundStepsRuntimeAudioContentKind;
  contentRef: string;
  sourceFingerprint: string;
  audioSha256: string;
  assetPath: string;
  purpose: "target_reference";
  reviewState: "clinical_reference_approved";
}

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SOURCE_FINGERPRINT = /^[0-9a-f]{8}$/u;

function expectedAssetPath(binding: Pick<
  SoundStepsManifestBinding,
  "locale" | "contentKind" | "sourceFingerprint"
>): string {
  return `assets/tts/canonical/${binding.locale}/${binding.contentKind}/${binding.sourceFingerprint}.wav`;
}

function validateBinding(binding: SoundStepsManifestBinding): void {
  if (!binding.pronunciationLabReleaseId.trim()) {
    throw new Error("pronunciationLabReleaseId is required");
  }
  if (!binding.soundStepsReleaseId.startsWith("runtime-audio-release:")) {
    throw new Error("soundStepsReleaseId must start with runtime-audio-release:");
  }
  if (!binding.contentRef.trim()) throw new Error("contentRef is required");
  if (!SOURCE_FINGERPRINT.test(binding.sourceFingerprint)) {
    throw new Error("sourceFingerprint must be exactly 8 lowercase hexadecimal characters");
  }
  const expected = expectedAssetPath(binding);
  if (binding.assetPath !== expected) {
    throw new Error(`SoundSteps asset path mismatch: expected ${expected}`);
  }
}

function manifestPayload(input: Omit<SoundStepsReleaseManifest, "manifestFingerprint">): unknown {
  return {
    schemaVersion: input.schemaVersion,
    consumer: input.consumer,
    generatedAt: input.generatedAt,
    releaseLedgerHeadFingerprint: input.releaseLedgerHeadFingerprint,
    entries: input.entries,
  };
}

function entryFrom(input: {
  release: ReleasedReference;
  binding: SoundStepsManifestBinding;
}): SoundStepsApprovedAudioEntry {
  return Object.freeze({
    pronunciationLabReleaseId: input.release.releaseId,
    pronunciationLabReleaseFingerprint: input.release.releaseManifestFingerprint,
    soundStepsReleaseId: input.binding.soundStepsReleaseId,
    targetId: input.release.targetId,
    targetRegistryVersion: input.release.targetRegistryVersion,
    artifactId: input.release.artifactId,
    audioSha256: input.release.audioSha256,
    renderingProfileId: input.release.renderingProfileId,
    renderingProfileVersion: input.release.renderingProfileVersion,
    rendererIdentity: input.release.rendererIdentity,
    rendererVersion: input.release.rendererVersion,
    locale: input.binding.locale,
    contentKind: input.binding.contentKind,
    contentRef: input.binding.contentRef,
    sourceFingerprint: input.binding.sourceFingerprint,
    assetPath: input.binding.assetPath,
    purpose: "target_reference",
    reviewState: "clinical_reference_approved",
  });
}

export function createSoundStepsReleaseManifest(input: {
  ledger: readonly ReleaseLedgerEvent[];
  bindings: readonly SoundStepsManifestBinding[];
  generatedAt: string;
}): SoundStepsReleaseManifest {
  if (!Number.isFinite(Date.parse(input.generatedAt))) {
    throw new Error("generatedAt must be an ISO timestamp");
  }

  const ledgerIssues = verifyReleaseLedger(input.ledger);
  if (ledgerIssues.length > 0) {
    throw new Error(`Cannot export invalid release ledger: ${ledgerIssues.join(",")}`);
  }

  const activeById = new Map(
    activeReleasesFromLedger(input.ledger).map((release) => [release.releaseId, release] as const),
  );
  const seenSoundStepsIds = new Set<string>();
  const seenContentKeys = new Set<string>();
  const entries: SoundStepsApprovedAudioEntry[] = [];

  for (const binding of input.bindings) {
    validateBinding(binding);
    if (seenSoundStepsIds.has(binding.soundStepsReleaseId)) {
      throw new Error(`Duplicate SoundSteps release id ${binding.soundStepsReleaseId}`);
    }
    seenSoundStepsIds.add(binding.soundStepsReleaseId);

    const contentKey = `${binding.locale}:${binding.contentKind}:${binding.contentRef}`;
    if (seenContentKeys.has(contentKey)) {
      throw new Error(`Duplicate SoundSteps content binding ${contentKey}`);
    }
    seenContentKeys.add(contentKey);

    const release = activeById.get(binding.pronunciationLabReleaseId);
    if (!release) {
      throw new Error(
        `SoundSteps binding references a release that is not active: ${binding.pronunciationLabReleaseId}`,
      );
    }
    if (
      release.linguisticReviewEvidenceIds.length === 0 ||
      release.clinicalReviewEvidenceIds.length === 0
    ) {
      throw new Error(`Release ${release.releaseId} lacks required human approval evidence`);
    }
    entries.push(entryFrom({ release, binding }));
  }

  entries.sort((left, right) => left.soundStepsReleaseId.localeCompare(right.soundStepsReleaseId));
  const frozenEntries = Object.freeze(entries);
  const base = {
    schemaVersion: "1.0.0" as const,
    consumer: "soundsteps" as const,
    generatedAt: input.generatedAt,
    releaseLedgerHeadFingerprint:
      input.ledger.length === 0 ? null : input.ledger[input.ledger.length - 1]!.eventFingerprint,
    entries: frozenEntries,
  };
  const manifestFingerprint = fingerprint(manifestPayload(base));

  return Object.freeze({
    ...base,
    manifestFingerprint,
  });
}

function hasBasicManifestShape(value: unknown): value is SoundStepsReleaseManifest {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === "1.0.0" &&
    record.consumer === "soundsteps" &&
    typeof record.generatedAt === "string" &&
    (record.releaseLedgerHeadFingerprint === null ||
      typeof record.releaseLedgerHeadFingerprint === "string") &&
    Array.isArray(record.entries) &&
    typeof record.manifestFingerprint === "string"
  );
}

export function verifySoundStepsReleaseManifest(input: {
  manifest: SoundStepsReleaseManifest;
  ledger?: readonly ReleaseLedgerEvent[];
}): readonly string[] {
  const issues: string[] = [];
  const manifest = input.manifest;

  if (manifest.schemaVersion !== "1.0.0") issues.push("SCHEMA_VERSION_UNSUPPORTED");
  if (manifest.consumer !== "soundsteps") issues.push("CONSUMER_MISMATCH");
  if (!Number.isFinite(Date.parse(manifest.generatedAt))) issues.push("GENERATED_AT_INVALID");
  if (!SHA256.test(manifest.manifestFingerprint)) issues.push("MANIFEST_FINGERPRINT_INVALID");

  const expectedManifestFingerprint = fingerprint(
    manifestPayload({
      schemaVersion: manifest.schemaVersion,
      consumer: manifest.consumer,
      generatedAt: manifest.generatedAt,
      releaseLedgerHeadFingerprint: manifest.releaseLedgerHeadFingerprint,
      entries: manifest.entries,
    }),
  );
  if (manifest.manifestFingerprint !== expectedManifestFingerprint) {
    issues.push("MANIFEST_FINGERPRINT_MISMATCH");
  }

  const ids = new Set<string>();
  const contentKeys = new Set<string>();
  for (const entry of manifest.entries) {
    if (!entry.soundStepsReleaseId.startsWith("runtime-audio-release:")) {
      issues.push(`SOUNDSTEPS_RELEASE_ID_INVALID:${entry.soundStepsReleaseId}`);
    }
    if (!SHA256.test(entry.audioSha256)) {
      issues.push(`AUDIO_SHA256_INVALID:${entry.soundStepsReleaseId}`);
    }
    if (!SHA256.test(entry.pronunciationLabReleaseFingerprint)) {
      issues.push(`LAB_RELEASE_FINGERPRINT_INVALID:${entry.soundStepsReleaseId}`);
    }
    if (!SOURCE_FINGERPRINT.test(entry.sourceFingerprint)) {
      issues.push(`SOURCE_FINGERPRINT_INVALID:${entry.soundStepsReleaseId}`);
    }
    if (
      entry.assetPath !==
      expectedAssetPath({
        locale: entry.locale,
        contentKind: entry.contentKind,
        sourceFingerprint: entry.sourceFingerprint,
      })
    ) {
      issues.push(`ASSET_PATH_MISMATCH:${entry.soundStepsReleaseId}`);
    }
    if (entry.purpose !== "target_reference") {
      issues.push(`PURPOSE_MISMATCH:${entry.soundStepsReleaseId}`);
    }
    if (entry.reviewState !== "clinical_reference_approved") {
      issues.push(`REVIEW_STATE_MISMATCH:${entry.soundStepsReleaseId}`);
    }
    if (ids.has(entry.soundStepsReleaseId)) {
      issues.push(`DUPLICATE_SOUNDSTEPS_RELEASE:${entry.soundStepsReleaseId}`);
    }
    ids.add(entry.soundStepsReleaseId);
    const key = `${entry.locale}:${entry.contentKind}:${entry.contentRef}`;
    if (contentKeys.has(key)) issues.push(`DUPLICATE_CONTENT:${key}`);
    contentKeys.add(key);
  }

  if (input.ledger) {
    const ledgerIssues = verifyReleaseLedger(input.ledger);
    issues.push(...ledgerIssues.map((issue) => `LEDGER_INVALID:${issue}`));

    const expectedHead =
      input.ledger.length === 0
        ? null
        : input.ledger[input.ledger.length - 1]!.eventFingerprint;
    if (manifest.releaseLedgerHeadFingerprint !== expectedHead) {
      issues.push("RELEASE_LEDGER_HEAD_MISMATCH");
    }

    const activeById = new Map(
      activeReleasesFromLedger(input.ledger).map((release) => [release.releaseId, release] as const),
    );
    for (const entry of manifest.entries) {
      const release = activeById.get(entry.pronunciationLabReleaseId);
      if (!release) {
        issues.push(`LAB_RELEASE_NOT_ACTIVE:${entry.pronunciationLabReleaseId}`);
        continue;
      }
      if (release.releaseManifestFingerprint !== entry.pronunciationLabReleaseFingerprint) {
        issues.push(`LAB_RELEASE_FINGERPRINT_MISMATCH:${entry.pronunciationLabReleaseId}`);
      }
      if (release.artifactId !== entry.artifactId) {
        issues.push(`ARTIFACT_ID_MISMATCH:${entry.pronunciationLabReleaseId}`);
      }
      if (release.audioSha256 !== entry.audioSha256) {
        issues.push(`AUDIO_HASH_MISMATCH:${entry.pronunciationLabReleaseId}`);
      }
      if (release.targetId !== entry.targetId) {
        issues.push(`TARGET_ID_MISMATCH:${entry.pronunciationLabReleaseId}`);
      }
      if (release.targetRegistryVersion !== entry.targetRegistryVersion) {
        issues.push(`TARGET_VERSION_MISMATCH:${entry.pronunciationLabReleaseId}`);
      }
      if (
        release.renderingProfileId !== entry.renderingProfileId ||
        release.renderingProfileVersion !== entry.renderingProfileVersion
      ) {
        issues.push(`RENDERING_PROFILE_MISMATCH:${entry.pronunciationLabReleaseId}`);
      }
      if (
        release.rendererIdentity !== entry.rendererIdentity ||
        release.rendererVersion !== entry.rendererVersion
      ) {
        issues.push(`RENDERER_IDENTITY_MISMATCH:${entry.pronunciationLabReleaseId}`);
      }
    }
  }

  return Object.freeze(issues);
}

export function serializeSoundStepsReleaseManifest(
  manifest: SoundStepsReleaseManifest,
): string {
  const issues = verifySoundStepsReleaseManifest({ manifest });
  if (issues.length > 0) {
    throw new Error(`Cannot serialize invalid SoundSteps manifest: ${issues.join(",")}`);
  }
  return `${canonicalJson(manifest)}\n`;
}

export function parseSoundStepsReleaseManifest(serialized: string): SoundStepsReleaseManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Invalid SoundSteps release manifest JSON");
  }
  if (!hasBasicManifestShape(parsed)) {
    throw new Error("Invalid SoundSteps release manifest shape");
  }
  const issues = verifySoundStepsReleaseManifest({ manifest: parsed });
  if (issues.length > 0) {
    throw new Error(`Invalid SoundSteps release manifest: ${issues.join(",")}`);
  }
  return Object.freeze({
    ...parsed,
    entries: Object.freeze(parsed.entries.map((entry) => Object.freeze({ ...entry }))),
  });
}

export function findApprovedSoundStepsArtifact(input: {
  manifest: SoundStepsReleaseManifest;
  locale: SoundStepsAudioLocale;
  contentKind: SoundStepsRuntimeAudioContentKind;
  contentRef: string;
  artifactId: string;
  audioSha256: string;
}): SoundStepsApprovedAudioEntry | undefined {
  if (verifySoundStepsReleaseManifest({ manifest: input.manifest }).length > 0) return undefined;
  return input.manifest.entries.find(
    (entry) =>
      entry.locale === input.locale &&
      entry.contentKind === input.contentKind &&
      entry.contentRef === input.contentRef &&
      entry.artifactId === input.artifactId &&
      entry.audioSha256 === input.audioSha256,
  );
}

export function toSoundStepsRuntimeAudioReleases(
  manifest: SoundStepsReleaseManifest,
): readonly SoundStepsRuntimeAudioRelease[] {
  const issues = verifySoundStepsReleaseManifest({ manifest });
  if (issues.length > 0) {
    throw new Error(`Cannot convert invalid SoundSteps manifest: ${issues.join(",")}`);
  }
  return Object.freeze(
    manifest.entries.map((entry) =>
      Object.freeze({
        releaseId: entry.soundStepsReleaseId,
        locale: entry.locale,
        contentKind: entry.contentKind,
        contentRef: entry.contentRef,
        sourceFingerprint: entry.sourceFingerprint,
        audioSha256: entry.audioSha256,
        assetPath: entry.assetPath,
        purpose: "target_reference" as const,
        reviewState: "clinical_reference_approved" as const,
      }),
    ),
  );
}
