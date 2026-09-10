import { useCallback, useEffect, useState } from 'react';
import { setSyncedPreference } from '../services/preferences';
import {
  checkWebGPUSupport,
  getDefaultWebLlmModel,
  getWebLlmModelInfo,
  initWebLLM,
} from '../services/webLlmService';
import { initTTS } from '../services/ttsService';
import { listImageModels, POLLINATIONS_IMAGE_MODELS } from '../services/pollinationsService';
import { listVideoModels, POLLINATIONS_VIDEO_MODELS } from '../services/pollinationsVideoService';
import { fromPersistedProject, type ShortsProject } from '../services/shortsProject';
import { loadGlobalSettings, loadShortsProject, saveGlobalSettings, type GlobalSettings } from '../services/storage';
import { markWebLLMAsCached } from '../services/shortsUtils';

type Stage = 'compose' | 'storyboard';

/**
 * One-time page bootstrap: restores the saved draft/settings, kicks off TTS
 * preloading, fetches the live Pollinations model catalogues, and mirrors the
 * landing page's WebGPU/WebLLM setup prompt for visitors who land directly on
 * /shorts. Also owns the background WebLLM download triggered by that prompt.
 */
export function useShortsRuntimeSetup(params: {
  defaultGlobalSettings: GlobalSettings;
  globalSettings: GlobalSettings;
  setGlobalSettings: React.Dispatch<React.SetStateAction<GlobalSettings>>;
  setProject: React.Dispatch<React.SetStateAction<ShortsProject>>;
  setStage: React.Dispatch<React.SetStateAction<Stage>>;
  setIsResourceModalOpen: (open: boolean) => void;
  setIsWebGPUModalOpen: (open: boolean) => void;
  startBackgroundDownloads: (flags: { tts: boolean; ffmpeg: boolean; webllm: boolean }) => void;
  endBackgroundDownloads: () => void;
  generationAbortRef: React.RefObject<AbortController | null>;
  renderAbortRef: React.RefObject<AbortController | null>;
}) {
  const {
    defaultGlobalSettings,
    globalSettings,
    setGlobalSettings,
    setProject,
    setStage,
    setIsResourceModalOpen,
    setIsWebGPUModalOpen,
    startBackgroundDownloads,
    endBackgroundDownloads,
    generationAbortRef,
    renderAbortRef,
  } = params;

  const [imageModels, setImageModels] = useState(POLLINATIONS_IMAGE_MODELS);
  const [videoModels, setVideoModels] = useState(POLLINATIONS_VIDEO_MODELS);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const [settings, draft] = await Promise.all([loadGlobalSettings(), loadShortsProject()]);
      if (!mounted) return;

      const merged = { ...defaultGlobalSettings, ...(settings ?? {}) };
      setGlobalSettings(merged);

      if (draft?.scenes?.length) {
        const restored = fromPersistedProject(draft);
        setProject(restored);
        setStage('storyboard');
      } else {
        setProject((prev) => ({
          ...prev,
          voice: merged.shortsVoice || merged.voice || prev.voice,
          imageModel: merged.pollinationsImageModel || prev.imageModel,
          captionStyle: merged.shortsCaptionStyle || prev.captionStyle,
          captionSize: merged.shortsCaptionSize || prev.captionSize,
          captionPosition: merged.shortsCaptionPosition || prev.captionPosition,
        }));
      }

      // The TTS worker downloads ~80MB on first use; start it while the user types.
      try {
        initTTS(merged.ttsQuantization || 'q8');
      } catch (e) {
        console.warn('[Shorts] TTS init could not be started:', e);
      }

      // Landing on /shorts directly skips the landing page's one-time WebGPU/WebLLM
      // setup prompt, so check for it here too or a local model never gets installed
      // until the user hits an alert mid-generation.
      if (!merged.shortsUseOpenAI) {
        const cached = JSON.parse(
          localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}',
        );
        const hideSetupModal = localStorage.getItem('hide_setup_modal') === 'true';
        if (!cached.webllm && !hideSetupModal) {
          setIsResourceModalOpen(true);
        }
      }
    })();

    // listImageModels/listVideoModels never reject; they resolve the static
    // fallback on failure.
    void listImageModels().then((models) => {
      if (mounted) setImageModels(models);
    });
    void listVideoModels().then((models) => {
      if (mounted) setVideoModels(models);
    });

    return () => {
      mounted = false;
      // Intentionally read at cleanup time, not a stale mount-time snapshot:
      // this aborts whatever render is in flight when the page unmounts, not
      // whatever (if anything) was in flight when it mounted. Not a DOM ref,
      // so the "copy to a variable" suggestion doesn't apply here.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generationAbortRef.current?.abort();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      renderAbortRef.current?.abort();
    };
  }, [defaultGlobalSettings, generationAbortRef, renderAbortRef, setGlobalSettings, setIsResourceModalOpen, setProject, setStage]);

  // Mirrors the landing page's one-time setup: pick a WebGPU-compatible default
  // model and download it in the background, so a direct /shorts visit doesn't
  // skip the check entirely and only surface it as a mid-generation dead end.
  const handleResourceSetupConfirm = useCallback(
    async (_dontShowAgain?: boolean) => {
      setIsResourceModalOpen(false);
      // Same as the landing page: clicking Continue persists the acknowledgment so a
      // refresh or navigating to /shorts mid-download doesn't re-prompt the modal.
      setSyncedPreference('hide_setup_modal', 'true');

      const cached = JSON.parse(
        localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}',
      );
      if (cached.webllm) return;

      startBackgroundDownloads({ tts: false, ffmpeg: false, webllm: true });
      try {
        const webgpuStatus = await checkWebGPUSupport();
        if (!webgpuStatus.supported) {
          setIsWebGPUModalOpen(true);
          return;
        }

        const configuredModel = getWebLlmModelInfo(globalSettings.webLlmModel);
        const isConfiguredModelCompatible =
          configuredModel && (webgpuStatus.hasF16 || configuredModel.precision === 'f32');
        const model = isConfiguredModelCompatible ? configuredModel!.id : getDefaultWebLlmModel(webgpuStatus.hasF16);

        const next = { ...globalSettings, useWebLLM: true, webLlmModel: model };
        await saveGlobalSettings(next);
        setGlobalSettings(next);

        await initWebLLM(model, () => {});
        markWebLLMAsCached();
      } catch (e) {
        console.warn('[Shorts] Background WebLLM setup failed:', e);
      } finally {
        endBackgroundDownloads();
      }
    },
    [
      globalSettings,
      startBackgroundDownloads,
      endBackgroundDownloads,
      setGlobalSettings,
      setIsResourceModalOpen,
      setIsWebGPUModalOpen,
    ],
  );

  const handleResourceSetupSkip = useCallback(() => {
    setIsResourceModalOpen(false);
    // Skipping doesn't queue the WebLLM download, but still persists the
    // acknowledgment so the modal doesn't reprompt every session.
    setSyncedPreference('hide_setup_modal', 'true');
  }, [setIsResourceModalOpen]);

  return {
    imageModels,
    videoModels,
    handleResourceSetupConfirm,
    handleResourceSetupSkip,
  };
}
