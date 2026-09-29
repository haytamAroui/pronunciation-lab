import type { PronunciationCandidate } from "../core/model.js";
import {
  createRenderingProfile,
  createTargetRegistryRecord,
} from "../governance/registry.js";
import type {
  RenderingProfile,
  TargetRegistryRecord,
} from "../governance/model.js";
import {
  buildMicrosoftComparisonMatrix,
  type MicrosoftComparisonMatrixOptions,
} from "./comparisonMatrix.js";

export const NL_BE_S_INITIAL_EXPERIMENT_ID = "experiment:nl-BE:s:initial:r1" as const;
export type NlBeSInitialItemSource =
  | "pilot_seed"
  | "external_reference_candidate";

export interface NlBeSInitialExperimentItem {
  itemId: string;
  text: string;
  source: NlBeSInitialItemSource;
  sourceContentId?: string;
  /** Review hint only. Never promoted automatically into canonical authority. */
  referenceIpaCandidate: string;
  referenceSyllableCount: number;
  referenceFollowingPhone: string;
  targetPhoneme: "/s/";
  wordPosition: "initial";
  syllableRole: "onset";
  clusterType: "singleton";
  reviewStatus: "pending_native_review";
  sourceRefs: readonly string[];
  contentNotes: string;
}

function item(input: Omit<NlBeSInitialExperimentItem, "targetPhoneme" | "wordPosition" | "syllableRole" | "clusterType" | "reviewStatus">): NlBeSInitialExperimentItem {
  return Object.freeze({
    ...input,
    targetPhoneme: "/s/",
    wordPosition: "initial",
    syllableRole: "onset",
    clusterType: "singleton",
    reviewStatus: "pending_native_review",
    sourceRefs: Object.freeze([...input.sourceRefs]),
  });
}

/**
 * R1 authoring queue.
 *
 * The first six entries are internal R1 seed words retained only as experiment inputs. The second six are external reference candidates chosen to broaden following-vowel contexts.
 *
 * NONE of these entries is native-approved merely by appearing here.
 */
