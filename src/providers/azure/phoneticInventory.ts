import type { PhoneticAlphabet } from "../../core/model.js";

export interface PhoneticInventory {
  provider: "azure_speech";
  locale: string;
  alphabet: PhoneticAlphabet;
  phones: readonly string[];
  suprasegmentals: readonly string[];
  version: string;
  sourceRef: string;
}

export interface PhoneticValidationResult {
  valid: boolean;
  issues: readonly string[];
  inventoryRef?: string;
}

const SOURCE_REF =
  "https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-ssml-phonetic-sets";
const INVENTORY_VERSION = "microsoft-learn:2026-09-13";
const IPA_SUPRASEGMENTALS = Object.freeze(["ˈ", "ˌ", ".", "ː", "‿"]);

const DUTCH_IPA_PHONES = Object.freeze([
  "ɑ͡u",
  "ɛ͡i",
  "œ͡y",
  "aː",
  "ɛː",
  "eː",
  "øː",
  "ɔː",
  "oː",
  "ɑ̃",
  "ɛ̃",
  "ɔ̃",
  "ɑ",
  "ɛ",
  "ɪ",
  "i",
  "ɔ",
  "u",
  "ʏ",
  "ə",
  "œ",
  "y",
  "b",
  "d",
  "f",
  "χ",
  "ʔ",
  "ɦ",
  "g",
  "j",
  "k",
  "l",
  "m",
  "n",
  "ŋ",
  "p",
  "ʀ",
  "s",
  "ʃ",
  "t",
  "w",
  "v",
  "ʋ",
  "z",
  "ʒ",
]);

const FRENCH_IPA_PHONES = Object.freeze([
  "n‿",
  "t‿",
  "z‿",
  "ɑ̃",
  "ɛ̃",
  "ɔ̃",
  "œ̃",
  "a",
  "ɑ",
  "ə",
  "ɛ",
  "ø",
  "e",
  "i",
  "œ",
  "ɔ",
  "o",
  "u",
  "y",
  "b",
  "d",
  "f",
  "g",
  "ɲ",
  "ɥ",
  "k",
  "l",
  "m",
  "n",
  "ŋ",
  "p",
  "ʁ",
  "s",
  "ʃ",
  "t",
  "v",
  "w",
  "j",
  "z",
]);

const FRENCH_SAPI_PHONES = Object.freeze([
  "ae",
  "af",
  "an",
  "ax",
  "eh",
  "eu",
  "ey",
  "in",
  "iy",
  "oe",
  "oh",
  "on",
  "ow",
  "un",
  "uw",
  "uy",
  "b",
  "d",
  "f",
  "g",
  "gn",
  "hw",
  "k",
  "l",
  "m",
  "n",
  "ng",
  "p",
  "r",
  "s",
  "sh",
  "t",
  "v",
  "w",
  "y",
  "z",
]);

function inventory(locale: string, alphabet: PhoneticAlphabet, phones: readonly string[]): PhoneticInventory {
  return Object.freeze({
    provider: "azure_speech" as const,
    locale,
    alphabet,
    phones,
    suprasegmentals: alphabet === "ipa" ? IPA_SUPRASEGMENTALS : Object.freeze([]),
    version: INVENTORY_VERSION,
    sourceRef: SOURCE_REF,
  });
}

const INVENTORIES = Object.freeze([
  inventory("nl-BE", "ipa", DUTCH_IPA_PHONES),
  inventory("nl-NL", "ipa", DUTCH_IPA_PHONES),
  inventory("fr-BE", "ipa", FRENCH_IPA_PHONES),
  inventory("fr-FR", "ipa", FRENCH_IPA_PHONES),
  inventory("fr-CA", "ipa", FRENCH_IPA_PHONES),
  inventory("fr-CH", "ipa", FRENCH_IPA_PHONES),
  inventory("fr-BE", "sapi", FRENCH_SAPI_PHONES),
  inventory("fr-FR", "sapi", FRENCH_SAPI_PHONES),
]);

const KNOWN_LOCALES = new Set(INVENTORIES.map((entry) => entry.locale.toLowerCase()));

function inventoryRef(entry: PhoneticInventory): string {
  return `azure:${entry.locale}:${entry.alphabet}:${entry.version}`;
}

export function getAzurePhoneticInventory(
  locale: string,
  alphabet: PhoneticAlphabet,
): PhoneticInventory | null {
  const normalizedLocale = locale.trim().toLowerCase();
  return (
    INVENTORIES.find(
      (entry) => entry.locale.toLowerCase() === normalizedLocale && entry.alphabet === alphabet,
    ) ?? null
  );
}

function validateIpa(phoneString: string, entry: PhoneticInventory): string[] {
  const issues: string[] = [];
  const raw = phoneString.trim().replace(/^\//u, "").replace(/\/$/u, "").normalize("NFC");
  if (!raw) return ["AZURE_PHONE_STRING_EMPTY"];

  const tokens = [...entry.phones, ...entry.suprasegmentals].sort((a, b) => b.length - a.length);
  let index = 0;
  while (index < raw.length) {
    if (/\s/u.test(raw[index] ?? "")) {
      index += 1;
      continue;
    }
    const match = tokens.find((token) => raw.startsWith(token, index));
    if (!match) {
      const context = Array.from(raw.slice(index)).slice(0, 4).join("");
      issues.push(`AZURE_PHONE_UNSUPPORTED_FOR_LOCALE:${context}`);
      break;
    }
    index += match.length;
  }
  return issues;
}

function validateSapi(phoneString: string, entry: PhoneticInventory): string[] {
  const raw = phoneString.trim();
  if (!raw) return ["AZURE_PHONE_STRING_EMPTY"];
  const allowed = new Set(entry.phones);
  const issues: string[] = [];
  for (const token of raw.split(/\s+/u)) {
    if (!allowed.has(token)) issues.push(`AZURE_PHONE_UNSUPPORTED_FOR_LOCALE:${token}`);
  }
  return issues;
}

export function validateAzurePhoneString(input: {
  locale: string;
  alphabet: PhoneticAlphabet;
  phoneString: string;
}): PhoneticValidationResult {
  const entry = getAzurePhoneticInventory(input.locale, input.alphabet);
  if (!entry) {
    if (KNOWN_LOCALES.has(input.locale.trim().toLowerCase())) {
      return Object.freeze({
        valid: false,
        issues: Object.freeze(["AZURE_ALPHABET_UNSUPPORTED_FOR_LOCALE"]),
      });
    }
    // Unknown locales retain provider-level validation until a versioned inventory is registered.
    return Object.freeze({ valid: true, issues: Object.freeze([]) });
  }

  const issues = input.alphabet === "ipa" ? validateIpa(input.phoneString, entry) : validateSapi(input.phoneString, entry);
  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
    inventoryRef: inventoryRef(entry),
  });
}

export function assertAzurePhoneStringSupported(input: {
  locale: string;
  alphabet: PhoneticAlphabet;
  phoneString: string;
}): string | null {
  const result = validateAzurePhoneString(input);
  if (!result.valid) throw new Error(result.issues.join(","));
  return result.inventoryRef ?? null;
}
