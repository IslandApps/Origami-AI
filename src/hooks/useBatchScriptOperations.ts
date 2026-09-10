import React from 'react';
import { transformText } from '../services/aiService';
import {
  checkWebGPUSupport,
  ensureWebLLMReady,
  getCurrentWebLLMModel,
  isWebLLMLoaded,
  unloadWebLLM,
  WebLLMCancelledError,
} from '../services/webLlmService';
import type { GlobalSettings } from '../services/storage';
import type { SlideData } from '../types/slides';
import type { useModal } from '../context/ModalContext';

type ModalApi = Pick<ReturnType<typeof useModal>, 'showAlert' | 'showConfirm' | 'showThreeWayConfirm'>;

const isSlideMediaVideo = (slide: SlideData) => slide.type === 'video' && Boolean(slide.mediaUrl);

/**
 * Batch "AI Fix Script" / "Generate All TTS" / "Revert All" operations, plus the WebLLM
 * model-load gate that shows visible progress before a batch run starts (see ensureWebLLMForFix).
 */
export function useBatchScriptOperations(
  slides: SlideData[],
  onUpdateSlide: (index: number, data: Partial<SlideData>) => void,
  onGenerateAudio: (index: number) => Promise<void>,
  isDownloading: boolean,
  onShowDownloadBlocked: (action: string) => void,
  globalSettings: GlobalSettings | null | undefined,
  { showAlert, showConfirm, showThreeWayConfirm }: ModalApi,
) {
  const [isBatchGenerating, setIsBatchGenerating] = React.useState(false);
  const [isBatchFixing, setIsBatchFixing] = React.useState(false);
  // The single slide a batch op (TTS or AI fix) is actively working on right now, so the
  // per-slide "generating" border can highlight just that card instead of every slide.
  const [batchProcessingIndex, setBatchProcessingIndex] = React.useState<number | null>(null);
  const batchGeneratingCancelledRef = React.useRef(false);
  const batchFixingCancelledRef = React.useRef(false);
  const [isCancellingBatch, setIsCancellingBatch] = React.useState<'generate' | 'fix' | null>(null);
  const [isWebLLMLoadingOpen, setIsWebLLMLoadingOpen] = React.useState(false);
  const [batchProgress, setBatchProgress] = React.useState<{ current: number; total: number } | null>(null);

  /**
   * Loads the local WebLLM model *before* an AI Fix run starts, with visible progress.
   *
   * Without this, the first click hides a multi-GB download and WebGPU shader compilation
   * behind a button that only says "Fixing...", which reads as a hang. Returns false if the
   * caller should abort (WebGPU unsupported, or the load failed/was cancelled).
   */
  const ensureWebLLMForFix = React.useCallback(async (modelId: string): Promise<boolean> => {
    if (isWebLLMLoaded() && getCurrentWebLLMModel() === modelId) return true;

    const webgpuStatus = await checkWebGPUSupport();
    if (!webgpuStatus.supported) {
      showAlert(
        webgpuStatus.error || 'WebGPU is not available, so the local AI model cannot run.',
        { type: 'error', title: 'WebGPU Unavailable' }
      );
      return false;
    }

    setIsWebLLMLoadingOpen(true);
    try {
      await ensureWebLLMReady(modelId);
      return true;
    } catch (error) {
      console.error('[SlideEditor] WebLLM model load failed:', error);
      // A cancel is a deliberate user action, not a failure worth an alert.
      if (!(error instanceof WebLLMCancelledError)) {
        showAlert(
          'Could not load the local AI model: ' + (error instanceof Error ? error.message : String(error)),
          { type: 'error', title: 'Model Load Failed' }
        );
      }
      return false;
    } finally {
      setIsWebLLMLoadingOpen(false);
    }
  }, [showAlert]);

  const handleCancelWebLLMLoad = React.useCallback(() => {
    // Abandons the in-flight load and terminates its worker, freeing the GPU.
    void unloadWebLLM();
    setIsWebLLMLoadingOpen(false);
  }, []);

  // Clear cancelling state when batch operations complete
  React.useEffect(() => {
    if (!isBatchGenerating && !isBatchFixing && isCancellingBatch) {
      setIsCancellingBatch(null);
    }
  }, [isBatchGenerating, isBatchFixing, isCancellingBatch]);

  const handleCancelBatchGenerate = () => {
    batchGeneratingCancelledRef.current = true;
    setIsCancellingBatch('generate');
  };

  const handleGenerateAll = async () => {
    if (isDownloading) {
      onShowDownloadBlocked('Generate TTS Audio');
      return;
    }
    const eligibleSlideIndexes = slides
      .map((slide, index) => ({ slide, index }))
      .filter(({ slide }) => !isSlideMediaVideo(slide))
      .map(({ index }) => index);

    if (eligibleSlideIndexes.length === 0) {
      showAlert('No eligible slides found. Slide Media video slides are excluded from batch TTS.', { type: 'info', title: 'Nothing to Generate' });
      return;
    }

    const slideIndexesWithAudio = eligibleSlideIndexes.filter(i => Boolean(slides[i].audioUrl));
    let targetSlideIndexes = eligibleSlideIndexes;

    if (slideIndexesWithAudio.length > 0) {
      const choice = await showThreeWayConfirm(
        `${slideIndexesWithAudio.length} of ${eligibleSlideIndexes.length} eligible slide(s) already have generated audio. Overwrite all of them, or only generate audio for slides that don't have any yet?`,
        { title: 'Batch Generate', confirmText: 'Overwrite All', secondaryText: 'Only Missing', cancelText: 'Cancel' }
      );
      if (choice === null) return;
      if (choice === 'secondary') {
        targetSlideIndexes = eligibleSlideIndexes.filter(i => !slides[i].audioUrl);
        if (targetSlideIndexes.length === 0) {
          showAlert('All eligible slides already have generated audio.', { type: 'info', title: 'Nothing to Generate' });
          return;
        }
      }
    } else if (!await showConfirm(`This will generate audio for ${eligibleSlideIndexes.length} eligible slide(s). Slide Media video slides are excluded. Continue?`, { title: 'Batch Generate', confirmText: 'Generate All' })) {
      return;
    }

    batchGeneratingCancelledRef.current = false;
    setIsBatchGenerating(true);
    setBatchProgress({ current: 0, total: targetSlideIndexes.length });
    let cancelled = false;
    let processedCount = 0;
    try {
      for (let i = 0; i < targetSlideIndexes.length; i++) {
        if (batchGeneratingCancelledRef.current) {
          cancelled = true;
          break;
        }
        const slideIndex = targetSlideIndexes[i];
        setBatchProgress({ current: i + 1, total: targetSlideIndexes.length });
        setBatchProcessingIndex(slideIndex);
        await onGenerateAudio(slideIndex);
        processedCount++;
      }
      if (cancelled) {
        showAlert(`Batch generation cancelled. ${processedCount} slide(s) were processed.`, { type: 'info', title: 'Cancelled' });
        setIsCancellingBatch(null);
      } else {
        showAlert('Batch audio generation completed successfully!', { type: 'success', title: 'Batch Complete' });
      }
    } finally {
      setIsBatchGenerating(false);
      setBatchProcessingIndex(null);
      setBatchProgress(null);
      batchGeneratingCancelledRef.current = false;
    }
  };

  const handleCancelBatchFix = () => {
    batchFixingCancelledRef.current = true;
    setIsCancellingBatch('fix');
  };

  const handleFixAllScripts = async () => {
    if (isDownloading) {
      onShowDownloadBlocked('Batch AI Fix Script');
      return;
    }
    const useWebLLM = globalSettings?.useWebLLM;
    const webLlmModel = globalSettings?.webLlmModel;
    const eligibleSlideIndexes = slides
      .map((slide, index) => ({ slide, index }))
      .filter(({ slide }) => !isSlideMediaVideo(slide))
      .map(({ index }) => index);

    const apiKey = import.meta.env.VITE_LLM_API_KEY || '';
    const baseUrl = localStorage.getItem('llm_base_url') || import.meta.env.VITE_LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
    const model = localStorage.getItem('llm_model') || import.meta.env.VITE_LLM_MODEL || 'gemini-2.5-flash';

    if (eligibleSlideIndexes.length === 0) {
      showAlert('No eligible slides found. Slide Media video slides are excluded from batch AI fix.', { type: 'info', title: 'Nothing to Process' });
      return;
    }

    if (useWebLLM && !webLlmModel) {
      showAlert('Please select and load a WebLLM model in Settings (WebLLM tab) to use this feature.', { type: 'warning', title: 'WebLLM Not Configured' });
      return;
    }

    const slideIndexesAlreadyFixed = eligibleSlideIndexes.filter(i => Boolean(slides[i].originalScript));
    let targetSlideIndexes = eligibleSlideIndexes;

    if (slideIndexesAlreadyFixed.length > 0) {
      const choice = await showThreeWayConfirm(
        `${slideIndexesAlreadyFixed.length} of ${eligibleSlideIndexes.length} eligible slide(s) already have an AI-fixed script. Overwrite all of them, or only fix slides that haven't been fixed yet?`,
        { title: 'Batch AI Fix', confirmText: 'Overwrite All', secondaryText: 'Only Missing', cancelText: 'Cancel' }
      );
      if (choice === null) return;
      if (choice === 'secondary') {
        targetSlideIndexes = eligibleSlideIndexes.filter(i => !slides[i].originalScript);
        if (targetSlideIndexes.length === 0) {
          showAlert('All eligible slides already have an AI-fixed script.', { type: 'info', title: 'Nothing to Process' });
          return;
        }
      }
    } else if (!await showConfirm(`This will sequentially update ${eligibleSlideIndexes.length} eligible slide script(s) using AI. Slide Media video slides are excluded. Continue?`, { title: 'Batch AI Fix', confirmText: 'Start Processing' })) {
      return;
    }

    // Load the model once, visibly, before the batch starts — otherwise the download hides
    // behind slide 1 of N in the progress counter.
    if (useWebLLM && webLlmModel) {
      if (!await ensureWebLLMForFix(webLlmModel)) return;
    }

    batchFixingCancelledRef.current = false;
    setIsBatchFixing(true);
    setBatchProgress({ current: 0, total: targetSlideIndexes.length });
    let cancelled = false;
    let processedCount = 0;

    try {
      for (let i = 0; i < targetSlideIndexes.length; i++) {
        if (batchFixingCancelledRef.current) {
          cancelled = true;
          break;
        }
        const slideIndex = targetSlideIndexes[i];
        setBatchProgress({ current: i + 1, total: targetSlideIndexes.length });
        setBatchProcessingIndex(slideIndex);
        const slide = slides[slideIndex];
        if (!slide.script.trim()) continue;

        try {
          let transformed = await transformText({
            apiKey: apiKey || '',
            baseUrl,
            model,
            useWebLLM,
            webLlmModel,
            openaiEndpoint: globalSettings?.openaiEndpoint,
            openaiModel: globalSettings?.openaiModel,
            openaiApiKey: globalSettings?.openaiApiKey,
            openaiDisableThinking: globalSettings?.openaiDisableThinking !== false,
            useOpenAIFixScript: globalSettings?.useOpenAIFixScript
          }, slide.script, globalSettings?.aiFixScriptSystemPrompt, globalSettings?.aiFixScriptContext);

          // See handleTransform: the identical-output retry is skipped for local models.
          const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          if (!useWebLLM && normalize(transformed) === normalize(slide.script)) {
            transformed = await transformText({
              apiKey: apiKey || '',
              baseUrl,
              model,
              useWebLLM,
              webLlmModel,
              openaiEndpoint: globalSettings?.openaiEndpoint,
              openaiModel: globalSettings?.openaiModel,
              openaiApiKey: globalSettings?.openaiApiKey,
              openaiDisableThinking: globalSettings?.openaiDisableThinking !== false,
              useOpenAIFixScript: globalSettings?.useOpenAIFixScript
            }, slide.script, globalSettings?.aiFixScriptSystemPrompt, globalSettings?.aiFixScriptContext);
          }
          onUpdateSlide(slideIndex, { script: transformed, originalScript: slide.script });
          processedCount++;
        } catch (error) {
          console.error(`Failed to fix slide ${slideIndex + 1}`, error);
        }

        // Delay 5s to prevent rate limiting only when using cloud API (API imposes 15 RPM ~ 4s/req)
        // Skip delay for WebLLM since it runs locally without rate limits
        if (!useWebLLM && i < targetSlideIndexes.length - 1) {
          // Check cancellation during the delay using a polling loop
          const delayEnd = Date.now() + 5000;
          while (Date.now() < delayEnd) {
            if (batchFixingCancelledRef.current) break;
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
      if (cancelled) {
        showAlert(`Batch AI fix cancelled. ${processedCount} slide(s) were processed.`, { type: 'info', title: 'Cancelled' });
        setIsCancellingBatch(null);
      } else {
        showAlert('Batch script fixing completed successfully!', { type: 'success', title: 'Batch Complete' });
      }
    } finally {
      setIsBatchFixing(false);
      setBatchProcessingIndex(null);
      setBatchProgress(null);
      batchFixingCancelledRef.current = false;
    }
  };

  const handleRevertAllScripts = async () => {
    const slidesWithOriginals = slides.filter(slide => slide.originalScript);

    if (slidesWithOriginals.length === 0) {
      showAlert('No slides with original scripts found to revert.', { type: 'info', title: 'Nothing to Revert' });
      return;
    }

    if (!await showConfirm(`This will revert ${slidesWithOriginals.length} slide(s) to their original scripts, discarding all current changes. Continue?`, { title: 'Bulk Revert', confirmText: 'Revert All', type: 'warning' })) {
      return;
    }

    try {
      let revertedCount = 0;
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        if (slide.originalScript) {
          onUpdateSlide(i, { script: slide.originalScript, originalScript: undefined });
          revertedCount++;
        }
      }
      showAlert(`Successfully reverted ${revertedCount} slide(s) to original scripts!`, { type: 'success', title: 'Bulk Revert Complete' });
    } catch (error) {
      showAlert('Failed to revert some scripts: ' + (error instanceof Error ? error.message : String(error)), { type: 'error', title: 'Revert Failed' });
    }
  };

  return {
    isBatchGenerating,
    isBatchFixing,
    batchProcessingIndex,
    isCancellingBatch,
    isWebLLMLoadingOpen,
    setIsWebLLMLoadingOpen,
    batchProgress,
    ensureWebLLMForFix,
    handleCancelWebLLMLoad,
    handleCancelBatchGenerate,
    handleGenerateAll,
    handleCancelBatchFix,
    handleFixAllScripts,
    handleRevertAllScripts,
  };
}
