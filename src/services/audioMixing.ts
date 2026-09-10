/**
 * Shared audio decoding / WAV-encoding helpers used by both BrowserVideoRenderer
 * and ShortsVideoRenderer. The per-renderer audio mixdown scheduling stays in the
 * renderers; only the truly duplicated primitives live here.
 */

/** Encode a mixed AudioBuffer as a 16-bit PCM stereo WAV (downmixed to ≤2 channels). */
export function audioBufferToWav(buffer: AudioBuffer): Uint8Array {
  const numberOfChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = numberOfChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const clampSample = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

  const channels = Array.from({ length: numberOfChannels }, (_, index) => buffer.getChannelData(index));
  let offset = 44;
  for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex++) {
    for (let channelIndex = 0; channelIndex < numberOfChannels; channelIndex++) {
      const sample = clampSample(channels[channelIndex][sampleIndex] || 0, -1, 1);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Uint8Array(wavBuffer);
}

/** Decode an audio source (URL or blob) with a cache keyed by URL / blob identity. */
export async function decodeAudioBuffer(
  source: string | Blob,
  context: OfflineAudioContext,
  cache: Map<string, AudioBuffer>
): Promise<AudioBuffer> {
  const cacheKey = typeof source === 'string' ? source : `blob:${source.size}:${source.type}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const arrayBuffer = typeof source === 'string'
    ? await fetch(source).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load audio asset: ${response.status} ${response.statusText}`);
        }
        return response.arrayBuffer();
      })
    : await source.arrayBuffer();

  const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
  cache.set(cacheKey, decoded);
  return decoded;
}

/** Decode an audio source (URL or blob) without caching. */
export async function decodeAudio(context: BaseAudioContext, source: Blob | string): Promise<AudioBuffer> {
  const arrayBuffer = source instanceof Blob
    ? await source.arrayBuffer()
    : await (await fetch(source)).arrayBuffer();
  return context.decodeAudioData(arrayBuffer.slice(0));
}
