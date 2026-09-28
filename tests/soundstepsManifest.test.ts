import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendRelease,
  createSoundStepsReleaseManifest,
  findApprovedSoundStepsArtifact,
  parseSoundStepsReleaseManifest,
  retireRelease,
  serializeSoundStepsReleaseManifest,
  toSoundStepsRuntimeAudioReleases,
  verifySoundStepsReleaseManifest,
  type ReleasedReference,
} from "../src/index.js";

const release: ReleasedReference = Object.freeze({
  schemaVersion: "1.0.0",
  releaseId: "release:approved-sok",
  targetId: "nl-BE:s_initial:sok",
  targetRegistryVersion: "1.0.0",
  artifactId: "artifact:approved-sok",
  audioSha256: `sha256:${"a".repeat(64)}`,
  candidateId: "candidate:approved-sok",
  renderingProfileId: "profile:nl-BE:s-initial:child-reference",
  renderingProfileVersion: "1.0.0",
  rendererIdentity: "azure_speech",
  rendererVersion: "azure:test",
  linguisticReviewEvidenceIds: Object.freeze(["evidence:native"]),
  clinicalReviewEvidenceIds: Object.freeze(["evidence:clinical"]),
  technicalQaId: "technical-qa:sok",
  acousticQaId: "acoustic-qa:sok",
  acousticQaStatus: "target_likely_located",
  releasedAt: "2026-09-28T21:00:00.000Z",
  releaseManifestFingerprint: `sha256:${"b".repeat(64)}`,
  status: "active",
  authority: "human_approved_release",
});

const binding = Object.freeze({
  pronunciationLabReleaseId: release.releaseId,
  soundStepsReleaseId: "runtime-audio-release:nl-BE_sok:4f6ad104",
  locale: "nl-BE" as const,
  contentKind: "canonical_lexeme" as const,
  contentRef: "nl-BE_sok",
  sourceFingerprint: "4f6ad104",
  assetPath: "assets/tts/canonical/nl-BE/canonical_lexeme/4f6ad104.wav",
});

describe("SoundSteps release manifest", () => {
  it("exports active Pronunciation Lab releases into the existing SoundSteps runtime shape", () => {
    const ledger = appendRelease({ ledger: [], release });
    const manifest = createSoundStepsReleaseManifest({
      ledger,
      bindings: [binding],
      generatedAt: "2026-09-28T21:10:00.000Z",
    });

    assert.deepEqual(verifySoundStepsReleaseManifest({ manifest, ledger }), []);
    assert.equal(manifest.entries[0]!.artifactId, release.artifactId);
    assert.deepEqual(toSoundStepsRuntimeAudioReleases(manifest), [
      {
        releaseId: binding.soundStepsReleaseId,
        locale: "nl-BE",
        contentKind: "canonical_lexeme",
        contentRef: "nl-BE_sok",
        sourceFingerprint: "4f6ad104",
        audioSha256: release.audioSha256,
        assetPath: binding.assetPath,
        purpose: "target_reference",
        reviewState: "clinical_reference_approved",
      },
    ]);
  });

  it("serializes deterministically and parses only fingerprint-valid data", () => {
    const ledger = appendRelease({ ledger: [], release });
    const manifest = createSoundStepsReleaseManifest({
      ledger,
      bindings: [binding],
      generatedAt: "2026-09-28T21:10:00.000Z",
    });
    const serialized = serializeSoundStepsReleaseManifest(manifest);
    const parsed = parseSoundStepsReleaseManifest(serialized);

    assert.equal(parsed.manifestFingerprint, manifest.manifestFingerprint);
    assert.equal(serializeSoundStepsReleaseManifest(parsed), serialized);
    assert.throws(() => parseSoundStepsReleaseManifest("{}"), /manifest shape/u);
  });

  it("fails closed when the upstream release was retired after export", () => {
    const first = appendRelease({ ledger: [], release });
    const manifest = createSoundStepsReleaseManifest({
      ledger: first,
      bindings: [binding],
      generatedAt: "2026-09-28T21:10:00.000Z",
    });
    const retired = retireRelease({
      ledger: first,
      releaseId: release.releaseId,
      reason: "superseded",
      occurredAt: "2026-09-28T21:20:00.000Z",
    });

    const issues = verifySoundStepsReleaseManifest({ manifest, ledger: retired });
    assert.ok(issues.includes("RELEASE_LEDGER_HEAD_MISMATCH"));
    assert.ok(issues.includes(`LAB_RELEASE_NOT_ACTIVE:${release.releaseId}`));
  });

  it("requires exact artifact ID and audio SHA-256", () => {
    const ledger = appendRelease({ ledger: [], release });
    const manifest = createSoundStepsReleaseManifest({
      ledger,
      bindings: [binding],
      generatedAt: "2026-09-28T21:10:00.000Z",
    });

    assert.ok(
      findApprovedSoundStepsArtifact({
        manifest,
        locale: "nl-BE",
        contentKind: "canonical_lexeme",
        contentRef: "nl-BE_sok",
        artifactId: release.artifactId,
        audioSha256: release.audioSha256,
      }),
    );
    assert.equal(
      findApprovedSoundStepsArtifact({
        manifest,
        locale: "nl-BE",
        contentKind: "canonical_lexeme",
        contentRef: "nl-BE_sok",
        artifactId: release.artifactId,
        audioSha256: `sha256:${"c".repeat(64)}`,
      }),
      undefined,
    );
  });

  it("detects manifest tampering and malformed SoundSteps asset paths", () => {
    const ledger = appendRelease({ ledger: [], release });
    const manifest = createSoundStepsReleaseManifest({
      ledger,
      bindings: [binding],
      generatedAt: "2026-09-28T21:10:00.000Z",
    });
    const tampered = {
      ...manifest,
      entries: [{ ...manifest.entries[0]!, audioSha256: `sha256:${"c".repeat(64)}` }],
    };
    assert.ok(
      verifySoundStepsReleaseManifest({ manifest: tampered }).includes("MANIFEST_FINGERPRINT_MISMATCH"),
    );

    assert.throws(
      () =>
        createSoundStepsReleaseManifest({
          ledger,
          bindings: [{ ...binding, assetPath: "assets/tts/canonical/nl-BE/canonical_lexeme/wrong.wav" }],
          generatedAt: "2026-09-28T21:10:00.000Z",
        }),
      /asset path mismatch/u,
    );
  });
});
