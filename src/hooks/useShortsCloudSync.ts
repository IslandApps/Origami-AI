import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { User } from 'firebase/auth';
import {
  saveShortsProjectToCloud,
  loadShortsProjectFromCloud,
} from '../services/cloudStorage';
import {
  fromPersistedProject,
  revokeProjectUrls,
  toPersistedProject,
  type ShortsProject,
} from '../services/shortsProject';
import type { useModal } from '../context/ModalContext';

type ModalApi = Pick<ReturnType<typeof useModal>, 'showAlert' | 'showConfirm' | 'showPrompt'>;

// Remembers which cloud Library entry the current local draft is linked to, so
// Auto Save keeps updating the same entry across page reloads instead of
// creating a new one every session.
const SHORTS_LIBRARY_LINK_KEY = 'origami_library_link_shorts';

/**
 * Cloud Library persistence for the current shorts draft: "Save to Library" plus
 * the /shorts?libraryProjectId=<id>[&libraryAction=download] load flow navigated
 * to from the Library page, plus an opt-in Auto Save.
 */
export function useShortsCloudSync(params: {
  user: User | null;
  project: ShortsProject;
  projectRef: React.RefObject<ShortsProject>;
  setProject: React.Dispatch<React.SetStateAction<ShortsProject>>;
  setStage: (stage: 'compose' | 'storyboard') => void;
  /** Set on a Library "Download" load; consumed by useShortsRender. */
  pendingLibraryDownloadRef: React.RefObject<boolean>;
  /** Auto Save toggle from Settings. Off by default. */
  autoSaveEnabled: boolean;
  modal: ModalApi,
}) {
  const { user, project, projectRef, setProject, setStage, pendingLibraryDownloadRef, autoSaveEnabled, modal } = params;
  const { showAlert, showConfirm, showPrompt } = modal;
  const [searchParams, setSearchParams] = useSearchParams();

  const [isSavingToCloud, setIsSavingToCloud] = useState(false);
  const [linkedCloudProjectId, setLinkedCloudProjectId] = useState<string | null>(null);
  const isSavingToCloudRef = useRef(false);
  isSavingToCloudRef.current = isSavingToCloud;
  const linkedCloudProjectIdRef = useRef(linkedCloudProjectId);
  linkedCloudProjectIdRef.current = linkedCloudProjectId;
  // Skips the very first Auto Save trigger after mount/reload — that transition is
  // either a restored local draft (already saved) or the very first scene landing,
  // not a change worth immediately pushing to the cloud.
  const skipNextCloudAutoSaveRef = useRef(true);

  // Hydrate the Library link from a previous session.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SHORTS_LIBRARY_LINK_KEY);
      const link = raw ? JSON.parse(raw) as { projectId?: string } : null;
      if (link?.projectId) setLinkedCloudProjectId(link.projectId);
    } catch {
      // Malformed/unavailable localStorage entry — fall back to unlinked.
    }
  }, []);

  // Keep the Library link mirrored to storage so it survives reloads.
  useEffect(() => {
    try {
      if (linkedCloudProjectId) {
        localStorage.setItem(SHORTS_LIBRARY_LINK_KEY, JSON.stringify({ projectId: linkedCloudProjectId }));
      } else {
        localStorage.removeItem(SHORTS_LIBRARY_LINK_KEY);
      }
    } catch {
      // localStorage unavailable (e.g. private browsing) — Auto Save still works within the session.
    }
  }, [linkedCloudProjectId]);

  const handleSaveToLibrary = useCallback(async () => {
    if (!user) {
      showAlert('Please sign in to save to your Library.', { type: 'error' });
      return;
    }
    if (projectRef.current.scenes.length === 0) {
      showAlert('Nothing to save yet — generate a short first.', { type: 'warning' });
      return;
    }
    const current = projectRef.current;
    const defaultTitle = current.title || current.topic || 'Untitled Short';
    const title = await showPrompt('Name this short so you can find it later in your Library.', {
      title: linkedCloudProjectId ? 'Update Library entry' : 'Save to Library',
      defaultValue: defaultTitle,
      confirmText: 'Save',
    });
    if (title === null) return;
    setIsSavingToCloud(true);
    try {
      const projectId = linkedCloudProjectId ?? Date.now().toString();
      const toSave = { ...projectRef.current, title };
      setProject(toSave);
      const pData = toPersistedProject(toSave);
      const result = await saveShortsProjectToCloud(user.uid, projectId, pData);
      setLinkedCloudProjectId(result.projectId);
      showAlert('Saved to Library!', { type: 'success' });
    } catch (e: any) {
      console.error(e);
      showAlert('Failed to save to Library: ' + e.message, { type: 'error' });
    } finally {
      setIsSavingToCloud(false);
    }
  }, [user, projectRef, linkedCloudProjectId, setProject, showAlert, showPrompt]);

  // Handles /shorts?libraryProjectId=<id>[&libraryAction=download] navigated to from the Library page.
  useEffect(() => {
    const libraryProjectId = searchParams.get('libraryProjectId');
    if (!libraryProjectId) return;
    if (!user) {
      setSearchParams({}, { replace: true });
      return;
    }
    const action = searchParams.get('libraryAction');

    (async () => {
      if (projectRef.current.scenes.length > 0) {
        const proceed = await showConfirm(
          'Opening this short from your Library will replace your current unsaved draft. Continue?',
          { type: 'warning', title: 'Replace current draft?' },
        );
        if (!proceed) {
          setSearchParams({}, { replace: true });
          return;
        }
      }
      try {
        const loadedData = await loadShortsProjectFromCloud(user.uid, libraryProjectId);
        if (!loadedData) {
          showAlert('Project not found — it may have been deleted.', { type: 'error' });
          return;
        }
        revokeProjectUrls(projectRef.current);
        skipNextCloudAutoSaveRef.current = true;
        setProject(fromPersistedProject(loadedData));
        setStage(loadedData.scenes.length > 0 ? 'storyboard' : 'compose');
        setLinkedCloudProjectId(libraryProjectId);
        if (action === 'download') pendingLibraryDownloadRef.current = true;
      } catch (e: any) {
        console.error(e);
        showAlert('Failed to load project: ' + e.message, { type: 'error' });
      } finally {
        setSearchParams({}, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  // Auto Save to the cloud Library, when enabled in Settings and the user is signed in.
  // Debounced independently from the local draft autosave, since this hits the network
  // and re-uploads any local blob scene/music assets.
  useEffect(() => {
    if (!autoSaveEnabled || !user) return;
    if (project.scenes.length === 0) return;

    if (skipNextCloudAutoSaveRef.current) {
      skipNextCloudAutoSaveRef.current = false;
      return;
    }

    const timer = window.setTimeout(async () => {
      if (isSavingToCloudRef.current) return; // a manual save is already in flight
      setIsSavingToCloud(true);
      try {
        const current = projectRef.current;
        const projectId = linkedCloudProjectIdRef.current ?? Date.now().toString();
        const title = current.title || current.topic || 'Untitled Short';
        const pData = toPersistedProject({ ...current, title });
        const result = await saveShortsProjectToCloud(user.uid, projectId, pData);
        setLinkedCloudProjectId(result.projectId);
      } catch (e) {
        console.error('[Shorts] Auto Save to Library failed:', e);
      } finally {
        setIsSavingToCloud(false);
      }
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [project, autoSaveEnabled, user, projectRef]);

  return {
    isSavingToCloud,
    linkedCloudProjectId,
    setLinkedCloudProjectId,
    handleSaveToLibrary,
  };
}
