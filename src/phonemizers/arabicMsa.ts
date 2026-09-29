import { fingerprint } from "../core/fingerprint.js";
import type { PhonemizationProposal } from "./model.js";

const ENGINE_ID = "arabic-msa-diacritized-rules";
const ENGINE_VERSION = "1.0.0";
const RULESET_REF = "pronunciation-lab:arabic-msa-diacritized-rules/1.0.0";

const FATHA = "\u064E";
const DAMMA = "\u064F";
const KASRA = "\u0650";
const SHADDA = "\u0651";
const SUKUN = "\u0652";
const FATHATAN = "\u064B";
const DAMMATAN = "\u064C";
const KASRATAN = "\u064D";
const DAGGER_ALIF = "\u0670";
const TATWEEL = "\u0640";

const BASE_CONSONANTS: Readonly<Record<string, string>> = Object.freeze({
  "ء": "ʔ",
  "أ": "ʔ",
  "إ": "ʔ",
  "ؤ": "ʔ",
  "ئ": "ʔ",
  "ب": "b",
  "ت": "t",
  "ث": "θ",
  "ج": "dʒ",
  "ح": "ħ",
  "خ": "x",
  "د": "d",
  "ذ": "ð",
  "ر": "r",
  "ز": "z",
  "س": "s",
  "ش": "ʃ",
  "ص": "sˤ",
  "ض": "dˤ",
  "ط": "tˤ",
  "ظ": "ðˤ",
  "ع": "ʕ",
  "غ": "ɣ",
  "ف": "f",
  "ق": "q",
  "ك": "k",
  "ل": "l",
  "م": "m",
  "ن": "n",
  "ه": "h",
  "و": "w",
  "ي": "j",
});

const SUN_LETTERS = new Set([
  "ت", "ث", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ل", "ن",
]);

const ARABIC_BASES = new Set([
  ...Object.keys(BASE_CONSONANTS),
  "ا", "آ", "ى", "ة", "ٱ",
]);

const DIACRITICS = new Set([
  FATHA,
  DAMMA,
  KASRA,
  SHADDA,
  SUKUN,
  FATHATAN,
  DAMMATAN,
  KASRATAN,
  DAGGER_ALIF,
]);

interface Cluster {
  base: string;
  marks: readonly string[];
  sourceIndex: number;
}

function splitClusters(text: string): readonly Cluster[] {
  const clusters: Cluster[] = [];
  let current: { base: string; marks: string[]; sourceIndex: number } | null = null;
  let index = 0;

  for (const char of text.normalize("NFC")) {
    if (char === TATWEEL) {
      index += 1;
      continue;
    }
    if (DIACRITICS.has(char)) {
      if (!current) throw new Error("Arabic diacritic appears before a base letter");
      current.marks.push(char);
      index += 1;
      continue;
    }
    if (!ARABIC_BASES.has(char)) {
      throw new Error(`Unsupported Arabic character: ${char}`);
    }
    if (current) clusters.push(Object.freeze({
      base: current.base,
      marks: Object.freeze([...current.marks]),
      sourceIndex: current.sourceIndex,
    }));
    current = { base: char, marks: [], sourceIndex: index };
    index += 1;
  }

  if (current) clusters.push(Object.freeze({
    base: current.base,
    marks: Object.freeze([...current.marks]),
    sourceIndex: current.sourceIndex,
  }));

  return Object.freeze(clusters);
}

function hasAny(markSet: readonly string[], ...marks: string[]): boolean {
  return marks.some((mark) => markSet.includes(mark));
}

function vowelForMarks(marks: readonly string[]): {
  short: string;
  tanwin: string;
  hasExplicitVowel: boolean;
  hasSukun: boolean;
} {
  if (marks.includes(FATHATAN)) return { short: "a", tanwin: "n", hasExplicitVowel: true, hasSukun: false };
  if (marks.includes(DAMMATAN)) return { short: "u", tanwin: "n", hasExplicitVowel: true, hasSukun: false };
  if (marks.includes(KASRATAN)) return { short: "i", tanwin: "n", hasExplicitVowel: true, hasSukun: false };
  if (marks.includes(FATHA)) return { short: "a", tanwin: "", hasExplicitVowel: true, hasSukun: false };
  if (marks.includes(DAMMA)) return { short: "u", tanwin: "", hasExplicitVowel: true, hasSukun: false };
  if (marks.includes(KASRA)) return { short: "i", tanwin: "", hasExplicitVowel: true, hasSukun: false };
  if (marks.includes(SUKUN)) return { short: "", tanwin: "", hasExplicitVowel: false, hasSukun: true };
  return { short: "", tanwin: "", hasExplicitVowel: false, hasSukun: false };
}

function proposal(input: {
  locale: string;
  text: string;
  ipa: string | null;
  status: "complete" | "partial" | "abstain";
  flags: readonly string[];
}): PhonemizationProposal {
  const proposalFingerprint = fingerprint({
    engineId: ENGINE_ID,
    engineVersion: ENGINE_VERSION,
    locale: input.locale,
    text: input.text,
    ipa: input.ipa,
    status: input.status,
    flags: input.flags,
  });
  return Object.freeze({
    schemaVersion: "1.0.0",
    proposalId: `phonemization:${proposalFingerprint.slice("sha256:".length)}`,
    locale: input.locale,
    text: input.text,
    ipa: input.ipa,
    status: input.status,
    flags: Object.freeze([...input.flags]),
    sourceRefs: Object.freeze([RULESET_REF]),
    engine: Object.freeze({
      engineId: ENGINE_ID,
      engineVersion: ENGINE_VERSION,
      method: "deterministic_rules" as const,
    }),
    authority: "phonemizer_proposal_only",
  });
}

