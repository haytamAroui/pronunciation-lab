#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const OUT = "experiments/multilingual-s-initial-r1/audio";
const SPEED = "130";
const PITCH = "50";
const AMPLITUDE = "100";

const packs = [
  { locale: "nl-BE", voice: "nl", items: [
    ["sap", "sap"], ["sok", "sok"], ["soep", "soep"],
    ["sop", "sop"], ["suf", "suf"], ["som", "som"],
  ]},
  { locale: "fr-BE", voice: "fr-be", items: [
    ["sac", "sac"], ["soupe", "soupe"], ["savon", "savon"],
    ["soleil", "soleil"], ["souris", "souris"], ["salade", "salade"],
  ]},
  { locale: "en-US", voice: "en-us", items: [
    ["sock", "sock"], ["soup", "soup"], ["sun", "sun"],
    ["soap", "soap"], ["seal", "seal"], ["seven", "seven"],
  ]},
  {
    locale: "ar",
    voice: "fa",
    note: "Cross-locale experimental fallback: explicit target-directed eSpeak phonemes rendered by the available Persian voice.",
    items: [
      ["samak", "سَمَك", "[[samak]]", "/samak/"],
      ["sariir", "سَرير", "[[sa'Ri:R]]", "/saˈriːr/"],
      ["safiina", "سَفينة", "[[sa'fi:na]]", "/saˈfiːna/"],
      ["sukkar", "سُكَّر", "[['suk:aR]]", "/ˈsukːar/"],
      ["sayyaara", "سَيّارة", "[[saj'ja:Ra]]", "/sajˈjaːra/"],
      ["samaa", "سَماء", "[[sa'ma:?]]", "/saˈmaːʔ/"],
    ],
  },
];

function command(args, options = {}) {
  return execFileSync("espeak", args, { encoding: "utf8", ...options });
}

function parsePcm16MonoWav(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Expected RIFF/WAVE");
  }
  let offset = 12;
  let format = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      data = buffer.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  if (!format || !data) throw new Error("Missing WAV fmt/data chunks");
  if (format.audioFormat !== 1 || format.channels !== 1 || format.bitsPerSample !== 16) {
    throw new Error("Pilot expects mono PCM16 WAV");
  }
  return { ...format, data };
}

function technicalQa(buffer) {
  const wav = parsePcm16MonoWav(buffer);
  const samples = [];
  for (let i = 0; i + 1 < wav.data.length; i += 2) {
    samples.push(wav.data.readInt16LE(i) / 32768);
  }
  const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
  const dcOffset = samples.reduce((sum, x) => sum + x, 0) / samples.length;
  const clippedRatio = samples.filter((x) => Math.abs(x) >= 0.999).length / samples.length;
  const edgeCount = Math.min(220, samples.length);
  const boundary = [...samples.slice(0, edgeCount), ...samples.slice(-edgeCount)];
  const boundaryPeak = Math.max(0, ...boundary.map(Math.abs));
  const durationMs = Math.round((samples.length / wav.sampleRate) * 1000);
  const pass =
    wav.sampleRate >= 16000 &&
    wav.sampleRate <= 96000 &&
    durationMs >= 100 &&
    durationMs <= 15000 &&
    rms >= 0.002 &&
    Math.abs(dcOffset) <= 0.1 &&
    clippedRatio <= 0.001 &&
    boundaryPeak <= 0.98;
  return {
    durationMs,
    sampleRate: wav.sampleRate,
    channels: wav.channels,
    sampleWidthBytes: 2,
    status: pass ? "pass" : "fail",
    rms: Number(rms.toFixed(6)),
    dcOffset: Number(dcOffset.toFixed(6)),
    clippedRatio: Number(clippedRatio.toFixed(8)),
    boundaryPeak: Number(boundaryPeak.toFixed(6)),
  };
}

const items = [];
for (const pack of packs) {
  for (const tuple of pack.items) {
    const [slug, text, rendererInput, targetIpaCandidate] = tuple;
    const input = rendererInput ?? text;
    const path = join(OUT, pack.locale, `${slug}.wav`);
    mkdirSync(dirname(path), { recursive: true });
    command(["-v", pack.voice, "-s", SPEED, "-p", PITCH, "-a", AMPLITUDE, "-z", "-w", path, input]);
    const preview = command(["-q", "-v", pack.voice, "--ipa", input]).trim();
    const bytes = readFileSync(path);
    const qa = technicalQa(bytes);
    items.push({
      locale: pack.locale,
      slug,
      text,
      voice: pack.voice,
      ...(rendererInput ? { rendererInput } : {}),
      ...(targetIpaCandidate ? { targetIpaCandidate } : {}),
      espeakIpaPreview: preview,
      assetPath: path,
      audioSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      byteLength: bytes.length,
      sampleRate: qa.sampleRate,
      channels: qa.channels,
      sampleWidthBytes: qa.sampleWidthBytes,
      durationMs: qa.durationMs,
      authority: "experiment_only",
      reviewState: "unreviewed_synthetic_candidate",
      technicalQaPreview: {
        status: qa.status,
        rms: qa.rms,
        dcOffset: qa.dcOffset,
        clippedRatio: qa.clippedRatio,
        boundaryPeak: qa.boundaryPeak,
      },
    });
  }
}

const manifest = {
  schemaVersion: "1.0.0",
  experimentId: "multilingual-s-initial-r1",
  generator: {
    engine: "espeak",
    version: command(["--version"]).split("\n")[0],
    speedWpm: Number(SPEED),
    pitch: Number(PITCH),
    amplitude: Number(AMPLITUDE),
  },
  notes: [
    "nl-BE uses eSpeak nl, not a Belgian-Dutch-specific voice.",
    "fr-BE uses eSpeak fr-be.",
    "en-US uses eSpeak en-us.",
    "Arabic uses explicit target-directed eSpeak phoneme sequences rendered with the installed fa voice because this environment has no Arabic voice.",
    "Every artifact is experiment_only and unreviewed.",
  ],
  items,
};

mkdirSync("experiments/multilingual-s-initial-r1", { recursive: true });
writeFileSync(
  "experiments/multilingual-s-initial-r1/run-manifest.local.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(`Generated ${items.length} WAV files; technical QA pass = ${items.filter((x) => x.technicalQaPreview.status === "pass").length}`);
