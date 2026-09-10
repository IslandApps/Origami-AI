import type { ZoomKeyframe } from '../types/slides';

/**
 * Pure builders for the FFmpeg -filter_complex graph used by BrowserVideoRenderer's
 * ffmpeg.wasm render path. Every function here only assembles filter strings — no
 * FFmpeg I/O — so the graph can be reasoned about (and tested by inspection) in
 * isolation from the file-writing/exec plumbing.
 */

/** Resolve output dimensions from a resolution tier + aspect ratio. */
export function resolveOutputDimensions(
  resolution: string,
  aspectRatio: string,
): { width: number; height: number } {
  const baseWidth = resolution === '720p' ? 1280 : 1920;
  const baseHeight = resolution === '720p' ? 720 : 1080;

  let VIDEO_WIDTH = baseWidth;
  let VIDEO_HEIGHT = baseHeight;

  if (aspectRatio === '9:16') {
    VIDEO_WIDTH = baseHeight;
    VIDEO_HEIGHT = baseWidth;
  } else if (aspectRatio === '1:1') {
    VIDEO_WIDTH = baseHeight;
    VIDEO_HEIGHT = baseHeight;
  } else if (aspectRatio === '4:3') {
    VIDEO_WIDTH = Math.round(baseHeight * (4 / 3));
    VIDEO_HEIGHT = baseHeight;
  }

  return { width: VIDEO_WIDTH, height: VIDEO_HEIGHT };
}

/**
 * Build the zoompan filter that applies zoom keyframes (with cursor-follow
 * sampling) on top of a standardized video stream. A zoom persists from its start
 * until the next zoom begins; the formula eases zoom/pan toward per-interval targets.
 */
export function buildZoompanFilter(params: {
  zooms: ZoomKeyframe[];
  cursorTrack?: Array<{ timeMs: number; x: number; y: number }>;
  zoomTimelineEnd: number;
  width: number;
  height: number;
  fps: number;
  inputLabel: string;
  outputLabel: string;
}): string {
  const { zooms, cursorTrack, zoomTimelineEnd, width, height, fps, inputLabel, outputLabel } = params;
  const zExprs: string[] = [];
  const xExprs: string[] = [];
  const yExprs: string[] = [];
  const sortedZooms = [...zooms].sort((a, b) => a.timestampStartSeconds - b.timestampStartSeconds);

  for (let zoomIndex = 0; zoomIndex < sortedZooms.length; zoomIndex++) {
    const z = sortedZooms[zoomIndex];
    const t1 = z.timestampStartSeconds;
    const nextZoom = sortedZooms[zoomIndex + 1];
    const fallbackEnd = t1 + Math.max(z.durationSeconds, 1);
    const naturalEnd = nextZoom ? nextZoom.timestampStartSeconds : Math.max(zoomTimelineEnd, fallbackEnd);
    const t2 = Math.max(t1 + 0.001, naturalEnd);

    zExprs.push(`if(between(it,${t1},${t2}),${z.zoomLevel}`);

    let txExpr = `${z.targetX ?? 0.5}`;
    let tyExpr = `${z.targetY ?? 0.5}`;

    if (z.type === 'cursor' && cursorTrack && cursorTrack.length > 0) {
      const track = cursorTrack;
      const samplesX: string[] = [];
      const samplesY: string[] = [];
      const step = 0.05;
      const sampleEnd = Math.min(t2, Math.max(zoomTimelineEnd, t1 + step));

      const getCursorAtTime = (timeSeconds: number) => {
        const timeMs = timeSeconds * 1000;
        const trackIndex = track.findIndex(c => c.timeMs >= timeMs);

        if (trackIndex === 0) return track[0];
        if (trackIndex === -1) return track[track.length - 1];

        const before = track[trackIndex - 1];
        const after = track[trackIndex];

        const delta = Math.max(1, after.timeMs - before.timeMs);
        const progress = (timeMs - before.timeMs) / delta;
        return {
          x: before.x + (after.x - before.x) * progress,
          y: before.y + (after.y - before.y) * progress,
        };
      };

      for (let t = t1; t < sampleEnd; t += step) {
        const cp = getCursorAtTime(t);
        samplesX.push(`if(between(it,${t},${t+step}),${cp.x}`);
        samplesY.push(`if(between(it,${t},${t+step}),${cp.y}`);
      }
      const finalCp = track[track.length - 1];
      txExpr = samplesX.join(',') + `,${finalCp.x}` + ')'.repeat(samplesX.length);
      tyExpr = samplesY.join(',') + `,${finalCp.y}` + ')'.repeat(samplesY.length);
    }

    xExprs.push(`if(between(it,${t1},${t2}),${txExpr}`);
    yExprs.push(`if(between(it,${t1},${t2}),${tyExpr}`);
  }

  const targetZ = zExprs.join(',') + ',1' + ')'.repeat(zExprs.length);
  const targetX = xExprs.join(',') + ',0.5' + ')'.repeat(xExprs.length);
  const targetY = yExprs.join(',') + ',0.5' + ')'.repeat(yExprs.length);

  const zFormula = `max(1, pzoom + (${targetZ} - pzoom)*if(gt(${targetZ},pzoom),0.010,0.005))`;
  const xFormula = `px + (((iw - iw/zoom)*${targetX}) - px)*0.005`;
  const yFormula = `py + (((ih - ih/zoom)*${targetY}) - py)*0.005`;

  return `[${inputLabel}]zoompan=z='${zFormula}':x='${xFormula}':y='${yFormula}':d=1:s=${width}x${height}:fps=${fps}[${outputLabel}]`;
}

