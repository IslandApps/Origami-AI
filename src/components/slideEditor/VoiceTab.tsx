import React from 'react';
import { Loader2, Mic, Play, Square } from 'lucide-react';
import { Dropdown } from '../Dropdown';
import type { Voice } from '../../services/ttsService';
import type { GlobalSettings } from '../../services/storage';

interface VoiceTabProps {
  voices: Voice[];
  globalVoice: string;
  setGlobalVoice: React.Dispatch<React.SetStateAction<string>>;
  onUpdateGlobalSettings?: (settings: Partial<GlobalSettings>) => void;
  isGlobalPreviewPlaying: boolean;
  isGlobalPreviewGenerating: boolean;
  handleGlobalPreview: () => void | Promise<void>;
  handleApplyGlobalVoice: () => void | Promise<void>;
}

export const VoiceTab: React.FC<VoiceTabProps> = ({
  voices,
  globalVoice,
  setGlobalVoice,
  onUpdateGlobalSettings,
  isGlobalPreviewPlaying,
  isGlobalPreviewGenerating,
  handleGlobalPreview,
  handleApplyGlobalVoice,
}) => {
  return (
    <div className="max-w-4xl w-full mx-auto h-full flex flex-col space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 shrink-0">
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white flex items-center gap-3">
            <Mic className="w-6 h-6" />
            Voice Configuration
          </h3>
          <p className="text-base text-white/50 leading-relaxed">Choose the narrator voice for all slides.</p>
        </div>
        {/* Hybrid Toggle */}

      </div>

      <div className="flex-1 space-y-6 sm:space-y-8 p-4 sm:p-6 md:p-10 rounded-3xl bg-white/5 border border-white/10 flex flex-col justify-center">
        <div className="space-y-3">
          <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Select Voice</label>
          <Dropdown
            options={voices}
            value={globalVoice}
            onChange={(val) => { setGlobalVoice(val); onUpdateGlobalSettings?.({ voice: val }); }}
            className="h-14 text-base px-6"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 pt-4">
          <button onClick={handleGlobalPreview} disabled={isGlobalPreviewGenerating} className={`flex-1 h-12 sm:h-14 rounded-xl font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-3 ${isGlobalPreviewPlaying ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : isGlobalPreviewGenerating ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 hover:text-white'}`} title="Listen to the selected voice">
            {isGlobalPreviewGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : isGlobalPreviewPlaying ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />} {isGlobalPreviewGenerating ? 'Generating...' : isGlobalPreviewPlaying ? 'Stop' : 'Preview Voice'}
          </button>
          <button onClick={handleApplyGlobalVoice} className="flex-1 h-12 sm:h-14 rounded-xl bg-branding-primary/20 border border-branding-primary/30 hover:bg-branding-primary/30 text-white font-bold text-sm uppercase tracking-wider transition-all">
            Apply to All Slides
          </button>
        </div>
      </div>
    </div>
  );
};
