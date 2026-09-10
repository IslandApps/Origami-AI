/**
 * Shared WebCodecs H.264 encoding helpers used by both BrowserVideoRenderer and
 * ShortsVideoRenderer. Callers keep their own feature detection (their support
 * checks are intentionally different) and their own abort semantics — the abort
 * check is injected so each renderer keeps throwing its own error type.
 */

export function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }

  return merged;
}

/**
 * Pick the first supported H.264 encoder config, preferring hardware acceleration.
 * `bitrate` is caller-computed because the two renderers use different tiering.
 */
export async function getSupportedVideoEncoderConfig(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): Promise<VideoEncoderConfig> {
  // Pick the H.264 level from the frame size. The level is the last byte of the
  // codec string (hex). Level 3.1 (0x1F) maxes out at 1280x720; 1080p needs at
  // least level 4.0 (0x28). Using a level that's too low makes isConfigSupported
  // reject the config, which previously forced 1080p off WebCodecs entirely and
  // onto the much slower single-threaded ffmpeg.wasm fallback.
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const levelHex =
    macroblocks > 8192 ? '33' :   // level 5.1 (4K and above headroom)
    macroblocks > 3600 ? '28' :   // level 4.0 (covers 1080p@30)
    '1F';                          // level 3.1 (720p and below)

  const baselineCodec = `avc1.42E0${levelHex}`; // Baseline profile
  const mainCodec = `avc1.4D40${levelHex}`;     // Main profile

  const base = {
    width,
    height,
    bitrate,
    framerate: fps,
    avc: { format: 'annexb' as const },
    bitrateMode: 'variable' as const,
    latencyMode: 'quality' as const,
    alpha: 'discard' as const
  };

  // Try hardware first (fastest), then no-preference, then software as a last
  // resort. Within each tier prefer Main profile, falling back to Baseline.
  const candidates: VideoEncoderConfig[] = [
    { ...base, codec: mainCodec, hardwareAcceleration: 'prefer-hardware' },
    { ...base, codec: baselineCodec, hardwareAcceleration: 'prefer-hardware' },
    { ...base, codec: mainCodec, hardwareAcceleration: 'no-preference' },
    { ...base, codec: baselineCodec, hardwareAcceleration: 'no-preference' },
    { ...base, codec: mainCodec, hardwareAcceleration: 'prefer-software' },
    { ...base, codec: baselineCodec, hardwareAcceleration: 'prefer-software' }
  ];

  for (const candidate of candidates) {
    const support = await VideoEncoder.isConfigSupported(candidate);
    if (support.supported && support.config) {
      return support.config;
    }
  }

  throw new Error('No supported H.264 WebCodecs configuration was found');
}

/** Backpressure: wait until the encoder's queue drains below `maxQueueSize`. */
export async function waitForEncoderQueueBelow(
  encoder: VideoEncoder,
  maxQueueSize: number,
  signal: AbortSignal | undefined,
  ensureNotAborted: (signal?: AbortSignal) => void,
): Promise<void> {
  while (encoder.encodeQueueSize > maxQueueSize) {
    ensureNotAborted(signal);
    await new Promise<void>((resolve) => {
      const onDequeue = () => {
        encoder.removeEventListener('dequeue', onDequeue);
        resolve();
      };

      encoder.addEventListener('dequeue', onDequeue, { once: true });

      window.setTimeout(() => {
        encoder.removeEventListener('dequeue', onDequeue);
        resolve();
      }, 16);
    });
  }
}
