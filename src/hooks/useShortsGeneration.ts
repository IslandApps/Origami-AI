import React, { useCallback } from 'react';
import {
  checkWebGPUSupport,
  getCurrentWebLLMModel,
  initWebLLM,
  isWebLLMLoaded,
} from '../services/webLlmService';
import { composeVisualPrompt, extendNarration, generateShortsScript, regenerateImagePrompt } from '../services/shortsScriptService';
import {
  createScene,
  generateSceneAudio,
  generateSceneImage,
  generateSceneVideo,
  isSceneAudioStale,
  isSceneVisualStale,
  type ShortsProject,
  type ShortsScene,
} from '../services/shortsProject';
import type { GlobalSettings } from '../services/storage';
import { markWebLLMAsCached, errorMessage, buildTitleCardScene } from '../services/shortsUtils';
import type { useModal } from '../context/ModalContext';

type Stage = 'compose' | 'storyboard';
type ModalApi = Pick<ReturnType<typeof useModal>, 'showAlert' | 'showConfirm'>;

/**
 * The Shorts page's entire generation pipeline: script generation, per-scene
 * visual/audio generation and regeneration, prompt rewriting, narration
 * extension, and the WebLLM/OpenAI readiness gate that guards all of it.
 * Everything here closes over `project`/`projectRef`/`setProject` since a
 * generation run always needs to read the freshest scene list, not a stale
 * render-time snapshot.
 */
