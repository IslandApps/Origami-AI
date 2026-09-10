import { Download, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface DownloadBlockedModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The action the user attempted, shown in the modal body. */
  actionLabel?: string;
}

export function DownloadBlockedModal({ isOpen, onClose, actionLabel }: DownloadBlockedModalProps) {
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (isOpen) {
      setIsRendered(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setIsVisible(true)));
    } else {
      setIsVisible(false);
      timerRef.current = setTimeout(() => setIsRendered(false), 300);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen]);

  if (!isRendered) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center p-4 transition-all duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div
        className={`relative w-full max-w-md bg-[#1b222e] border border-blue-400/60 rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-hidden transform transition-all duration-300 ${isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-6'}`}
        style={{ fontFamily: '"Roboto", "Inter", system-ui, -apple-system, sans-serif' }}
      >
        <div className="h-1.5 bg-blue-400" />

        {/* Header */}
        <div className="flex items-start gap-3 px-4 py-4 bg-[#222d3e] border-b border-slate-600/60">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0 bg-blue-400/20 text-blue-200">
            <Download className="w-5 h-5" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-base font-bold text-slate-100 leading-6">Downloads in progress</span>
            <span className="mt-1 text-xs leading-5 text-slate-300">One-time setup • preparing your tools</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:text-slate-100 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-start gap-3 text-sm">
            <Loader2 className="w-4 h-4 text-blue-300 motion-safe:animate-spin shrink-0 mt-0.5" />
            <p className="text-slate-100 leading-relaxed">
              {actionLabel
                ? <><span className="font-semibold">{actionLabel}</span> requires resources that are still being downloaded.</>
                : <>This feature requires resources that are still being downloaded.</>}
              {' '}Please wait for the setup to finish before trying again.
            </p>
          </div>

          <div className="rounded-xl bg-white/5 border border-slate-600/60 px-4 py-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              You can monitor the download progress in the{' '}
              <span className="text-slate-100 font-medium">Downloading resources…</span>{' '}
              notification in the bottom-right corner of the screen. This is a one-time download — it will be much faster on subsequent visits.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-blue-400 hover:bg-blue-300 text-[#0d1119] text-sm font-bold transition-all shadow-lg shadow-blue-400/20 hover:scale-[1.02] active:scale-95"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
