import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parsePronunciationSourceEvidenceTsv,
  serializePronunciationSourceEvidenceTsv,
} from "../src/index.js";

describe("pronunciation source TSV", () => {
  it("round-trips sourced pronunciation evidence without granting canonical authority", () => {
    const input = [
      "locale\ttext\tipa\tsource_type\tsource_ref\tsource_label\tstrength\tobserved_at\tnotes",
      "en-US\tGIF\t/dʒɪf/\tofficial\thttps://example.test\tCreator statement\tdirect\t2026-09-29T12:00:00.000Z\tprimary evidence",
      "",
    ].join("\n");
    const evidence = parsePronunciationSourceEvidenceTsv(input);
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0]!.authority, "source_evidence_only");

    const serialized = serializePronunciationSourceEvidenceTsv(evidence);
    const reparsed = parsePronunciationSourceEvidenceTsv(serialized);
    assert.equal(reparsed[0]!.evidenceId, evidence[0]!.evidenceId);
  });
});
