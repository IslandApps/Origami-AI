import React from 'react';
import { Clock, Library, Music, Play, Repeat, Speech, Square, Trash2, Upload } from 'lucide-react';
import type { useMusicPlayer } from '../../hooks/useMusicPlayer';
import type { MusicSettings } from '../../types/slides';
import type { GlobalSettings } from '../../services/storage';

interface MixingTabProps {
  ttsVolume?: number;
  onUpdateTtsVolume?: (volume: number) => void;
  globalDelay: number;
  setGlobalDelay: React.Dispatch<React.SetStateAction<number>>;
  onUpdateGlobalSettings?: (settings: Partial<GlobalSettings>) => void;
  handleApplyGlobalDelay: () => void | Promise<void>;
  musicSettings: MusicSettings;
  onUpdateMusicSettings: (settings: MusicSettings) => void;
  musicPlayer: ReturnType<typeof useMusicPlayer>;
}

export const MixingTab: React.FC<MixingTabProps> = ({
  ttsVolume,
  onUpdateTtsVolume,
  globalDelay,
  setGlobalDelay,
  onUpdateGlobalSettings,
  handleApplyGlobalDelay,
  musicSettings,
  onUpdateMusicSettings,
  musicPlayer,
}) => {
  const {
    fileInputRef,
    musicAudioRef,
    isMusicPlaying,
    musicCurrentTime,
    musicDuration,
    visualizerCanvasRef,
    setShowMusicPicker,
    handleMusicUpload,
    toggleMusicPlayback,
    formatTime,
    handleMusicSeek,
    handleMusicSeekStart,
    handleMusicSeekEnd,
    handleRemoveMusic,
  } = musicPlayer;

  return (
    <div className="max-w-7xl w-full mx-auto h-full flex flex-col space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="shrink-0 space-y-2">
        <h3 className="text-xl font-bold text-white flex items-center gap-3">
          <Music className="w-6 h-6" />
          Audio Mixing
        </h3>
        <p className="text-base text-white/50">Control global volume levels and background music.</p>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="flex flex-col gap-8 h-full">
          {/* TTS Volume */}
          <div className="flex-1 space-y-4 p-8 rounded-3xl bg-white/5 border border-white/10 flex flex-col justify-center">
            <label className="text-xs font-bold text-white/60 uppercase tracking-widest flex items-center gap-3">
              <Speech className="w-4 h-4" /> Narrator Volume
            </label>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <span className="text-4xl font-light text-white">{Math.round((ttsVolume ?? 1) * 50)}%</span>
                {ttsVolume !== 1 && (
                  <button onClick={() => onUpdateTtsVolume?.(1)} className="text-xs text-branding-primary hover:underline font-bold uppercase tracking-wider">Reset</button>
                )}
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={ttsVolume ?? 1}
                onChange={(e) => onUpdateTtsVolume?.(parseFloat(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-black/20 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-branding-primary [&::-webkit-slider-thumb]:hover:scale-110"
                style={{ background: `linear-gradient(to right, var(--branding-primary-hex, #00f0ff) ${((ttsVolume ?? 1) / 2) * 100}%, rgba(0, 0, 0, 0.2) ${((ttsVolume ?? 1) / 2) * 100}%)` }}
              />
            </div>
          </div>

          {/* Global Delay */}
          <div className="flex-1 space-y-4 p-8 rounded-3xl bg-white/5 border border-white/10 flex flex-col justify-center">
            <label className="text-xs font-bold text-white/60 uppercase tracking-widest flex items-center gap-3">
              <Clock className="w-4 h-4" /> Slide Pacing
            </label>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={globalDelay}
                    onChange={(e) => { const val = parseFloat(e.target.value) || 0; setGlobalDelay(val); onUpdateGlobalSettings?.({ delay: val }); }}
                    className="w-full h-14 px-6 rounded-xl bg-black/20 border border-white/10 text-white text-base focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all pr-12"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/40 font-bold">SEC</span>
                </div>
                <button onClick={handleApplyGlobalDelay} className="px-6 h-14 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 hover:text-white text-xs font-bold uppercase tracking-wider transition-all">
                  Apply
                </button>
              </div>
              <p className="text-xs text-white/40 leading-relaxed">
                Amount of silence added after each slide's narration finishes.
              </p>
            </div>
          </div>
        </div>

        {/* Background Music */}
        <div className="h-full space-y-4 p-8 rounded-3xl bg-white/5 border border-white/10 flex flex-col justify-center">
          <div className="flex items-center justify-between shrink-0 mb-4">
            <label className="text-xs font-bold text-white/60 uppercase tracking-widest flex items-center gap-3">
              <Music className="w-4 h-4" /> Background Music
            </label>
            {musicSettings.url && (
              <button onClick={handleRemoveMusic} className="text-red-400 hover:text-red-300 transition-colors p-2 hover:bg-red-500/10 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex-1 flex flex-col justify-center space-y-6">
            <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleMusicUpload} />

            {/* Volume Control - ALWAYS VISIBLE */}
            <div className="space-y-4" title="Adjust background music volume">
              <div className="flex justify-between items-center text-xs font-bold text-white/60 uppercase">
                <span>Music Volume</span>
                <span>{Math.round(Math.sqrt(musicSettings.volume || 0.16) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.001"
                value={Math.sqrt(musicSettings.volume || 0.16)}
                onChange={(e) => {
                  const newVol = parseFloat(e.target.value);
                  const squaredVol = newVol * newVol;
                  onUpdateMusicSettings({ ...musicSettings, volume: squaredVol });
                  if (musicAudioRef.current) musicAudioRef.current.volume = squaredVol;
                }}
                style={{
                  background: `linear-gradient(to right, hsl(var(--branding-primary)) 0%, hsl(var(--branding-primary)) ${Math.round(Math.sqrt(musicSettings.volume || 0.16) * 100)}%, rgba(255,255,255,0.1) ${Math.round(Math.sqrt(musicSettings.volume || 0.16) * 100)}%, rgba(255,255,255,0.1) 100%)`
                }}
                className="w-full h-2 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-branding-primary [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-runnable-track]:w-full [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:border [&::-webkit-slider-runnable-track]:border-white/20 [&::-moz-range-track]:w-full [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:border [&::-moz-range-track]:border-white/20"
              />
            </div>

            {/* Music Selection or Track Info */}
            {!musicSettings.url ? (
              <div className="space-y-4">
                <button onClick={() => setShowMusicPicker(true)} className="w-full h-16 rounded-2xl bg-branding-primary/10 border border-branding-primary/30 hover:bg-branding-primary/20 hover:border-branding-primary/50 text-branding-primary text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-3" title="Choose from royalty-free music">
                  <Library className="w-5 h-5" /> Browse Music Library
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="w-full h-16 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 hover:text-white text-white/50 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-3" title="Upload your own audio file">
                  <Upload className="w-5 h-5" /> Upload Custom Track
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="relative p-8 rounded-2xl bg-black/20 border border-white/5 text-center overflow-hidden">
                  {/* Audio Visualizer Background */}
                  {isMusicPlaying && (
                    <canvas
                      ref={visualizerCanvasRef}
                      width={800}
                      height={96}
                      className="absolute inset-0 w-full h-full"
                    />
                  )}

                  {/* Track Info Overlay */}
                  <div className="relative z-10">
                    <Music className="w-12 h-12 text-white/20 mx-auto mb-4" />
                    <p className="text-lg font-medium text-white/90 truncate">{musicSettings.title || 'Unknown Track'}</p>
                  </div>
                </div>

                {/* Seek Slider */}
                {musicDuration > 0 && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs font-bold text-white/40 uppercase">
                      <span>Progress</span>
                      <span>{formatTime(musicCurrentTime)} / {formatTime(musicDuration)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={musicDuration || 1}
                      step="0.1"
                      value={musicCurrentTime}
                      onChange={handleMusicSeek}
                      onMouseDown={handleMusicSeekStart}
                      onMouseUp={handleMusicSeekEnd}
                      onTouchStart={handleMusicSeekStart}
                      onTouchEnd={handleMusicSeekEnd}
                      style={{
                        background: `linear-gradient(to right, hsl(var(--branding-primary)) 0%, hsl(var(--branding-primary)) ${((musicCurrentTime / (musicDuration || 1)) * 100)}%, rgba(255,255,255,0.1) ${((musicCurrentTime / (musicDuration || 1)) * 100)}%, rgba(255,255,255,0.1) 100%)`
                      }}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-branding-primary [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-runnable-track]:w-full [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:border [&::-webkit-slider-runnable-track]:border-white/20 [&::-moz-range-track]:w-full [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:border [&::-moz-range-track]:border-white/20"
                    />
                  </div>
                )}

                <div className="flex items-center gap-6">
                  <button onClick={toggleMusicPlayback} className="w-14 h-14 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0">
                    {isMusicPlaying ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                  </button>
                  <button
                    onClick={() => onUpdateMusicSettings({ ...musicSettings, loop: !(musicSettings.loop ?? true) })}
                    className={`flex-1 py-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-3 ${(musicSettings.loop ?? true) ? 'bg-branding-primary/10 text-branding-primary' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                  >
                    <Repeat className="w-4 h-4" /> {(musicSettings.loop ?? true) ? 'Looping' : 'Not Looping'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