export function useShortsGeneration(params: {
  project: ShortsProject;
  projectRef: React.RefObject<ShortsProject>;
  setProject: React.Dispatch<React.SetStateAction<ShortsProject>>;
  setStage: React.Dispatch<React.SetStateAction<Stage>>;
  patchProject: (patch: Partial<ShortsProject>) => void;
  patchScene: (id: string, patch: Partial<ShortsScene>) => void;
  pollinationsKey: string | undefined;
  globalSettings: GlobalSettings;
  useOpenAI: boolean;
  openAIConfigured: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  setIsWebGPUModalOpen: (open: boolean) => void;
  setIsWebLLMLoadingOpen: (open: boolean) => void;
  generationAbortRef: React.RefObject<AbortController | null>;
  modal: ModalApi;
}) {
  const {
    project,
    projectRef,
    setProject,
    setStage,
    patchProject,
    patchScene,
    pollinationsKey,
    globalSettings,
    useOpenAI,
    openAIConfigured,
    setIsSettingsOpen,
    setIsWebGPUModalOpen,
    setIsWebLLMLoadingOpen,
    generationAbortRef,
    modal: { showAlert, showConfirm },
  } = params;

  const [isBusy, setIsBusy] = React.useState(false);
  const [busyLabel, setBusyLabel] = React.useState('');
  const [isRegeneratingAllImages, setIsRegeneratingAllImages] = React.useState(false);
  const [isRegeneratingStale, setIsRegeneratingStale] = React.useState(false);

  // Per-scene "extend narration" requests in flight, plus whether the current
  // batch is the "extend every scene" bulk action rather than a single card.
  const [extendingIds, setExtendingIds] = React.useState<Set<string>>(new Set());
  const [isExtendingAll, setIsExtendingAll] = React.useState(false);
  const [rewritingPromptIds, setRewritingPromptIds] = React.useState<Set<string>>(new Set());

  // --- model readiness --------------------------------------------------------

  const ensureScriptEngineReady = useCallback(async (): Promise<boolean> => {
    if (useOpenAI) {
      if (!openAIConfigured) {
        setIsSettingsOpen(true);
        return false;
      }
      return true;
    }

    const support = await checkWebGPUSupport();
    if (!support.supported) {
      setIsWebGPUModalOpen(true);
      return false;
    }

    if (!globalSettings.webLlmModel) {
      await showAlert('Choose a local model in Settings first, or switch the script engine to an API endpoint.', {
        type: 'warning',
        title: 'No model selected',
      });
      setIsSettingsOpen(true);
      return false;
    }

    if (isWebLLMLoaded() && getCurrentWebLLMModel() === globalSettings.webLlmModel) return true;

    setIsWebLLMLoadingOpen(true);
    try {
      await initWebLLM(globalSettings.webLlmModel, () => {});
      markWebLLMAsCached();
      return true;
    } catch (e) {
      await showAlert(errorMessage(e), { type: 'error', title: 'Model load failed' });
      return false;
    } finally {
      setIsWebLLMLoadingOpen(false);
    }
  }, [
    useOpenAI,
    openAIConfigured,
    globalSettings.webLlmModel,
    showAlert,
    setIsSettingsOpen,
    setIsWebGPUModalOpen,
    setIsWebLLMLoadingOpen,
  ]);

  const llmOptions = useCallback(
    (signal?: AbortSignal) => ({
      useOpenAI,
      webLlmModel: globalSettings.webLlmModel,
      llmSettings: {
        apiKey: globalSettings.openaiApiKey ?? '',
        baseUrl: globalSettings.openaiEndpoint ?? '',
        model: globalSettings.openaiModel ?? '',
        openaiDisableThinking: globalSettings.openaiDisableThinking !== false,
      },
      signal,
    }),
    [useOpenAI, globalSettings.webLlmModel, globalSettings.openaiApiKey, globalSettings.openaiEndpoint, globalSettings.openaiModel, globalSettings.openaiDisableThinking],
  );

  // --- asset generation -------------------------------------------------------

  const runSceneImage = useCallback(
    async (scene: ShortsScene, target: ShortsProject, signal: AbortSignal) => {
      patchScene(scene.id, { imageStatus: 'pending', imageError: null });
      try {
        const { blob, url } = await generateSceneImage(scene, target, { apiKey: pollinationsKey, signal });
        // Release the previous URL now that a replacement exists.
        if (scene.imageUrl) URL.revokeObjectURL(scene.imageUrl);
        patchScene(scene.id, {
          imageBlob: blob,
          imageUrl: url,
          imageStatus: 'ready',
          imageError: null,
          visualPromptSnapshot: scene.imagePrompt,
          visualModelSnapshot: target.imageModel,
          visualAspectSnapshot: target.aspect,
        });
      } catch (e) {
        if (signal.aborted) return;
        patchScene(scene.id, { imageStatus: 'error', imageError: errorMessage(e) });
      }
    },
    [patchScene, pollinationsKey],
  );

  const runSceneVideo = useCallback(
    async (scene: ShortsScene, target: ShortsProject, signal: AbortSignal) => {
      patchScene(scene.id, { videoStatus: 'pending', videoError: null });
      try {
        const { blob, url } = await generateSceneVideo(scene, target, { apiKey: pollinationsKey, signal });
        if (scene.videoUrl) URL.revokeObjectURL(scene.videoUrl);
        patchScene(scene.id, {
          videoBlob: blob,
          videoUrl: url,
          videoStatus: 'ready',
          videoError: null,
          visualPromptSnapshot: scene.imagePrompt,
          visualModelSnapshot: target.videoModel,
          visualAspectSnapshot: target.aspect,
        });
      } catch (e) {
        if (signal.aborted) return;
        patchScene(scene.id, { videoStatus: 'error', videoError: errorMessage(e) });
      }
    },
    [patchScene, pollinationsKey],
  );

  const runSceneVisual = useCallback(
    (scene: ShortsScene, target: ShortsProject, signal: AbortSignal) =>
      target.generationMode === 'video'
        ? runSceneVideo(scene, target, signal)
        : runSceneImage(scene, target, signal),
    [runSceneImage, runSceneVideo],
  );

  const runSceneAudio = useCallback(
    async (scene: ShortsScene, voice: string, signal: AbortSignal) => {
      patchScene(scene.id, { audioStatus: 'pending', audioError: null });
      try {
        const { blob, url, duration } = await generateSceneAudio(scene, voice, { signal });
        if (signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }
        if (scene.audioUrl) URL.revokeObjectURL(scene.audioUrl);
        patchScene(scene.id, {
          audioBlob: blob,
          audioUrl: url,
          audioDuration: duration,
          audioStatus: 'ready',
          audioError: null,
          audioNarrationSnapshot: scene.narration,
          isCustomAudio: false,
        });
      } catch (e) {
        if (signal.aborted) return;
        patchScene(scene.id, { audioStatus: 'error', audioError: errorMessage(e) });
      }
    },
    [patchScene],
  );

  const handleBatchUploadImages = useCallback((files: File[]) => {
    if (!files.length) return;
    setProject((prev) => {
      const nextScenes = [...prev.scenes];
      let fileIdx = 0;

      // Fill scenes without an image first
      for (let i = 0; i < nextScenes.length && fileIdx < files.length; i++) {
        if (!nextScenes[i].imageUrl && !nextScenes[i].videoUrl) {
          const file = files[fileIdx++];
          nextScenes[i] = {
            ...nextScenes[i],
            imageBlob: file,
            imageUrl: URL.createObjectURL(file),
            imageStatus: 'ready',
            imageError: null,
            videoBlob: null,
            videoUrl: null,
            videoStatus: 'idle',
            isCustomUpload: true,
          };
        }
      }

      // If still have remaining files, append new scenes
      while (fileIdx < files.length) {
        const file = files[fileIdx++];
        const scene = createScene('', composeVisualPrompt(prev.topic || 'Custom scene', prev));
        nextScenes.push({
          ...scene,
          imageBlob: file,
          imageUrl: URL.createObjectURL(file),
          imageStatus: 'ready',
          imageError: null,
          isCustomUpload: true,
        });
      }

      return { ...prev, scenes: nextScenes };
    });
  }, [setProject]);

  // --- main generation flow ---------------------------------------------------

  const handleGenerate = useCallback(async () => {
    if (!project.topic.trim()) return;

    const ready = await ensureScriptEngineReady();
    if (!ready) return;

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    setIsBusy(true);
    setBusyLabel('Writing the script...');

    try {
      const script = await generateShortsScript(
        {
          topic: project.topic,
          targetDurationSec: project.targetDurationSec,
          visualStyle: project.visualStyle,
          tone: project.tone,
          aspect: project.aspect,
          captionsEnabled: project.captionsEnabled,
          generationMode: project.generationMode,
        },
        { ...llmOptions(controller.signal), onStage: setBusyLabel },
      );

      if (controller.signal.aborted) return;

      // Discard previous audio/video runs, but retain custom uploads if present
      const existingUploads = projectRef.current.scenes
        .filter((s) => s.imageUrl && s.imageBlob && s.isCustomUpload)
        .map((s) => ({ blob: s.imageBlob!, url: s.imageUrl! }));

      projectRef.current.scenes.forEach((scene) => {
        if (scene.videoUrl) URL.revokeObjectURL(scene.videoUrl);
        if (scene.audioUrl) URL.revokeObjectURL(scene.audioUrl);
        if (scene.imageUrl && !scene.isCustomUpload) URL.revokeObjectURL(scene.imageUrl);
      });

      const scenes = script.scenes.map((s, idx) => {
        const scene = createScene(s.narration, s.imagePrompt);
        if (existingUploads[idx]) {
          return {
            ...scene,
            imageBlob: existingUploads[idx].blob,
            imageUrl: existingUploads[idx].url,
            imageStatus: 'ready' as const,
            isCustomUpload: true,
          };
        }
        return scene;
      });

      // Revoke any unused excess upload URLs
      existingUploads.slice(script.scenes.length).forEach((item) => URL.revokeObjectURL(item.url));

      const nextProject: ShortsProject = { ...projectRef.current, title: script.title, scenes };
      if (nextProject.showTitleCard) {
        nextProject.scenes = [buildTitleCardScene(script.title, nextProject), ...scenes];
      }
      setProject(nextProject);
      setStage('storyboard');

      // Stop here to allow the user to approve the script before generating media.
    } catch (e) {
      if (controller.signal.aborted) return;
      await showAlert(errorMessage(e), { type: 'error', title: 'Generation failed' });
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setIsBusy(false);
      setBusyLabel('');
    }
  }, [
    project.topic,
    project.targetDurationSec,
    project.visualStyle,
    project.tone,
    project.aspect,
    project.captionsEnabled,
    project.generationMode,
    ensureScriptEngineReady,
    llmOptions,
    showAlert,
    generationAbortRef,
    projectRef,
    setProject,
    setStage,
  ]);

  const handleGenerateVisuals = useCallback(async () => {
    if (projectRef.current.generationMode === 'upload') return;

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    const isVideo = projectRef.current.generationMode === 'video';
    setIsBusy(true);
    setBusyLabel(isVideo ? 'Generating clips...' : 'Generating images...');

    try {
      const scenes = projectRef.current.scenes;
      for (const scene of scenes) {
        if (controller.signal.aborted) return;
        const needsVisual = isVideo
          ? ['idle', 'error'].includes(scene.videoStatus)
          : ['idle', 'error'].includes(scene.imageStatus);
        if (needsVisual) {
          await runSceneVisual(scene, projectRef.current, controller.signal);
        }
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      await showAlert(errorMessage(e), {
        type: 'error',
        title: isVideo ? 'Clip generation failed' : 'Image generation failed',
      });
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setIsBusy(false);
      setBusyLabel('');
    }
  }, [runSceneVisual, showAlert, generationAbortRef, projectRef]);

  const handleGenerateAudio = useCallback(async () => {
    const current = projectRef.current;
    if (current.voiceMode === 'record') {
      await showAlert(
        'You have selected Custom Voice Recording. Click the Record button on each scene card to record your voice for that slide with your microphone.',
        { title: 'Record per slide', type: 'info' },
      );
      return;
    }

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    setIsBusy(true);
    setBusyLabel('Generating voiceover...');

    try {
      const scenes = projectRef.current.scenes;
      for (const scene of scenes) {
        if (controller.signal.aborted) return;
        const needsAudio = ['idle', 'error'].includes(scene.audioStatus) && !scene.isCustomAudio;
        if (needsAudio) {
          await runSceneAudio(scene, projectRef.current.voice, controller.signal);
        }
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      await showAlert(errorMessage(e), { type: 'error', title: 'Voiceover generation failed' });
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setIsBusy(false);
      setBusyLabel('');
    }
  }, [runSceneAudio, showAlert, generationAbortRef, projectRef]);

  // Aborts the in-flight generation (script, visuals, or voiceover) and resets
  // any scene left mid-flight so it can be regenerated: an asset that already
  // exists on the scene is kept (reverting it to "ready"), otherwise the scene
  // returns to "idle" so the Generate step re-appears in the primary action.
  const handleCancelGeneration = useCallback(() => {
    generationAbortRef.current?.abort();
    setProject((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene) => ({
        ...scene,
        imageStatus: scene.imageStatus === 'pending' ? (scene.imageBlob ? 'ready' : 'idle') : scene.imageStatus,
        videoStatus: scene.videoStatus === 'pending' ? (scene.videoBlob ? 'ready' : 'idle') : scene.videoStatus,
        audioStatus: scene.audioStatus === 'pending' ? (scene.audioBlob ? 'ready' : 'idle') : scene.audioStatus,
      })),
    }));
  }, [generationAbortRef, setProject]);

  // Re-renders only the audio/visuals whose scripted text or prompt has drifted
  // from what was actually used to generate the asset currently on the scene.
  const handleRegenerateStale = useCallback(async () => {
    const current = projectRef.current;
    const activeVisualModel =
      current.generationMode === 'video' ? current.videoModel : current.imageModel;
    const staleVisualScenes = current.scenes.filter((s) =>
      isSceneVisualStale(s, current.generationMode, activeVisualModel, current.aspect),
    );
    const staleAudioScenes = current.scenes.filter((s) => isSceneAudioStale(s));
    if (!staleVisualScenes.length && !staleAudioScenes.length) return;

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    setIsBusy(true);
    setIsRegeneratingStale(true);
    setBusyLabel('Regenerating edited scenes...');

    try {
      const visuals = Promise.all(
        staleVisualScenes.map((scene) => runSceneVisual(scene, current, controller.signal)),
      );

      const audio = (async () => {
        for (const scene of staleAudioScenes) {
          if (controller.signal.aborted) return;
          await runSceneAudio(scene, current.voice, controller.signal);
        }
      })();

      await Promise.all([visuals, audio]);
    } catch (e) {
      if (controller.signal.aborted) return;
      await showAlert(errorMessage(e), { type: 'error', title: 'Regeneration failed' });
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setIsBusy(false);
      setIsRegeneratingStale(false);
      setBusyLabel('');
    }
  }, [runSceneVisual, runSceneAudio, showAlert, generationAbortRef, projectRef]);

  // --- per-scene actions ------------------------------------------------------

  const handleRegenerateImage = useCallback(
    (id: string) => {
      const current = projectRef.current;
      const scene = current.scenes.find((s) => s.id === id);
      if (!scene) return;

      // New seed so a re-roll actually produces a different image; Pollinations
      // returns the cached result for an identical prompt+seed.
      const reseeded = { ...scene, seed: Math.floor(Math.random() * 2_147_483_000) };
      patchScene(id, { seed: reseeded.seed });
      void runSceneImage(reseeded, current, new AbortController().signal);
    },
    [patchScene, runSceneImage, projectRef],
  );

  const handleRegenerateVideo = useCallback(
    (id: string) => {
      const current = projectRef.current;
      const scene = current.scenes.find((s) => s.id === id);
      if (!scene) return;

      // New seed so a re-roll actually produces a different clip; Pollinations
      // returns the cached result for an identical prompt+seed.
      const reseeded = { ...scene, seed: Math.floor(Math.random() * 2_147_483_000) };
      patchScene(id, { seed: reseeded.seed });
      void runSceneVideo(reseeded, current, new AbortController().signal);
    },
    [patchScene, runSceneVideo, projectRef],
  );

  const handleRegenerateVisual = useCallback(
    (id: string) => {
      if (projectRef.current.generationMode === 'video') {
        handleRegenerateVideo(id);
      } else {
        handleRegenerateImage(id);
      }
    },
    [handleRegenerateImage, handleRegenerateVideo, projectRef],
  );

  // Bumps every scene's seed and regenerates all images, so a single tap swaps
  // the whole deck for a fresh set rather than re-rolling one card at a time.
  const handleRegenerateAllImages = useCallback(async () => {
    const current = projectRef.current;
    if (!current.scenes.length || current.generationMode === 'video' || current.generationMode === 'upload') return;

    const confirmed = await showConfirm(
      'This will replace every generated image with a new one using a different random seed. Nothing else changes — your narration, prompts, and voiceover stay as they are.',
      { title: 'Regenerate all images', confirmText: 'Regenerate', cancelText: 'Cancel' },
    );
    if (!confirmed) return;

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    // New seed per scene (Pollinations caches identical prompt+seed), keyed by
    // id so the project state and each dispatched run agree on the same seed.
    const reseededScenes = current.scenes.map((scene) => ({
      ...scene,
      seed: Math.floor(Math.random() * 2_147_483_000),
    }));
    const seedById = new Map(reseededScenes.map((scene) => [scene.id, scene.seed]));

    setProject((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene) => ({
        ...scene,
        seed: seedById.get(scene.id) ?? scene.seed,
      })),
    }));

    setIsBusy(true);
    setIsRegeneratingAllImages(true);
    setBusyLabel('Regenerating all images...');
    try {
      await Promise.all(
        reseededScenes.map((scene) => runSceneImage(scene, current, controller.signal)),
      );
    } catch (e) {
      if (controller.signal.aborted) return;
      await showAlert(errorMessage(e), { type: 'error', title: 'Image regeneration failed' });
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setIsBusy(false);
      setIsRegeneratingAllImages(false);
      setBusyLabel('');
    }
  }, [runSceneImage, showAlert, showConfirm, generationAbortRef, projectRef, setProject]);

  const handleRegenerateAudio = useCallback(
    (id: string) => {
      const current = projectRef.current;
      const scene = current.scenes.find((s) => s.id === id);
      if (!scene) return;
      void runSceneAudio(scene, current.voice, new AbortController().signal);
    },
    [runSceneAudio, projectRef],
  );

  const handleRewritePrompt = useCallback(
    async (id: string) => {
      const current = projectRef.current;
      const scene = current.scenes.find((s) => s.id === id);
      if (!scene) return;

      setRewritingPromptIds((prev) => new Set(prev).add(id));
      try {
        const prompt = await regenerateImagePrompt(
          scene.narration,
          {
            topic: current.topic,
            visualStyle: current.visualStyle,
            aspect: current.aspect,
            captionsEnabled: current.captionsEnabled,
            generationMode: current.generationMode,
          },
          llmOptions(),
        );
        patchScene(id, { imagePrompt: prompt });
      } catch (e) {
        console.warn('[Shorts] Rewrite prompt failed:', e);
      } finally {
        setRewritingPromptIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [llmOptions, patchScene, projectRef],
  );

  const handleExtendScene = useCallback(
    async (id: string) => {
      const current = projectRef.current;
      const scene = current.scenes.find((s) => s.id === id);
      if (!scene) return;

      const ready = await ensureScriptEngineReady();
      if (!ready) return;

      setExtendingIds((prev) => new Set(prev).add(id));
      try {
        const extended = await extendNarration(
          scene.narration,
          { topic: current.topic, tone: current.tone },
          llmOptions(),
        );
        patchScene(id, { narration: extended });
      } catch (e) {
        await showAlert(errorMessage(e), { type: 'error', title: 'Could not extend line' });
      } finally {
        setExtendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [ensureScriptEngineReady, llmOptions, patchScene, showAlert, projectRef],
  );

  const handleClearAllImages = useCallback(() => {
    patchProject({
      scenes: projectRef.current.scenes.map((scene) => {
        if (scene.isCustomUpload) return scene;

        if (scene.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(scene.imageUrl);
        if (scene.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(scene.videoUrl);

        return {
          ...scene,
          imageBlob: undefined,
          imageUrl: undefined,
          imageStatus: 'idle',
          videoBlob: undefined,
          videoUrl: undefined,
          videoStatus: 'idle',
          visualPromptSnapshot: undefined,
          visualModelSnapshot: undefined,
          visualAspectSnapshot: undefined,
        };
      }),
    });
  }, [patchProject, projectRef]);

  // Sequential, not parallel: extendNarration goes through the same single
  // WebLLM engine as every other script pass (see shortsScriptService), which
  // resetChat()s per call and cannot serve concurrent requests.
  const handleExtendAllScenes = useCallback(async () => {
    const current = projectRef.current;
    if (!current.scenes.length) return;

    const eligibleCount = current.scenes.filter((s) => s.narration.trim()).length;
    if (!eligibleCount) return;

    const confirmed = await showConfirm(
      `Add a few more sentences to ${eligibleCount} scene${eligibleCount === 1 ? '' : 's'} using AI? This rewrites their narration.`,
      { title: 'Extend all scripts', confirmText: 'Extend All' },
    );
    if (!confirmed) return;

    const ready = await ensureScriptEngineReady();
    if (!ready) return;

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    setIsExtendingAll(true);
    let failures = 0;
    try {
      for (const scene of current.scenes) {
        if (controller.signal.aborted) return;
        if (!scene.narration.trim()) continue;

        setExtendingIds((prev) => new Set(prev).add(scene.id));
        try {
          const extended = await extendNarration(
            scene.narration,
            { topic: current.topic, tone: current.tone },
            llmOptions(controller.signal),
          );
          patchScene(scene.id, { narration: extended });
        } catch (e) {
          if (controller.signal.aborted) return;
          failures += 1;
          console.warn('[Shorts] Failed to extend scene', scene.id, e);
        } finally {
          setExtendingIds((prev) => {
            const next = new Set(prev);
            next.delete(scene.id);
            return next;
          });
        }
      }

      if (failures > 0) {
        await showAlert(`Could not extend ${failures} of ${current.scenes.length} scene${current.scenes.length > 1 ? 's' : ''}. Try those individually.`, {
          type: 'warning',
          title: 'Some scenes were not extended',
        });
      }
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setIsExtendingAll(false);
    }
  }, [ensureScriptEngineReady, llmOptions, patchScene, showAlert, showConfirm, generationAbortRef, projectRef]);

  // Extend-all runs sequentially and can take a while — let the user bail out
  // mid-run instead of forcing them to wait for every scene to finish.
  const handleCancelExtendAll = useCallback(() => {
    generationAbortRef.current?.abort();
  }, [generationAbortRef]);

  return {
    isBusy,
    busyLabel,
    isRegeneratingAllImages,
    isRegeneratingStale,
    extendingIds,
    isExtendingAll,
    rewritingPromptIds,
    ensureScriptEngineReady,
    llmOptions,
    handleBatchUploadImages,
    handleGenerate,
    handleGenerateVisuals,
    handleGenerateAudio,
    handleCancelGeneration,
    handleRegenerateStale,
    handleRegenerateImage,
    handleRegenerateVideo,
    handleRegenerateVisual,
    handleRegenerateAllImages,
    handleRegenerateAudio,
    handleRewritePrompt,
    handleExtendScene,
    handleClearAllImages,
    handleExtendAllScenes,
    handleCancelExtendAll,
  };
}
