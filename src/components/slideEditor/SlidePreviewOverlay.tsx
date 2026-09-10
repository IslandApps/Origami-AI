import React from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Play, RotateCcw, RotateCw, Speech, Square, X } from 'lucide-react';
import { ZoomTimelineEditor } from '../ZoomTimelineEditor';
import type { SlideData } from '../../types/slides';

// Helper function to highlight matching text in preview
const highlightPreviewText = (text: string, search: string) => {
  if (!search) return text;

  const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) => {
    // When using split() with a capturing group, matches are at odd indices
    if (index % 2 === 1 && part) {
      return (
        <mark key={index} className="bg-yellow-400/80 text-black rounded-sm px-0.5 py-0.5 font-bold">
          {part}
        </mark>
      );
    }
    return part;
  });
};

interface SlidePreviewOverlayProps {
  /** 'modal' renders full-screen through a portal; 'inline' renders in-flow below the toolbar. */
  isModal: boolean;
  slides: SlideData[];
  previewIndex: number;
  setPreviewIndex: React.Dispatch<React.SetStateAction<number | null>>;
  onUpdateSlide: (index: number, data: Partial<SlideData>) => void;
  onGenerateAudio: (index: number) => Promise<void>;
  generatingSlides: Set<number>;
  isPreviewTTSPlaying: boolean;
  togglePreviewTTS: () => void;
  previewVideoRef: React.RefObject<HTMLVideoElement | null>;
  previewZoomStyle: React.CSSProperties;
  previewVideoTime: number;
  setPreviewVideoTime: React.Dispatch<React.SetStateAction<number>>;
  previewVideoDuration: number;
  setPreviewVideoDuration: React.Dispatch<React.SetStateAction<number>>;
  findText: string;
}

