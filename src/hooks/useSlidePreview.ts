import React, { useRef } from 'react';
import { generateTTS } from '../services/ttsService';
import type { SlideData } from '../types/slides';
import type { useModal } from '../context/ModalContext';

type ShowAlert = ReturnType<typeof useModal>['showAlert'];

/**
 * Slide preview modal state (per-slide TTS playback + zoom-following video preview) plus the
 * global voice preview played by the Voice tab. Returns the raw state/setters/refs the preview
 * JSX still wires up directly (video time/seek, ZoomTimelineEditor handlers).
 */
export function useSlidePreview(
  slides: SlideData[],
  ttsVolume: number | undefined,
  globalVoice: string,
  showAlert: ShowAlert,
) {
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null);
  const [isPreviewTTSPlaying, setIsPreviewTTSPlaying] = React.useState(false);
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const [previewVideoTime, setPreviewVideoTime] = React.useState(0);
  const [previewVideoDuration, setPreviewVideoDuration] = React.useState(1);
  const previewVideoRef = React.useRef<HTMLVideoElement>(null);

  const previewZoomStyle = React.useMemo(() => {
    if (previewIndex === null || !slides[previewIndex]) return {};
    const slide = slides[previewIndex];
    if (slide.type !== 'video' || !slide.zooms || slide.zooms.length === 0) return {};

    // Find the most recently-started zoom keyframe at or before the current time.
    // A zoom persists from its start until the NEXT zoom begins (not just its duration).
    const sorted = [...slide.zooms].sort((a, b) => a.timestampStartSeconds - b.timestampStartSeconds);
    const z = sorted.filter(k => k.timestampStartSeconds <= previewVideoTime).pop();

    if (!z) return { transform: 'scale(1)', transition: 'transform 0.3s ease-out' };

    let tx = z.targetX ?? 0.5;
    let ty = z.targetY ?? 0.5;

    if (z.type === 'cursor' && slide.cursorTrack && slide.cursorTrack.length > 0) {
      const cp = slide.cursorTrack.find(c => c.timeMs / 1000 >= previewVideoTime) || slide.cursorTrack[slide.cursorTrack.length - 1];
      tx = cp.x;
      ty = cp.y;
    }

    return {
      transform: `scale(${z.zoomLevel})`,
      transformOrigin: `${tx * 100}% ${ty * 100}%`,
      transition: 'transform 1.0s cubic-bezier(0.25, 1, 0.5, 1), transform-origin 0.5s ease-out'
    };
  }, [previewIndex, slides, previewVideoTime]);

  // Global Preview for Sidebar
  const [isGlobalPreviewPlaying, setIsGlobalPreviewPlaying] = React.useState(false);
  const [globalPreviewAudio, setGlobalPreviewAudio] = React.useState<HTMLAudioElement | null>(null);
  const [isGlobalPreviewGenerating, setIsGlobalPreviewGenerating] = React.useState(false);
  const globalAudioContextRef = useRef<AudioContext | null>(null);
  const globalGainNodeRef = useRef<GainNode | null>(null);

  const handleGlobalPreview = async () => {
    if (isGlobalPreviewPlaying && globalPreviewAudio) {
      globalPreviewAudio.pause();
      setIsGlobalPreviewPlaying(false);
      return;
    }

    try {
      setIsGlobalPreviewGenerating(true);
      setIsGlobalPreviewPlaying(true);
      const text = "Hello! This is a sample of how I sound. I hope you enjoy listening to my voice. Thank you for choosing me!";

      const audioUrl = await generateTTS(text, {
        voice: globalVoice,
        speed: 1.0,
        pitch: 1.0
      });

      setIsGlobalPreviewGenerating(false);

      const audio = new Audio(audioUrl);
      const vol = ttsVolume ?? 1;

      // Helper to setup amplification
      if (vol > 1) {
        try {
          audio.volume = 1;
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioContextClass();
          const source = ctx.createMediaElementSource(audio);
          const gainNode = ctx.createGain();

          gainNode.gain.value = vol;
          source.connect(gainNode);
          gainNode.connect(ctx.destination);

          globalAudioContextRef.current = ctx;
          globalGainNodeRef.current = gainNode;
        } catch (e) {
          console.error("Global preview amplification failed", e);
          audio.volume = 1;
        }
      } else {
        audio.volume = Math.max(0, vol);
      }

      audio.onended = () => {
        setIsGlobalPreviewPlaying(false);
        setGlobalPreviewAudio(null);
        if (globalAudioContextRef.current) {
          globalAudioContextRef.current.close().catch(console.error);
          globalAudioContextRef.current = null;
        }
        globalGainNodeRef.current = null;
      };
      audio.onerror = () => {
        setIsGlobalPreviewPlaying(false);
        setGlobalPreviewAudio(null);
        showAlert("Failed to play audio preview.", { type: 'error' });
      };

      setGlobalPreviewAudio(audio);
      await audio.play();
    } catch (e) {
      console.error("Preview failed", e);
      setIsGlobalPreviewGenerating(false);
      setIsGlobalPreviewPlaying(false);
      showAlert("Failed to generate preview", { type: 'error' });
    }
  };

  React.useEffect(() => {
    return () => {
      if (globalPreviewAudio) {
        globalPreviewAudio.pause();
      }
      if (globalAudioContextRef.current) {
        globalAudioContextRef.current.close().catch(console.error);
      }
    }
  }, [globalPreviewAudio]);

  // Live volume adjustment for Global Preview
  React.useEffect(() => {
    if (isGlobalPreviewPlaying && globalPreviewAudio) {
      const vol = ttsVolume ?? 1;
      const audio = globalPreviewAudio;

      // Upgrade to Web Audio if needed
      if (vol > 1 && !globalAudioContextRef.current) {
        try {
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioContextClass();
          const source = ctx.createMediaElementSource(audio);
          const gainNode = ctx.createGain();

          source.connect(gainNode);
          gainNode.connect(ctx.destination);

          globalAudioContextRef.current = ctx;
          globalGainNodeRef.current = gainNode;

          audio.volume = 1;
        } catch (e) {
          console.error("Global preview amplification upgrade failed", e);
        }
      }

      // Apply volume
      if (globalAudioContextRef.current && globalGainNodeRef.current) {
        globalGainNodeRef.current.gain.value = vol;
        if (audio.volume !== 1) audio.volume = 1;
      } else {
        audio.volume = Math.max(0, vol);
      }
    }
  }, [ttsVolume, isGlobalPreviewPlaying, globalPreviewAudio]);

  // Effect to handle preview audio playback
  React.useEffect(() => {
    // Cleanup when preview closes
    if (previewIndex === null) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
        previewAudioRef.current = null;
      }
      setIsPreviewTTSPlaying(false);
      return;
    }

    const slide = slides[previewIndex];
    if (!slide?.audioUrl) {
      setIsPreviewTTSPlaying(false);
      return;
    }

    // Create or update audio element
    if (!previewAudioRef.current) {
      const audio = new Audio(slide.audioUrl);
      audio.volume = ttsVolume || 1.0;
      audio.onended = () => setIsPreviewTTSPlaying(false);
      audio.onplay = () => setIsPreviewTTSPlaying(true);
      audio.onpause = () => {
        // Only update state if we didn't just finish playing
        if (!audio.ended) setIsPreviewTTSPlaying(false);
      };
      previewAudioRef.current = audio;
    } else if (previewAudioRef.current.src !== slide.audioUrl && !previewAudioRef.current.src.endsWith(slide.audioUrl)) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      previewAudioRef.current.src = slide.audioUrl;
      previewAudioRef.current.volume = ttsVolume || 1.0;
    }

    // Cleanup
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
      }
    };
    // ttsVolume and isPreviewTTSPlaying are intentionally excluded: including them would
    // re-run this effect (and its cleanup, which pauses/resets the audio) on every volume
    // tweak or play/pause toggle. Volume changes are handled by the effect below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewIndex, slides]);

  // Update volume when ttsVolume changes
  React.useEffect(() => {
    if (previewAudioRef.current && ttsVolume !== undefined) {
      previewAudioRef.current.volume = ttsVolume;
    }
  }, [ttsVolume]);

  // Cleanup audio on unmount
  React.useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const togglePreviewTTS = () => {
    if (previewIndex === null || !slides[previewIndex]?.audioUrl) return;

    const slide = slides[previewIndex];
    let audio = previewAudioRef.current;

    // Create audio element if it doesn't exist
    if (!audio) {
      audio = new Audio(slide.audioUrl);
      audio.volume = ttsVolume || 1.0;
      audio.onended = () => setIsPreviewTTSPlaying(false);
      audio.onplay = () => setIsPreviewTTSPlaying(true);
      audio.onpause = () => {
        if (!audio!.ended) setIsPreviewTTSPlaying(false);
      };
      previewAudioRef.current = audio;
    }

    // Toggle playback
    if (audio.paused) {
      audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  };

  return {
    previewIndex,
    setPreviewIndex,
    isPreviewTTSPlaying,
    togglePreviewTTS,
    previewVideoTime,
    setPreviewVideoTime,
    previewVideoDuration,
    setPreviewVideoDuration,
    previewVideoRef,
    previewZoomStyle,
    isGlobalPreviewPlaying,
    isGlobalPreviewGenerating,
    handleGlobalPreview,
  };
}
