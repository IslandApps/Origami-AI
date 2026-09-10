import { Cpu, KeyRound, ArrowRight } from 'lucide-react';

export interface AiModeChoiceModalProps {
  isOpen: boolean;
  onSelectWebLLM: () => void;
  onSelectBYOK: () => void;
  onSkip: () => void;
}

export function AiModeChoiceModal({ isOpen, onSelectWebLLM, onSelectBYOK, onSkip }: AiModeChoiceModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-mode-choice-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-250"
    >
      {/* Deep frosted backdrop */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md" />

      {/* Modal Container */}
      <div
        className="relative w-full max-w-2xl my-auto bg-[#0d111a]/95 border border-white/10 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_35px_rgba(34,211,238,0.06)] overflow-hidden backdrop-blur-xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-250"
        style={{ fontFamily: '"Roboto", "Inter", system-ui, -apple-system, sans-serif' }}
      >
        {/* Top ambient luminescent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/60 via-blue-500/40 to-transparent" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-36 bg-cyan-500/10 blur-3xl pointer-events-none rounded-full" />

        {/* Header */}
        <div className="relative px-5 sm:px-6 pt-5 sm:pt-6 pb-4 text-center">
          <h2 id="ai-mode-choice-title" className="text-xl sm:text-[1.35rem] font-bold text-white tracking-tight leading-tight">
            Choose your AI text engine
          </h2>
          <p className="text-xs sm:text-sm text-white/50 mt-1.5 max-w-md mx-auto">
            Origami writes narration scripts and drives the assistant with AI. Pick where that generation happens.
          </p>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Options */}
        <div className="relative px-5 sm:px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* On-device WebGPU/WebLLM */}
          <button
            onClick={onSelectWebLLM}
            className="group text-left p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-cyan-400/40 transition-all flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400">
                <Cpu className="w-4.5 h-4.5" />
              </div>
              <span className="text-[9.5px] font-bold uppercase tracking-wide text-emerald-300 bg-emerald-500/10 border border-emerald-400/25 rounded-full px-2 py-0.5 shrink-0">
                No key required
              </span>
            </div>
            <div>
              <div className="text-sm font-semibold text-white/95 flex items-center gap-1.5">
                On-Device AI
                <ArrowRight className="w-3.5 h-3.5 text-cyan-400 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
              </div>
              <div className="text-[11.5px] text-white/50 leading-relaxed mt-1">
                Runs a local model in your browser via WebGPU/WebLLM. Private, free, no account needed. Requires a reasonably modern GPU.
              </div>
            </div>
          </button>

          {/* BYOK */}
          <button
            onClick={onSelectBYOK}
            className="group text-left p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-violet-400/40 transition-all flex flex-col gap-3"
          >
            <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-400/20 flex items-center justify-center text-violet-400">
              <KeyRound className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white/95 flex items-center gap-1.5">
                Bring Your Own Key
                <ArrowRight className="w-3.5 h-3.5 text-violet-400 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
              </div>
              <div className="text-[11.5px] text-white/50 leading-relaxed mt-1">
                Use your own cloud LLM API key instead. Faster and works on any device, but requests leave your browser.
              </div>
            </div>
          </button>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Footer */}
        <div className="relative px-5 sm:px-6 py-3.5 flex items-center justify-between gap-3.5 bg-black/30">
          <p className="text-[11px] text-white/35">
            Voice narration and video rendering download either way.
          </p>
          <button
            onClick={onSkip}
            className="text-[11px] text-white/25 hover:text-white/45 transition-colors cursor-pointer underline decoration-dotted underline-offset-2 shrink-0"
          >
            Decide later
          </button>
        </div>
      </div>
    </div>
  );
}
