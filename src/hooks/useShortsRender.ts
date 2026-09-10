import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShortsRenderPhase } from '../components/shorts/ShortsRenderModal';
import { ShortsRenderAbortedError, ShortsVideoRenderer, type ShortsRenderScene } from '../services/ShortsVideoRenderer';
import { sceneCaptions, type ShortsProject } from '../services/shortsProject';
import { errorMessage, slugify } from '../services/shortsUtils';
import type { useModal } from '../context/ModalContext';

type ShowAlert = ReturnType<typeof useModal>['showAlert'];

/**
 * MP4 export state and flow for the Shorts page: rendering progress/phase state,
 * the render + download handlers, the auto-download arm for Library loads, and
 * the reload guard while a render is in flight.
 */
export function useShortsRender(params: {
  project: ShortsProject;
  projectRef: React.RefObject<ShortsProject>;
  showAlert: ShowAlert;
  /** Set by a Library "Download" load; the next landed project triggers render+download. */
  pendingLibraryDownloadRef: React.RefObject<boolean>;
}) {
  const { project, projectRef, showAlert, pendingLibraryDownloadRef } = params;

  const [renderPhase, setRenderPhase] = useState<ShortsRenderPhase | null>(null);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatus, setRenderStatus] = useState('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null);

  const renderAbortRef = useRef<AbortController | null>(null);
  const rendererRef = useRef(new ShortsVideoRenderer());

  const handleRender = useCallback(async () => {
    const current = projectRef.current;
    if (!current.scenes.length) return;

    const missingAudio = current.scenes.filter((s) => s.audioStatus !== 'ready');
    if (missingAudio.length) {
      await showAlert(
        `${missingAudio.length} scene${missingAudio.length > 1 ? 's are' : ' is'} still missing a voiceover. Regenerate the voice on those scenes first.`,
        { type: 'warning', title: 'Not ready to render' },
      );
      return;
    }

    const controller = new AbortController();
    renderAbortRef.current = controller;

    setRenderedBlob(null);
    setRenderError(null);
    setRenderProgress(0);
    setRenderStatus('Preparing scenes...');
    setRenderPhase('rendering');

    const renderScenes: ShortsRenderScene[] = current.scenes.map((scene) => ({
      imageBlob: scene.imageBlob ?? null,
      videoBlob: scene.videoBlob ?? null,
      audioUrl: scene.audioUrl ?? null,
      audioDuration: scene.audioDuration ?? 0,
      narration: scene.narration,
      captions: sceneCaptions(scene),
      isTitleCard: scene.isTitleCard,
    }));

    try {
      const blob = await rendererRef.current.render({
        scenes: renderScenes,
        aspect: current.aspect,
        title: current.title,
        captionsEnabled: current.captionsEnabled,
        captionStyle: current.captionStyle,
        captionSize: current.captionSize,
        captionPosition: current.captionPosition,
        music: current.music ? { blob: current.music.blob, volume: current.music.volume } : null,
        signal: controller.signal,
        onProgress: (progress, status) => {
          setRenderProgress(progress);
          setRenderStatus(status);
        },
      });

      setRenderedBlob(blob);
      setRenderPhase('done');
    } catch (e) {
      if (e instanceof ShortsRenderAbortedError || controller.signal.aborted) {
        setRenderPhase(null);
        return;
      }
      setRenderError(errorMessage(e));
      setRenderPhase('error');
    } finally {
      if (renderAbortRef.current === controller) renderAbortRef.current = null;
    }
  }, [showAlert, projectRef, renderAbortRef, rendererRef]);

  const fileName = `${slugify(project.title || project.topic)}-${project.aspect.replace(':', 'x')}.mp4`;

  const handleDownload = useCallback(() => {
    if (!renderedBlob) return;
    const url = URL.createObjectURL(renderedBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }, [renderedBlob, fileName]);

  // Fires the existing render+download flow once a Library "Download" load has landed in state.
  const autoDownloadArmedRef = useRef(false);
  useEffect(() => {
    if (pendingLibraryDownloadRef.current && project.scenes.length > 0) {
      pendingLibraryDownloadRef.current = false;
      autoDownloadArmedRef.current = true;
      void handleRender();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  useEffect(() => {
    if (autoDownloadArmedRef.current && renderPhase === 'done' && renderedBlob) {
      autoDownloadArmedRef.current = false;
      handleDownload();
    }
  }, [renderPhase, renderedBlob, handleDownload]);

  // Guard against losing an in-flight render to an accidental reload.
  useEffect(() => {
    if (renderPhase !== 'rendering') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [renderPhase]);

  return {
    renderPhase,
    setRenderPhase,
    renderProgress,
    renderStatus,
    renderError,
    renderedBlob,
    renderAbortRef,
    handleRender,
    handleDownload,
    fileName,
  };
}
