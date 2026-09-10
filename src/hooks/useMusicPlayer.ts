import React, { useRef } from 'react';
import type { IncompetechCachedTrack } from '../types/music';
import type { MusicSettings } from '../types/slides';

/**
 * Background music playback + a Web Audio frequency visualizer, plus the Incompetech
 * track-picker state. `isMixingTabActive` gates auto-pause: playback stops the moment the
 * caller navigates away from the tab that shows the player UI.
 */
export function useMusicPlayer(
  musicSettings: MusicSettings,
  onUpdateMusicSettings: (settings: MusicSettings) => void,
  isMixingTabActive: boolean,
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = React.useState(false);
  const [musicCurrentTime, setMusicCurrentTime] = React.useState(0);
  const [musicDuration, setMusicDuration] = React.useState(0);
  const [isMusicDragging, setIsMusicDragging] = React.useState(false);

  // Audio Visualizer State
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // Music Picker State
  const [showMusicPicker, setShowMusicPicker] = React.useState(false);
  const [incompetechTrack, setIncompetechTrack] = React.useState<IncompetechCachedTrack | null>(null);

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setIncompetechTrack(null); // Clear incompetech track when uploading
      onUpdateMusicSettings({ ...musicSettings, url, blob: undefined, volume: musicSettings.volume || 0.16, title: file.name });
    }
  };

  const handleSelectIncompetechTrack = (track: IncompetechCachedTrack) => {
    const url = URL.createObjectURL(track.blob);
    setIncompetechTrack(track);
    onUpdateMusicSettings({
      ...musicSettings,
      url,
      blob: track.blob,
      volume: musicSettings.volume || 0.16,
      title: track.title
    });
    setShowMusicPicker(false);
  };

  const toggleMusicPlayback = () => {
    if (isMusicPlaying && musicAudioRef.current) {
      musicAudioRef.current.pause();
      setIsMusicPlaying(false);
      stopVisualizer();
    } else if (musicSettings.url) {
      const audio = new Audio(musicSettings.url);
      audio.volume = musicSettings.volume;
      audio.loop = musicSettings.loop ?? true;
      audio.crossOrigin = "anonymous";
      audio.onloadedmetadata = () => {
        setMusicDuration(audio.duration);
        setMusicCurrentTime(audio.currentTime);
      };
      audio.onended = () => {
        setIsMusicPlaying(false);
        stopVisualizer();
      };
      audio.play().then(() => {
        setIsMusicPlaying(true);
        // Setup visualizer after audio starts playing
        setTimeout(() => setupAudioVisualizer(audio), 100);
      }).catch(e => {
        console.error("Music playback failed", e);
        setIsMusicPlaying(false);
        stopVisualizer();
      });
      musicAudioRef.current = audio;
    }
  };

  const setupAudioVisualizer = (audio: HTMLAudioElement) => {
    if (!visualizerCanvasRef.current) {
      console.warn('[Visualizer] Canvas not ready');
      return;
    }

    // Clean up any existing audio context
    stopVisualizer();

    // Set canvas size to match display size
    const canvas = visualizerCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;

    try {
      // Create Audio Context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128; // Fewer bars for background effect (64 bars)

      // Connect audio element to analyser
      const source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;

      // Start visualization
      drawVisualizer();
    } catch (e) {
      console.error('[Visualizer] Failed to setup audio visualizer:', e);
    }
  };

  const stopVisualizer = () => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  // Stop background music when switching away from the mixing tab
  React.useEffect(() => {
    if (!isMixingTabActive && isMusicPlaying) {
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
        musicAudioRef.current.currentTime = 0;
      }
      setIsMusicPlaying(false);
      stopVisualizer();
    }
  }, [isMixingTabActive, isMusicPlaying]);

  const drawVisualizer = () => {
    if (!analyserRef.current || !visualizerCanvasRef.current) return;

    const canvas = visualizerCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      if (!analyserRef.current || !canvas) return;

      animationRef.current = requestAnimationFrame(renderFrame);

      analyserRef.current.getByteFrequencyData(dataArray);

      // Clear canvas with transparent background
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Use only the lower 2/3 of frequency spectrum (where most music energy is)
      // and scale it to fill the entire canvas width
      const usableBins = Math.floor(bufferLength * 0.6); // Use first 60% of bins
      const barCount = usableBins;
      const totalGapWidth = barCount * 1;
      const barWidth = (canvas.width - totalGapWidth) / barCount;

      let barHeight;
      let x = 0;

      for (let i = 0; i < usableBins; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;

        // Vibrant gradient for visibility
        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(0, 240, 255, 0.8)');
        gradient.addColorStop(0.5, 'rgba(0, 240, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(0, 240, 255, 0.2)');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    renderFrame();
  };

  // Cleanup visualizer on unmount
  React.useEffect(() => {
    return () => {
      stopVisualizer();
    };
  }, []);

  // Handle window resize for canvas
  React.useEffect(() => {
    if (!visualizerCanvasRef.current) return;

    const resizeCanvas = () => {
      if (visualizerCanvasRef.current) {
        const canvas = visualizerCanvasRef.current;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
      }
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(visualizerCanvasRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  React.useEffect(() => {
    return () => {
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
      }
      // Reset playback state when URL changes
      setMusicCurrentTime(0);
      setMusicDuration(0);
      setIsMusicPlaying(false);
    }
  }, [musicSettings.url]);

  React.useEffect(() => {
    if (musicAudioRef.current) {
      musicAudioRef.current.loop = musicSettings.loop ?? true;
    }
  }, [musicSettings.loop]);

  // Format time for display (seconds to mm:ss)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Music seek handler
  const handleMusicSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setMusicCurrentTime(newTime);
    if (musicAudioRef.current) {
      musicAudioRef.current.currentTime = newTime;
    }
  };

  const handleMusicSeekStart = () => {
    setIsMusicDragging(true);
  };

  const handleMusicSeekEnd = () => {
    setIsMusicDragging(false);
  };

  // Update music playback time
  React.useEffect(() => {
    if (!musicAudioRef.current || !isMusicPlaying) {
      return;
    }

    const audio = musicAudioRef.current;

    // Set up timeupdate listener
    const handleTimeUpdate = () => {
      if (!isMusicDragging) {
        setMusicCurrentTime(audio.currentTime);
      }
    };

    // Set up loadedmetadata listener to get duration
    const handleLoadedMetadata = () => {
      setMusicDuration(audio.duration);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    // Set initial duration if already loaded
    if (audio.readyState >= 1) {
      setMusicDuration(audio.duration);
      setMusicCurrentTime(audio.currentTime);
    }

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [isMusicPlaying, isMusicDragging]);

  const handleRemoveMusic = () => {
    setIncompetechTrack(null); // Clear incompetech track
    onUpdateMusicSettings({ ...musicSettings, url: undefined, blob: undefined, title: undefined });
    if (isMusicPlaying && musicAudioRef.current) {
      musicAudioRef.current.pause();
      setIsMusicPlaying(false);
      stopVisualizer();
    }
  };

  return {
    fileInputRef,
    musicAudioRef,
    isMusicPlaying,
    musicCurrentTime,
    musicDuration,
    visualizerCanvasRef,
    showMusicPicker,
    setShowMusicPicker,
    incompetechTrack,
    handleMusicUpload,
    handleSelectIncompetechTrack,
    toggleMusicPlayback,
    formatTime,
    handleMusicSeek,
    handleMusicSeekStart,
    handleMusicSeekEnd,
    handleRemoveMusic,
  };
}
