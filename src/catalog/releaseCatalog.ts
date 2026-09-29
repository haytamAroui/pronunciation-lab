import { canonicalJson, fingerprint } from "../core/fingerprint.js";
import type { TargetRegistryRecord } from "../governance/model.js";
import {
  activeReleasesFromLedger,
  verifyReleaseLedger,
  type ReleaseLedgerEvent,
} from "../governance/ledger.js";

export interface ReleasedPronunciationCatalogEntry {
  schemaVersion: "1.0.0";
  targetId: string;
  targetRegistryVersion: string;
  locale: string;
  text: string;
  canonicalIpa: string | null;
  readingSetId?: string;
  readingSetFingerprint?: string;
  releaseId: string;
  releaseManifestFingerprint: string;
  artifactId: string;
  audioSha256: string;
  rendererIdentity: string;
  rendererVersion: string;
  linguisticReviewEvidenceIds: readonly string[];
  clinicalReviewEvidenceIds: readonly string[];
  releasedAt: string;
  authority: "governed_release_catalog_entry";
}

export interface ReleasedPronunciationCatalog {
  schemaVersion: "1.0.0";
  generatedAt: string;
  releaseLedgerHeadFingerprint: string | null;
  entries: readonly ReleasedPronunciationCatalogEntry[];
  catalogFingerprint: string;
  authority: "governed_release_catalog";
}

function targetKey(targetId: string, registryVersion: string): string {
  return `${targetId}\u001f${registryVersion}`;
}

function catalogPayload(input: Omit<ReleasedPronunciationCatalog, "catalogFingerprint" | "authority">): unknown {
  return {
    schemaVersion: input.schemaVersion,
    generatedAt: input.generatedAt,
    releaseLedgerHeadFingerprint: input.releaseLedgerHeadFingerprint,
    entries: input.entries,
  };
}

export function createReleasedPronunciationCatalog(input: {
  generatedAt: string;
  releaseLedger: readonly ReleaseLedgerEvent[];
  targetRecords: readonly TargetRegistryRecord[];
}): ReleasedPronunciationCatalog {
  if (!Number.isFinite(Date.parse(input.generatedAt))) {
    throw new Error("generatedAt must be an ISO timestamp");
  }
  const ledgerIssues = verifyReleaseLedger(input.releaseLedger);
  if (ledgerIssues.length > 0) throw new Error(`Invalid release ledger: ${ledgerIssues.join(",")}`);

  const targetByKey = new Map<string, TargetRegistryRecord>();
  for (const record of input.targetRecords) {
    const key = targetKey(record.target.targetId, record.registryVersion);
    if (targetByKey.has(key)) throw new Error(`Duplicate target registry record ${key}`);
    targetByKey.set(key, record);
  }

  const entries = activeReleasesFromLedger(input.releaseLedger).map((release) => {
    const record = targetByKey.get(targetKey(release.targetId, release.targetRegistryVersion));
    if (!record) {
      throw new Error(
        `Active release ${release.releaseId} has no matching target registry record`,
      );
    }
    if (record.approval.status !== "native_reviewed") {
      throw new Error(`Active release ${release.releaseId} target is not native-reviewed`);
    }

    const readingSetId =
      typeof record.target.metadata.readingSetId === "string"
        ? record.target.metadata.readingSetId
        : undefined;
    const readingSetFingerprint =
      typeof record.target.metadata.readingSetFingerprint === "string"
        ? record.target.metadata.readingSetFingerprint
        : undefined;

    return Object.freeze({
      schemaVersion: "1.0.0" as const,
      targetId: record.target.targetId,
      targetRegistryVersion: record.registryVersion,
      locale: record.target.locale,
      text: record.target.text,
      canonicalIpa: record.target.canonicalIpa,
      ...(readingSetId !== undefined ? { readingSetId } : {}),
      ...(readingSetFingerprint !== undefined ? { readingSetFingerprint } : {}),
      releaseId: release.releaseId,
      releaseManifestFingerprint: release.releaseManifestFingerprint,
      artifactId: release.artifactId,
      audioSha256: release.audioSha256,
      rendererIdentity: release.rendererIdentity,
      rendererVersion: release.rendererVersion,
      linguisticReviewEvidenceIds: Object.freeze([...release.linguisticReviewEvidenceIds]),
      clinicalReviewEvidenceIds: Object.freeze([...release.clinicalReviewEvidenceIds]),
      releasedAt: release.releasedAt,
      authority: "governed_release_catalog_entry" as const,
    });
  });

  const sortedEntries = Object.freeze(
    [...entries].sort((a, b) =>
      [a.locale, a.text, a.targetId, a.releaseId].join("\u001f").localeCompare(
        [b.locale, b.text, b.targetId, b.releaseId].join("\u001f"),
      ),
    ),
  );
  const releaseLedgerHeadFingerprint =
    input.releaseLedger.length === 0
      ? null
      : input.releaseLedger[input.releaseLedger.length - 1]!.eventFingerprint;

  const base = {
    schemaVersion: "1.0.0" as const,
    generatedAt: input.generatedAt,
    releaseLedgerHeadFingerprint,
    entries: sortedEntries,
  };
  const catalogFingerprint = fingerprint(catalogPayload(base));

  return Object.freeze({
    ...base,
    catalogFingerprint,
    authority: "governed_release_catalog",
  });
}

