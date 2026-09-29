import { fingerprint } from "../core/fingerprint.js";
import type { PhonemizationProposal } from "./model.js";

export interface ArpabetLexiconEntry {
  word: string;
  variant: number;
  phones: readonly string[];
  sourceRef: string;
}

export interface ArpabetLexicon {
  schemaVersion: "1.0.0";
  entries: readonly ArpabetLexiconEntry[];
  sourceRef: string;
}

const VOWELS: Readonly<Record<string, string>> = Object.freeze({
  AA: "ɑ",
  AE: "æ",
  AH: "ʌ",
  AO: "ɔ",
  AW: "aʊ",
  AY: "aɪ",
  EH: "ɛ",
  ER: "ɝ",
  EY: "eɪ",
  IH: "ɪ",
  IY: "i",
  OW: "oʊ",
  OY: "ɔɪ",
  UH: "ʊ",
  UW: "u",
});

const CONSONANTS: Readonly<Record<string, string>> = Object.freeze({
  B: "b",
  CH: "tʃ",
  D: "d",
  DH: "ð",
  F: "f",
  G: "ɡ",
  HH: "h",
  JH: "dʒ",
  K: "k",
  L: "l",
  M: "m",
  N: "n",
  NG: "ŋ",
  P: "p",
  R: "ɹ",
  S: "s",
  SH: "ʃ",
  T: "t",
  TH: "θ",
  V: "v",
  W: "w",
  Y: "j",
  Z: "z",
  ZH: "ʒ",
});

function parsePhone(phone: string): { ipa: string; stress: string | null; flag?: string } {
  const match = /^([A-Z]+)([012])?$/u.exec(phone);
  if (!match) return { ipa: "", stress: null, flag: `unsupported_arpabet:${phone}` };
  const base = match[1]!;
  const stress = match[2] ?? null;

  if (base in VOWELS) {
    let ipa = VOWELS[base]!;
    if (base === "AH" && stress === "0") ipa = "ə";
    if (base === "ER" && stress === "0") ipa = "ɚ";
    return { ipa, stress };
  }
  if (base in CONSONANTS) return { ipa: CONSONANTS[base]!, stress: null };
  return { ipa: "", stress: null, flag: `unsupported_arpabet:${phone}` };
}

export function parseCmuLikeArpabetLexicon(input: {
  content: string;
  sourceRef: string;
}): ArpabetLexicon {
  if (!input.sourceRef.trim()) throw new Error("sourceRef is required");
  const entries: ArpabetLexiconEntry[] = [];

  for (const rawLine of input.content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";;;") || line.startsWith("#")) continue;
    const parts = line.split(/\s+/u);
    if (parts.length < 2) continue;
    const rawWord = parts[0]!;
    const match = /^(.+?)(?:\((\d+)\))?$/u.exec(rawWord);
    if (!match) continue;
    const word = match[1]!.toUpperCase();
    const variant = match[2] ? Number(match[2]) : 1;
    const phones = Object.freeze(parts.slice(1));
    entries.push(Object.freeze({ word, variant, phones, sourceRef: input.sourceRef }));
  }

  return Object.freeze({
    schemaVersion: "1.0.0",
    entries: Object.freeze(entries),
    sourceRef: input.sourceRef,
  });
}

export function arpabetPhonesToIpa(
  phones: readonly string[],
): Readonly<{ ipa: string | null; flags: readonly string[] }> {
  const flags: string[] = [];
  const segments: string[] = [];

  for (const phone of phones) {
    const parsed = parsePhone(phone);
    if (parsed.flag) {
      flags.push(parsed.flag);
      continue;
    }
    if (parsed.stress === "1") {
      segments.push("ˈ");
      flags.push("stress_marker_unsyllabified");
    } else if (parsed.stress === "2") {
      segments.push("ˌ");
      flags.push("stress_marker_unsyllabified");
    }
    segments.push(parsed.ipa);
  }

  if (segments.length === 0 || flags.some((flag) => flag.startsWith("unsupported_arpabet:"))) {
    return Object.freeze({ ipa: null, flags: Object.freeze([...new Set(flags)]) });
  }
  return Object.freeze({ ipa: segments.join(""), flags: Object.freeze([...new Set(flags)]) });
}

export function phonemizeEnglishWordFromArpabet(input: {
  text: string;
  locale?: string;
  lexicon: ArpabetLexicon;
}): readonly PhonemizationProposal[] {
  const text = input.text.trim();
  if (!text) throw new Error("text is required");
  if (/\s/u.test(text)) throw new Error("English ARPAbet adapter currently accepts one orthographic token");
  const locale = input.locale ?? "en-US";
  if (!/^en(?:-|$)/u.test(locale)) throw new Error("English ARPAbet adapter requires an English locale");

  const key = text.toUpperCase();
  const matches = input.lexicon.entries
    .filter((entry) => entry.word === key)
    .sort((a, b) => a.variant - b.variant);

  if (matches.length === 0) {
    const proposalId = fingerprint({
      engineId: "english-arpabet-lexicon",
      engineVersion: "1.0.0",
      locale,
      text,
      status: "abstain",
      sourceRef: input.lexicon.sourceRef,
    });
    return Object.freeze([
      Object.freeze({
        schemaVersion: "1.0.0",
        proposalId: `phonemization:${proposalId.slice("sha256:".length)}`,
        locale,
        text,
        ipa: null,
        status: "abstain",
        flags: Object.freeze(["lexicon_miss"]),
        sourceRefs: Object.freeze([input.lexicon.sourceRef]),
        engine: Object.freeze({
          engineId: "english-arpabet-lexicon",
          engineVersion: "1.0.0",
          method: "lexicon" as const,
        }),
        authority: "phonemizer_proposal_only",
      }),
    ]);
  }

  return Object.freeze(
    matches.map((entry) => {
      const converted = arpabetPhonesToIpa(entry.phones);
      const status = converted.ipa === null ? "abstain" : "complete";
      const proposalFingerprint = fingerprint({
        engineId: "english-arpabet-lexicon",
        engineVersion: "1.0.0",
        locale,
        text,
        variant: entry.variant,
        phones: entry.phones,
        ipa: converted.ipa,
        flags: converted.flags,
        sourceRef: entry.sourceRef,
      });
      return Object.freeze({
        schemaVersion: "1.0.0",
        proposalId: `phonemization:${proposalFingerprint.slice("sha256:".length)}`,
        locale,
        text,
        ipa: converted.ipa,
        status,
        flags: converted.flags,
        sourceRefs: Object.freeze([entry.sourceRef]),
        engine: Object.freeze({
          engineId: "english-arpabet-lexicon",
          engineVersion: "1.0.0",
          method: "lexicon" as const,
        }),
        authority: "phonemizer_proposal_only",
      });
    }),
  );
}
