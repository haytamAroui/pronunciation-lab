import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arpabetPhonesToIpa,
  parseCmuLikeArpabetLexicon,
  phonemizeEnglishWordFromArpabet,
} from "../src/index.js";

describe("English ARPAbet proposal adapter", () => {
  const lexicon = parseCmuLikeArpabetLexicon({
    sourceRef: "lexicon:test",
    content: [
      "HELLO  HH AH0 L OW1",
      "READ  R IY1 D",
      "READ(2)  R EH1 D",
    ].join("\n"),
  });

  it("parses multiple dictionary variants", () => {
    const proposals = phonemizeEnglishWordFromArpabet({ text: "read", lexicon });
    assert.equal(proposals.length, 2);
    assert.ok(proposals.every((proposal) => proposal.authority === "phonemizer_proposal_only"));
  });

  it("converts common ARPAbet phones to IPA while flagging unsyllabified stress", () => {
    const converted = arpabetPhonesToIpa(["HH", "AH0", "L", "OW1"]);
    assert.equal(converted.ipa, "həlˈoʊ");
    assert.ok(converted.flags.includes("stress_marker_unsyllabified"));
  });

  it("abstains on lexicon misses instead of guessing", () => {
    const [proposal] = phonemizeEnglishWordFromArpabet({ text: "unknownword", lexicon });
    assert.equal(proposal!.status, "abstain");
    assert.equal(proposal!.ipa, null);
    assert.deepEqual(proposal!.flags, ["lexicon_miss"]);
  });
});
