import type { RenderedPage } from '../services/pdfService';
import type { GlobalSettings } from '../services/storage';

export interface VideoNarrationSceneTrack {
  id: string;
  stepNumber: number;
  timestampStart: string;
  timestampStartSeconds: number;
  onScreenAction: string;
  narrationText: string;
  durationSeconds: number;
  effectiveStartSeconds: number;
  effectiveDurationSeconds: number;
  audioUrl?: string;
  audioDurationSeconds?: number;
}

export interface VideoNarrationAnalysisData {
  model: string;
  generatedAt: number;
  videoMetadata: {
    title: string;
    totalEstimatedDuration: string;
    totalEstimatedDurationSeconds: number;
  };
  scenes: VideoNarrationSceneTrack[];
  totalTimelineDurationSeconds: number;
  totalStretchSeconds: number;
  rawGeminiJson?: string;
}

export interface ZoomKeyframe {
  id: string;
  timestampStartSeconds: number;
  durationSeconds: number;
  type: 'fixed' | 'cursor';
  targetX?: number; // 0-1 percentage
  targetY?: number; // 0-1 percentage
  zoomLevel: number;
  // New: Easing and smoothing improvements
  easing?: 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart' | 'easeInExpo' | 'easeOutExpo' | 'easeInOutExpo' | 'easeOutElastic' | 'easeOutBounce';
  // Smoothing factor for the transition into this zoom (0 = instant, 1 = very slow)
  transitionSmoothing?: number;
  // Damping for cursor following (0.005-0.015, higher = slower/smoother)
  cursorDamping?: number;
  // Enable predictive cursor following (look ahead)
  predictiveCursor?: boolean;
  // Auto-zoom-out on inactivity
  autoZoomOut?: boolean; // Enable automatic zoom-out during idle periods
}

export interface AutoZoomConfig {
  enabled: boolean;
  minIdleDurationMs?: number; // Minimum idle time before zoom-out (default: 2000ms)
  minCursorMovement?: number; // Min cursor movement distance to not count as idle (default: 0.015)
  zoomOutLevel?: number; // Zoom level to return to during idle (default: 1.0)
  transitionDurationMs?: number; // Duration of zoom-out/in transitions (default: 800ms)
}

export interface SlideData extends Partial<RenderedPage> {
  id: string;
  type: 'image' | 'video';
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaDuration?: number;
  isVideoMusicPaused?: boolean;
  script: string;
  audioUrl?: string;
  audioDuration?: number;
  duration?: number;
  transition: 'fade' | 'slide' | 'zoom' | 'none';
  voice: string;
  postAudioDelay?: number;
  isTtsDisabled?: boolean;
  isMusicDisabled?: boolean;
  originalScript?: string;
  isSelected?: boolean;
  audioSourceType?: 'tts' | 'recorded';
  videoNarrationAnalysis?: VideoNarrationAnalysisData;
  cursorTrack?: { timeMs: number, x: number, y: number }[];
  interactionData?: { timeMs: number, type: string }[];
  zooms?: ZoomKeyframe[];
  autoZoomConfig?: AutoZoomConfig;
  rotation?: number;
}

export interface MusicSettings {
  url?: string;
  blob?: Blob;
  volume: number;
  loop?: boolean;
  title?: string;
}

export type SlideEditorViewMode = 'list' | 'grid';

export interface SlideAnalysisProgress {
  status: string;
  progress: number;
}

export interface SlideEditorProps {
  slides: SlideData[];
  onUpdateSlide: (index: number, data: Partial<SlideData>) => void;
  onReplaceSlideImage: (index: number, file: File) => Promise<void>;
  onGenerateAudio: (index: number) => Promise<void>;
  onGenerateVideoSceneAudio: (index: number) => Promise<void>;
  onAnalyzeVideoNarration: (index: number) => Promise<void>;
  onOpenSceneAlignmentEditor: (index: number) => void;
  generatingSlides: Set<number>;
  analyzingSlides: Set<number>;
  analysisProgressBySlide: Record<number, SlideAnalysisProgress>;
  onReorderSlides: (slides: SlideData[]) => void;
  musicSettings: MusicSettings;
  onUpdateMusicSettings: (settings: MusicSettings) => void;
  ttsVolume?: number;
  onUpdateTtsVolume?: (volume: number) => void;
  globalSettings?: GlobalSettings | null;
  onUpdateGlobalSettings?: (settings: Partial<GlobalSettings>) => void;
  viewMode: SlideEditorViewMode;
  onViewModeChange: (mode: SlideEditorViewMode) => void;
  onOpenSettings?: () => void;
  onStartScreenRecord?: () => void;
  defaultToolsConfigTab?: 'overview' | 'voice' | 'mixing' | 'tools' | 'media';
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3';
  cursorData?: any;
  /** True while background resources (TTS / FFmpeg / WebLLM) are still downloading. */
  isDownloading?: boolean;
}