export const NL_BE_S_INITIAL_DRAFT_ITEMS: readonly NlBeSInitialExperimentItem[] =
  Object.freeze([
    item({
      itemId: "nl-BE:s-initial:sap",
      text: "sap",
      source: "pilot_seed",
      sourceContentId: "nl-BE_sap",
      referenceIpaCandidate: "/sɑp/",
      referenceSyllableCount: 1,
      referenceFollowingPhone: "ɑ",
      sourceRefs: ["pilot-seed:nl-BE_sap"],
      contentNotes: "R1 seed word; native review remains authoritative.",
    }),
    item({
      itemId: "nl-BE:s-initial:sok",
      text: "sok",
      source: "pilot_seed",
      sourceContentId: "nl-BE_sok",
      referenceIpaCandidate: "/sɔk/",
      referenceSyllableCount: 1,
      referenceFollowingPhone: "ɔ",
      sourceRefs: ["pilot-seed:nl-BE_sok"],
      contentNotes: "R1 seed word and governed pilot anchor; native review remains authoritative.",
    }),
    item({
      itemId: "nl-BE:s-initial:soep",
      text: "soep",
      source: "pilot_seed",
      sourceContentId: "nl-BE_soep",
      referenceIpaCandidate: "/sup/",
      referenceSyllableCount: 1,
      referenceFollowingPhone: "u",
      sourceRefs: ["pilot-seed:nl-BE_soep"],
      contentNotes: "R1 seed word; native review remains authoritative.",
    }),
    item({
      itemId: "nl-BE:s-initial:sop",
      text: "sop",
      source: "pilot_seed",
      sourceContentId: "nl-BE_sop",
      referenceIpaCandidate: "/sɔp/",
      referenceSyllableCount: 1,
      referenceFollowingPhone: "ɔ",
      sourceRefs: ["pilot-seed:nl-BE_sop"],
      contentNotes: "R1 seed word; native review remains authoritative.",
    }),
    item({
      itemId: "nl-BE:s-initial:suf",
      text: "suf",
      source: "pilot_seed",
      sourceContentId: "nl-BE_suf",
      referenceIpaCandidate: "/sʏf/",
      referenceSyllableCount: 1,
      referenceFollowingPhone: "ʏ",
      sourceRefs: ["pilot-seed:nl-BE_suf"],
      contentNotes: "R1 seed word; native review remains authoritative.",
    }),
    item({
      itemId: "nl-BE:s-initial:som",
      text: "som",
      source: "pilot_seed",
      sourceContentId: "nl-BE_som",
      referenceIpaCandidate: "/sɔm/",
      referenceSyllableCount: 1,
      referenceFollowingPhone: "ɔ",
      sourceRefs: ["pilot-seed:nl-BE_som"],
      contentNotes: "R1 seed word; native review remains authoritative.",
    }),
    item({
      itemId: "nl-BE:s-initial:saus",
      text: "saus",
      source: "external_reference_candidate",
      referenceIpaCandidate: "/sɑus/",
      referenceSyllableCount: 1,
      referenceFollowingPhone: "ɑ",
      sourceRefs: ["https://nl.wiktionary.org/wiki/saus"],
      contentNotes: "Reference candidate; lexical suitability for children and nl-BE IPA require native review.",
    }),
    item({
      itemId: "nl-BE:s-initial:saai",
      text: "saai",
      source: "external_reference_candidate",
      referenceIpaCandidate: "/saɪ̯/",
      referenceSyllableCount: 1,
      referenceFollowingPhone: "a",
      sourceRefs: ["https://nl.wiktionary.org/wiki/saai"],
      contentNotes: "Reference candidate using the published Vlaanderen/Brabant variant; native review remains authoritative.",
    }),
    item({
      itemId: "nl-BE:s-initial:serie",
      text: "serie",
      source: "external_reference_candidate",
      referenceIpaCandidate: "/ˈseri/",
      referenceSyllableCount: 2,
      referenceFollowingPhone: "e",
      sourceRefs: ["https://nl.wiktionary.org/wiki/serie"],
      contentNotes: "Reference candidate; child familiarity and Belgian realization require native review.",
    }),
    item({
      itemId: "nl-BE:s-initial:serre",
      text: "serre",
      source: "external_reference_candidate",
      referenceIpaCandidate: "/ˈsɛːrə/",
      referenceSyllableCount: 2,
      referenceFollowingPhone: "ɛː",
      sourceRefs: ["https://nl.wiktionary.org/wiki/serre"],
      contentNotes: "Reference candidate with strong Flemish relevance; native review remains required.",
    }),
    item({
      itemId: "nl-BE:s-initial:siroop",
      text: "siroop",
      source: "external_reference_candidate",
      referenceIpaCandidate: "/siˈrop/",
      referenceSyllableCount: 2,
      referenceFollowingPhone: "i",
      sourceRefs: ["https://nl.wiktionary.org/wiki/siroop"],
      contentNotes: "Reference candidate; native review must approve the exact Belgian-Dutch canonical form.",
    }),
    item({
      itemId: "nl-BE:s-initial:safari",
      text: "safari",
      source: "external_reference_candidate",
      referenceIpaCandidate: "/saˈfari/",
      referenceSyllableCount: 3,
      referenceFollowingPhone: "a",
      sourceRefs: ["https://nl.wiktionary.org/wiki/safari"],
      contentNotes: "Reference candidate; included to broaden word shape, pending child-content and native review.",
    }),
  ]);

export const NL_BE_S_INITIAL_REVIEW_CHECKLIST = Object.freeze([
  "Confirm the word is natural and familiar enough for Belgian-Dutch children in the intended age range.",
  "Confirm exact nl-BE canonical IPA; do not promote the reference IPA automatically.",
  "Confirm the target realization is /s/ at word-initial syllable onset.",
  "Confirm the target onset is singleton rather than an /s/+consonant cluster.",
  "Confirm the following phone and intended phonetic-environment label.",
  "Confirm syllable count and lexical stress.",
  "Check for regional/lexical ambiguity that could make the item unsuitable as a stable reference.",
  "Confirm the concept can be represented clearly and without text in child-facing imagery.",
] as const);

