import type { PronunciationSpan } from "../core/model.js";

export type PhonemizationStatus = "complete" | "partial" | "abstain";

export interface PhonemizerIdentity {
  engineId: string;
  engineVersion: string;
  method: "lexicon" | "deterministic_rules";
}

export interface PhonemizationProposal {
  schemaVersion: "1.0.0";
  proposalId: string;
  locale: string;
  text: string;
  ipa: string | null;
  spans?: readonly PronunciationSpan[];
  status: PhonemizationStatus;
  flags: readonly string[];
  sourceRefs: readonly string[];
  engine: PhonemizerIdentity;
  authority: "phonemizer_proposal_only";
}