export function verifyReleasedPronunciationCatalog(
  catalog: ReleasedPronunciationCatalog,
): readonly string[] {
  const issues: string[] = [];
  if (catalog.schemaVersion !== "1.0.0") issues.push("SCHEMA_VERSION_UNSUPPORTED");
  if (!Number.isFinite(Date.parse(catalog.generatedAt))) issues.push("GENERATED_AT_INVALID");
  const expected = fingerprint(
    catalogPayload({
      schemaVersion: catalog.schemaVersion,
      generatedAt: catalog.generatedAt,
      releaseLedgerHeadFingerprint: catalog.releaseLedgerHeadFingerprint,
      entries: catalog.entries,
    }),
  );
  if (catalog.catalogFingerprint !== expected) issues.push("CATALOG_FINGERPRINT_MISMATCH");

  const releaseIds = new Set<string>();
  for (const entry of catalog.entries) {
    if (releaseIds.has(entry.releaseId)) issues.push(`DUPLICATE_RELEASE_ID:${entry.releaseId}`);
    releaseIds.add(entry.releaseId);
  }
  return Object.freeze(issues);
}

export function serializeReleasedPronunciationCatalog(
  catalog: ReleasedPronunciationCatalog,
): string {
  const issues = verifyReleasedPronunciationCatalog(catalog);
  if (issues.length > 0) throw new Error(`Cannot serialize invalid catalog: ${issues.join(",")}`);
  return `${canonicalJson(catalog)}\n`;
}

export function searchReleasedPronunciationCatalog(input: {
  catalog: ReleasedPronunciationCatalog;
  query?: string;
  locale?: string;
  targetId?: string;
}): readonly ReleasedPronunciationCatalogEntry[] {
  const issues = verifyReleasedPronunciationCatalog(input.catalog);
  if (issues.length > 0) throw new Error(`Invalid catalog: ${issues.join(",")}`);

  const query = input.query?.trim().toLocaleLowerCase();
  return Object.freeze(
    input.catalog.entries.filter((entry) => {
      if (input.locale !== undefined && entry.locale !== input.locale) return false;
      if (input.targetId !== undefined && entry.targetId !== input.targetId) return false;
      if (
        query !== undefined &&
        query.length > 0 &&
        !entry.text.toLocaleLowerCase().includes(query) &&
        !(entry.canonicalIpa ?? "").toLocaleLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    }),
  );
}
