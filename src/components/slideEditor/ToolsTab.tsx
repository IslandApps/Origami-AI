import React from 'react';
import { Loader2, Search, Sparkles, Undo2, Wand2, X } from 'lucide-react';
import type { useBatchScriptOperations } from '../../hooks/useBatchScriptOperations';
import type { SlideData } from '../../types/slides';

interface ToolsTabProps {
  slides: SlideData[];
  generatingSlides: Set<number>;
  findText: string;
  setFindText: React.Dispatch<React.SetStateAction<string>>;
  replaceText: string;
  setReplaceText: React.Dispatch<React.SetStateAction<string>>;
  handleFindAndReplace: () => void | Promise<void>;
  batchOps: ReturnType<typeof useBatchScriptOperations>;
}

export const ToolsTab: React.FC<ToolsTabProps> = ({
  slides,
  generatingSlides,
  findText,
  setFindText,
  replaceText,
  setReplaceText,
  handleFindAndReplace,
  batchOps,
}) => {
  const {
    isBatchGenerating,
    isBatchFixing,
    batchProgress,
    handleCancelBatchGenerate,
    handleCancelBatchFix,
    handleGenerateAll,
    handleFixAllScripts,
    handleRevertAllScripts,
  } = batchOps;

  return (
    <div className="max-w-5xl w-full mx-auto h-full flex flex-col justify-center space-y-10 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="shrink-0 space-y-2">
        <h3 className="text-xl font-bold text-white flex items-center gap-3">
          Batch Tools
        </h3>
        <p className="text-base text-white/50">Apply specific actions to all slides at once.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* AI Fix */}
        <div className="relative h-full">
          <button
            onClick={handleFixAllScripts}
            disabled={isBatchFixing || isBatchGenerating || slides.length === 0}
            className="group relative w-full h-full min-h-52 p-6 rounded-3xl bg-linear-to-br from-branding-accent/10 to-transparent border border-branding-accent/20 hover:border-branding-accent/50 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-branding-accent/5 overflow-hidden"
          >
            <div className="absolute top-2 right-2 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Sparkles className="w-24 h-24" />
            </div>
            <div className="relative z-10 flex flex-col h-full space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-branding-accent/20 flex items-center justify-center">
                  {isBatchFixing ? <Loader2 className="w-5 h-5 text-branding-accent animate-spin" /> : <Sparkles className="w-5 h-5 text-branding-accent" />}
                </div>
                <h4 className="text-lg font-bold text-white">AI Script Fixer</h4>
              </div>
              <p className="text-sm text-white/60 mb-auto">Automatically rewrite all slide scripts to be more natural and engaging.</p>
              <div className="flex items-center justify-between pt-4 mt-auto">
                <div className="text-xs font-bold text-branding-accent uppercase tracking-widest">
                  {isBatchFixing ? `Processing ${batchProgress?.current || 0}/${batchProgress?.total || 0}...` : 'Start Process'}
                </div>
              </div>
            </div>
          </button>
          {isBatchFixing && (
            <button
              onClick={handleCancelBatchFix}
              className="absolute bottom-6 right-6 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-all text-[10px] font-bold uppercase tracking-wider z-10"
              title="Cancel batch AI fix"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          )}
        </div>

        {/* Generate All */}
        <div className="relative h-full">
          <button
            onClick={handleGenerateAll}
            disabled={generatingSlides.size > 0 || isBatchGenerating || slides.length === 0}
            className="group relative w-full h-full min-h-52 p-6 rounded-3xl bg-linear-to-br from-branding-primary/10 to-transparent border border-branding-primary/20 hover:border-branding-primary/50 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-branding-primary/5 overflow-hidden"
          >
            <div className="absolute top-2 right-2 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Wand2 className="w-24 h-24" />
            </div>
            <div className="relative z-10 flex flex-col h-full space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-branding-primary/20 flex items-center justify-center">
                  {isBatchGenerating ? <Loader2 className="w-5 h-5 text-branding-primary animate-spin" /> : <Wand2 className="w-5 h-5 text-branding-primary" />}
                </div>
                <h4 className="text-lg font-bold text-white">Generate All Audio</h4>
              </div>
              <p className="text-sm text-white/60 mb-auto">Generate or regenerate TTS audio for all slides sequentially.</p>
              <div className="flex items-center justify-between pt-4 mt-auto">
                <div className="text-xs font-bold text-branding-primary uppercase tracking-widest">
                  {isBatchGenerating ? `Generating ${batchProgress?.current || 0}/${batchProgress?.total || 0}...` : 'Start Process'}
                </div>
              </div>
            </div>
          </button>
          {isBatchGenerating && (
            <button
              onClick={handleCancelBatchGenerate}
              className="absolute bottom-6 right-6 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-all text-[10px] font-bold uppercase tracking-wider z-10"
              title="Cancel batch TTS generation"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          )}
        </div>

        {/* Bulk Revert */}
        <button
          onClick={handleRevertAllScripts}
          disabled={slides.filter(s => s.originalScript).length === 0}
          className="group relative w-full h-full min-h-52 p-6 rounded-3xl bg-linear-to-br from-branding-primary/10 to-transparent border border-branding-primary/20 hover:border-branding-primary/50 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-branding-primary/5 overflow-hidden"
        >
          <div className="absolute top-2 right-2 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Undo2 className="w-24 h-24" />
          </div>
          <div className="relative z-10 flex flex-col h-full space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-branding-primary/20 flex items-center justify-center">
                <Undo2 className="w-5 h-5 text-branding-primary" />
              </div>
              <h4 className="text-lg font-bold text-white">Bulk Revert Scripts</h4>
            </div>
            <p className="text-sm text-white/60 flex-1">Revert all modified scripts back to their original state at once.</p>
            <div className="text-xs font-bold text-branding-primary uppercase tracking-widest pt-2">
              {slides.filter(s => s.originalScript).length} Slide(s) Available
            </div>
          </div>
        </button>
      </div>

      {/* Find and Replace */}
      <div className="p-8 rounded-3xl bg-white/5 border border-white/10 space-y-6">
        <h4 className="text-xs font-bold text-white/70 uppercase tracking-widest flex items-center gap-3">
          <Search className="w-4 h-4" /> Find & Replace
        </h4>
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Find..."
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            className="flex-1 min-w-0 h-12 px-6 rounded-xl bg-black/20 border border-white/10 text-white text-sm focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all placeholder:text-white/30"
          />
          <input
            type="text"
            placeholder="Replace with..."
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            className="flex-1 min-w-0 h-12 px-6 rounded-xl bg-black/20 border border-white/10 text-white text-sm focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all placeholder:text-white/30"
          />
          <button
            onClick={handleFindAndReplace}
            disabled={!findText}
            className="px-8 h-12 rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Replace All
          </button>
        </div>
      </div>
    </div>
  );
};