/**
 * Build the per-slide video filters: for video slides with timed narration scenes
 * the matching clip segments are trimmed (freeze-frame padded when narration was
 * stretched), stitched, and tail-padded; everything else is a plain fps/trim pass.
 */
export function buildSlideVideoFilters(params: {
  slideIndex: number;
  inputLabel: string;
  outputLabel: string;
  duration: number;
  fps: number;
  isVideoSlide: boolean;
  scenes?: Array<{
    timestampStartSeconds: number;
    durationSeconds: number;
    effectiveStartSeconds: number;
    effectiveDurationSeconds: number;
  }>;
}): string[] {
  const { slideIndex, inputLabel, outputLabel, duration, fps, isVideoSlide, scenes } = params;
  const videoFilterParts: string[] = [];

  const allTimedScenes = (scenes ?? [])
    .filter(scene => Number.isFinite(scene.timestampStartSeconds) && Number.isFinite(scene.durationSeconds) && Number.isFinite(scene.effectiveDurationSeconds))
    .sort((a, b) => a.effectiveStartSeconds - b.effectiveStartSeconds);

  if (isVideoSlide && allTimedScenes.length > 0) {
    const sceneLabels: string[] = [];

    for (let j = 0; j < allTimedScenes.length; j++) {
      const scene = allTimedScenes[j];
      const originalStart = Math.max(0, scene.timestampStartSeconds || 0);
      const originalDuration = Math.max(0.05, scene.durationSeconds || 0.05);
      const originalEnd = originalStart + originalDuration;
      const effectiveDuration = Math.max(0.05, scene.effectiveDurationSeconds || originalDuration);

      const baseLabel = `vSceneBase_${slideIndex}_${j}`;
      const sceneLabel = `vScene_${slideIndex}_${j}`;
      sceneLabels.push(sceneLabel);

      videoFilterParts.push(
        `[${inputLabel}]trim=start=${originalStart}:end=${originalEnd},setpts=PTS-STARTPTS,fps=${fps},format=yuv420p[${baseLabel}]`
      );

      if (effectiveDuration > originalDuration) {
        const freezeDuration = Math.max(0.01, effectiveDuration - originalDuration);
        videoFilterParts.push(
          `[${baseLabel}]tpad=stop_mode=clone:stop_duration=${freezeDuration},trim=duration=${effectiveDuration},setpts=PTS-STARTPTS[${sceneLabel}]`
        );
      } else {
        videoFilterParts.push(
          `[${baseLabel}]trim=duration=${effectiveDuration},setpts=PTS-STARTPTS[${sceneLabel}]`
        );
      }
    }

    const stitchedLabel = `vStitched_${slideIndex}`;
    if (sceneLabels.length === 1) {
      videoFilterParts.push(`[${sceneLabels[0]}]copy[${stitchedLabel}]`);
    } else {
      const concatInputs = sceneLabels.map(label => `[${label}]`).join('');
      videoFilterParts.push(`${concatInputs}concat=n=${sceneLabels.length}:v=1:a=0[${stitchedLabel}]`);
    }

    const renderedSceneEnd = allTimedScenes.reduce((max, scene) => {
      return Math.max(max, (scene.effectiveStartSeconds || 0) + (scene.effectiveDurationSeconds || 0));
    }, 0);
    const tailPad = Math.max(0, duration - renderedSceneEnd);

    if (tailPad > 0.01) {
      videoFilterParts.push(`[${stitchedLabel}]tpad=stop_mode=clone:stop_duration=${tailPad},trim=duration=${duration},setpts=PTS-STARTPTS[${outputLabel}]`);
    } else {
      videoFilterParts.push(`[${stitchedLabel}]trim=duration=${duration},setpts=PTS-STARTPTS[${outputLabel}]`);
    }
  } else {
    // No timed scenes just trim
    let vFilter = `[${inputLabel}]fps=${fps},format=yuv420p`;
    vFilter += `,trim=duration=${duration},setpts=PTS-STARTPTS[${outputLabel}]`;
    videoFilterParts.push(vFilter);
  }

  return videoFilterParts;
}

