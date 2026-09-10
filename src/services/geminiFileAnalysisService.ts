import { postChatCompletions, normalizeModelForRequest, type ChatMessage, type IssueCaptureAnalysis, type LLMSettings, type VideoAnalysisProgress, type VideoNarrationAnalysis } from './aiService';
import { GEMINI_ISSUE_CAPTURE_ANALYSIS_SYSTEM_PROMPT, GEMINI_VIDEO_ANALYSIS_SYSTEM_PROMPT } from './prompts';
import { parseIssueCaptureAnalysis, parseVideoNarrationAnalysis, stripCodeFence } from './narrationParsing';

interface GeminiFileResource {
  name: string;
  uri: string;
  mimeType?: string;
  state?: string;
}

const isGoogleGeminiEndpoint = (baseUrl: string): boolean => {
  return /generativelanguage\.googleapis\.com/i.test(baseUrl);
};

const getGeminiApiKey = (settings: LLMSettings): string => {
  const apiKey = settings.apiKey?.trim();
  if (!apiKey) {
    throw new Error('Missing API key for Gemini media analysis.');
  }
  return apiKey;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface GeminiUploadProgressLabels {
  uploading: string;
  uploaded: string;
  processing: string;
  processed: string;
  generate: string;
  parse: string;
}

const DEFAULT_GEMINI_UPLOAD_LABELS: GeminiUploadProgressLabels = {
  uploading: 'Uploading media',
  uploaded: 'Media uploaded',
  processing: 'Processing media',
  processed: 'Media processed',
  generate: 'Generating structured output',
  parse: 'Parsing JSON output',
};

const GEMINI_VIDEO_UPLOAD_LABELS: GeminiUploadProgressLabels = {
  uploading: 'Uploading video',
  uploaded: 'Video uploaded',
  processing: 'Processing video',
  processed: 'Video processed',
  generate: 'Generating script JSON',
  parse: 'Parsing JSON output',
};

const GEMINI_ISSUE_CAPTURE_UPLOAD_LABELS: GeminiUploadProgressLabels = {
  uploading: 'Uploading recording',
  uploaded: 'Recording uploaded',
  processing: 'Processing recording',
  processed: 'Recording processed',
  generate: 'Writing debugging prompt',
  parse: 'Parsing prompt output',
};

const uploadGeminiFile = async (
  apiKey: string,
  file: Blob,
  mimeType: string,
  displayName: string,
  onProgress?: (update: VideoAnalysisProgress) => void,
  labels: GeminiUploadProgressLabels = DEFAULT_GEMINI_UPLOAD_LABELS
): Promise<GeminiFileResource> => {
  onProgress?.({ stage: labels.uploading, progress: 12 });
  const startResp = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(file.size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file: {
        display_name: displayName,
      }
    })
  });

  if (!startResp.ok) {
    const errorData = await startResp.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to start Gemini file upload: ${startResp.statusText}`);
  }

  const uploadUrl = startResp.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new Error('Gemini upload URL was not returned by the API.');
  }

  onProgress?.({ stage: labels.uploading, progress: 20 });

  const finalizeResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Type': mimeType,
    },
    body: file,
  });

  if (!finalizeResp.ok) {
    const errorData = await finalizeResp.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to upload Gemini file: ${finalizeResp.statusText}`);
  }

  const finalizeData = await finalizeResp.json();
  const uploaded = (finalizeData.file ?? finalizeData) as GeminiFileResource;
  if (!uploaded?.name || !uploaded?.uri) {
    throw new Error('Gemini upload response did not include file metadata.');
  }

  onProgress?.({ stage: labels.uploaded, progress: 28 });

  return uploaded;
};

