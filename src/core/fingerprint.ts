import { createHash } from "node:crypto";

/**
 * Compatibility identifier for the canonicalization algorithm used by every
 * existing fingerprint and hash-chained ledger event.
 *
 * IMPORTANT: v1 sorts object keys with String.localeCompare(). Do not change
 * this implementation in place. A future deterministic comparator requires a
 * versioned migration because changing canonical JSON changes every derived
 * fingerprint, candidate ID, evidence ID, release ID, and ledger hash.
 */
export const FINGERPRINT_CANONICALIZATION_VERSION = "v1-localeCompare" as const;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function fingerprint(value: unknown): string {
  return sha256(canonicalJson(value));
}