/**
 * Build the per-slide audio filters: timed narration segments are trimmed,
 * delayed to their start offsets and amix'd; a single narration clip is just
 * padded/trimmed; slides with no audio get generated silence.
 */
export function buildSlideAudioFilters(params: {
  slideIndex: number;
  outputLabel: string;
  duration: number;
  segmentInputs: Array<{ idx: number; startSeconds: number; durationSeconds: number; label: string }>;
  singleAudioIdx: number | null;
  hasAudio: boolean;
}): string[] {
  const { slideIndex, outputLabel, duration, segmentInputs, singleAudioIdx, hasAudio } = params;
  const audioFilterParts: string[] = [];

  if (hasAudio) {
    if (segmentInputs.length > 0) {
      const delayedLabels: string[] = [];

      for (const seg of segmentInputs) {
        const delayMs = Math.max(0, Math.round(seg.startSeconds * 1000));
        const outLabel = `${seg.label}_d`;
        audioFilterParts.push(
          `[${seg.idx}:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=duration=${seg.durationSeconds},adelay=${delayMs}|${delayMs}[${outLabel}]`
        );
        delayedLabels.push(`[${outLabel}]`);
      }

      const mixedLabel = `segMix_${slideIndex}`;
      audioFilterParts.push(`${delayedLabels.join('')}amix=inputs=${delayedLabels.length}:duration=longest:dropout_transition=0[${mixedLabel}]`);
      audioFilterParts.push(`[${mixedLabel}]aformat=sample_rates=44100:channel_layouts=stereo,apad,atrim=duration=${duration}[${outputLabel}]`);
    } else if (singleAudioIdx !== null) {
      audioFilterParts.push(`[${singleAudioIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,apad,atrim=duration=${duration}[${outputLabel}]`);
    }
  }

  if (!hasAudio) {
    // Silence
    audioFilterParts.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${duration}[${outputLabel}]`);
  }

  return audioFilterParts;
}

/**
 * Chain the per-slide streams together with xfade transitions (or plain concat for
 * 'none'). `durations` must be the effective per-slide durations; the accumulated
 * total is returned for progress estimation and output mapping.
 */
export function buildTransitionChain(params: {
  inputLabels: string[];
  durations: number[];
  transitions: Array<'none' | 'fade' | 'slide' | 'wipe' | 'blur' | 'zoom' | undefined>;
}): { filterParts: string[]; finalLabel: string; totalDuration: number } {
  const { inputLabels, durations, transitions } = params;
  const videoFilterParts: string[] = [];

  let lastV = inputLabels[0];
  let currentDuration = durations[0];

  if (inputLabels.length > 1) {
    for (let i = 1; i < inputLabels.length; i++) {
      const transType = transitions[i];

      let ffmpegTrans: string;
      switch (transType) {
        case 'slide': ffmpegTrans = 'slideleft'; break;
        case 'wipe': ffmpegTrans = 'wipeleft'; break;
        case 'blur': ffmpegTrans = 'circleopen'; break;
        case 'zoom': ffmpegTrans = 'zoomin'; break;
        case 'none':
        default: ffmpegTrans = 'fade';
      }

      const dCurrent = durations[i];
      const nextV = `vMerged${i}`;

      if (transType === 'none') {
        videoFilterParts.push(`[${lastV}][${inputLabels[i]}]concat=n=2:v=1:a=0[${nextV}]`);
      } else {
        let transDur = 0.5;
        const safeTransDur = Math.min(transDur, currentDuration / 2, dCurrent / 2);
        transDur = Math.max(safeTransDur, 0.05);

        const paddedPrev = `vPad${i}`;
        videoFilterParts.push(`[${lastV}]tpad=stop_mode=clone:stop_duration=${transDur}[${paddedPrev}]`);
        videoFilterParts.push(`[${paddedPrev}][${inputLabels[i]}]xfade=transition=${ffmpegTrans}:duration=${transDur}:offset=${currentDuration}[${nextV}]`);
      }

      lastV = nextV;
      currentDuration += dCurrent;
    }
  }

  return { filterParts: videoFilterParts, finalLabel: lastV, totalDuration: currentDuration };
}

/**
 * Build the final speech output chain: concat the per-slide audio streams and
 * normalize volume. Only used when at least one slide exists.
 */
export function buildSpeechOutputFilters(audioStreamLabels: string[]): string[] {
  const audioFilterParts: string[] = [];

  if (audioStreamLabels.length === 1) {
    audioFilterParts.push(`[${audioStreamLabels[0]}]volume=1.0[aout_speech]`);
  } else {
    const concatAudioInputs = audioStreamLabels.map(label => `[${label}]`).join('');
    audioFilterParts.push(`${concatAudioInputs}concat=n=${audioStreamLabels.length}:v=0:a=1[aout_speech_concat]`);
    audioFilterParts.push(`[aout_speech_concat]volume=1.0[aout_speech]`);
  }

  return audioFilterParts;
}

/**
 * Apply the TTS volume and amix looping background music in when present
 * (`musicInputIdx` is the pre-registered '-stream_loop -1' music input).
 */
export function buildMusicMixFilters(params: {
  musicInputIdx: number | null;
  ttsVolume: number;
  musicVolume: number;
}): { filterParts: string[]; finalAudioMap: string } {
  const { musicInputIdx, ttsVolume, musicVolume } = params;
  const audioFilterParts: string[] = [];

  if (musicInputIdx !== null) {
    audioFilterParts.push(`[aout_speech]volume=${ttsVolume}[speech_vol]`);
    audioFilterParts.push(`[${musicInputIdx}:a]volume=${musicVolume}[music_vol]`);
    audioFilterParts.push(`[speech_vol][music_vol]amix=inputs=2:duration=first:dropout_transition=0.5[aout_mixed]`);
  } else {
    // Ensure we have the mixed map even if no music
    audioFilterParts.push(`[aout_speech]volume=${ttsVolume}[aout_mixed]`);
  }
  const finalAudioMap = '[aout_mixed]';

  return { filterParts: audioFilterParts, finalAudioMap };
}
