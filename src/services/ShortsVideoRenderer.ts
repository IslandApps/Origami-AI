import { getFFmpeg, resetFFmpeg, terminateFFmpeg } from './ffmpegLoader';
import type { CaptionChunk } from './shortsCaptions';
import { getSupportedVideoEncoderConfig, waitForEncoderQueueBelow, concatUint8Arrays } from './webCodecsEncoding';
import { audioBufferToWav, decodeAudio } from './audioMixing';
import { drawScrim, drawCaptions, drawTitleCard } from './shortsCaptionRenderer';

/**
 * Renderer for AI-generated short-form video.
 *
 * Pipeline: still images are animated on a 2D canvas (Ken Burns + crossfade +
 * burned-in captions), encoded to an H.264 elementary stream with WebCodecs, and
 * muxed against an OfflineAudioContext mix of the Kokoro voiceover and optional
 * background music by FFmpeg.wasm.
 *
 * WebCodecs is faster than realtime and frame-exact. Where VideoEncoder is
 * unavailable (currently Firefox and older Safari) it falls back to
 * MediaRecorder, which is realtime-bound but still produces a valid MP4 after
 * an FFmpeg transcode.
 *
 * This is deliberately separate from BrowserVideoRenderer: that renderer's
 * WebCodecs path hardcodes landscape 720p/1080p and ignores aspectRatio, and
 * retrofitting portrait output into 2000 lines of slide-specific timeline code
 * would risk the existing slide export.
 */

export type ShortsAspect = '9:16' | '16:9' | '1:1';
export type ShortsCaptionStyle =
  | 'bold-pop'
  | 'clean-lower'
  | 'karaoke'
  | 'highlighter'
  | 'neon-glow'
  | 'classic-cinema';
export type ShortsCaptionSize = 'small' | 'medium' | 'large';
export type ShortsCaptionPosition = 'top' | 'middle' | 'bottom';

export interface ShortsRenderScene {
  /** Generated still. When absent a styled gradient placeholder is drawn. */
  imageBlob?: Blob | null;
  /** Generated AI video clip. Takes priority over imageBlob when present. */
  videoBlob?: Blob | null;
  /** Object URL of the Kokoro WAV for this scene. */
  audioUrl?: string | null;
  /** Measured audio duration in seconds. */
  audioDuration: number;
  narration: string;
  captions: CaptionChunk[];
  /** Scene 00 — a normal scene whose caption pass is replaced by the project title overlay. */
  isTitleCard?: boolean;
}

export interface ShortsRenderOptions {
  scenes: ShortsRenderScene[];
  aspect: ShortsAspect;
  /** Text overlaid on the scene flagged isTitleCard, if any. */
  title?: string;
  captionsEnabled?: boolean;
  captionStyle?: ShortsCaptionStyle;
  captionSize?: ShortsCaptionSize;
  captionPosition?: ShortsCaptionPosition;
  accentColor?: string;
  music?: { blob: Blob; volume: number } | null;
  voiceVolume?: number;
  onProgress?: (progress: number, status: string) => void;
  signal?: AbortSignal;
}

export const shortsEvents = new EventTarget();

export interface ShortsProgressEventDetail {
  progress: number;
  status: string;
}

export const SHORTS_DIMENSIONS: Record<ShortsAspect, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
};

const FPS = 30;
const AUDIO_SAMPLE_RATE = 48_000;
/** Silence appended after each scene's narration so lines do not collide. */
const SCENE_TAIL_SEC = 0.28;
const MIN_SCENE_SEC = 1.2;
const CROSSFADE_SEC = 0.4;
const DEFAULT_ACCENT = '#22d3ee';
/** How long the branded end card holds after the last scene. */
const END_SPLASH_SEC = 5;
const END_SPLASH_URL = '/endsplash.jpg';

