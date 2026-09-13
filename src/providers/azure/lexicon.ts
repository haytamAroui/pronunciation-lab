export interface AzureLexeme {
  grapheme: string;
  phoneme?: string;
  alias?: string;
}

export interface AzureLexiconPublisher {
  put(input: { id: string; plsXml: string }): Promise<string>;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function validateAzureLexiconRef(value: string): readonly string[] {
  const issues: string[] = [];
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return Object.freeze(["AZURE_LEXICON_REF_INVALID_URL"]);
  }

  if (url.protocol !== "https:") issues.push("AZURE_LEXICON_REF_REQUIRES_HTTPS");
  if (url.username || url.password) issues.push("AZURE_LEXICON_REF_EMBEDDED_CREDENTIALS_FORBIDDEN");
  if (!/\.(?:xml|pls)$/iu.test(url.pathname)) issues.push("AZURE_LEXICON_REF_REQUIRES_XML_OR_PLS");
  return Object.freeze(issues);
}

export function buildAzurePlsLexicon(input: {
  locale: string;
  lexemes: readonly AzureLexeme[];
}): string {
  if (!input.locale.trim()) throw new Error("AZURE_PLS_LOCALE_MISSING");
  if (input.lexemes.length === 0) throw new Error("AZURE_PLS_LEXEMES_EMPTY");

  const entries = input.lexemes.map((lexeme) => {
    if (!lexeme.grapheme.normalize("NFC").trim()) throw new Error("AZURE_PLS_GRAPHEME_MISSING");
    const hasPhoneme = Boolean(lexeme.phoneme?.trim());
    const hasAlias = Boolean(lexeme.alias?.normalize("NFC").trim());
    if (hasPhoneme === hasAlias) {
      throw new Error("AZURE_PLS_LEXEME_REQUIRES_EXACTLY_ONE_PRONUNCIATION");
    }
    const pronunciation = hasPhoneme
      ? `<phoneme>${escapeXml(lexeme.phoneme!.trim())}</phoneme>`
      : `<alias>${escapeXml(lexeme.alias!.normalize("NFC").trim())}</alias>`;
    return `<lexeme><grapheme>${escapeXml(lexeme.grapheme.normalize("NFC"))}</grapheme>${pronunciation}</lexeme>`;
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<lexicon version="1.0" xmlns="http://www.w3.org/2005/01/pronunciation-lexicon" alphabet="ipa" xml:lang="${escapeXml(input.locale.trim())}">`,
    ...entries,
    `</lexicon>`,
  ].join("\n");
}