const waitForGeminiFileActive = async (
  apiKey: string,
  fileName: string,
  onProgress?: (update: VideoAnalysisProgress) => void,
  labels: GeminiUploadProgressLabels = DEFAULT_GEMINI_UPLOAD_LABELS
): Promise<GeminiFileResource> => {
  const cleanName = fileName.startsWith('files/') ? fileName : fileName.replace(/^\/+/, '');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${encodeURIComponent(apiKey)}`;

  const maxAttempts = 45;
  onProgress?.({ stage: labels.processing, progress: 30 });
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const resp = await fetch(endpoint);
    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Failed to check Gemini file state: ${resp.statusText}`);
    }

    const data = await resp.json();
    const resource = (data.file ?? data) as GeminiFileResource;
    const state = (resource.state || '').toUpperCase();

    if (state === 'ACTIVE') {
      onProgress?.({ stage: labels.processed, progress: 70 });
      return resource;
    }
    if (state === 'FAILED') {
      throw new Error('Gemini failed to process the uploaded media file.');
    }

    const processProgress = Math.min(69, 30 + Math.floor(((attempt + 1) / maxAttempts) * 39));
    onProgress?.({ stage: labels.processing, progress: processProgress });
    await sleep(2000);
  }

  throw new Error('Gemini media processing timed out. Try a shorter clip and retry.');
};

const deleteGeminiFile = async (apiKey: string, fileName: string): Promise<void> => {
  const cleanName = fileName.startsWith('files/') ? fileName : fileName.replace(/^\/+/, '');
  await fetch(`https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${encodeURIComponent(apiKey)}`, {
    method: 'DELETE'
  }).catch(() => undefined);
};

const generateGeminiFileAnalysis = async (
  apiKey: string,
  model: string,
  fileUri: string,
  mimeType: string,
  systemPrompt: string,
  userPrompt: string,
  onProgress?: (update: VideoAnalysisProgress) => void,
  labels: GeminiUploadProgressLabels = DEFAULT_GEMINI_UPLOAD_LABELS
): Promise<string> => {
  onProgress?.({ stage: labels.generate, progress: 76 });
  const normalizedModel = normalizeModelForRequest(model.trim());
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [
            { text: userPrompt },
            { file_data: { mime_type: mimeType, file_uri: fileUri } }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      }
    })
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Gemini media analysis request failed: ${resp.statusText}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.find((p: any) => typeof p?.text === 'string')?.text || '';
  if (!text.trim()) {
    throw new Error('Gemini did not return any text output for media analysis.');
  }
  onProgress?.({ stage: labels.parse, progress: 84 });
  return text;
};