interface PreparedScene {
  bitmap: ImageBitmap | null;
  /** Pre-sampled, output-cropped frames for a video-clip scene. Takes priority over `bitmap` when set. */
  videoFrames: ImageBitmap[] | null;
  videoFrameIntervalSec: number;
  videoClipDuration: number;
  start: number;
  duration: number;
  captions: CaptionChunk[];
  /** Ken Burns endpoints, alternating per scene so motion does not feel looped. Unused for video-clip scenes. */
  zoomFrom: number;
  zoomTo: number;
  panFromX: number;
  panToX: number;
  panFromY: number;
  panToY: number;
  /** The branded end card appended after the last narrated scene. */
  isEndSplash?: boolean;
  /** Scene 00 — drawn like any other scene, but with the project title overlaid instead of captions. */
  isTitleCard?: boolean;
}

/** Video clips are pre-sampled at a low, fixed rate rather than seeked live per output
 * frame — an HTMLVideoElement seek costs tens of ms, which is far too slow to pay once
 * per encoded frame. Sampling once during preparation keeps the hot encode loop a plain
 * bitmap blit, identical in cost to the existing still-image path. */
const VIDEO_SAMPLE_FPS = 8;
const MAX_VIDEO_SAMPLE_FRAMES = 24;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

export class ShortsRenderAbortedError extends Error {
  constructor() {
    super('Render aborted');
    this.name = 'ShortsRenderAbortedError';
  }
}

export class ShortsVideoRenderer {
  private aborted = false;

  // --- progress ---------------------------------------------------------------

  private emit(progress: number, status: string, onProgress?: ShortsRenderOptions['onProgress']) {
    const safe = clamp(progress, 0, 100);
    onProgress?.(safe, status);
    shortsEvents.dispatchEvent(
      new CustomEvent<ShortsProgressEventDetail>('shorts-progress', {
        detail: { progress: safe, status },
      }),
    );
  }

  private ensureNotAborted(signal?: AbortSignal) {
    if (this.aborted || signal?.aborted) throw new ShortsRenderAbortedError();
  }

  // --- preparation ------------------------------------------------------------

