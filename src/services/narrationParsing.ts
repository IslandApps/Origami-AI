import type { IssueCaptureAnalysis, VideoNarrationAnalysis, VideoNarrationScene } from './aiService';

/**
 * Timestamp / response parsing helpers for LLM narration output (Gemini analysis
 * payloads and friends). Pure functions — no I/O, no provider calls.
 */

export const parseMMSS = (value: string): number => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid timestamp format: ${value}. Expected MM:SS.`);
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) {
    throw new Error(`Invalid timestamp value: ${value}.`);
  }

  return (minutes * 60) + seconds;
};

export const parseTimestampFlexible = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  const text = String(value ?? '').trim();
  if (!text) {
    throw new Error('Empty timestamp');
  }

  // Supports HH:MM:SS and MM:SS in addition to strict MM:SS.
  const hmsMatch = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(text);
  if (hmsMatch) {
    const h = Number(hmsMatch[1]);
    const m = Number(hmsMatch[2]);
    const s = Number(hmsMatch[3]);
    if (m < 60 && s < 60) {
      return (h * 3600) + (m * 60) + s;
    }
  }

  return parseMMSS(text);
};

export const stripCodeFence = (input: string): string => {
  const trimmed = input.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```[\w-]*\s*/, '').replace(/\s*```$/, '').trim();
  }
  return trimmed;
};

export const formatMMSS = (totalSeconds: number): string => {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const estimateDurationFromNarration = (text: string): number => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 4;
  // 150 words/minute ~= 2.5 words/second
  return Math.max(2, Math.round(words / 2.5));
};

export const pickFirstDefined = <T = unknown>(source: Record<string, any>, keys: string[]): T | undefined => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key] as T;
    }
  }
  return undefined;
};

export const parseVideoNarrationAnalysis = (rawContent: string): VideoNarrationAnalysis => {
  const cleaned = stripCodeFence(rawContent);

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Gemini returned invalid JSON for video analysis.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Video analysis payload is not a JSON object.');
  }

  const metadata = (parsed.video_metadata || parsed.videoMetadata || parsed.metadata || {}) as Record<string, any>;
  const scenes = (parsed.scenes || parsed.steps || parsed.segments || parsed.timeline || []) as any[];

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('Missing video_metadata in Gemini output.');
  }
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('Missing or empty scenes array in Gemini output.');
  }

  const title = String(
    pickFirstDefined(metadata, ['title', 'video_title', 'name']) ||
    'Video Tutorial'
  ).trim();
  const totalEstimatedDurationRaw = String(
    pickFirstDefined(metadata, ['total_estimated_duration', 'totalEstimatedDuration', 'duration', 'total_duration']) ||
    ''
  ).trim();
  if (!title) {
    throw new Error('video_metadata.title is required.');
  }

  const normalizedScenes: VideoNarrationScene[] = [];
  let inferredCursor = 0;

  for (let idx = 0; idx < scenes.length; idx++) {
    const scene = (scenes[idx] && typeof scenes[idx] === 'object') ? scenes[idx] : {};
    const rawTimestampValue = pickFirstDefined(scene, [
      'timestamp_start',
      'timestampStart',
      'start',
      'start_time',
      'startTime',
      'time'
    ]);
    let onScreenAction = String(
      pickFirstDefined(scene, [
        'on_screen_action',
        'onScreenAction',
        'screen_action',
        'screenAction',
        'visual',
        'action'
      ]) ||
      ''
    ).trim();
    let narrationText = String(
      pickFirstDefined(scene, [
        'narration_text',
        'naration_text',
        'narrationText',
        'narration',
        'voiceover',
        'voice_over',
        'script',
        'tts'
      ]) ||
      ''
    ).trim();
    const stepNumberRaw = Number(pickFirstDefined(scene, ['step_number', 'stepNumber', 'step', 'index', 'order']) ?? idx + 1);
    const stepNumber = Number.isFinite(stepNumberRaw) ? stepNumberRaw : idx + 1;

    // Never drop a scene row. Fill placeholders if the model omitted fields.

    if (!onScreenAction) {
      onScreenAction = `Continue to step ${stepNumber} on screen.`;
    }
    if (!narrationText) {
      narrationText = `Now, continue with step ${stepNumber}.`;
    }

    let durationSecondsRaw = Number(
      pickFirstDefined(scene, ['duration_seconds', 'durationSeconds', 'duration', 'seconds', 'length']) ?? 0
    );
    if (!Number.isFinite(durationSecondsRaw) || durationSecondsRaw <= 0) {
      durationSecondsRaw = estimateDurationFromNarration(narrationText);
    }
    const durationSeconds = Math.max(1, Math.round(durationSecondsRaw));

    let timestampStartSeconds: number;
    let timestampStart: string;
    try {
      if (rawTimestampValue === undefined || rawTimestampValue === null || String(rawTimestampValue).trim() === '') {
        throw new Error('missing');
      }
      timestampStartSeconds = parseTimestampFlexible(rawTimestampValue);
      timestampStart = formatMMSS(timestampStartSeconds);
    } catch {
      timestampStartSeconds = Math.max(0, Math.round(inferredCursor));
      timestampStart = formatMMSS(timestampStartSeconds);
    }

    normalizedScenes.push({
      stepNumber,
      timestampStart,
      timestampStartSeconds,
      onScreenAction,
      narrationText,
      durationSeconds,
    });

    inferredCursor = Math.max(inferredCursor, timestampStartSeconds + durationSeconds);
  }

  if (normalizedScenes.length === 0) {
    throw new Error('Gemini returned no usable scenes.');
  }

  normalizedScenes.sort((a, b) => a.timestampStartSeconds - b.timestampStartSeconds || a.stepNumber - b.stepNumber);

  for (let i = 1; i < normalizedScenes.length; i++) {
    if (normalizedScenes[i].timestampStartSeconds < normalizedScenes[i - 1].timestampStartSeconds) {
      throw new Error('Scene timestamps are not in non-decreasing order.');
    }
  }

  const inferredTotalDurationSeconds = Math.max(
    1,
    Math.ceil(normalizedScenes.reduce((max, scene) => Math.max(max, scene.timestampStartSeconds + scene.durationSeconds), 0))
  );

  let totalEstimatedDurationSeconds = inferredTotalDurationSeconds;
  let totalEstimatedDuration = formatMMSS(inferredTotalDurationSeconds);
  if (totalEstimatedDurationRaw) {
    try {
      totalEstimatedDurationSeconds = parseMMSS(totalEstimatedDurationRaw);
      totalEstimatedDuration = totalEstimatedDurationRaw;
    } catch {
      // Keep inferred duration when metadata timestamp is invalid.
    }
  }

  return {
    videoMetadata: {
      title,
      totalEstimatedDuration,
      totalEstimatedDurationSeconds,
    },
    scenes: normalizedScenes,
  };
};

export const parseStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);
};

export const parseIssueCaptureAnalysis = (rawContent: string): IssueCaptureAnalysis => {
  const cleaned = stripCodeFence(rawContent);

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Gemini returned invalid JSON for issue capture analysis.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Issue capture analysis payload is not a JSON object.');
  }

  const issueTitle = String(parsed.issue_title || parsed.issueTitle || 'Observed bug').trim();
  const issueSummary = String(parsed.issue_summary || parsed.issueSummary || '').trim();
  const observedBehavior = String(parsed.observed_behavior || parsed.observedBehavior || '').trim();
  const expectedBehavior = String(parsed.expected_behavior || parsed.expectedBehavior || '').trim();
  const reproductionSteps = parseStringArray(parsed.reproduction_steps || parsed.reproductionSteps);
  const technicalClues = parseStringArray(parsed.technical_clues || parsed.technicalClues);
  const recommendedPrompt = String(parsed.recommended_prompt || parsed.recommendedPrompt || '').trim();

  if (!issueSummary) {
    throw new Error('Issue capture analysis is missing issue_summary.');
  }

  if (!observedBehavior) {
    throw new Error('Issue capture analysis is missing observed_behavior.');
  }

  if (!expectedBehavior) {
    throw new Error('Issue capture analysis is missing expected_behavior.');
  }

  if (reproductionSteps.length === 0) {
    throw new Error('Issue capture analysis is missing reproduction_steps.');
  }

  if (!recommendedPrompt) {
    throw new Error('Issue capture analysis is missing recommended_prompt.');
  }

  return {
    issueTitle,
    issueSummary,
    observedBehavior,
    expectedBehavior,
    reproductionSteps,
    technicalClues,
    recommendedPrompt,
  };
};