export function phonemizeArabicMsaWord(input: {
  text: string;
  locale?: string;
}): PhonemizationProposal {
  const text = input.text.trim();
  if (!text) throw new Error("text is required");
  if (/\s/u.test(text)) throw new Error("Arabic MSA adapter currently accepts one orthographic token");
  const locale = input.locale ?? "ar";
  if (!/^ar(?:-|$)/u.test(locale)) throw new Error("Arabic MSA adapter requires an Arabic locale");

  let clusters: readonly Cluster[];
  try {
    clusters = splitClusters(text);
  } catch (error) {
    return proposal({
      locale,
      text,
      ipa: null,
      status: "abstain",
      flags: [error instanceof Error ? error.message : "arabic_parse_error"],
    });
  }
  if (clusters.length === 0) {
    return proposal({ locale, text, ipa: null, status: "abstain", flags: ["empty_after_normalization"] });
  }

  const flags: string[] = [];
  const out: string[] = [];
  const consumed = new Set<number>();
  let definiteArticleSunIndex: number | null = null;

  if (
    clusters.length >= 3 &&
    (clusters[0]!.base === "ا" || clusters[0]!.base === "ٱ") &&
    clusters[1]!.base === "ل"
  ) {
    out.push("ʔa");
    consumed.add(0);
    consumed.add(1);
    flags.push("word_initial_hamzat_al_wasl_assumed");
    const third = clusters[2]!;
    if (SUN_LETTERS.has(third.base)) {
      definiteArticleSunIndex = 2;
      flags.push("definite_article_sun_assimilation_applied");
    } else {
      out.push("l");
      flags.push("definite_article_moon_applied");
    }
  }

  for (let i = 0; i < clusters.length; i += 1) {
    if (consumed.has(i)) continue;
    const cluster = clusters[i]!;
    const next = clusters[i + 1];
    const marks = cluster.marks;

    if (cluster.base === "آ") {
      out.push("ʔaː");
      continue;
    }
    if (cluster.base === "ى") {
      out.push("aː");
      continue;
    }
    if (cluster.base === "ا" || cluster.base === "ٱ") {
      flags.push(`bare_alif_unresolved:${cluster.sourceIndex}`);
      continue;
    }
    if (cluster.base === "ة") {
      const vowel = vowelForMarks(marks);
      if (vowel.hasExplicitVowel) {
        out.push("t");
        out.push(vowel.short);
        if (vowel.tanwin) out.push(vowel.tanwin);
      } else {
        flags.push(`ta_marbuta_context_required:${cluster.sourceIndex}`);
      }
      continue;
    }

    const consonant = BASE_CONSONANTS[cluster.base];
    if (!consonant) {
      flags.push(`unsupported_base:${cluster.base}`);
      continue;
    }

    const geminate =
      marks.includes(SHADDA) ||
      (definiteArticleSunIndex === i && !marks.includes(SHADDA));
    out.push(consonant);
    if (geminate) out.push(consonant);

    const vowel = vowelForMarks(marks);
    if (marks.includes(DAGGER_ALIF)) {
      out.push("aː");
      continue;
    }
    if (vowel.hasSukun) continue;

    if (vowel.hasExplicitVowel) {
      if (vowel.short === "a" && next && (next.base === "ا" || next.base === "ى")) {
        out.push("aː");
        consumed.add(i + 1);
      } else if (vowel.short === "u" && next?.base === "و" && next.marks.length === 0) {
        out.push("uː");
        consumed.add(i + 1);
      } else if (vowel.short === "i" && next?.base === "ي" && next.marks.length === 0) {
        out.push("iː");
        consumed.add(i + 1);
      } else {
        out.push(vowel.short);
      }
      if (vowel.tanwin) {
        if (vowel.short === "a" && next?.base === "ا" && next.marks.length === 0) {
          consumed.add(i + 1);
        }
        out.push(vowel.tanwin);
      }
      continue;
    }

    const isLast = i === clusters.length - 1;
    if (!isLast) {
      flags.push(`missing_vowel_diacritic:${cluster.sourceIndex}`);
    } else {
      flags.push(`word_final_pause_assumed:${cluster.sourceIndex}`);
    }
  }

  const uniqueFlags = Object.freeze([...new Set(flags)]);
  const ipa = out.join("");
  if (!ipa) return proposal({ locale, text, ipa: null, status: "abstain", flags: uniqueFlags });

  const blockingAmbiguity = uniqueFlags.some(
    (flag) =>
      flag.startsWith("bare_alif_unresolved:") ||
      flag.startsWith("ta_marbuta_context_required:") ||
      flag.startsWith("missing_vowel_diacritic:") ||
      flag.startsWith("unsupported_"),
  );

  return proposal({
    locale,
    text,
    ipa,
    status: blockingAmbiguity ? "partial" : "complete",
    flags: uniqueFlags,
  });
}