export const analyzeVideoNarrationWithGemini = async (
  settings: LLMSettings,
  context: {
    topicHint: string;
    mediaDurationSeconds?: number;
    fileNameHint?: string;
    mediaBlob?: Blob;
    mediaMimeType?: string;
    onProgress?: (update: VideoAnalysisProgress) => void;
  }
): Promise<VideoNarrationAnalysis> => {
  const model = settings.model?.trim() || 'gemini-2.5-flash-lite';
  context.onProgress?.({ stage: 'Preparing request', progress: 5 });
  const userPrompt = [
    `Tutorial topic: ${context.topicHint || 'Video walkthrough'}`,
    context.fileNameHint ? `Video file hint: ${context.fileNameHint}` : '',
    Number.isFinite(context.mediaDurationSeconds) ? `Video length hint (seconds): ${context.mediaDurationSeconds}` : '',
    'Return strictly valid JSON only. Do not include markdown fences.',
    'Use EXACT keys: video_metadata.title, video_metadata.total_estimated_duration, and scenes[].{step_number,timestamp_start,on_screen_action,narration_text,duration_seconds}.',
  ].filter(Boolean).join('\n');

  // If the client does not have an API key (no VITE_LLM_API_KEY baked in), proxy the entire analysis to the server.
  if (typeof window !== 'undefined' && (!settings.apiKey || !settings.apiKey.trim())) {
    const body: any = {
      baseUrl: settings.baseUrl,
      model,
      systemPrompt: GEMINI_VIDEO_ANALYSIS_SYSTEM_PROMPT,
      userPrompt,
    };

    if (context.mediaBlob) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read media blob'));
        reader.readAsDataURL(context.mediaBlob as Blob);
      });
      const parts = dataUrl.split(',');
      body.mediaBase64 = parts.length > 1 ? parts[1] : parts[0];
      body.mediaMimeType = context.mediaMimeType?.trim() || context.mediaBlob?.type || 'video/mp4';
      body.mediaFileName = context.fileNameHint || 'upload.mp4';
    }

    context.onProgress?.({ stage: 'Uploading/Generating', progress: 30 });
    const resp = await fetch('/api/llm/analyze-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(errText || 'Server LLM analyze failed');
    }
    const text = await resp.text();
    context.onProgress?.({ stage: 'Analysis ready', progress: 88 });
    return { ...parseVideoNarrationAnalysis(text), rawJson: stripCodeFence(text) };
  }

  if (!context.mediaBlob) {
    // Fallback path for callers that do not provide a media blob.
    const messages: ChatMessage[] = [
      { role: 'system', content: GEMINI_VIDEO_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    const first = await postChatCompletions(settings, messages, 0.2, model);
    context.onProgress?.({ stage: 'Parsing JSON output', progress: 84 });
    try {
      context.onProgress?.({ stage: 'Analysis ready', progress: 88 });
      return { ...parseVideoNarrationAnalysis(first), rawJson: stripCodeFence(first) };
    } catch {
      const repairMessages: ChatMessage[] = [
        ...messages,
        { role: 'assistant', content: first },
        { role: 'user', content: 'Your previous response was invalid. Return ONLY valid JSON matching the required schema. No markdown, no commentary.' }
      ];
      const repaired = await postChatCompletions(settings, repairMessages, 0.1, model);
      context.onProgress?.({ stage: 'Analysis ready', progress: 88 });
      return { ...parseVideoNarrationAnalysis(repaired), rawJson: stripCodeFence(repaired) };
    }
  }

  if (!isGoogleGeminiEndpoint(settings.baseUrl)) {
    throw new Error('Actual video analysis requires a Google Gemini endpoint. Set Base URL to generativelanguage.googleapis.com and retry.');
  }

  const apiKey = getGeminiApiKey(settings);
  const mimeType = context.mediaMimeType?.trim() || context.mediaBlob.type || 'video/mp4';
  let uploadedFile: GeminiFileResource | null = null;

  try {
    uploadedFile = await uploadGeminiFile(
      apiKey,
      context.mediaBlob,
      mimeType,
      context.fileNameHint || 'slide-media-video',
      context.onProgress,
      GEMINI_VIDEO_UPLOAD_LABELS
    );
    const activeFile = await waitForGeminiFileActive(apiKey, uploadedFile.name, context.onProgress, GEMINI_VIDEO_UPLOAD_LABELS);

    const first = await generateGeminiFileAnalysis(
      apiKey,
      model,
      activeFile.uri,
      mimeType,
      GEMINI_VIDEO_ANALYSIS_SYSTEM_PROMPT,
      userPrompt,
      context.onProgress,
      GEMINI_VIDEO_UPLOAD_LABELS
    );
    try {
      context.onProgress?.({ stage: 'Analysis ready', progress: 88 });
      return { ...parseVideoNarrationAnalysis(first), rawJson: stripCodeFence(first) };
    } catch {
      const repairPrompt = `${userPrompt}\n\nYour previous response was invalid JSON. Return only valid JSON matching the requested schema.`;
      const repaired = await generateGeminiFileAnalysis(
        apiKey,
        model,
        activeFile.uri,
        mimeType,
        GEMINI_VIDEO_ANALYSIS_SYSTEM_PROMPT,
        repairPrompt,
        context.onProgress,
        GEMINI_VIDEO_UPLOAD_LABELS
      );
      context.onProgress?.({ stage: 'Analysis ready', progress: 88 });
      return { ...parseVideoNarrationAnalysis(repaired), rawJson: stripCodeFence(repaired) };
    }
  } finally {
    if (uploadedFile?.name) {
      await deleteGeminiFile(apiKey, uploadedFile.name);
    }
  }
};

export const analyzeIssueCaptureWithGemini = async (
  settings: LLMSettings,
  context: {
    mediaBlob: Blob;
    mediaMimeType?: string;
    fileNameHint?: string;
    mediaDurationSeconds?: number;
    userGoal?: string;
    extraContext?: string;
    onProgress?: (update: VideoAnalysisProgress) => void;
  }
): Promise<IssueCaptureAnalysis> => {
  if (!context.mediaBlob) {
    throw new Error('A screen recording is required for issue analysis.');
  }

  const model = settings.model?.trim() || 'gemini-2.5-flash-lite';
  const mimeType = context.mediaMimeType?.trim() || context.mediaBlob.type || 'video/webm';

  context.onProgress?.({ stage: 'Preparing request', progress: 5 });

  const userPrompt = [
    'Analyze the attached screen-recorded video clip and produce the best possible bug report wording for an agentic AI.',
    context.fileNameHint ? `Recording file hint: ${context.fileNameHint}` : '',
    Number.isFinite(context.mediaDurationSeconds) ? `Approximate recording duration (seconds): ${context.mediaDurationSeconds}` : '',
    context.userGoal?.trim() ? `Developer's own description of the issue: ${context.userGoal.trim()}` : '',
    context.extraContext?.trim() ? `Extra context: ${context.extraContext.trim()}` : '',
    'Use the developer description as an important input, but verify the wording against what is actually visible in the recording.',
    'Return strictly valid JSON only. Do not include markdown fences.',
    'Use EXACT keys: issue_title, issue_summary, observed_behavior, expected_behavior, reproduction_steps, technical_clues, recommended_prompt.',
  ].filter(Boolean).join('\n');

  // If client doesn't have an API key, proxy the issue analysis to the server
  if (typeof window !== 'undefined' && (!settings.apiKey || !settings.apiKey.trim())) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read media blob'));
      reader.readAsDataURL(context.mediaBlob as Blob);
    });
    const parts = dataUrl.split(',');
    const body: any = {
      baseUrl: settings.baseUrl,
      model,
      systemPrompt: GEMINI_ISSUE_CAPTURE_ANALYSIS_SYSTEM_PROMPT,
      userPrompt,
      mediaBase64: parts.length > 1 ? parts[1] : parts[0],
      mediaMimeType: mimeType,
      mediaFileName: context.fileNameHint || 'issue-recording.webm',
    };

    context.onProgress?.({ stage: 'Uploading/Generating', progress: 30 });
    const resp = await fetch('/api/llm/analyze-issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(errText || 'Server LLM analyze failed');
    }
    const text = await resp.text();
    context.onProgress?.({ stage: 'Prompt ready', progress: 92 });
    return { ...parseIssueCaptureAnalysis(text), rawJson: stripCodeFence(text) };
  }

  const apiKey = getGeminiApiKey(settings);
  let uploadedFile: GeminiFileResource | null = null;

  try {
    uploadedFile = await uploadGeminiFile(
      apiKey,
      context.mediaBlob,
      mimeType,
      context.fileNameHint || 'origami-issue-report',
      context.onProgress,
      GEMINI_ISSUE_CAPTURE_UPLOAD_LABELS
    );
    const activeFile = await waitForGeminiFileActive(apiKey, uploadedFile.name, context.onProgress, GEMINI_ISSUE_CAPTURE_UPLOAD_LABELS);

    const first = await generateGeminiFileAnalysis(
      apiKey,
      model,
      activeFile.uri,
      mimeType,
      GEMINI_ISSUE_CAPTURE_ANALYSIS_SYSTEM_PROMPT,
      userPrompt,
      context.onProgress,
      GEMINI_ISSUE_CAPTURE_UPLOAD_LABELS
    );

    try {
      context.onProgress?.({ stage: 'Prompt ready', progress: 92 });
      return { ...parseIssueCaptureAnalysis(first), rawJson: stripCodeFence(first) };
    } catch {
      const repairPrompt = `${userPrompt}\n\nYour previous response was invalid JSON. Return only valid JSON matching the requested schema.`;
      const repaired = await generateGeminiFileAnalysis(
        apiKey,
        model,
        activeFile.uri,
        mimeType,
        GEMINI_ISSUE_CAPTURE_ANALYSIS_SYSTEM_PROMPT,
        repairPrompt,
        context.onProgress,
        GEMINI_ISSUE_CAPTURE_UPLOAD_LABELS
      );
      context.onProgress?.({ stage: 'Prompt ready', progress: 92 });
      return { ...parseIssueCaptureAnalysis(repaired), rawJson: stripCodeFence(repaired) };
    }
  } finally {
    if (uploadedFile?.name) {
      await deleteGeminiFile(apiKey, uploadedFile.name);
    }
  }
};
