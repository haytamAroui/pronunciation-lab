#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONFIG_PATH = "experiments/edge-neural-audition-r1/config.json";
const OUTPUT_DIR = "experiments/edge-neural-audition-r1/audio";
const MANIFEST_PATH = "experiments/edge-neural-audition-r1/run-manifest.json";

function run(executable, args, options = {}) {
  return execFileSync(executable, args, {
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
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
    throw new Error("Expected mono PCM16 WAV");
  }
  return { ...format, data };
}

function technicalQa(buffer) {
  const wav = parsePcm16MonoWav(buffer);
  const sampleCount = Math.floor(wav.data.length / 2);
  let sumSq = 0;
  let sum = 0;
  let clipped = 0;
  const samples = new Float64Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const x = wav.data.readInt16LE(i * 2) / 32768;
    samples[i] = x;
    sumSq += x * x;
    sum += x;
    if (Math.abs(x) >= 0.999) clipped += 1;
  }
  const rms = Math.sqrt(sumSq / sampleCount);
  const dcOffset = sum / sampleCount;
  const clippedRatio = clipped / sampleCount;
  const edgeCount = Math.min(Math.round(wav.sampleRate * 0.01), sampleCount);
  let boundaryPeak = 0;
  for (let i = 0; i < edgeCount; i += 1) {
    boundaryPeak = Math.max(boundaryPeak, Math.abs(samples[i] ?? 0));
    boundaryPeak = Math.max(boundaryPeak, Math.abs(samples[sampleCount - 1 - i] ?? 0));
  }
  const durationMs = Math.round((sampleCount / wav.sampleRate) * 1000);
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
    status: pass ? "pass" : "fail",
    durationMs,
    sampleRate: wav.sampleRate,
    channels: wav.channels,
    bitsPerSample: wav.bitsPerSample,
    rms: Number(rms.toFixed(6)),
    dcOffset: Number(dcOffset.toFixed(6)),
    clippedRatio: Number(clippedRatio.toFixed(8)),
    boundaryPeak: Number(boundaryPeak.toFixed(6)),
  };
}

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const voicesOutput = run("edge-tts", ["--list-voices"]);
for (const pack of config.packs) {
  if (!voicesOutput.includes(pack.voice)) {
    throw new Error(`Required Edge voice is unavailable: ${pack.voice}`);
  }
}

rmSync(OUTPUT_DIR, { recursive: true, force: true });
const results = [];

for (const pack of config.packs) {
  for (const item of pack.items) {
    const dir = join(OUTPUT_DIR, pack.locale);
    mkdirSync(dir, { recursive: true });
    const mp3Path = join(dir, `${item.slug}.edge.mp3`);
    const wavPath = join(dir, `${item.slug}.wav`);

    run("edge-tts", [
      "--voice", pack.voice,
      "--text", item.text,
      `--rate=${config.rate}`,
      `--pitch=${config.pitch}`,
      `--volume=${config.volume}`,
      "--write-media", mp3Path,
    ]);

    run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", mp3Path,
      "-ac", "1",
      "-ar", String(config.outputSampleRate),
      "-c:a", "pcm_s16le",
      wavPath,
    ]);

    const mp3 = readFileSync(mp3Path);
    const wav = readFileSync(wavPath);
    const qa = technicalQa(wav);

    results.push({
      locale: pack.locale,
      voice: pack.voice,
      slug: item.slug,
      text: item.text,
      rate: config.rate,
      pitch: config.pitch,
      volume: config.volume,
      sourceMp3Path: mp3Path,
      wavPath,
      sourceMp3Sha256: sha256(mp3),
      wavSha256: sha256(wav),
      byteLength: wav.length,
      technicalQa: qa,
      authority: "experiment_only",
      reviewState: "unreviewed_voice_audition",
    });
  }
}

const edgeVersion = run("edge-tts", ["--version"]).trim();
const manifest = {
  schemaVersion: "1.0.0",
  experimentId: config.experimentId,
  generatedAt: new Date().toISOString(),
  generator: {
    engine: "edge-tts",
    version: edgeVersion,
    rate: config.rate,
    pitch: config.pitch,
    volume: config.volume,
  },
  voicePolicy: {
    "nl-BE": "nl-BE-DenaNeural",
    "fr-BE": "fr-BE-CharlineNeural",
    "en-US": "en-US-AnaNeural",
    "ar-SA": "ar-SA-ZariyahNeural"
  },
  authority: "experiment_only",
  reviewState: "unreviewed_voice_audition",
  summary: {
    files: results.length,
    technicalQaPass: results.filter((x) => x.technicalQa.status === "pass").length,
    technicalQaFail: results.filter((x) => x.technicalQa.status === "fail").length,
  },
  items: results,
};

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest.summary));