export const NL_BE_S_INITIAL_RENDERING_PROFILE: RenderingProfile =
  createRenderingProfile({
    profileId: "profile:nl-BE:s-initial:child-reference",
    version: "1.0.0",
    locale: "nl-BE",
    targetClass: "s_initial_singleton",
    intent: {
      rate: "natural",
      salience: "enhanced_without_exaggeration",
      childImitationModel: true,
      notes:
        "R1 experiment profile. Rendering parameters are candidates only; clinical suitability remains a human decision.",
    },
  });

function draftReason(item: NlBeSInitialExperimentItem): string {
  return item.source === "pilot_seed"
    ? "R1 pilot seed content only; native nl-BE target approval is still required before candidate generation."
    : "External pronunciation reference candidate only; native nl-BE review and child-content review are required before candidate generation.";
}

export function createNlBeSInitialDraftRegistry(): readonly TargetRegistryRecord[] {
  return Object.freeze(
    NL_BE_S_INITIAL_DRAFT_ITEMS.map((entry) =>
      createTargetRegistryRecord({
        target: {
          targetId: entry.itemId,
          locale: "nl-BE",
          text: entry.text,
          canonicalIpa: entry.referenceIpaCandidate,
          role: "pronunciation_reference",
          metadata: Object.freeze({
            experimentId: NL_BE_S_INITIAL_EXPERIMENT_ID,
            targetPhoneme: "/s/",
            wordPosition: "initial",
            syllableRole: "onset",
            clusterType: "singleton",
            itemSource: entry.source,
            referenceFollowingPhone: entry.referenceFollowingPhone,
            referenceSyllableCount: entry.referenceSyllableCount,
            ...(entry.sourceContentId ? { sourceContentId: entry.sourceContentId } : {}),
          }),
        },
        registryVersion: "0.1.0-draft",
        approval: {
          status: "draft",
          reason: draftReason(entry),
        },
      }),
    ),
  );
}

function assertExactReviewedSet(records: readonly TargetRegistryRecord[]): void {
  if (records.length !== NL_BE_S_INITIAL_DRAFT_ITEMS.length) {
    throw new Error(
      `nl-BE /s/ initial experiment requires exactly ${NL_BE_S_INITIAL_DRAFT_ITEMS.length} reviewed targets`,
    );
  }

  const byId = new Map(records.map((record) => [record.target.targetId, record] as const));
  for (const item of NL_BE_S_INITIAL_DRAFT_ITEMS) {
    const record = byId.get(item.itemId);
    if (!record) throw new Error(`Missing reviewed target ${item.itemId}`);
    if (record.approval.status !== "native_reviewed") {
      throw new Error(`Target ${item.itemId} is not native-reviewed`);
    }
    if (
      record.target.locale !== "nl-BE" ||
      record.target.text !== item.text ||
      record.target.metadata.targetPhoneme !== "/s/" ||
      record.target.metadata.wordPosition !== "initial" ||
      record.target.metadata.clusterType !== "singleton"
    ) {
      throw new Error(`Target ${item.itemId} does not match the experiment contract`);
    }
  }
}

export interface NlBeSInitialCandidateMatrix {
  targetRecord: TargetRegistryRecord;
  candidates: readonly PronunciationCandidate[];
}

export function buildNlBeSInitialCandidateMatrices(input: {
  targetRecords: readonly TargetRegistryRecord[];
  comparison: MicrosoftComparisonMatrixOptions;
}): readonly NlBeSInitialCandidateMatrix[] {
  assertExactReviewedSet(input.targetRecords);

  const byId = new Map(
    input.targetRecords.map((record) => [record.target.targetId, record] as const),
  );

  return Object.freeze(
    NL_BE_S_INITIAL_DRAFT_ITEMS.map((item) => {
      const targetRecord = byId.get(item.itemId)!;
      return Object.freeze({
        targetRecord,
        candidates: buildMicrosoftComparisonMatrix(targetRecord.target, input.comparison),
      });
    }),
  );
}
