import { useState, useEffect } from 'react';
import { AlertTriangle, ArrowRight, Check, MonitorSmartphone } from 'lucide-react';

export interface OsWarningModalProps {
  isOpen: boolean;
  osName: string;
  onConfirm: (dontShowAgain: boolean) => void;
}

export function OsWarningModal({ isOpen, osName, onConfirm }: OsWarningModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(isOpen);

  // Sync state with props during render
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setDontShowAgain(false);
      setIsClosing(false);
    } else {
      setIsClosing(true);
    }
  }

  useEffect(() => {
    if (isClosing) {
      const timer = setTimeout(() => setIsClosing(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isClosing]);

  // Derived visibility state to avoid cascading renders
  const isVisible = isOpen || isClosing;

  if (!isVisible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="os-warning-title"
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 transition-all duration-250 ease-out overflow-y-auto ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Deep frosted backdrop */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-250" />

      {/* Modal Container */}
      <div
        className={`relative w-full max-w-[34rem] my-auto bg-[#0d111a]/95 border border-white/10 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_35px_rgba(245,158,11,0.06)] overflow-hidden transition-all duration-250 ease-out backdrop-blur-xl ${
          isOpen ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-2 opacity-0'
        }`}
        style={{
          fontFamily: '"Roboto", "Inter", system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Top ambient luminescent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/60 via-orange-500/40 to-transparent" />

        {/* Ambient soft glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-36 bg-amber-500/10 blur-3xl pointer-events-none rounded-full" />

        {/* Header */}
        <div className="relative px-5 sm:px-6 pt-5 sm:pt-6 pb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-transparent border border-amber-400/30 shadow-[0_0_20px_rgba(245,158,11,0.15)] shrink-0">
              <div className="absolute inset-0 rounded-xl bg-amber-400/5 blur-sm" />
              <AlertTriangle className="relative w-6 h-6 text-amber-400 drop-shadow" />
            </div>

            <div>
              <h2 id="os-warning-title" className="text-xl sm:text-[1.35rem] font-bold text-white tracking-tight leading-tight">
                Non-Windows OS detected
              </h2>
              <p className="text-xs text-white/50 mt-0.5">
                Extra configuration may be required
              </p>
            </div>
          </div>
        </div>

        {/* Crease divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Body Content */}
        <div className="relative px-5 sm:px-6 py-4 space-y-3.5">
          <p className="text-[13px] text-white/70 leading-relaxed">
            We detected you're running <strong className="text-white font-medium">{osName}</strong>. Origami's on-device pipeline (WebGPU, local TTS, and FFmpeg WASM rendering) is primarily tuned and tested on Windows, and may require additional configuration or special GPU drivers to work properly on this platform.
          </p>

          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-400/20 flex items-center justify-center shrink-0 text-amber-400">
                <MonitorSmartphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white/95">For the smoothest experience</div>
                <div className="text-[11px] text-white/50 truncate">We recommend using a Windows machine</div>
              </div>
            </div>
          </div>

          {/* Notice */}
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-500/[0.06] border border-amber-500/15 text-[12px] text-amber-200/90 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              You can still <strong className="text-white font-medium">continue on this OS</strong> — some features like WebGPU acceleration or driver-dependent rendering may behave differently.
            </span>
          </div>
        </div>

        {/* Crease divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Footer */}
        <div className="relative px-5 sm:px-6 py-4 flex flex-col-reverse sm:flex-row items-center justify-between gap-3.5 bg-black/30">
          <label className="flex items-center gap-2.5 cursor-pointer group select-none text-left w-full sm:w-auto">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="peer sr-only"
              />
              <div className="w-4 h-4 rounded border border-white/20 bg-white/5 peer-checked:bg-amber-500 peer-checked:border-amber-400 flex items-center justify-center transition-all group-hover:border-white/40">
                {dontShowAgain && <Check className="w-3 h-3 text-black stroke-[3]" />}
              </div>
            </div>
            <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors">
              Don't show this warning again
            </span>
          </label>

          <button
            onClick={() => onConfirm(dontShowAgain)}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm shadow-[0_0_20px_rgba(245,158,11,0.25)] hover:shadow-[0_0_25px_rgba(245,158,11,0.4)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group cursor-pointer"
          >
            <span>Continue Anyway</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
