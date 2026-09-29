import { decodePcmWav, downmixToMono } from "../qa/pcm.js";
import type {
  BoundSpeechPracticePlan,
  ComposedPracticeAudio,
} from "./model.js";

function encodeMonoPcm16Wav(samples: Float32Array, sampleRateHz: number): Uint8Array {
  const dataLength = samples.length * 2;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRateHz, true);
  view.setUint32(28, sampleRateHz * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index] ?? 0));
    const pcm = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
    view.setInt16(44 + index * 2, pcm, true);
  }
  return bytes;
}

export function composeSpeechPracticePcmWav(input: {
  plan: BoundSpeechPracticePlan;
  renderedWavByRequestId: ReadonlyMap<string, Uint8Array>;
}): ComposedPracticeAudio {
  const decoded = new Map<string, Float32Array>();
  let sampleRateHz: number | null = null;

  for (const request of input.plan.requests) {
    const bytes = input.renderedWavByRequestId.get(request.requestId);
    if (!bytes) throw new Error(`Missing rendered WAV for request ${request.requestId}`);
    const audio = decodePcmWav(bytes);
    if (sampleRateHz === null) sampleRateHz = audio.sampleRateHz;
    if (sampleRateHz !== audio.sampleRateHz) {
      throw new Error("Practice composition requires a common sample rate");
    }
    decoded.set(request.requestId, downmixToMono(audio));
  }

  if (sampleRateHz === null) throw new Error("Practice plan contains no render requests");

  let totalFrames = 0;
  const eventLengths: number[] = [];
  for (const event of input.plan.timeline) {
    let length: number;
    if (event.kind === "render") {
      const source = decoded.get(event.requestId);
      if (!source) throw new Error(`Timeline references unknown request ${event.requestId}`);
      length = source.length;
    } else {
      length = Math.round((event.durationMs / 1000) * sampleRateHz);
    }
    eventLengths.push(length);
    totalFrames += length;
  }

  const samples = new Float32Array(totalFrames);
  const boundaries: Array<{
    eventIndex: number;
    kind: "render" | "silence";
    startFrame: number;
    endFrame: number;
    requestId?: string;
  }> = [];
  let cursor = 0;

  input.plan.timeline.forEach((event, eventIndex) => {
    const length = eventLengths[eventIndex]!;
    const startFrame = cursor;
    if (event.kind === "render") {
      const source = decoded.get(event.requestId);
      if (!source) throw new Error(`Timeline references unknown request ${event.requestId}`);
      samples.set(source, cursor);
      cursor += source.length;
      boundaries.push({
        eventIndex,
        kind: "render",
        startFrame,
        endFrame: cursor,
        requestId: event.requestId,
      });
    } else {
      cursor += length;
      boundaries.push({
        eventIndex,
        kind: "silence",
        startFrame,
        endFrame: cursor,
      });
    }
  });

  const bytes = encodeMonoPcm16Wav(samples, sampleRateHz);
  return Object.freeze({
    bytes,
    mediaType: "audio/wav",
    sampleRateHz,
    channels: 1,
    durationMs: (totalFrames / sampleRateHz) * 1000,
    eventBoundaries: Object.freeze(boundaries.map((item) => Object.freeze(item))),
  });
}
