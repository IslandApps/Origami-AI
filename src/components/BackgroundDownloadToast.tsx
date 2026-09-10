import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Download, Loader2 } from 'lucide-react';
import { ttsEvents, type ProgressEventDetail } from '../services/ttsService';
import { videoEvents } from '../services/BrowserVideoRenderer';
import { webLlmEvents } from '../services/webLlmService';
import type { InitProgressReport } from '@mlc-ai/web-llm';

interface BackgroundDownloadToastProps {
  active: boolean;
  queue: { tts: boolean; ffmpeg: boolean; webllm: boolean };
}

type ResourceState = 'pending' | 'active' | 'ready';

const RESOURCE_LABELS: Record<'tts' | 'ffmpeg' | 'webllm', string> = {
  tts: 'Voice narration',
  ffmpeg: 'Video renderer',
  webllm: 'AI assistant',
};

export function BackgroundDownloadToast({ active, queue }: BackgroundDownloadToastProps) {
  const [dismissed, setDismissed] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [status, setStatus] = useState<Record<'tts' | 'ffmpeg' | 'webllm', ResourceState>>({
    tts: 'pending',
    ffmpeg: 'pending',
    webllm: 'pending',
  });
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!active) return;

    setDismissed(false);
    setStatus({
      tts: queue.tts ? 'active' : 'ready',
      ffmpeg: queue.ffmpeg ? 'pending' : 'ready',
      webllm: queue.webllm ? 'pending' : 'ready',
    });
    setPercent(0);

    const handleTTSProgress = (e: Event) => {
      const detail = (e as CustomEvent<ProgressEventDetail>).detail;
      setStatus(prev => ({ ...prev, tts: 'active' }));
      setPercent(Math.round(detail.progress));
    };
    const handleTTSComplete = () => {
      setStatus(prev => ({ ...prev, tts: 'ready' }));
      setPercent(0);
    };

    const handleVideoProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ status: string }>).detail;
      if (detail.status === 'FFmpeg ready') {
        setStatus(prev => ({ ...prev, ffmpeg: 'ready' }));
        setPercent(0);
      } else {
        setStatus(prev => ({ ...prev, ffmpeg: 'active' }));
      }
    };

    const handleWebLLMProgress = (e: Event) => {
      const report = (e as CustomEvent<InitProgressReport>).detail;
      const normalized = report.progress > 1 ? report.progress / 100 : report.progress;
      setStatus(prev => ({ ...prev, webllm: 'active' }));
      setPercent(Math.round(Math.max(0, Math.min(1, normalized)) * 100));
    };
    const handleWebLLMComplete = () => {
      setStatus(prev => ({ ...prev, webllm: 'ready' }));
      setPercent(0);
    };

    ttsEvents.addEventListener('tts-progress', handleTTSProgress);
    ttsEvents.addEventListener('tts-init-complete', handleTTSComplete);
    videoEvents.addEventListener('video-progress', handleVideoProgress);
    webLlmEvents.addEventListener('webllm-init-progress', handleWebLLMProgress);
    webLlmEvents.addEventListener('webllm-init-complete', handleWebLLMComplete);

    return () => {
      ttsEvents.removeEventListener('tts-progress', handleTTSProgress);
      ttsEvents.removeEventListener('tts-init-complete', handleTTSComplete);
      videoEvents.removeEventListener('video-progress', handleVideoProgress);
      webLlmEvents.removeEventListener('webllm-init-progress', handleWebLLMProgress);
      webLlmEvents.removeEventListener('webllm-init-complete', handleWebLLMComplete);
    };
  }, [active, queue.tts, queue.ffmpeg, queue.webllm]);

  if (!active || dismissed) return null;

  const activeKey = (['tts', 'ffmpeg', 'webllm'] as const).find(key => queue[key] && status[key] === 'active');
  const allReady = (['tts', 'ffmpeg', 'webllm'] as const).every(key => !queue[key] || status[key] === 'ready');

  return (
    <>
      <div
        aria-hidden="true"
        className="download-toast-backdrop pointer-events-none fixed inset-0 z-[49] bg-black/45 opacity-0"
      />
    <div
      className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] sm:bottom-6 sm:right-6 sm:w-96 bg-[#1b222e] border border-blue-400/60 rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-hidden download-toast-attention"
      style={{ fontFamily: '"Roboto", "Inter", system-ui, -apple-system, sans-serif' }}
    >
      <div className={`h-1.5 ${allReady ? 'bg-emerald-400' : 'bg-blue-400'}`} />
      <div className="flex items-start gap-3 px-4 py-4 bg-[#222d3e] border-b border-slate-600/60">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${allReady ? 'bg-emerald-400/15 text-emerald-300' : 'bg-blue-400/20 text-blue-200'}`}>
          {allReady ? <CheckCircle2 className="w-5 h-5" /> : <Download className="w-5 h-5" />}
        </div>
        <div className="flex flex-col flex-1 min-w-0" role="status" aria-live="polite">
          <span className="text-base font-bold text-slate-100 leading-6">
            {allReady ? 'Setup complete' : 'Downloading resources…'}
          </span>
          <span className="mt-1 text-xs leading-5 text-slate-300">
            {allReady ? 'Your resources are ready to use.' : 'One-time setup • preparing your tools'}
          </span>
        </div>
        <button
          onClick={() => setMinimized(prev => !prev)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:text-slate-100 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 transition-colors shrink-0"
          aria-label={minimized ? 'Expand download details' : 'Minimize download details'}
          aria-expanded={!minimized}
          aria-controls="background-download-details"
        >
          {minimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {!minimized && (
        <>
          <div id="background-download-details" className="px-4 py-4 space-y-3">
            {(['tts', 'ffmpeg', 'webllm'] as const).filter(key => queue[key]).map((key) => (
              <div key={key} className="flex items-center gap-3 text-sm">
                {status[key] === 'ready' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : status[key] === 'active' ? (
                  <Loader2 className="w-4 h-4 text-blue-300 motion-safe:animate-spin shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-slate-400 shrink-0" />
                )}
                <span className={status[key] === 'ready' ? 'text-slate-300' : 'text-slate-100'}>
                  {RESOURCE_LABELS[key]}
                </span>
                {key === activeKey && (
                  <span className="ml-auto rounded-md bg-blue-400/15 px-2 py-1 font-mono text-xs font-bold tabular-nums text-blue-200">{percent}%</span>
                )}
              </div>
            ))}
          </div>

        </>
      )}

      {activeKey && !allReady && (
        <div
          className="h-2 bg-slate-700"
          role="progressbar"
          aria-label={`${RESOURCE_LABELS[activeKey]} download progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="h-full bg-blue-400 motion-safe:transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
    </>
  );
}