  /** Seek an offscreen video element to `time` and wait for the frame to be ready. */
  private seekVideoTo(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
      };
      const onSeeked = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error('Video seek failed.')); };
      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });
      video.currentTime = time;
    });
  }

  /**
   * Decode a generated video clip into a short sequence of output-cropped bitmaps.
   * The cover-fit crop is done once here (at sample time) rather than per output
   * frame, so the draw loop's video path is a plain blit like the image path.
   */
  private async sampleVideoFrames(
    blob: Blob,
    width: number,
    height: number,
    signal?: AbortSignal,
  ): Promise<{ frames: ImageBitmap[]; frameIntervalSec: number; clipDuration: number }> {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          video.removeEventListener('loadedmetadata', onLoaded);
          video.removeEventListener('error', onError);
        };
        const onLoaded = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('Could not load the generated video clip.')); };
        video.addEventListener('loadedmetadata', onLoaded, { once: true });
        video.addEventListener('error', onError, { once: true });
      });

      const clipDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      if (!(clipDuration > 0) || !video.videoWidth || !video.videoHeight) {
        throw new Error('Generated video clip has no readable frames.');
      }

      const frameCount = Math.max(1, Math.min(MAX_VIDEO_SAMPLE_FRAMES, Math.ceil(clipDuration * VIDEO_SAMPLE_FPS)));
      const frameIntervalSec = clipDuration / frameCount;

      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = width;
      sampleCanvas.height = height;
      const sampleCtx = sampleCanvas.getContext('2d', { alpha: false });
      if (!sampleCtx) throw new Error('Could not create a 2D context to sample video frames.');

      // Cover-fit, matching the still-image draw path.
      const bw = video.videoWidth;
      const bh = video.videoHeight;
      const scale = Math.max(width / bw, height / bh);
      const dw = bw * scale;
      const dh = bh * scale;
      const dx = (width - dw) / 2;
      const dy = (height - dh) / 2;

      const frames: ImageBitmap[] = [];
      for (let i = 0; i < frameCount; i += 1) {
        if (signal?.aborted) throw new ShortsRenderAbortedError();
        const t = Math.min(clipDuration - 0.001, i * frameIntervalSec);
        await this.seekVideoTo(video, t);
        sampleCtx.drawImage(video, dx, dy, dw, dh);
        frames.push(await createImageBitmap(sampleCanvas));
      }

      return { frames, frameIntervalSec, clipDuration };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Fetch the static end-splash asset. Missing/unreadable is non-fatal — the card is just skipped. */
  private async loadEndSplashBitmap(): Promise<ImageBitmap | null> {
    try {
      const response = await fetch(END_SPLASH_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await createImageBitmap(await response.blob());
    } catch (e) {
      console.warn('[Shorts] End splash image could not be loaded; skipping the end card.', e);
      return null;
    }
  }

  private async prepareScenes(
    options: ShortsRenderOptions,
    width: number,
    height: number,
  ): Promise<{ scenes: PreparedScene[]; totalDuration: number }> {
    const prepared: PreparedScene[] = [];
    let cursor = 0;

    for (let i = 0; i < options.scenes.length; i += 1) {
      this.ensureNotAborted(options.signal);
      const scene = options.scenes[i];

      let bitmap: ImageBitmap | null = null;
      let videoFrames: ImageBitmap[] | null = null;
      let videoFrameIntervalSec = 0;
      let videoClipDuration = 0;

      if (scene.videoBlob) {
        try {
          const sampled = await this.sampleVideoFrames(scene.videoBlob, width, height, options.signal);
          videoFrames = sampled.frames;
          videoFrameIntervalSec = sampled.frameIntervalSec;
          videoClipDuration = sampled.clipDuration;
        } catch (e) {
          if (e instanceof ShortsRenderAbortedError) throw e;
          // A single unreadable clip must not sink the whole render — the frame
          // loop falls back to a gradient card for this scene.
          console.warn(`[Shorts] Scene ${i + 1}: video clip could not be decoded, using a placeholder.`, e);
        }
      } else if (scene.imageBlob) {
        try {
          bitmap = await createImageBitmap(scene.imageBlob);
        } catch (e) {
          console.warn(`[Shorts] Scene ${i + 1}: image could not be decoded, using a placeholder.`, e);
        }
      }

      const duration = Math.max(MIN_SCENE_SEC, (scene.audioDuration || 0) + SCENE_TAIL_SEC);

      // Alternate zoom direction and pan axis so consecutive scenes read as
      // distinct shots rather than the same move repeated. Unused for video scenes.
      const zoomIn = i % 2 === 0;
      const horizontal = i % 4 < 2;
      const drift = 0.28;

      prepared.push({
        bitmap,
        videoFrames,
        videoFrameIntervalSec,
        videoClipDuration,
        start: cursor,
        duration,
        captions: scene.captions ?? [],
        zoomFrom: zoomIn ? 1.0 : 1.12,
        zoomTo: zoomIn ? 1.12 : 1.0,
        panFromX: horizontal ? -drift : 0,
        panToX: horizontal ? drift : 0,
        panFromY: horizontal ? 0 : -drift,
        panToY: horizontal ? 0 : drift,
        isTitleCard: scene.isTitleCard,
      });

      cursor += duration;
    }

    this.ensureNotAborted(options.signal);
    const splashBitmap = await this.loadEndSplashBitmap();
    if (splashBitmap) {
      prepared.push({
        bitmap: splashBitmap,
        videoFrames: null,
        videoFrameIntervalSec: 0,
        videoClipDuration: 0,
        start: cursor,
        duration: END_SPLASH_SEC,
        captions: [],
        // Held static — this is a branded end card, not a Ken Burns shot.
        zoomFrom: 1,
        zoomTo: 1,
        panFromX: 0,
        panToX: 0,
        panFromY: 0,
        panToY: 0,
        isEndSplash: true,
      });
      cursor += END_SPLASH_SEC;
    }

    return { scenes: prepared, totalDuration: cursor };
  }

  // --- drawing ----------------------------------------------------------------

  /** Draw one scene's background at local time `t` seconds, at the given alpha. */
  private drawSceneImage(
    ctx: CanvasRenderingContext2D,
    scene: PreparedScene,
    t: number,
    width: number,
    height: number,
    alpha: number,
    sceneIndex: number,
  ) {
    ctx.save();
    ctx.globalAlpha = alpha;

    if (scene.videoFrames && scene.videoFrames.length) {
      // Already output-cropped at sample time — no Ken Burns needed, the clip
      // supplies its own motion. Loop if the scene needs more time than the
      // clip provides; hold the last frame if the clip runs longer than needed.
      const localT = scene.videoClipDuration > 0 ? t % scene.videoClipDuration : 0;
      const index = clamp(
        Math.floor(localT / (scene.videoFrameIntervalSec || 1)),
        0,
        scene.videoFrames.length - 1,
      );
      ctx.drawImage(scene.videoFrames[index], 0, 0, width, height);
      ctx.restore();
      return;
    }

    if (!scene.bitmap) {
      // Placeholder: a deterministic dark gradient keyed to the scene index, so a
      // failed image still looks intentional rather than broken.
      const hue = (sceneIndex * 47) % 360;
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, `hsl(${hue}, 45%, 14%)`);
      gradient.addColorStop(1, `hsl(${(hue + 40) % 360}, 55%, 6%)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      return;
    }

    const progress = easeInOutSine(clamp(scene.duration > 0 ? t / scene.duration : 0, 0, 1));
    const zoom = scene.zoomFrom + (scene.zoomTo - scene.zoomFrom) * progress;
    const panX = scene.panFromX + (scene.panToX - scene.panFromX) * progress;
    const panY = scene.panFromY + (scene.panToY - scene.panFromY) * progress;

    const bw = scene.bitmap.width;
    const bh = scene.bitmap.height;

    // Cover-fit, then apply the Ken Burns zoom on top.
    const scale = Math.max(width / bw, height / bh) * zoom;
    const dw = bw * scale;
    const dh = bh * scale;

    // Pan only within the overflow so we never expose an empty edge.
    const overflowX = Math.max(0, (dw - width) / 2);
    const overflowY = Math.max(0, (dh - height) / 2);
    const dx = (width - dw) / 2 + panX * overflowX;
    const dy = (height - dh) / 2 + panY * overflowY;

    ctx.drawImage(scene.bitmap, dx, dy, dw, dh);
    ctx.restore();
  }

  /** Bottom scrim so captions stay legible over bright imagery. */
  /** Composite a single output frame at absolute time `time` (seconds). */
  private drawFrame(
    ctx: CanvasRenderingContext2D,
    scenes: PreparedScene[],
    time: number,
    width: number,
    height: number,
    options: ShortsRenderOptions,
  ) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    let index = scenes.findIndex((s) => time >= s.start && time < s.start + s.duration);
    if (index === -1) index = time < 0 ? 0 : scenes.length - 1;

    const scene = scenes[index];
    const localTime = clamp(time - scene.start, 0, scene.duration);

    const fadeSpan = Math.min(CROSSFADE_SEC, scene.duration / 2);
    if (index > 0 && localTime < fadeSpan) {
      const previous = scenes[index - 1];
      this.drawSceneImage(ctx, previous, previous.duration, width, height, 1, index - 1);
      this.drawSceneImage(ctx, scene, localTime, width, height, localTime / fadeSpan, index);
    } else {
      this.drawSceneImage(ctx, scene, localTime, width, height, 1, index);
    }

    if (scene.isTitleCard) {
      drawTitleCard(ctx, options.title ?? '', localTime, scene.duration, width, height, options.accentColor ?? DEFAULT_ACCENT);
      return;
    }

    if (options.captionsEnabled !== false && !scene.isEndSplash) {
      drawScrim(ctx, width, height);

      const chunk = scene.captions.find((c) => localTime >= c.start && localTime < c.end);
      if (chunk) {
        drawCaptions(
          ctx,
          chunk,
          localTime,
          width,
          height,
          options.captionStyle ?? 'bold-pop',
          options.accentColor ?? DEFAULT_ACCENT,
          options.captionSize ?? 'medium',
          options.captionPosition ?? 'bottom',
        );
      }
    }
  }

  // --- audio ------------------------------------------------------------------

  private async renderAudioMix(
    options: ShortsRenderOptions,
    prepared: PreparedScene[],
    totalDuration: number,
  ): Promise<Uint8Array> {
    const frameCount = Math.max(1, Math.ceil(totalDuration * AUDIO_SAMPLE_RATE));
    const context = new OfflineAudioContext(2, frameCount, AUDIO_SAMPLE_RATE);

    const voiceGain = context.createGain();
    voiceGain.gain.value = options.voiceVolume ?? 1;
    voiceGain.connect(context.destination);

    for (let i = 0; i < options.scenes.length; i += 1) {
      this.ensureNotAborted(options.signal);
      const url = options.scenes[i].audioUrl;
      if (!url) continue;

      try {
        const buffer = await decodeAudio(context, url);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(voiceGain);
        source.start(prepared[i].start);
      } catch (e) {
        console.warn(`[Shorts] Scene ${i + 1}: narration audio could not be decoded; rendering it silent.`, e);
      }
    }

    if (options.music?.blob) {
      try {
        const musicBuffer = await decodeAudio(context, options.music.blob);
        const musicGain = context.createGain();
        musicGain.gain.value = options.music.volume;
        musicGain.connect(context.destination);

        // OfflineAudioContext has no live looping, so schedule repeats manually.
        let offset = 0;
        while (offset < totalDuration && musicBuffer.duration > 0.05) {
          const source = context.createBufferSource();
          source.buffer = musicBuffer;
          source.connect(musicGain);
          source.start(offset);
          offset += musicBuffer.duration;
        }

        // Fade the music out over the last 1.2s so the short does not cut dead.
        const fadeStart = Math.max(0, totalDuration - 1.2);
        musicGain.gain.setValueAtTime(options.music.volume, fadeStart);
        musicGain.gain.linearRampToValueAtTime(0.0001, totalDuration);
      } catch (e) {
        console.warn('[Shorts] Background music could not be decoded; rendering without it.', e);
      }
    }

    const rendered = await context.startRendering();
    return audioBufferToWav(rendered);
  }

  // --- video encode -----------------------------------------------------------

  private isWebCodecsSupported(): boolean {
    return typeof window !== 'undefined'
      && typeof (window as { VideoEncoder?: unknown }).VideoEncoder !== 'undefined'
      && typeof (window as { VideoFrame?: unknown }).VideoFrame !== 'undefined';
  }

  private async encodeWithWebCodecs(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    scenes: PreparedScene[],
    totalDuration: number,
    options: ShortsRenderOptions,
  ): Promise<Uint8Array> {
    const { width, height } = canvas;
    const config = await getSupportedVideoEncoderConfig(
      width,
      height,
      FPS,
      Math.max(width, height) >= 1920 ? 12_000_000 : 8_000_000
    );

    const chunks: Uint8Array[] = [];
    let encoderError: Error | null = null;

    const encoder = new VideoEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        chunks.push(data);
      },
      error: (e) => {
        encoderError = e instanceof Error ? e : new Error(String(e));
        console.error('[Shorts] VideoEncoder error:', e);
      },
    });

    encoder.configure(config);

    const totalFrames = Math.max(1, Math.ceil(totalDuration * FPS));
    const frameDurationUs = Math.round(1_000_000 / FPS);

    try {
      for (let frame = 0; frame < totalFrames; frame += 1) {
        this.ensureNotAborted(options.signal);
        if (encoderError) throw encoderError;

        this.drawFrame(ctx, scenes, frame / FPS, width, height, options);

        await waitForEncoderQueueBelow(encoder, 8, options.signal, (s) => this.ensureNotAborted(s));

        const videoFrame = new VideoFrame(canvas, {
          timestamp: frame * frameDurationUs,
          duration: frameDurationUs,
        });

        try {
          // A keyframe every two seconds keeps the stream seekable.
          encoder.encode(videoFrame, { keyFrame: frame % (FPS * 2) === 0 });
        } finally {
          videoFrame.close();
        }

        // Periodic flush keeps encoder memory bounded on long renders.
        if (frame > 0 && frame % Math.max(FPS * 2, 60) === 0) {
          await encoder.flush();
        }

        // Yield so the tab stays responsive and progress actually paints.
        if (frame % 12 === 0) {
          this.emit(10 + (frame / totalFrames) * 75, 'Rendering frames...', options.onProgress);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      await encoder.flush();
      if (encoderError) throw encoderError;
    } finally {
      try {
        if (encoder.state !== 'closed') encoder.close();
      } catch {
        // closing an errored encoder is noisy but harmless
      }
    }

    if (!chunks.length) throw new Error('The encoder produced no video data.');
    return concatUint8Arrays(chunks);
  }

  /**
   * Realtime fallback for browsers without VideoEncoder. MediaRecorder timestamps
   * follow the wall clock, so this runs in realtime by design.
   */
  private async encodeWithMediaRecorder(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    scenes: PreparedScene[],
    totalDuration: number,
    options: ShortsRenderOptions,
  ): Promise<{ data: Uint8Array; mimeType: string }> {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('This browser cannot record canvas video.');

    const stream = canvas.captureStream(FPS);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    const parts: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) parts.push(event.data);
    };

    const finished = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = (event) => reject((event as unknown as { error?: Error }).error ?? new Error('Recording failed'));
    });

    recorder.start(1000);
    const startedAt = performance.now();

    try {
      // Drive the canvas in realtime; captureStream samples whatever is drawn.
      for (;;) {
        this.ensureNotAborted(options.signal);
        const elapsed = (performance.now() - startedAt) / 1000;
        if (elapsed >= totalDuration) break;

        this.drawFrame(ctx, scenes, elapsed, canvas.width, canvas.height, options);
        this.emit(10 + (elapsed / totalDuration) * 75, 'Recording frames (realtime)...', options.onProgress);

        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      // Hold the last frame briefly so the tail is not truncated.
      this.drawFrame(ctx, scenes, totalDuration - 1 / FPS, canvas.width, canvas.height, options);
      await new Promise((resolve) => setTimeout(resolve, 250));
    } finally {
      if (recorder.state !== 'inactive') recorder.stop();
      stream.getTracks().forEach((track) => track.stop());
    }

    await finished;

    const blob = new Blob(parts, { type: mimeType });
    if (blob.size === 0) throw new Error('The recorder produced no video data.');
    return { data: new Uint8Array(await blob.arrayBuffer()), mimeType };
  }

  // --- mux --------------------------------------------------------------------

  private async mux(
    video: { data: Uint8Array; kind: 'h264' | 'webm' },
    audio: Uint8Array,
    options: ShortsRenderOptions,
  ): Promise<Blob> {
    const ffmpeg = await getFFmpeg();
    const videoName = video.kind === 'h264' ? 'shorts_video.h264' : 'shorts_video.webm';
    const audioName = 'shorts_audio.wav';
    const outputName = 'shorts_output.mp4';

    // Registered once and removed in finally — the slide renderer leaks one of
    // these per render, and long sessions should not accumulate handlers.
    const onFFmpegProgress = ({ progress }: { progress: number }) => {
      this.emit(85 + clamp(progress, 0, 1) * 15, 'Muxing MP4...', options.onProgress);
    };
    ffmpeg.on('progress', onFFmpegProgress);

    try {
      this.emit(85, 'Muxing MP4...', options.onProgress);

      await ffmpeg.writeFile(videoName, video.data);
      await ffmpeg.writeFile(audioName, audio);

      const args = video.kind === 'h264'
        ? [
            // Elementary Annex-B stream: remux without re-encoding the video.
            '-f', 'h264',
            '-framerate', String(FPS),
            '-i', videoName,
            '-i', audioName,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
            '-movflags', '+faststart',
            outputName,
          ]
        : [
            // MediaRecorder gave us VP8/VP9, which MP4 players will not take.
            '-i', videoName,
            '-i', audioName,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '21',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
            '-movflags', '+faststart',
            outputName,
          ];

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile(outputName);
      if (!(data instanceof Uint8Array) || data.byteLength === 0) {
        throw new Error('FFmpeg produced an empty video.');
      }

      return new Blob([data as BlobPart], { type: 'video/mp4' });
    } finally {
      ffmpeg.off('progress', onFFmpegProgress);
      for (const name of [videoName, audioName, outputName]) {
        try {
          await ffmpeg.deleteFile(name);
        } catch {
          // file may not exist if exec failed early
        }
      }
    }
  }

  // --- entry point ------------------------------------------------------------

  async render(options: ShortsRenderOptions): Promise<Blob> {
    this.aborted = false;

    if (!options.scenes.length) throw new Error('There are no scenes to render.');
    if (options.signal?.aborted) throw new ShortsRenderAbortedError();

    const abortHandler = () => {
      this.aborted = true;
      // A terminated core cannot be reused; drop it so the next render reloads.
      terminateFFmpeg();
    };
    options.signal?.addEventListener('abort', abortHandler, { once: true });

    const { width, height } = SHORTS_DIMENSIONS[options.aspect];
    let prepared: PreparedScene[] = [];

    try {
      this.emit(0, 'Preparing scenes...', options.onProgress);

      // Captions are drawn with webfonts; without this the first frames can fall
      // back to a system font mid-render and visibly change weight.
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready;
      }

      const result = await this.prepareScenes(options, width, height);
      prepared = result.scenes;
      const totalDuration = result.totalDuration;

      if (!(totalDuration > 0)) throw new Error('The scenes have no duration to render.');

      this.emit(5, 'Mixing audio...', options.onProgress);
      const audio = await this.renderAudioMix(options, prepared, totalDuration);
      this.ensureNotAborted(options.signal);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Could not create a 2D rendering context.');

      this.emit(10, 'Rendering frames...', options.onProgress);

      let video: { data: Uint8Array; kind: 'h264' | 'webm' };
      if (this.isWebCodecsSupported()) {
        try {
          const data = await this.encodeWithWebCodecs(canvas, ctx, prepared, totalDuration, options);
          video = { data, kind: 'h264' };
        } catch (e) {
          if (e instanceof ShortsRenderAbortedError) throw e;
          console.warn('[Shorts] WebCodecs encoding failed; falling back to MediaRecorder.', e);
          const recorded = await this.encodeWithMediaRecorder(canvas, ctx, prepared, totalDuration, options);
          video = { data: recorded.data, kind: 'webm' };
        }
      } else {
        console.warn('[Shorts] VideoEncoder unavailable; using the MediaRecorder fallback.');
        const recorded = await this.encodeWithMediaRecorder(canvas, ctx, prepared, totalDuration, options);
        video = { data: recorded.data, kind: 'webm' };
      }

      this.ensureNotAborted(options.signal);

      const blob = await this.mux(video, audio, options);
      this.emit(100, 'Render complete', options.onProgress);
      return blob;
    } catch (e) {
      if (this.aborted || options.signal?.aborted) throw new ShortsRenderAbortedError();
      // A failed exec can leave the core wedged; force a clean instance next time.
      resetFFmpeg();
      throw e;
    } finally {
      options.signal?.removeEventListener('abort', abortHandler);
      prepared.forEach((scene) => {
        scene.bitmap?.close();
        scene.videoFrames?.forEach((frame) => frame.close());
      });
    }
  }
}

export const shortsRenderer = new ShortsVideoRenderer();