export const SlidePreviewOverlay: React.FC<SlidePreviewOverlayProps> = ({
  isModal,
  slides,
  previewIndex,
  setPreviewIndex,
  onUpdateSlide,
  onGenerateAudio,
  generatingSlides,
  isPreviewTTSPlaying,
  togglePreviewTTS,
  previewVideoRef,
  previewZoomStyle,
  previewVideoTime,
  setPreviewVideoTime,
  previewVideoDuration,
  setPreviewVideoDuration,
  findText,
}) => {
  if (isModal) {
    return createPortal(
      <div
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md p-4 sm:p-8 flex items-center justify-center animate-fade-in"
        onClick={() => setPreviewIndex(null)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setPreviewIndex(null);
          }}
          className="absolute top-4 right-4 z-50 p-2 text-white/60 hover:text-white transition-colors flex items-center gap-2 group"
          title="Close Preview"
        >
          <div className="transition-colors">
            <X className="w-8 h-8 drop-shadow-md" />
          </div>
        </button>

        <div className="relative flex flex-col w-full h-[calc(100dvh-2rem)] sm:h-[calc(100dvh-4rem)] gap-4 pt-10 pb-2" onClick={(e) => e.stopPropagation()}>
          <div className="w-[min(96vw,1800px)] mx-auto shrink-0 z-10 bg-[#121212]/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 sm:px-6 sm:py-5 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-0">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-branding-primary drop-shadow-sm">{previewIndex + 1}</span>
                <span className="text-xs font-bold text-white/30 uppercase tracking-widest">of {slides.length}</span>
              </div>
              <div className="flex items-center gap-3">
                {slides[previewIndex].audioUrl ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePreviewTTS();
                    }}
                    className="flex items-center justify-center flex-1 sm:flex-none gap-2 px-4 py-2 rounded-xl bg-branding-primary/10 hover:bg-branding-primary/20 border border-branding-primary/20 text-branding-primary font-bold text-sm transition-all hover:scale-105 active:scale-95 shadow-lg shadow-branding-primary/5"
                  >
                    {isPreviewTTSPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                    {isPreviewTTSPlaying ? 'Pause TTS' : 'Play TTS'}
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onGenerateAudio(previewIndex);
                    }}
                    disabled={generatingSlides.has(previewIndex)}
                    className="flex items-center justify-center flex-1 sm:flex-none gap-2 px-4 py-2 rounded-xl bg-branding-accent/10 hover:bg-branding-accent/20 border border-branding-accent/20 text-branding-accent font-bold text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-branding-accent/5"
                  >
                    {generatingSlides.has(previewIndex) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Speech className="w-4 h-4" />}
                    {generatingSlides.has(previewIndex) ? 'Generating...' : 'Generate TTS'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="w-[min(96vw,1800px)] mx-auto flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem] gap-4">
            <div className="relative min-h-[52dvh] lg:min-h-0 w-full flex items-center justify-center overflow-hidden rounded-2xl bg-black/50 border border-white/10 shadow-2xl shadow-black/40 p-2 sm:p-3 group/detail-media">
              <div className="absolute top-4 left-4 z-10 flex gap-2 opacity-0 pointer-events-none transition-all duration-200 group-hover/detail-media:opacity-100 group-hover/detail-media:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto">
                <button
                  type="button"
                  onClick={() => {
                    const newRotation = (slides[previewIndex].rotation || 0) - 90;
                    onUpdateSlide(previewIndex, { rotation: newRotation });
                  }}
                  className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-black/60 p-2 text-white/90 hover:bg-black/80 transition-colors cursor-pointer"
                  title="Rotate Counter-Clockwise"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const newRotation = (slides[previewIndex].rotation || 0) + 90;
                    onUpdateSlide(previewIndex, { rotation: newRotation });
                  }}
                  className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-black/60 p-2 text-white/90 hover:bg-black/80 transition-colors cursor-pointer"
                  title="Rotate Clockwise"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>

              {slides[previewIndex].type === 'video' ? (
                <video
                  ref={previewVideoRef}
                  src={slides[previewIndex].mediaUrl}
                  className="w-full h-full object-contain rounded-xl"
                  style={{
                    ...previewZoomStyle,
                    transform: `${previewZoomStyle?.transform || ''} rotate(${slides[previewIndex].rotation || 0}deg)`.trim()
                  }}
                  controls

                  autoPlay
                  onTimeUpdate={(e) => setPreviewVideoTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => {
                    const vid = e.currentTarget;
                    if (vid.duration === Infinity) {
                      vid.currentTime = 1e101;
                      const onDurChange = () => {
                        vid.currentTime = 0;
                        vid.removeEventListener('durationchange', onDurChange);
                        setPreviewVideoDuration(vid.duration);
                      };
                      vid.addEventListener('durationchange', onDurChange);
                    } else {
                      setPreviewVideoDuration(vid.duration);
                    }
                  }}
                />
              ) : (
                <img
                  src={slides[previewIndex].dataUrl}
                  alt={`Slide ${previewIndex + 1}`}
                  className="w-full h-full object-contain rounded-xl"
                  style={{
                    transform: `rotate(${slides[previewIndex].rotation || 0}deg)`
                  }}
                />
              )}
            </div>

            <aside className="min-h-0 flex flex-col rounded-2xl bg-[#121212]/95 backdrop-blur-2xl border border-white/10 shadow-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Script</span>
                <span className="text-[11px] text-white/35">{slides[previewIndex].script.length} chars</span>
              </div>
              <div className="mt-4 min-h-0 flex-1">
                <textarea
                  value={slides[previewIndex].script}
                  onChange={(e) => onUpdateSlide(previewIndex, { script: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                    className="w-full h-full min-h-55 resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm md:text-base text-white/85 font-medium leading-relaxed placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-branding-primary/40 focus:border-branding-primary/40"
                  placeholder="Write or edit your narration script..."
                />
              </div>
            </aside>
          </div>

          {slides[previewIndex].type === 'video' && (
            <div className="w-[min(96vw,1800px)] mx-auto shrink-0 mb-4" onClick={(e) => e.stopPropagation()}>
              <ZoomTimelineEditor
                currentTime={previewVideoTime}
                duration={previewVideoDuration}
                zooms={slides[previewIndex].zooms || []}
                onUpdateZooms={(zooms) => onUpdateSlide(previewIndex, { zooms })}
                onSeek={(time) => {
                  if (previewVideoRef.current && Number.isFinite(time)) {
                    previewVideoRef.current.currentTime = time;
                    setPreviewVideoTime(time);
                  }
                }}
                autoZoomConfig={slides[previewIndex].autoZoomConfig}
                onUpdateAutoZoomConfig={(config) => onUpdateSlide(previewIndex, { autoZoomConfig: config })}
                cursorData={slides[previewIndex].cursorTrack}
                interactionData={slides[previewIndex].cursorTrack ? [] : undefined}
              />
            </div>
          )}
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div
      className="relative w-full mb-8 bg-black/40 p-8 rounded-3xl border border-white/10 flex flex-col items-center animate-fade-in"
      onClick={() => setPreviewIndex(null)}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          setPreviewIndex(null);
        }}
        className="absolute top-10 right-10 z-50 p-2 text-white/60 hover:text-white transition-colors flex items-center gap-2 group"
        title="Close Preview"
      >
        <div className="transition-colors">
          <X className="w-8 h-8 drop-shadow-md" />
        </div>
      </button>

      <div className="relative flex flex-col w-full min-h-[50vh] max-h-[85dvh] gap-4" onClick={(e) => e.stopPropagation()}>
        {/* Unified Slide Panel */}
        <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 shrink-0 z-10 bg-[#121212]/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 sm:p-6 shadow-2xl">
          {/* Header Row: Slide Number & TTS Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-4 gap-4 sm:gap-0">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-branding-primary drop-shadow-sm">{previewIndex + 1}</span>
              <span className="text-xs font-bold text-white/30 uppercase tracking-widest">of {slides.length}</span>
            </div>
            <div className="flex items-center gap-3">
              {slides[previewIndex].audioUrl ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePreviewTTS();
                  }}
                  className="flex items-center justify-center flex-1 sm:flex-none gap-2 px-4 py-2 rounded-xl bg-branding-primary/10 hover:bg-branding-primary/20 border border-branding-primary/20 text-branding-primary font-bold text-sm transition-all hover:scale-105 active:scale-95 shadow-lg shadow-branding-primary/5"
                >
                  {isPreviewTTSPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                  {isPreviewTTSPlaying ? 'Pause TTS' : 'Play TTS'}
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerateAudio(previewIndex);
                  }}
                  disabled={generatingSlides.has(previewIndex)}
                  className="flex items-center justify-center flex-1 sm:flex-none gap-2 px-4 py-2 rounded-xl bg-branding-accent/10 hover:bg-branding-accent/20 border border-branding-accent/20 text-branding-accent font-bold text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-branding-accent/5"
                >
                  {generatingSlides.has(previewIndex) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Speech className="w-4 h-4" />}
                  {generatingSlides.has(previewIndex) ? 'Generating...' : 'Generate TTS'}
                </button>
              )}
            </div>
          </div>

          {/* Script Content */}
          {slides[previewIndex].script.trim() && (
            <div className="text-sm md:text-base text-white/80 w-full max-h-[25dvh] overflow-y-auto pr-2 font-medium leading-relaxed text-left [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
              <p className="whitespace-pre-wrap">{highlightPreviewText(slides[previewIndex].script, findText)}</p>
            </div>
          )}
        </div>

        <div className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden group/detail-media">
          <div className="absolute top-4 left-4 z-10 flex gap-2 opacity-0 pointer-events-none transition-all duration-200 group-hover/detail-media:opacity-100 group-hover/detail-media:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                const newRotation = (slides[previewIndex].rotation || 0) - 90;
                onUpdateSlide(previewIndex, { rotation: newRotation });
              }}
              className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-black/60 p-2 text-white/90 hover:bg-black/80 transition-colors cursor-pointer"
              title="Rotate Counter-Clockwise"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const newRotation = (slides[previewIndex].rotation || 0) + 90;
                onUpdateSlide(previewIndex, { rotation: newRotation });
              }}
              className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-black/60 p-2 text-white/90 hover:bg-black/80 transition-colors cursor-pointer"
              title="Rotate Clockwise"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>

          {slides[previewIndex].type === 'video' ? (
            <div className="flex flex-col w-full h-full">
              <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-visible">
                <video
                  ref={previewVideoRef}
                  src={slides[previewIndex].mediaUrl}
                  className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl shadow-black ring-1 ring-white/10"
                  style={{
                    ...previewZoomStyle,
                    transform: `${previewZoomStyle?.transform || ''} rotate(${slides[previewIndex].rotation || 0}deg)`.trim()
                  }}
                  controls
                  autoPlay
                  onTimeUpdate={(e) => setPreviewVideoTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => {
                    const vid = e.currentTarget;
                    if (vid.duration === Infinity) {
                      vid.currentTime = 1e101;
                      const onDurChange = () => {
                        vid.currentTime = 0;
                        vid.removeEventListener('durationchange', onDurChange);
                        setPreviewVideoDuration(vid.duration);
                      };
                      vid.addEventListener('durationchange', onDurChange);
                    } else {
                      setPreviewVideoDuration(vid.duration);
                    }
                  }}
                />
              </div>
              <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                <ZoomTimelineEditor
                  currentTime={previewVideoTime}
                  duration={previewVideoDuration}
                  zooms={slides[previewIndex].zooms || []}
                  onUpdateZooms={(zooms) => onUpdateSlide(previewIndex, { zooms })}
                  onSeek={(time) => {
                    if (previewVideoRef.current && Number.isFinite(time)) {
                      previewVideoRef.current.currentTime = time;
                      setPreviewVideoTime(time);
                    }
                  }}
                  autoZoomConfig={slides[previewIndex].autoZoomConfig}
                  onUpdateAutoZoomConfig={(config) => onUpdateSlide(previewIndex, { autoZoomConfig: config })}
                  cursorData={slides[previewIndex].cursorTrack}
                  interactionData={slides[previewIndex].cursorTrack ? [] : undefined}
                />
              </div>
            </div>
          ) : (
            <img
              src={slides[previewIndex].dataUrl}
              alt={`Slide ${previewIndex + 1}`}
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl shadow-black ring-1 ring-white/10"
              style={{
                transform: `rotate(${slides[previewIndex].rotation || 0}deg)`
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
