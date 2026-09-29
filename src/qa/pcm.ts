export interface DecodedPcmAudio {
  sampleRateHz: number;
  channels: number;
  samples: Float32Array;
  frames: number;
  durationMs: number;
  source: Readonly<{
    container: "wav" | "decoded_pcm";
    sampleFormat: string;
  }>;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function i24(view: DataView, offset: number): number {
  const value =
    view.getUint8(offset) |
    (view.getUint8(offset + 1) << 8) |
    (view.getUint8(offset + 2) << 16);
  return value & 0x800000 ? value | 0xff000000 : value;
}

export function createDecodedPcmAudio(input: {
  sampleRateHz: number;
  channels: number;
  samples: Float32Array;
  source?: Readonly<{ container: "wav" | "decoded_pcm"; sampleFormat: string }>;
}): DecodedPcmAudio {
  if (!Number.isInteger(input.sampleRateHz) || input.sampleRateHz <= 0) {
    throw new Error("sampleRateHz must be a positive integer");
  }
  if (!Number.isInteger(input.channels) || input.channels <= 0) {
    throw new Error("channels must be a positive integer");
  }
  if (input.samples.length % input.channels !== 0) {
    throw new Error("Interleaved PCM sample count must be divisible by channels");
  }
  const frames = input.samples.length / input.channels;
  return Object.freeze({
    sampleRateHz: input.sampleRateHz,
    channels: input.channels,
    samples: new Float32Array(input.samples),
    frames,
    durationMs: frames === 0 ? 0 : (frames / input.sampleRateHz) * 1000,
    source: Object.freeze(
      input.source ?? { container: "decoded_pcm" as const, sampleFormat: "float32_normalized" },
    ),
  });
}

export function decodePcmWav(bytes: Uint8Array): DecodedPcmAudio {
  if (bytes.byteLength < 44) throw new Error("WAV_TOO_SHORT");
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") {
    throw new Error("WAV_INVALID_RIFF_HEADER");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let audioFormat: number | null = null;
  let channels: number | null = null;
  let sampleRateHz: number | null = null;
  let bitsPerSample: number | null = null;
  let blockAlign: number | null = null;
  let dataOffset: number | null = null;
  let dataLength: number | null = null;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = ascii(bytes, offset, 4);
    const chunkSize = u32(view, offset + 4);
    const chunkDataOffset = offset + 8;
    if (chunkDataOffset + chunkSize > bytes.byteLength) {
      throw new Error("WAV_TRUNCATED_CHUNK");
    }

    if (chunkId === "fmt ") {
      if (chunkSize < 16) throw new Error("WAV_INVALID_FMT_CHUNK");
      audioFormat = u16(view, chunkDataOffset);
      channels = u16(view, chunkDataOffset + 2);
      sampleRateHz = u32(view, chunkDataOffset + 4);
      blockAlign = u16(view, chunkDataOffset + 12);
      bitsPerSample = u16(view, chunkDataOffset + 14);
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataLength = chunkSize;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (
    audioFormat === null ||
    channels === null ||
    sampleRateHz === null ||
    bitsPerSample === null ||
    blockAlign === null
  ) {
    throw new Error("WAV_FMT_CHUNK_MISSING");
  }
  if (dataOffset === null || dataLength === null) throw new Error("WAV_DATA_CHUNK_MISSING");
  if (channels <= 0 || sampleRateHz <= 0 || blockAlign <= 0) throw new Error("WAV_INVALID_FORMAT_VALUES");
  if (dataLength % blockAlign !== 0) throw new Error("WAV_DATA_NOT_FRAME_ALIGNED");

  const bytesPerSample = bitsPerSample / 8;
  if (!Number.isInteger(bytesPerSample)) throw new Error("WAV_UNSUPPORTED_BITS_PER_SAMPLE");
  if (blockAlign !== channels * bytesPerSample) throw new Error("WAV_BLOCK_ALIGN_MISMATCH");

  const frames = dataLength / blockAlign;
  const samples = new Float32Array(frames * channels);
  let cursor = dataOffset;

  for (let i = 0; i < samples.length; i += 1) {
    let sample: number;
    if (audioFormat === 1 && bitsPerSample === 16) {
      sample = view.getInt16(cursor, true) / 32768;
    } else if (audioFormat === 1 && bitsPerSample === 24) {
      sample = i24(view, cursor) / 8388608;
    } else if (audioFormat === 1 && bitsPerSample === 32) {
      sample = view.getInt32(cursor, true) / 2147483648;
    } else if (audioFormat === 3 && bitsPerSample === 32) {
      sample = view.getFloat32(cursor, true);
    } else {
      throw new Error(`WAV_UNSUPPORTED_FORMAT:${audioFormat}:${bitsPerSample}`);
    }
    samples[i] = sample;
    cursor += bytesPerSample;
  }

  return createDecodedPcmAudio({
    sampleRateHz,
    channels,
    samples,
    source: {
      container: "wav",
      sampleFormat:
        audioFormat === 3 ? `ieee_float_${bitsPerSample}` : `pcm_signed_${bitsPerSample}`,
    },
  });
}

export function downmixToMono(audio: DecodedPcmAudio): Float32Array {
  if (audio.channels === 1) return new Float32Array(audio.samples);
  const mono = new Float32Array(audio.frames);
  for (let frame = 0; frame < audio.frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < audio.channels; channel += 1) {
      sum += audio.samples[frame * audio.channels + channel] ?? 0;
    }
    mono[frame] = sum / audio.channels;
  }
  return mono;
}
